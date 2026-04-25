import { monkeyPortrait } from "./assets";
import {
  getCombatTeamSupportBonus,
  getFleeSkillBonus,
  getGuardDamageReduction,
  getMonkeyEffectiveStats,
  getToolEfficiencyMultiplier,
  hasSkill,
  shouldAvoidDamage,
} from "./skills";
import type {
  CombatActionId,
  CombatChoice,
  CombatEffect,
  CombatRoundResult,
  CombatResult,
  CombatUnit,
  DailyReport,
  GameState,
  MapArea,
  Monkey,
  PendingCombat,
  ToolName,
} from "./types";
import {
  average,
  changeRelation,
  clamp,
  getArea,
  getFaction,
  getMonkey,
  livingMonkeys,
  sample,
  updateMonkeyStatus,
} from "./utils";

export interface CombatActionRequest {
  action: CombatActionId;
  actorId?: string;
  targetId?: string;
}

export interface CombatActionDefinition {
  id: CombatActionId;
  label: string;
  text: string;
  needsTarget?: "enemy" | "ally";
}

export const COMBAT_ACTIONS: CombatActionDefinition[] = [
  { id: "attack", label: "Atacar", text: "Causa dano em um rival.", needsTarget: "enemy" },
  { id: "ambush", label: "Emboscada", text: "Usa furtividade para causar dano e cansar um rival.", needsTarget: "enemy" },
  { id: "defend", label: "Defender", text: "Ganha defesa ate o proximo ataque inimigo." },
  { id: "focusLeader", label: "Focar líder", text: "Pressiona o rival mais influente." },
  { id: "intimidate", label: "Intimidar", text: "Reduz moral inimiga e pode encerrar a luta." },
  { id: "flee", label: "Fugir", text: "Tenta sair do combate com perda de moral." },
  { id: "surrender", label: "Negociar rendição", text: "Tenta encerrar a luta pela moral e carisma." },
  { id: "protect", label: "Proteger ferido", text: "Reduz dano recebido por um aliado.", needsTarget: "ally" },
  { id: "useTool", label: "Usar ferramenta", text: "Aplica uma ferramenta ou ervas se houver." },
  { id: "saveEnergy", label: "Poupar energia", text: "Recupera energia e ganha pequena defesa." },
];

function ensureCombatDefaults(combat: PendingCombat): void {
  combat.phase ??= "playerTurn";
  combat.actedMonkeyIds ??= [];
  combat.defendingMonkeyIds ??= [];
  combat.protectedMonkeyIds ??= [];
  combat.exposedMonkeyIds ??= [];
  combat.enemyMorale ??= 60;
  combat.lastEffects ??= [];
}

function combatMonkeys(state: GameState, ids: string[]): Monkey[] {
  return ids.map((id) => getMonkey(state, id));
}

function activeMonkeys(state: GameState, ids: string[]): Monkey[] {
  return livingMonkeys(combatMonkeys(state, ids));
}

function combatParticipants(state: GameState, combat: PendingCombat): Monkey[] {
  return combatMonkeys(state, [...combat.playerMonkeyIds, ...combat.enemyMonkeyIds]);
}

function alivePlayerMonkeys(state: GameState, combat: PendingCombat): Monkey[] {
  return activeMonkeys(state, combat.playerMonkeyIds);
}

function aliveEnemyMonkeys(state: GameState, combat: PendingCombat): Monkey[] {
  return activeMonkeys(state, combat.enemyMonkeyIds);
}

function actionIdToChoice(action: CombatActionId): CombatChoice {
  const choices: Record<CombatActionId, CombatChoice> = {
    attack: "DIRECT_ATTACK",
    ambush: "AMBUSH",
    defend: "DEFEND",
    focusLeader: "FOCUS_LEADER",
    intimidate: "INTIMIDATE",
    flee: "FLEE",
    surrender: "NEGOTIATE_SURRENDER",
    protect: "PROTECT_WOUNDED",
    useTool: "USE_TOOL",
    saveEnergy: "SAVE_ENERGY",
  };
  return choices[action];
}

function choiceToActionId(choice: CombatChoice): CombatActionId {
  const actions: Record<CombatChoice, CombatActionId> = {
    DIRECT_ATTACK: "attack",
    AMBUSH: "ambush",
    DEFEND: "defend",
    FOCUS_LEADER: "focusLeader",
    INTIMIDATE: "intimidate",
    FLEE: "flee",
    NEGOTIATE_SURRENDER: "surrender",
    PROTECT_WOUNDED: "protect",
    USE_TOOL: "useTool",
    SAVE_ENERGY: "saveEnergy",
  };
  return actions[choice];
}

function hungerEfficiency(monkey: Monkey): number {
  if (monkey.hunger >= 85) {
    return 0.75;
  }
  if (monkey.hunger >= 65) {
    return 0.85;
  }
  if (monkey.hunger >= 40) {
    return 0.95;
  }
  return 1;
}

function energyEfficiency(monkey: Monkey): number {
  if (monkey.energy < 20) {
    return 0.75;
  }
  if (monkey.energy < 40) {
    return 0.9;
  }
  return 1;
}

function moraleEfficiency(monkey: Monkey): number {
  if (monkey.morale > 70) {
    return 1.1;
  }
  if (monkey.morale < 35) {
    return 0.9;
  }
  return 1;
}

function hungerMoralePenalty(monkey: Monkey): number {
  if (monkey.hunger >= 85) {
    return -8;
  }
  if (monkey.hunger >= 65) {
    return -10;
  }
  return 0;
}

function roleChoiceMultiplier(monkey: Monkey, choice: CombatChoice): number {
  if ((choice === "DIRECT_ATTACK" || choice === "FOCUS_LEADER") && monkey.role === "Guerreiro") {
    return 1.08;
  }
  if ((choice === "DEFEND" || choice === "PROTECT_WOUNDED") && monkey.role === "Guarda") {
    return 1.1;
  }
  if ((choice === "FLEE" || choice === "AMBUSH") && monkey.role === "Explorador") {
    return 1.08;
  }
  if (
    (choice === "NEGOTIATE_SURRENDER" || choice === "INTIMIDATE") &&
    (monkey.role === "Diplomata" || monkey.isLeader)
  ) {
    return 1.1;
  }
  if (choice === "USE_TOOL" && monkey.role?.startsWith("Artes")) {
    return 1.1;
  }
  if (choice === "SAVE_ENERGY" && monkey.role === "Descansando") {
    return 1.08;
  }
  return 1;
}

function speciesChoiceMultiplier(monkey: Monkey, choice: CombatChoice): number {
  let multiplier = 1;
  if ((choice === "DEFEND" || choice === "PROTECT_WOUNDED") && hasSkill(monkey, "gorilla-natural-guard")) {
    multiplier += 0.18;
  }
  if ((choice === "DIRECT_ATTACK" || choice === "INTIMIDATE") && hasSkill(monkey, "mandrill-intimidation")) {
    multiplier += 0.18;
  }
  if ((choice === "FLEE" || choice === "AMBUSH") && hasSkill(monkey, "gibbon-canopy-movement")) {
    multiplier += 0.16;
  }
  if (
    (choice === "NEGOTIATE_SURRENDER" || choice === "PROTECT_WOUNDED" || choice === "FOCUS_LEADER") &&
    (hasSkill(monkey, "chimp-tactical-mind") || hasSkill(monkey, "chimp-natural-diplomat"))
  ) {
    multiplier += 0.12;
  }
  if ((choice === "USE_TOOL" || choice === "AMBUSH") && hasSkill(monkey, "capuchin-tool-user")) {
    multiplier += 0.15;
  }
  return multiplier;
}

