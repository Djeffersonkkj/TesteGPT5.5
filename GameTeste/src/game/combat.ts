import { monkeyPortrait } from "./assets";
import { GOLD_FACTION_ID, SHADOW_FACTION_ID, STONE_FACTION_ID } from "./constants";
import type {
  CombatActionId,
  CombatEffect,
  CombatResult,
  CombatUnit,
  DailyReport,
  GameState,
  Monkey,
  PendingCombat,
  ToolName,
} from "./types";
import {
  average,
  changeRelation,
  clamp,
  combatPower,
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
  { id: "defend", label: "Defender", text: "Ganha defesa ate o proximo ataque inimigo." },
  { id: "intimidate", label: "Intimidar", text: "Reduz moral inimiga e pode encerrar a luta." },
  { id: "flee", label: "Fugir", text: "Tenta sair do combate com perda de moral." },
  { id: "protect", label: "Proteger ferido", text: "Reduz dano recebido por um aliado.", needsTarget: "ally" },
  { id: "useTool", label: "Usar ferramenta", text: "Aplica uma ferramenta ou ervas se houver." },
  { id: "saveEnergy", label: "Poupar energia", text: "Recupera energia e ganha pequena defesa." },
];

function ensureCombatDefaults(combat: PendingCombat): void {
  combat.phase ??= "playerTurn";
  combat.actedMonkeyIds ??= [];
  combat.defendingMonkeyIds ??= [];
  combat.protectedMonkeyIds ??= [];
  combat.enemyMorale ??= 60;
  combat.lastEffects ??= [];
}

function combatMonkeys(state: GameState, ids: string[]): Monkey[] {
  return ids.map((id) => getMonkey(state, id));
}

function activeMonkeys(state: GameState, ids: string[]): Monkey[] {
  return livingMonkeys(combatMonkeys(state, ids));
}

function alivePlayerMonkeys(state: GameState, combat: PendingCombat): Monkey[] {
  return activeMonkeys(state, combat.playerMonkeyIds);
}