function choiceAttackMultiplier(choice: CombatChoice): number {
  if (choice === "DIRECT_ATTACK") {
    return 1.18;
  }
  if (choice === "FOCUS_LEADER") {
    return 1.12;
  }
  if (choice === "USE_TOOL") {
    return 1.08;
  }
  if (choice === "AMBUSH") {
    return 1.05;
  }
  if (choice === "INTIMIDATE") {
    return 0.55;
  }
  if (choice === "DEFEND" || choice === "PROTECT_WOUNDED" || choice === "SAVE_ENERGY") {
    return 0.45;
  }
  return 0.25;
}

function choiceDefenseMultiplier(choice: CombatChoice): number {
  if (choice === "DEFEND") {
    return 1.32;
  }
  if (choice === "PROTECT_WOUNDED") {
    return 1.24;
  }
  if (choice === "FLEE" || choice === "AMBUSH") {
    return 1.14;
  }
  if (choice === "SAVE_ENERGY") {
    return 1.1;
  }
  if (choice === "DIRECT_ATTACK" || choice === "FOCUS_LEADER" || choice === "USE_TOOL") {
    return 0.88;
  }
  return 1;
}

function combatConditionMultiplier(
  monkey: Monkey,
  choice: CombatChoice,
  mode: "attack" | "defense" | "social" | "stealth" | "tool",
): number {
  let multiplier = hungerEfficiency(monkey) * energyEfficiency(monkey);
  if (mode !== "stealth") {
    multiplier *= moraleEfficiency(monkey);
  }
  multiplier *= roleChoiceMultiplier(monkey, choice);
  multiplier *= speciesChoiceMultiplier(monkey, choice);
  if (mode === "attack") {
    multiplier *= choiceAttackMultiplier(choice);
  } else if (mode === "defense") {
    multiplier *= choiceDefenseMultiplier(choice);
  } else if (mode === "tool") {
    multiplier *= getToolEfficiencyMultiplier(monkey);
  }
  return multiplier;
}

function getCombatMonkeyStats(monkey: Monkey, choice: CombatChoice, combatRound?: number) {
  const action = choiceToActionId(choice);
  const skillAction = action === "surrender" ? "negotiate" : action === "saveEnergy" ? "defend" : action;
  const stats = getMonkeyEffectiveStats(monkey, {
    action: skillAction,
    combatRound,
  });
  return {
    ...stats,
    attack: Math.max(1, Math.round(stats.attack * combatConditionMultiplier(monkey, choice, "attack"))),
    defense: Math.max(1, Math.round(stats.defense * combatConditionMultiplier(monkey, choice, "defense"))),
    stealth: Math.max(1, Math.round(stats.stealth * combatConditionMultiplier(monkey, choice, "stealth"))),
    intelligence: Math.max(1, Math.round(stats.intelligence * combatConditionMultiplier(monkey, choice, "tool"))),
    charisma: Math.max(1, Math.round(stats.charisma * combatConditionMultiplier(monkey, choice, "social"))),
    morale: clamp(stats.morale + hungerMoralePenalty(monkey), 0, 100),
  };
}

function combatPowerWithConditions(monkeys: Monkey[], choice: CombatChoice, round?: number): number {
  return livingMonkeys(monkeys).reduce((sum, monkey) => {
    const stats = getCombatMonkeyStats(monkey, choice, round);
    return sum + stats.attack * 1.35 + stats.defense + stats.stealth * 0.35 + stats.charisma * 0.2 + stats.morale / 18;
  }, 0);
}

function moraleBreakChance(monkey: Monkey): number {
  let chance = monkey.morale < 20 ? 0.2 : monkey.morale < 35 ? 0.08 : 0;
  if (monkey.hunger >= 85) {
    chance += 0.12;
  } else if (monkey.hunger >= 65) {
    chance += 0.06;
  }
  if (monkey.energy < 20) {
    chance += 0.08;
  }
  if (monkey.isLeader) {
    chance -= 0.06;
  }
  return clamp(chance, 0, 0.42);
}

function maybeMoraleFailure(combat: PendingCombat, monkey: Monkey): boolean {
  const chance = moraleBreakChance(monkey);
  if (chance <= 0 || Math.random() >= chance) {
    return false;
  }
  monkey.energy = clamp(monkey.energy - 3, 0, monkey.maxEnergy);
  monkey.morale = clamp(monkey.morale - 4, 0, 100);
  updateMonkeyStatus(monkey);
  pushCombatLog(combat, `${monkey.name} perdeu a coragem por um instante e falhou a acao.`);
  setEffects(combat, [{ unitId: monkey.id, kind: "miss", text: "hesitou" }]);
  return true;
}

function unitStatus(monkey: Monkey, combat: PendingCombat): string[] {
  const status: string[] = [];
  if (monkey.status !== "normal") {
    status.push(monkey.status);
  }
  if (combat.defendingMonkeyIds?.includes(monkey.id)) {
    status.push("defendendo");
  }
  if (combat.protectedMonkeyIds?.includes(monkey.id)) {
    status.push("protegido");
  }
  if (combat.exposedMonkeyIds?.includes(monkey.id)) {
    status.push("exposto");
  }
  if (combat.actedMonkeyIds?.includes(monkey.id)) {
    status.push("agiu");
  }
  return status;
}

export function buildCombatUnits(state: GameState): CombatUnit[] {
  const combat = state.pendingCombat;
  if (!combat) {
    return [];
  }

  const players = combatMonkeys(state, combat.playerMonkeyIds);
  const enemies = combatMonkeys(state, combat.enemyMonkeyIds);
  const yFor = (index: number, total: number) => {
    if (total <= 1) {
      return 1;
    }
    return Math.min(2, index);
  };

  return [
    ...players.map((monkey, index): CombatUnit => {
      const choice = combat.defendingMonkeyIds?.includes(monkey.id) ? "DEFEND" : "DIRECT_ATTACK";
      const stats = getCombatMonkeyStats(monkey, choice, combat.round);
      return {
        id: monkey.id,
        monkeyId: monkey.id,
        name: monkey.name,
        factionId: monkey.factionId,
        team: "player",
        hp: monkey.hp,
        maxHp: stats.maxHp,
        energy: monkey.energy,
        attack: stats.attack,
        defense: stats.defense,
        stealth: stats.stealth,
        charisma: stats.charisma,
        morale: monkey.morale,
        position: { x: index > 2 ? 1 : 0, y: yFor(index % 3, players.length) },
        hasActed: Boolean(combat.actedMonkeyIds?.includes(monkey.id)),
        status: unitStatus(monkey, combat),
        sprite: monkeyPortrait(state.monkeys.findIndex((item) => item.id === monkey.id)),
      };
    }),
    ...enemies.map((monkey, index): CombatUnit => {
      const stats = getCombatMonkeyStats(monkey, "DIRECT_ATTACK", combat.round);
      return {
        id: monkey.id,
        monkeyId: monkey.id,
        name: monkey.name,
        factionId: monkey.factionId,
        team: "enemy",
        hp: monkey.hp,
        maxHp: stats.maxHp,
        energy: monkey.energy,
        attack: stats.attack,
        defense: stats.defense,
        stealth: stats.stealth,
        charisma: stats.charisma,
        morale: monkey.morale,
        position: { x: index > 2 ? 4 : 5, y: yFor(index % 3, enemies.length) },
        hasActed: false,
        status: unitStatus(monkey, combat),
        sprite: monkeyPortrait(state.monkeys.findIndex((item) => item.id === monkey.id)),
      };
    }),
  ];
}

function pushCombatLog(combat: PendingCombat, line: string): void {
  combat.log = [...combat.log, line].slice(-18);
}

function setEffects(combat: PendingCombat, effects: CombatEffect[]): void {
  combat.lastEffects = effects;
}

function markActed(combat: PendingCombat, monkeyId: string): void {
  combat.actedMonkeyIds ??= [];
  if (!combat.actedMonkeyIds.includes(monkeyId)) {
    combat.actedMonkeyIds.push(monkeyId);
  }
}

function clearPlayerTemporaryStatuses(combat: PendingCombat): void {
  const playerIds = new Set(combat.playerMonkeyIds);
  combat.defendingMonkeyIds = (combat.defendingMonkeyIds ?? []).filter((id) => !playerIds.has(id));
  combat.exposedMonkeyIds = (combat.exposedMonkeyIds ?? []).filter((id) => !playerIds.has(id));
  combat.protectedMonkeyIds = [];
}

function addDefending(combat: PendingCombat, monkeyId: string): void {
  combat.defendingMonkeyIds ??= [];
  if (!combat.defendingMonkeyIds.includes(monkeyId)) {
    combat.defendingMonkeyIds.push(monkeyId);
  }
}

function addProtected(combat: PendingCombat, monkeyId: string): void {
  combat.protectedMonkeyIds ??= [];
  if (!combat.protectedMonkeyIds.includes(monkeyId)) {
    combat.protectedMonkeyIds.push(monkeyId);
  }
}

function addExposed(combat: PendingCombat, monkeyId: string): void {
  combat.exposedMonkeyIds ??= [];
  if (!combat.exposedMonkeyIds.includes(monkeyId)) {
    combat.exposedMonkeyIds.push(monkeyId);
  }
}

function chooseWeakest(monkeys: Monkey[]): Monkey {
  return [...monkeys].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
}

function chooseLeaderTarget(monkeys: Monkey[]): Monkey {
  return [...monkeys].sort(
    (a, b) => Number(b.isLeader) - Number(a.isLeader) || b.charisma + b.morale / 10 - (a.charisma + a.morale / 10),
  )[0];
}

function calculateDamage(
  state: GameState,
  attacker: Monkey,
  target: Monkey,
  combat: PendingCombat,
  bonus = 0,
  attackerChoice: CombatChoice = "DIRECT_ATTACK",
): number {
  if (shouldAvoidDamage(target)) {
    return 0;
  }
  const participants = combatParticipants(state, combat);
  const defenderChoice = combat.defendingMonkeyIds?.includes(target.id)
    ? "DEFEND"
    : combat.protectedMonkeyIds?.includes(target.id)
      ? "PROTECT_WOUNDED"
      : combat.exposedMonkeyIds?.includes(target.id)
        ? "DIRECT_ATTACK"
        : "INTIMIDATE";
  const attackerStats = getCombatMonkeyStats(attacker, attackerChoice, combat.round);
  const targetStats = getCombatMonkeyStats(target, defenderChoice, combat.round);
  const teamSupport = getCombatTeamSupportBonus(participants, attacker.factionId);
  const defending = combat.defendingMonkeyIds?.includes(target.id) ? 2 : 0;
  const protectedBonus = combat.protectedMonkeyIds?.includes(target.id) ? 3 : 0;
  const variance = Math.floor(Math.random() * 3) - 1;
  const directExposureBonus = attackerChoice === "DIRECT_ATTACK" && !combat.defendingMonkeyIds?.includes(attacker.id) ? 1 : 0;
  const rawDamage =
    attackerStats.attack * (1 + teamSupport) +
    bonus -
    Math.floor(targetStats.defense * 0.45) -
    defending -
    protectedBonus +
    variance +
    directExposureBonus;
  const reduction = getGuardDamageReduction(target, participants);
  return Math.max(1, Math.round(rawDamage * (1 - reduction)));
}

function applyDamage(target: Monkey, amount: number): number {
  const before = target.hp;
  target.hp = clamp(target.hp - amount, 0, target.maxHp);
  target.energy = clamp(target.energy - Math.ceil(amount * 2.5), 0, target.maxEnergy);
  target.morale = clamp(target.morale - amount * 3, 0, 100);
  updateMonkeyStatus(target);
  return before - target.hp;
}

function healMonkey(target: Monkey, amount: number): number {
  const before = target.hp;
  target.hp = clamp(target.hp + amount, 0, target.maxHp);
  target.energy = clamp(target.energy + 4, 0, target.maxEnergy);
  target.morale = clamp(target.morale + 4, 0, 100);
  updateMonkeyStatus(target);
  return target.hp - before;
}

function choiceEnergyCost(choice: CombatChoice): number {
  if (choice === "SAVE_ENERGY" || choice === "DEFEND" || choice === "NEGOTIATE_SURRENDER") {
    return 4;
  }
  if (choice === "FLEE" || choice === "AMBUSH" || choice === "FOCUS_LEADER") {
    return 11;
  }
  if (choice === "DIRECT_ATTACK" || choice === "USE_TOOL") {
    return 9;
  }
  return 7;
}

function militaryAdvantage(own: Monkey[], enemy: Monkey[], choice: CombatChoice, round: number): number {
  const ownPower = combatPowerWithConditions(own, choice, round);
  const enemyPower = combatPowerWithConditions(enemy, "DEFEND", round);
  return ownPower - enemyPower;
}

function applyTeamEnergy(monkeys: Monkey[], choice: CombatChoice): number {
  const cost = choiceEnergyCost(choice);
  let loss = 0;
  livingMonkeys(monkeys).forEach((monkey) => {
    const before = monkey.energy;
    monkey.energy = clamp(choice === "SAVE_ENERGY" ? monkey.energy - 2 : monkey.energy - cost, 0, monkey.maxEnergy);
    monkey.hunger = clamp(monkey.hunger + Math.max(1, cost / 6), 0, 100);
    updateMonkeyStatus(monkey);
    loss += before - monkey.energy;
  });
  return loss;
}

function applyTeamMorale(monkeys: Monkey[], delta: number): number {
  let total = 0;
  livingMonkeys(monkeys).forEach((monkey) => {
    const before = monkey.morale;
    monkey.morale = clamp(monkey.morale + delta, 0, 100);
    updateMonkeyStatus(monkey);
    total += monkey.morale - before;
  });
  return total;
}

function teamActionScore(monkeys: Monkey[], choice: CombatChoice, area: MapArea, round: number): number {
  const living = livingMonkeys(monkeys);
  if (living.length === 0) {
    return 0;
  }
  return (
    living.reduce((sum, monkey) => {
      const stats = getCombatMonkeyStats(monkey, choice, round);
      if (choice === "NEGOTIATE_SURRENDER") {
        return sum + stats.charisma + stats.morale / 10 + (monkey.isLeader ? 4 : 0);
      }
      if (choice === "INTIMIDATE") {
        return sum + stats.attack * 0.7 + stats.charisma + stats.morale / 18;
      }
      if (choice === "FLEE" || choice === "AMBUSH") {
        return sum + stats.stealth + stats.intelligence * 0.4 + monkey.energy / 16;
      }
      if (choice === "USE_TOOL") {
        return sum + stats.attack + stats.intelligence * 0.7;
      }
      return sum + stats.attack + stats.defense * 0.5 + stats.morale / 20;
    }, 0) +
    area.combatModifier +
    (choice === "FLEE" || choice === "AMBUSH" ? area.stealthModifier * 2 : 0)
  );
}