function aliveEnemyMonkeys(state: GameState, combat: PendingCombat): Monkey[] {
  return activeMonkeys(state, combat.enemyMonkeyIds);
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
    ...players.map((monkey, index): CombatUnit => ({
      id: monkey.id,
      monkeyId: monkey.id,
      name: monkey.name,
      factionId: monkey.factionId,
      team: "player",
      hp: monkey.hp,
      maxHp: monkey.maxHp,
      energy: monkey.energy,
      attack: monkey.attack,
      defense: monkey.defense,
      stealth: monkey.stealth,
      charisma: monkey.charisma,
      morale: monkey.morale,
      position: { x: index > 2 ? 1 : 0, y: yFor(index % 3, players.length) },
      hasActed: Boolean(combat.actedMonkeyIds?.includes(monkey.id)),
      status: unitStatus(monkey, combat),
      sprite: monkeyPortrait(state.monkeys.findIndex((item) => item.id === monkey.id)),
    })),
    ...enemies.map((monkey, index): CombatUnit => ({
      id: monkey.id,
      monkeyId: monkey.id,
      name: monkey.name,
      factionId: monkey.factionId,
      team: "enemy",
      hp: monkey.hp,
      maxHp: monkey.maxHp,
      energy: monkey.energy,
      attack: monkey.attack,
      defense: monkey.defense,
      stealth: monkey.stealth,
      charisma: monkey.charisma,
      morale: monkey.morale,
      position: { x: index > 2 ? 4 : 5, y: yFor(index % 3, enemies.length) },
      hasActed: false,
      status: unitStatus(monkey, combat),
      sprite: monkeyPortrait(state.monkeys.findIndex((item) => item.id === monkey.id)),
    })),
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

function chooseWeakest(monkeys: Monkey[]): Monkey {
  return [...monkeys].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
}

function calculateDamage(attacker: Monkey, target: Monkey, combat: PendingCombat, bonus = 0): number {
  const defending = combat.defendingMonkeyIds?.includes(target.id) ? 2 : 0;
  const protectedBonus = combat.protectedMonkeyIds?.includes(target.id) ? 3 : 0;
  const variance = Math.floor(Math.random() * 3) - 1;
  return Math.max(1, attacker.attack + bonus - Math.floor(target.defense * 0.45) - defending - protectedBonus + variance);
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
    `Feridos: ${playerInjured.length > 0 ? playerInjured.map((monkey) => monkey.name).join(", ") : "nenhum"}.`,
    `Mortos: ${playerDead.length > 0 ? playerDead.map((monkey) => monkey.name).join(", ") : "nenhum"}.`,
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
  const playerPower = combatPower(players);
  const enemyPower = combatPower(enemies);
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
  const damage = applyDamage(target, calculateDamage(actor, target, combat));
  actor.energy = clamp(actor.energy - 10, 0, actor.maxEnergy);
  updateMonkeyStatus(actor);
  pushCombatLog(combat, `${actor.name} atacou ${target.name} e causou ${damage} dano.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function useTool(state: GameState, combat: PendingCombat, actor: Monkey): void {
  const faction = getFaction(state, state.playerFactionId);
  const tool = actor.inventory.shift() ?? (Object.entries(faction.inventory).find(([, count]) => (count ?? 0) > 0)?.[0] as ToolName | undefined);
  const enemies = aliveEnemyMonkeys(state, combat);
  const allies = alivePlayerMonkeys(state, combat);

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
    const healed = healMonkey(target, 4 + Math.floor(actor.charisma / 2));
    pushCombatLog(combat, `${actor.name} usou ervas medicinais em ${target.name}.`);
    setEffects(combat, [{ unitId: target.id, kind: "heal", text: `+${healed} HP` }]);
    return;
  }

  const toolName = String(tool);

  if (toolName.includes("Tambor") || toolName.includes("Mascara") || toolName.includes("Máscara")) {
    const pressure = 8 + actor.charisma + Math.floor(Math.random() * 6);
    combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - pressure, 0, 100);
    pushCombatLog(combat, `${actor.name} usou ${tool} para abalar a moral rival.`);
    setEffects(combat, enemies.map((enemy) => ({ unitId: enemy.id, kind: "intimidate", text: "-moral" })));
    return;
  }

  const target = chooseWeakest(enemies);
  const bonus = toolName.includes("Catapulta") ? 5 : toolName.includes("Armadilha") ? 4 : toolName.includes("Lan") ? 3 : 2;
  const damage = applyDamage(target, calculateDamage(actor, target, combat, bonus));
  if (toolName.includes("Armadilha")) {
    target.energy = clamp(target.energy - 10, 0, target.maxEnergy);
    updateMonkeyStatus(target);
  }
  pushCombatLog(combat, `${actor.name} usou ${tool} contra ${target.name} e causou ${damage} dano.`);
  setEffects(combat, [{ unitId: target.id, kind: "hit", text: `-${damage} HP` }]);
}

function runEnemyTurn(state: GameState, combat: PendingCombat): void {
  combat.phase = "enemyTurn";
  const playerIds = new Set(combat.playerMonkeyIds);
  const effects: CombatEffect[] = [];

  for (const enemy of aliveEnemyMonkeys(state, combat)) {
    if (finishIfSideDown(state, combat)) {
      return;
    }

    const players = alivePlayerMonkeys(state, combat);
    const factionId = enemy.factionId;
    const enemyPower = combatPower(aliveEnemyMonkeys(state, combat));
    const playerPower = combatPower(players);

    if (factionId === GOLD_FACTION_ID && enemyPower < playerPower * 0.65 && Math.random() < 0.35) {
      if (Math.random() < 0.45) {
        finishAsSummary(state, combat, "surrender", `${getFaction(state, factionId).name} aceitou parar antes de perder mais lutadores.`);
        return;
      }
      addDefending(combat, enemy.id);
      pushCombatLog(combat, `${enemy.name} recuou e tentou negociar tempo.`);
      effects.push({ unitId: enemy.id, kind: "defend", text: "defesa" });
      continue;
    }

    const injuredTarget = players.find((monkey) => monkey.status === "ferido" || monkey.hp < monkey.maxHp * 0.5);
    if (factionId === SHADOW_FACTION_ID && injuredTarget && Math.random() < 0.35) {
      injuredTarget.energy = clamp(injuredTarget.energy - 7, 0, injuredTarget.maxEnergy);
      injuredTarget.morale = clamp(injuredTarget.morale - 8, 0, 100);
      updateMonkeyStatus(injuredTarget);
      pushCombatLog(combat, `${enemy.name} sabotou ${injuredTarget.name} pelas copas.`);
      effects.push({ unitId: injuredTarget.id, kind: "intimidate", text: "-energia" });
      continue;
    }

    const target = factionId === STONE_FACTION_ID ? chooseWeakest(players) : Math.random() < 0.65 ? chooseWeakest(players) : sample(players);
    const damage = applyDamage(target, calculateDamage(enemy, target, combat, factionId === STONE_FACTION_ID ? 1 : 0));
    enemy.energy = clamp(enemy.energy - 8, 0, enemy.maxEnergy);
    updateMonkeyStatus(enemy);
    pushCombatLog(combat, `${enemy.name} atacou ${target.name} e causou ${damage} dano.`);
    effects.push({ unitId: target.id, kind: "hit", text: `-${damage} HP` });
  }

  setEffects(combat, effects);
  if (finishIfSideDown(state, combat)) {
    return;
  }

  combat.defendingMonkeyIds = (combat.defendingMonkeyIds ?? []).filter((id) => !playerIds.has(id));
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

  if (request.action === "attack") {
    applyAttack(state, combat, actor, request.targetId);
  } else if (request.action === "defend") {
    addDefending(combat, actor.id);
    actor.energy = clamp(actor.energy + 4, 0, actor.maxEnergy);
    actor.morale = clamp(actor.morale + 2, 0, 100);
    pushCombatLog(combat, `${actor.name} firmou defesa.`);
    setEffects(combat, [{ unitId: actor.id, kind: "defend", text: "defesa" }]);
  } else if (request.action === "intimidate") {
    const pressure = actor.charisma + Math.floor(actor.attack / 2) + Math.floor(Math.random() * 8);
    combat.enemyMorale = clamp((combat.enemyMorale ?? 60) - pressure, 0, 100);
    actor.energy = clamp(actor.energy - 7, 0, actor.maxEnergy);
    pushCombatLog(combat, `${actor.name} intimidou os rivais. Moral inimiga: ${combat.enemyMorale}.`);
    setEffects(combat, aliveEnemyMonkeys(state, combat).map((enemy) => ({ unitId: enemy.id, kind: "intimidate", text: "-moral" })));
    if ((combat.enemyMorale ?? 60) < 18 && Math.random() < 0.55) {
      finishAsSummary(state, combat, "enemyFled", "A moral inimiga quebrou e os rivais fugiram.");
      return state;
    }
  } else if (request.action === "flee") {
    const players = alivePlayerMonkeys(state, combat);
    const area = getArea(state, combat.areaId);
    const escapeChance = clamp((average(players.map((monkey) => monkey.stealth + monkey.energy / 18)) + area.stealthModifier * 2) / 18, 0.18, 0.78);
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