export function resolveCombatRound(params: {
  attackers: Monkey[];
  defenders: Monkey[];
  attackerChoice: CombatChoice;
  defenderChoice: CombatChoice;
  area: MapArea;
  gameState: GameState;
}): CombatRoundResult {
  const { attackers, defenders, attackerChoice, defenderChoice, area, gameState } = params;
  const attackerFactionId = attackers[0]?.factionId;
  const defenderFactionId = defenders[0]?.factionId;
  const attackerFaction = attackerFactionId ? getFaction(gameState, attackerFactionId) : null;
  const defenderFaction = defenderFactionId ? getFaction(gameState, defenderFactionId) : null;
  const initialAttackHp = new Map(attackers.map((monkey) => [monkey.id, monkey.hp]));
  const initialDefenseHp = new Map(defenders.map((monkey) => [monkey.id, monkey.hp]));
  const log: string[] = [];
  let attackerEnergyLoss = 0;
  let defenderEnergyLoss = 0;
  let attackerMoraleDelta = 0;
  let defenderMoraleDelta = 0;
  let outcome: CombatRoundResult["outcome"] = "draw";
  let fledFactionId: string | undefined;
  let surrenderedFactionId: string | undefined;
  let rounds = 0;

  for (rounds = 1; rounds <= 3; rounds += 1) {
    const livingAttackers = livingMonkeys(attackers);
    const livingDefenders = livingMonkeys(defenders);
    if (livingAttackers.length === 0 || livingDefenders.length === 0) {
      break;
    }

    const attackerScore = teamActionScore(livingAttackers, attackerChoice, area, rounds);
    const defenderScore = teamActionScore(livingDefenders, defenderChoice, area, rounds);
    const defenderPersonalityBonus =
      defenderFaction?.aiPersonality === "gold" && defenderChoice === "NEGOTIATE_SURRENDER"
        ? 8
        : defenderFaction?.aiPersonality === "stone" && (defenderChoice === "DIRECT_ATTACK" || defenderChoice === "INTIMIDATE")
          ? 7
          : 0;

    if (attackerChoice === "FLEE" && attackerScore + Math.random() * 12 > defenderScore) {
      outcome = "attackersFled";
      fledFactionId = attackerFactionId;
      log.push(`${attackerFaction?.name ?? "Atacantes"} fugiram por ${area.name}.`);
      break;
    }
    if (defenderChoice === "FLEE" && defenderScore + Math.random() * 12 > attackerScore) {
      outcome = "defendersFled";
      fledFactionId = defenderFactionId;
      log.push(`${defenderFaction?.name ?? "Defensores"} abandonaram a linha.`);
      break;
    }

    if (
      attackerChoice === "NEGOTIATE_SURRENDER" &&
      attackerScore + militaryAdvantage(livingAttackers, livingDefenders, attackerChoice, rounds) * 0.25 + Math.random() * 14 >
        defenderScore
    ) {
      outcome = "surrender";
      surrenderedFactionId = defenderFactionId;
      log.push(`${attackerFaction?.name ?? "Atacantes"} forcaram uma rendicao negociada.`);
      break;
    }

    if (
      defenderChoice === "NEGOTIATE_SURRENDER" &&
      defenderScore + defenderPersonalityBonus + Math.random() * 14 >
        attackerScore + militaryAdvantage(livingAttackers, livingDefenders, attackerChoice, rounds) * 0.2
    ) {
      outcome = "surrender";
      surrenderedFactionId = defenderFactionId;
      log.push(`${defenderFaction?.name ?? "Defensores"} aceitaram uma rendicao negociada.`);
      break;
    }

    if (attackerChoice === "INTIMIDATE") {
      defenderMoraleDelta += applyTeamMorale(livingDefenders, -Math.max(2, Math.round(attackerScore / 18)));
      log.push("A intimidacao dos atacantes abalou a moral defensora.");
    }
    if (defenderChoice === "INTIMIDATE") {
      attackerMoraleDelta += applyTeamMorale(livingAttackers, -Math.max(2, Math.round((defenderScore + defenderPersonalityBonus) / 18)));
      log.push("A resposta defensora tentou quebrar a coragem dos atacantes.");
    }

    const attackDamage = Math.max(
      0,
      Math.round((attackerScore - defenderScore * 0.45 + Math.random() * 8) / Math.max(3, livingDefenders.length)),
    );
    const defenseDamage = Math.max(
      0,
      Math.round((defenderScore + defenderPersonalityBonus - attackerScore * 0.45 + Math.random() * 8) / Math.max(3, livingAttackers.length)),
    );

    if (attackDamage > 0 && attackerChoice !== "FLEE" && attackerChoice !== "NEGOTIATE_SURRENDER") {
      const target = chooseWeakest(livingDefenders);
      const actual = applyDamage(target, attackDamage);
      log.push(`Atacantes causaram ${actual} dano em ${target.name}.`);
    }
    if (defenseDamage > 0 && defenderChoice !== "FLEE" && defenderChoice !== "NEGOTIATE_SURRENDER") {
      const target = chooseWeakest(livingAttackers);
      const actual = applyDamage(target, defenseDamage);
      log.push(`Defensores causaram ${actual} dano em ${target.name}.`);
    }

    attackerEnergyLoss += applyTeamEnergy(livingAttackers, attackerChoice);
    defenderEnergyLoss += applyTeamEnergy(livingDefenders, defenderChoice);
    attackerMoraleDelta += applyTeamMorale(livingAttackers, attackerChoice === "SAVE_ENERGY" || attackerChoice === "DEFEND" ? 1 : -1);
    defenderMoraleDelta += applyTeamMorale(livingDefenders, defenderChoice === "SAVE_ENERGY" || defenderChoice === "DEFEND" ? 1 : -1);

    if (livingMonkeys(defenders).length === 0) {
      outcome = "attackersWin";
      break;
    }
    if (livingMonkeys(attackers).length === 0) {
      outcome = "defendersWin";
      break;
    }
  }

  if (outcome === "draw") {
    const attackerPower = combatPowerWithConditions(attackers, attackerChoice, 3);
    const defenderPower = combatPowerWithConditions(defenders, defenderChoice, 3);
    if (attackerPower > defenderPower * 1.15) {
      outcome = "attackersWin";
    } else if (defenderPower > attackerPower * 1.15) {
      outcome = "defendersWin";
    }
  }

  const damageCaused = defenders.reduce((sum, monkey) => sum + Math.max(0, (initialDefenseHp.get(monkey.id) ?? monkey.hp) - monkey.hp), 0);
  const damageReceived = attackers.reduce((sum, monkey) => sum + Math.max(0, (initialAttackHp.get(monkey.id) ?? monkey.hp) - monkey.hp), 0);
  const injuredIds = [...attackers, ...defenders]
    .filter((monkey) => monkey.status === "ferido" || monkey.status === "inconsciente")
    .map((monkey) => monkey.id);
  const deadIds = [...attackers, ...defenders].filter((monkey) => monkey.status === "morto").map((monkey) => monkey.id);
  const dailyReportLines = [
    `Combate em ${area.name}: ${damageCaused} dano causado e ${damageReceived} recebido.`,
    `Energia perdida: atacantes ${Math.round(attackerEnergyLoss)}, defensores ${Math.round(defenderEnergyLoss)}.`,
  ];
  if (fledFactionId) {
    dailyReportLines.push(`Fuga registrada: ${getFaction(gameState, fledFactionId).name}.`);
  }
  if (surrenderedFactionId) {
    dailyReportLines.push(`Rendicao registrada: ${getFaction(gameState, surrenderedFactionId).name}.`);
  }

  return {
    rounds: Math.min(rounds, 3),
    outcome,
    damageCaused,
    damageReceived,
    injuredIds,
    deadIds,
    attackerEnergyLoss,
    defenderEnergyLoss,
    attackerMoraleDelta,
    defenderMoraleDelta,
    fledFactionId,
    surrenderedFactionId,
    log,
    dailyReportLines,
  };
}

function resultTitle(outcome: CombatResult["outcome"]): string {
  if (outcome === "victory") {
    return "Vitoria";
  }
  if (outcome === "defeat") {
    return "Derrota";
  }
  if (outcome === "flee") {
    return "Fuga";
  }
  if (outcome === "enemyFled") {
    return "Rivais fugiram";
  }
  if (outcome === "surrender") {
    return "Rendicao aceita";
  }
  return "Empate";
}

function finishAsSummary(
  state: GameState,
  combat: PendingCombat,
  outcome: CombatResult["outcome"],
  reason: string,
): void {
  const playerCombatants = combatMonkeys(state, combat.playerMonkeyIds);
  const enemyCombatants = combatMonkeys(state, combat.enemyMonkeyIds);
  const playerDead = playerCombatants.filter((monkey) => monkey.status === "morto");
  const playerInjured = playerCombatants.filter(
    (monkey) => monkey.status === "ferido" || monkey.status === "inconsciente",
  );
  const enemyDead = enemyCombatants.filter((monkey) => monkey.status === "morto");
  const enemyInjured = enemyCombatants.filter(
    (monkey) => monkey.status === "ferido" || monkey.status === "inconsciente",
  );
  const damageCaused = enemyCombatants.reduce((sum, monkey) => sum + Math.max(0, monkey.maxHp - monkey.hp), 0);
  const damageReceived = playerCombatants.reduce((sum, monkey) => sum + Math.max(0, monkey.maxHp - monkey.hp), 0);
  const energyLoss = playerCombatants.reduce((sum, monkey) => sum + Math.max(0, monkey.maxEnergy - monkey.energy), 0);
  const foodDelta =
    outcome === "victory" ? 3 + Math.floor(Math.random() * 4) : outcome === "defeat" ? -(2 + Math.floor(Math.random() * 3)) : 0;
  const moraleDelta =
    outcome === "victory" ? 5 : outcome === "enemyFled" ? 3 : outcome === "flee" ? -6 : outcome === "defeat" ? -8 : -2;
  const relationDelta =
    outcome === "victory" ? -18 : outcome === "defeat" ? -12 : outcome === "enemyFled" ? -10 : outcome === "surrender" ? 5 : -4;
  const territoryChanged =
    (outcome === "victory" && combat.playerSide === "attacker") ||
    (outcome === "defeat" && combat.playerSide === "defender");

  const lines = [
    reason,
    `Dano causado: ${damageCaused}. Dano recebido: ${damageReceived}.`,
    `Feridos: ${playerInjured.length > 0 ? playerInjured.map((monkey) => monkey.name).join(", ") : "nenhum"}.`,
    `Mortos: ${playerDead.length > 0 ? playerDead.map((monkey) => monkey.name).join(", ") : "nenhum"}.`,
    `Rivais feridos: ${enemyInjured.length}. Energia perdida: ${Math.round(energyLoss)}.`,
    `Comida: ${foodDelta > 0 ? "+" : ""}${foodDelta}. Moral: ${moraleDelta > 0 ? "+" : ""}${moraleDelta}.`,
    `Relacao com rivais: ${relationDelta > 0 ? "+" : ""}${relationDelta}.`,
  ];
  if (territoryChanged) {
    lines.push(outcome === "victory" ? "Territorio conquistado." : "Territorio perdido.");
  }
  if (enemyDead.length > 0) {
    lines.push(`${enemyDead.length} rival(is) cairam.`);
  }

  combat.phase = "summary";
  combat.result = {
    outcome,
    title: resultTitle(outcome),
    reason,
    lines,
    playerDeadIds: playerDead.map((monkey) => monkey.id),
    playerInjuredIds: playerInjured.map((monkey) => monkey.id),
    enemyDeadIds: enemyDead.map((monkey) => monkey.id),
    damageCaused,
    damageReceived,
    energyLoss,
    moraleChange: moraleDelta,
    fledFactionId:
      outcome === "flee"
        ? state.playerFactionId
        : outcome === "enemyFled"
          ? combat.playerSide === "attacker"
            ? combat.defenderFactionId
            : combat.attackerFactionId
          : undefined,
    surrenderedFactionId:
      outcome === "surrender"
        ? combat.playerSide === "attacker"
          ? combat.defenderFactionId
          : combat.attackerFactionId
        : undefined,
    dailyReportLines: lines,
    foodDelta,
    moraleDelta,
    relationDelta,
    territoryChanged,
  };
  setEffects(combat, []);
  pushCombatLog(combat, reason);
}

function finishIfSideDown(state: GameState, combat: PendingCombat): boolean {
  const players = alivePlayerMonkeys(state, combat);
  const enemies = aliveEnemyMonkeys(state, combat);
  if (players.length === 0) {
    finishAsSummary(state, combat, "defeat", "Todos os macacos do jogador cairam.");
    return true;
  }
  if (enemies.length === 0) {
    finishAsSummary(state, combat, "victory", "Todos os rivais cairam.");
    return true;
  }
  return false;
}

function finishByRoundLimit(state: GameState, combat: PendingCombat): void {
  const players = alivePlayerMonkeys(state, combat);
  const enemies = aliveEnemyMonkeys(state, combat);
  const playerPower = combatPowerWithConditions(players, "DIRECT_ATTACK", combat.round);
  const enemyPower = combatPowerWithConditions(enemies, "DIRECT_ATTACK", combat.round);
  if (playerPower > enemyPower * 1.15) {
    finishAsSummary(state, combat, "victory", "A terceira rodada terminou com vantagem clara para a tribo.");
  } else if (enemyPower > playerPower * 1.15) {
    finishAsSummary(state, combat, "defeat", "A terceira rodada terminou com os rivais dominando o campo.");
  } else {
    finishAsSummary(state, combat, "draw", "Depois de tres rodadas, nenhum lado conseguiu romper a linha rival.");
  }
}

function applyAttack(state: GameState, combat: PendingCombat, actor: Monkey, targetId?: string): void {
  const target = targetId ? getMonkey(state, targetId) : chooseWeakest(aliveEnemyMonkeys(state, combat));
  if (!target || target.status === "morto") {
    pushCombatLog(combat, "Nao ha alvo valido para o ataque.");
    return;
  }
  const damage = applyDamage(target, calculateDamage(state, actor, target, combat, 1, "DIRECT_ATTACK"));
  actor.energy = clamp(actor.energy - 12, 0, actor.maxEnergy);
  addExposed(combat, actor.id);
  updateMonkeyStatus(actor);
  pushCombatLog(combat, `${actor.name} atacou ${target.name} e causou ${damage} dano.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function applyAmbush(state: GameState, combat: PendingCombat, actor: Monkey, targetId?: string): void {
  const target = targetId ? getMonkey(state, targetId) : chooseWeakest(aliveEnemyMonkeys(state, combat));
  if (!target || target.status === "morto") {
    pushCombatLog(combat, "Nao ha alvo valido para a emboscada.");
    return;
  }

  const actorStats = getCombatMonkeyStats(actor, "AMBUSH", combat.round);
  const targetStats = getCombatMonkeyStats(target, "DEFEND", combat.round);
  const chance = clamp((actorStats.stealth - targetStats.stealth + actor.energy / 12) / 18, 0.22, 0.78);
  actor.energy = clamp(actor.energy - 12, 0, actor.maxEnergy);

  if (Math.random() > chance) {
    pushCombatLog(combat, `${actor.name} tentou emboscar ${target.name}, mas perdeu o momento.`);
    setEffects(combat, [{ unitId: target.id, kind: "miss", text: "falhou" }]);
    return;
  }

  const damage = applyDamage(target, calculateDamage(state, actor, target, combat, 2, "AMBUSH"));
  target.energy = clamp(target.energy - 5, 0, target.maxEnergy);
  updateMonkeyStatus(target);
  updateMonkeyStatus(actor);
  pushCombatLog(combat, `${actor.name} emboscou ${target.name} e causou ${damage} dano.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function applyFocusLeader(state: GameState, combat: PendingCombat, actor: Monkey): void {
  const target = chooseLeaderTarget(aliveEnemyMonkeys(state, combat));
  const damage = applyDamage(target, calculateDamage(state, actor, target, combat, 2, "FOCUS_LEADER"));
  combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - (target.isLeader ? 6 : 3), 0, 100);
  actor.energy = clamp(actor.energy - 11, 0, actor.maxEnergy);
  addExposed(combat, actor.id);
  updateMonkeyStatus(actor);
  pushCombatLog(combat, `${actor.name} focou ${target.name} e abalou a linha rival.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function negotiateSurrender(state: GameState, combat: PendingCombat, actor: Monkey): void {
  const stats = getCombatMonkeyStats(actor, "NEGOTIATE_SURRENDER", combat.round);
  const support = getCombatTeamSupportBonus(combatParticipants(state, combat), actor.factionId);
  const pressure = Math.round((stats.charisma + actor.morale / 12 + Math.random() * 10) * (1 + support));
  actor.energy = clamp(actor.energy - 7, 0, actor.maxEnergy);
  combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - Math.max(2, Math.floor(pressure / 3)), 0, 100);

  if (pressure > (combat.enemyMorale ?? 60) + 8 && Math.random() < 0.45) {
    finishAsSummary(state, combat, "surrender", "A conversa abriu uma rendicao antes que o combate piorasse.");
    return;
  }

  pushCombatLog(combat, `${actor.name} tentou negociar rendicao. Moral inimiga: ${combat.enemyMorale}.`);
  setEffects(combat, aliveEnemyMonkeys(state, combat).map((enemy) => ({ unitId: enemy.id, kind: "intimidate", text: "-moral" })));
}

function useTool(state: GameState, combat: PendingCombat, actor: Monkey): void {
  const faction = getFaction(state, state.playerFactionId);
  const tool = actor.inventory.shift() ?? (Object.entries(faction.inventory).find(([, count]) => (count ?? 0) > 0)?.[0] as ToolName | undefined);
  const enemies = aliveEnemyMonkeys(state, combat);
  const allies = alivePlayerMonkeys(state, combat);
  const toolMultiplier = getToolEfficiencyMultiplier(actor);
  const actorStats = getCombatMonkeyStats(actor, "USE_TOOL", combat.round);

  if (!tool && faction.food.herbs <= 0) {
    pushCombatLog(combat, `${actor.name} procurou uma ferramenta, mas nao havia nada pronto.`);
    setEffects(combat, [{ unitId: actor.id, kind: "miss", text: "sem ferramenta" }]);
    return;
  }

  if (tool && faction.inventory[tool]) {
    faction.inventory[tool] = Math.max(0, (faction.inventory[tool] ?? 0) - 1);
  }

  if (!tool && faction.food.herbs > 0) {
    const target = chooseWeakest(allies);
    faction.food.herbs -= 1;
    const healed = healMonkey(target, Math.round((4 + Math.floor(actorStats.charisma / 2)) * toolMultiplier));
    pushCombatLog(combat, `${actor.name} usou ervas medicinais em ${target.name}.`);
    setEffects(combat, [{ unitId: target.id, kind: "heal", text: `+${healed} HP` }]);
    return;
  }

  const toolName = String(tool);

  if (toolName.includes("Tambor") || toolName.includes("Mascara") || toolName.includes("Máscara")) {
    const pressure = Math.round((8 + actorStats.charisma + Math.floor(Math.random() * 6)) * toolMultiplier);
    combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - pressure, 0, 100);
    pushCombatLog(combat, `${actor.name} usou ${tool} para abalar a moral rival.`);
    setEffects(combat, enemies.map((enemy) => ({ unitId: enemy.id, kind: "intimidate", text: "-moral" })));
    return;
  }

  const target = chooseWeakest(enemies);
  const baseBonus = toolName.includes("Catapulta") ? 5 : toolName.includes("Armadilha") ? 4 : toolName.includes("Lan") ? 3 : 2;
  const bonus = Math.round(baseBonus * toolMultiplier);
  const damage = applyDamage(target, calculateDamage(state, actor, target, combat, bonus, "USE_TOOL"));
  if (toolName.includes("Armadilha")) {
    target.energy = clamp(target.energy - 10, 0, target.maxEnergy);
    updateMonkeyStatus(target);
  }
  addExposed(combat, actor.id);
  pushCombatLog(combat, `${actor.name} usou ${tool} contra ${target.name} e causou ${damage} dano.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function factionHasUsableTool(state: GameState, factionId: string): boolean {
  const faction = getFaction(state, factionId);
  return Object.values(faction.inventory).some((count) => (count ?? 0) > 0);
}

function chooseEnemyCombatChoice(state: GameState, combat: PendingCombat, enemy: Monkey): CombatChoice {
  const players = alivePlayerMonkeys(state, combat);
  const enemies = aliveEnemyMonkeys(state, combat);
  const faction = getFaction(state, enemy.factionId);
  const enemyPower = combatPowerWithConditions(enemies, "DIRECT_ATTACK", combat.round);
  const playerPower = combatPowerWithConditions(players, "DIRECT_ATTACK", combat.round);
  const lowMorale = enemy.morale < 25 || (combat.enemyMorale ?? 60) < 25;

  if (enemy.energy < 22) {
    return faction.aiPersonality === "gold" ? "NEGOTIATE_SURRENDER" : "SAVE_ENERGY";
  }
  if (faction.aiPersonality === "gold") {
    if (enemyPower < playerPower * 0.72 || lowMorale) {
      return Math.random() < 0.65 ? "NEGOTIATE_SURRENDER" : "DEFEND";
    }
    if (hasSkill(enemy, "gibbon-canopy-movement") && Math.random() < 0.35) {
      return "AMBUSH";
    }
    if (factionHasUsableTool(state, enemy.factionId) && Math.random() < 0.25) {
      return "USE_TOOL";
    }
    return Math.random() < 0.28 ? "DEFEND" : "DIRECT_ATTACK";
  }
  if (faction.aiPersonality === "stone") {
    if (lowMorale && enemyPower < playerPower * 0.8) {
      return "INTIMIDATE";
    }
    if (Math.random() < 0.25) {
      return "INTIMIDATE";
    }
    return Math.random() < 0.18 ? "FOCUS_LEADER" : "DIRECT_ATTACK";
  }
  if (hasSkill(enemy, "gibbon-canopy-movement") && Math.random() < 0.2) {
    return "AMBUSH";
  }
  return "DIRECT_ATTACK";
}

function applyEnemyTool(state: GameState, combat: PendingCombat, enemy: Monkey, effects: CombatEffect[]): void {
  const faction = getFaction(state, enemy.factionId);
  const tool = Object.entries(faction.inventory).find(([, count]) => (count ?? 0) > 0)?.[0] as ToolName | undefined;
  const players = alivePlayerMonkeys(state, combat);
  if (!tool || players.length === 0) {
    pushCombatLog(combat, `${enemy.name} procurou uma ferramenta, mas perdeu tempo.`);
    effects.push({ unitId: enemy.id, kind: "miss", text: "sem ferramenta" });
    return;
  }
  faction.inventory[tool] = Math.max(0, (faction.inventory[tool] ?? 0) - 1);
  const target = chooseWeakest(players);
  const bonus = Math.round((tool.includes("Catapulta") ? 5 : tool.includes("Armadilha") ? 4 : tool.includes("Lan") ? 3 : 2) * getToolEfficiencyMultiplier(enemy));
  const damage = applyDamage(target, calculateDamage(state, enemy, target, combat, bonus, "USE_TOOL"));
  enemy.energy = clamp(enemy.energy - 8, 0, enemy.maxEnergy);
  addExposed(combat, enemy.id);
  updateMonkeyStatus(enemy);
  pushCombatLog(combat, `${enemy.name} usou ${tool} contra ${target.name} e causou ${damage} dano.`);
  effects.push({ unitId: target.id, kind: "hit", text: `-${damage} HP` });
}

function applyEnemyChoice(state: GameState, combat: PendingCombat, enemy: Monkey, effects: CombatEffect[]): void {
  if (maybeMoraleFailure(combat, enemy)) {
    effects.push({ unitId: enemy.id, kind: "miss", text: "hesitou" });
    return;
  }

  const players = alivePlayerMonkeys(state, combat);
  if (players.length === 0) {
    return;
  }

  const choice = chooseEnemyCombatChoice(state, combat, enemy);
  if (choice === "DEFEND" || choice === "SAVE_ENERGY") {
    addDefending(combat, enemy.id);
    enemy.energy = clamp(enemy.energy + (choice === "SAVE_ENERGY" ? 9 : 4), 0, enemy.maxEnergy);
    enemy.morale = clamp(enemy.morale + 2, 0, 100);
    pushCombatLog(combat, `${enemy.name} segurou posicao e poupou folego.`);
    effects.push({ unitId: enemy.id, kind: "defend", text: choice === "SAVE_ENERGY" ? "+energia" : "defesa" });
    return;
  }

  if (choice === "NEGOTIATE_SURRENDER") {
    const faction = getFaction(state, enemy.factionId);
    const playerPower = combatPowerWithConditions(players, "DIRECT_ATTACK", combat.round);
    const enemyPower = combatPowerWithConditions(aliveEnemyMonkeys(state, combat), "NEGOTIATE_SURRENDER", combat.round);
    const pressure = getCombatMonkeyStats(enemy, "NEGOTIATE_SURRENDER", combat.round).charisma + enemy.morale / 10 + faction.diplomacyBias / 5;
    enemy.energy = clamp(enemy.energy - 5, 0, enemy.maxEnergy);
    if (enemyPower < playerPower * 0.78 && pressure + Math.random() * 12 > 14) {
      finishAsSummary(state, combat, "surrender", `${faction.name} ofereceu rendicao antes de perder mais macacos.`);
      return;
    }
    pushCombatLog(combat, `${enemy.name} tentou transformar a luta em conversa.`);
    effects.push(...players.map((player) => ({ unitId: player.id, kind: "intimidate" as const, text: "pressao" })));
    return;
  }

  if (choice === "INTIMIDATE") {
    const stats = getCombatMonkeyStats(enemy, "INTIMIDATE", combat.round);
    const pressure = Math.max(2, Math.round((stats.attack / 2 + stats.charisma + Math.random() * 6) / 3));
    players.forEach((player) => {
      player.morale = clamp(player.morale - pressure, 0, 100);
      updateMonkeyStatus(player);
    });
    enemy.energy = clamp(enemy.energy - 7, 0, enemy.maxEnergy);
    pushCombatLog(combat, `${enemy.name} intimidou sua linha e reduziu a moral dos aliados.`);
    effects.push(...players.map((player) => ({ unitId: player.id, kind: "intimidate" as const, text: "-moral" })));
    return;
  }

  if (choice === "USE_TOOL") {
    applyEnemyTool(state, combat, enemy, effects);
    return;
  }

  const target =
    choice === "FOCUS_LEADER"
      ? chooseLeaderTarget(players)
      : choice === "AMBUSH"
        ? chooseWeakest(players)
        : getFaction(state, enemy.factionId).aiPersonality === "stone"
          ? chooseWeakest(players)
          : Math.random() < 0.65
            ? chooseWeakest(players)
            : sample(players);

  if (choice === "AMBUSH") {
    const chance = clamp(
      (getCombatMonkeyStats(enemy, "AMBUSH", combat.round).stealth - getCombatMonkeyStats(target, "DEFEND", combat.round).stealth + enemy.energy / 12) / 18,
      0.22,
      0.78,
    );
    enemy.energy = clamp(enemy.energy - 11, 0, enemy.maxEnergy);
    if (Math.random() > chance) {
      pushCombatLog(combat, `${enemy.name} tentou uma emboscada, mas sua tribo percebeu.`);
      effects.push({ unitId: enemy.id, kind: "miss", text: "falhou" });
      return;
    }
  }

  const damage = applyDamage(
    target,
    calculateDamage(state, enemy, target, combat, choice === "FOCUS_LEADER" ? 2 : choice === "AMBUSH" ? 1 : 0, choice),
  );
  enemy.energy = clamp(enemy.energy - (choice === "DIRECT_ATTACK" ? 9 : 11), 0, enemy.maxEnergy);
  if (choice === "DIRECT_ATTACK" || choice === "FOCUS_LEADER") {
    addExposed(combat, enemy.id);
  }
  updateMonkeyStatus(enemy);
  pushCombatLog(combat, `${enemy.name} ${choice === "AMBUSH" ? "emboscou" : "atacou"} ${target.name} e causou ${damage} dano.`);
  effects.push({ unitId: target.id, kind: "hit", text: `-${damage} HP` });
}

function runEnemyTurn(state: GameState, combat: PendingCombat): void {
  combat.phase = "enemyTurn";
  const playerIds = new Set(combat.playerMonkeyIds);
  const effects: CombatEffect[] = [];

  if ((combat.enemyMorale ?? 60) < 18) {
    const enemyFactionId = combat.playerSide === "attacker" ? combat.defenderFactionId : combat.attackerFactionId;
    const faction = getFaction(state, enemyFactionId);
    const enemies = aliveEnemyMonkeys(state, combat);
    const players = alivePlayerMonkeys(state, combat);
    const surrenderChance = faction.aiPersonality === "gold" ? 0.5 : 0.18;
    const fleeChance = enemies.some((enemy) => hasSkill(enemy, "gibbon-canopy-movement")) ? 0.4 : 0.25;
    if (combatPowerWithConditions(enemies, "DEFEND", combat.round) < combatPowerWithConditions(players, "DIRECT_ATTACK", combat.round) && Math.random() < surrenderChance) {
      finishAsSummary(state, combat, "surrender", `${faction.name} perdeu a vontade de lutar e aceitou rendicao.`);
      return;
    }
    if (Math.random() < fleeChance) {
      finishAsSummary(state, combat, "enemyFled", `${faction.name} fugiu quando a moral quebrou.`);
      return;
    }
  }

  for (const enemy of aliveEnemyMonkeys(state, combat)) {
    if (finishIfSideDown(state, combat)) {
      return;
    }

    applyEnemyChoice(state, combat, enemy, effects);
    if (combat.result) {
      return;
    }
  }

  setEffects(combat, effects);
  if (finishIfSideDown(state, combat)) {
    return;
  }

  combat.defendingMonkeyIds = (combat.defendingMonkeyIds ?? []).filter((id) => !playerIds.has(id));
  combat.exposedMonkeyIds = (combat.exposedMonkeyIds ?? []).filter((id) => !playerIds.has(id));
  combat.protectedMonkeyIds = [];

  if (combat.round >= combat.maxRounds) {
    finishByRoundLimit(state, combat);
    return;
  }

  combat.round += 1;
  combat.actedMonkeyIds = [];
  combat.phase = "playerTurn";
  pushCombatLog(combat, `Rodada ${combat.round}: sua tribo age novamente.`);
}

function allPlayersActed(state: GameState, combat: PendingCombat): boolean {
  const acted = new Set(combat.actedMonkeyIds ?? []);
  return alivePlayerMonkeys(state, combat).every((monkey) => acted.has(monkey.id));
}

export function performPlayerCombatAction(state: GameState, request: CombatActionRequest): GameState {
  const combat = state.pendingCombat;
  if (!combat || combat.result) {
    return state;
  }
  ensureCombatDefaults(combat);
  if (combat.phase !== "playerTurn") {
    return state;
  }

  const actor = request.actorId ? getMonkey(state, request.actorId) : alivePlayerMonkeys(state, combat)[0];
  if (!actor || actor.status === "morto" || combat.actedMonkeyIds?.includes(actor.id)) {
    return state;
  }

  setEffects(combat, []);
  const choice = actionIdToChoice(request.action);
  if (choice !== "FLEE" && choice !== "NEGOTIATE_SURRENDER" && choice !== "SAVE_ENERGY" && maybeMoraleFailure(combat, actor)) {
    markActed(combat, actor.id);
    if (allPlayersActed(state, combat)) {
      runEnemyTurn(state, combat);
    }
    return state;
  }

  if (request.action === "attack") {
    applyAttack(state, combat, actor, request.targetId);
  } else if (request.action === "ambush") {
    applyAmbush(state, combat, actor, request.targetId);
  } else if (request.action === "focusLeader") {
    applyFocusLeader(state, combat, actor);
  } else if (request.action === "defend") {
    addDefending(combat, actor.id);
    actor.energy = clamp(actor.energy + 4, 0, actor.maxEnergy);
    actor.morale = clamp(actor.morale + 2, 0, 100);
    pushCombatLog(combat, `${actor.name} firmou defesa.`);
    setEffects(combat, [{ unitId: actor.id, kind: "defend", text: "defesa" }]);
  } else if (request.action === "intimidate") {
    const stats = getCombatMonkeyStats(actor, "INTIMIDATE", combat.round);
    const support = getCombatTeamSupportBonus(combatParticipants(state, combat), actor.factionId);
    const mandrillBonus = hasSkill(actor, "mandrill-intimidation") ? 3 + Math.floor(Math.random() * 6) : 0;
    const pressure = Math.round((stats.charisma + Math.floor(stats.attack / 2) + Math.floor(Math.random() * 8)) * (1 + support)) + mandrillBonus;
    combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - pressure, 0, 100);
    actor.energy = clamp(actor.energy - 7, 0, actor.maxEnergy);
    pushCombatLog(combat, `${actor.name} intimidou os rivais. Moral inimiga: ${combat.enemyMorale}.`);
    setEffects(combat, aliveEnemyMonkeys(state, combat).map((enemy) => ({ unitId: enemy.id, kind: "intimidate", text: "-moral" })));
    if ((combat.enemyMorale ?? 60) < 18 && Math.random() < 0.55) {
      finishAsSummary(state, combat, "enemyFled", "A moral inimiga quebrou e os rivais fugiram.");
      return state;
    }
  } else if (request.action === "surrender") {
    negotiateSurrender(state, combat, actor);
  } else if (request.action === "flee") {
    const players = alivePlayerMonkeys(state, combat);
    const area = getArea(state, combat.areaId);
    const escapeChance = clamp(
      (average(players.map((monkey) => getCombatMonkeyStats(monkey, "FLEE", combat.round).stealth + monkey.energy / 18)) +
        area.stealthModifier * 2) /
        18 +
        getFleeSkillBonus(players),
      0.18,
      0.82,
    );
    if (Math.random() < escapeChance) {
      finishAsSummary(state, combat, "flee", "A tribo escapou por rotas laterais antes do cerco fechar.");
      return state;
    }
    pushCombatLog(combat, "A fuga falhou; os rivais atacaram a retirada.");
    combat.actedMonkeyIds = players.map((monkey) => monkey.id);
    runEnemyTurn(state, combat);
    return state;
  } else if (request.action === "protect") {
    const ally = request.targetId ? getMonkey(state, request.targetId) : chooseWeakest(alivePlayerMonkeys(state, combat));
    addProtected(combat, ally.id);
    if (hasSkill(actor, "gorilla-natural-guard") || hasSkill(actor, "chimp-tactical-mind")) {
      addDefending(combat, ally.id);
      ally.morale = clamp(ally.morale + 2, 0, 100);
    }
    actor.energy = clamp(actor.energy - 5, 0, actor.maxEnergy);
    pushCombatLog(combat, `${actor.name} protegeu ${ally.name}.`);
    setEffects(combat, [{ unitId: ally.id, kind: "defend", text: "protegido" }]);
  } else if (request.action === "useTool") {
    useTool(state, combat, actor);
    actor.energy = clamp(actor.energy - 6, 0, actor.maxEnergy);
    updateMonkeyStatus(actor);
  } else if (request.action === "saveEnergy") {
    actor.energy = clamp(actor.energy + 12, 0, actor.maxEnergy);
    actor.morale = clamp(actor.morale + 1, 0, 100);
    addDefending(combat, actor.id);
    pushCombatLog(combat, `${actor.name} poupou energia e ficou em guarda.`);
    setEffects(combat, [{ unitId: actor.id, kind: "defend", text: "+energia" }]);
  }

  if (combat.result) {
    return state;
  }

  markActed(combat, actor.id);
  updateMonkeyStatus(actor);

  if (finishIfSideDown(state, combat)) {
    return state;
  }

  if (allPlayersActed(state, combat)) {
    runEnemyTurn(state, combat);
  }

  return state;
}

export function applyCombatConsequences(state: GameState, report: DailyReport): void {
  const combat = state.pendingCombat;
  const result = combat?.result;
  if (!combat || !result) {
    return;
  }

  const area = getArea(state, combat.areaId);
  const playerFaction = getFaction(state, state.playerFactionId);
  const opponent = getFaction(
    state,
    combat.playerSide === "attacker" ? combat.defenderFactionId : combat.attackerFactionId,
  );
  const defender = getFaction(state, combat.defenderFactionId);
  const attacker = getFaction(state, combat.attackerFactionId);

  result.playerDeadIds.forEach((id) => {
    getFaction(state, getMonkey(state, id).factionId).deaths += 1;
  });
  result.enemyDeadIds.forEach((id) => {
    getFaction(state, getMonkey(state, id).factionId).deaths += 1;
  });

  if (result.outcome === "victory" || result.outcome === "enemyFled") {
    playerFaction.battlesWon += 1;
  }

  if (result.territoryChanged) {
    area.ownerFactionId = result.outcome === "victory" ? state.playerFactionId : combat.attackerFactionId;
    area.controlledByFactionId = area.ownerFactionId;
  }

  if (result.foodDelta > 0) {
    const stolen = Math.min(opponent.food.bananas, result.foodDelta);
    opponent.food.bananas -= stolen;
    playerFaction.food.bananas += stolen;
  } else if (result.foodDelta < 0) {
    playerFaction.food.bananas = Math.max(0, playerFaction.food.bananas + result.foodDelta);
  }

  livingMonkeys(combatMonkeys(state, combat.playerMonkeyIds)).forEach((monkey) => {
    monkey.morale = clamp(monkey.morale + result.moraleDelta, 0, 100);
    updateMonkeyStatus(monkey);
  });
  playerFaction.morale = clamp(playerFaction.morale + result.moraleDelta, 0, 100);
  changeRelation(state, attacker.id, defender.id, result.relationDelta);

  report.confirmed.push(`${result.title} em ${area.name}: ${result.reason}`);
  result.lines.slice(1).forEach((line) => report.confirmed.push(line));
  if (result.playerInjuredIds.length > 0) {
    report.casualtySummary.push(
      `${result.playerInjuredIds.map((id) => getMonkey(state, id).name).join(", ")} ficaram feridos.`,
    );
  }
  if (result.playerDeadIds.length > 0) {
    report.casualtySummary.push(
      `${result.playerDeadIds.map((id) => getMonkey(state, id).name).join(", ")} morreram em combate.`,
    );
  }
}
