import { resolveEnemyAI } from "./ai";
import {
  ACTION_ROLE_HINT,
  ACTIVE_RIVAL_FACTION_IDS,
  GROUP_ACTION_LABELS,
  PLAYER_NAMES,
  TOOLS,
  isActiveRivalFactionId,
  isOfficialFactionId,
} from "./constants";
import { applyCombatConsequences, performPlayerCombatAction, type CombatActionRequest } from "./combat";
import { applyHungerAndRecovery, regenerateAreaFood, resolveDailyBananaProduction, summarizeFactionRelations } from "./economy";
import { generatePendingDecisions } from "./events";
import { normalizeAreaId } from "./map";
import { createReport, ensureReportHasContent } from "./reports";
import {
  applyDailySkillEffects,
  getDefaultSkillsForSpecies,
  getGroupActionSkillMultiplier,
  getInitialStatsForSpecies,
  getMonkeyEffectiveStats,
  hasSilentScout,
} from "./skills";
import type {
  DailyReport,
  AreaId,
  Faction,
  GameOverInfo,
  GameState,
  GroupActionPlan,
  GroupActionType,
  Monkey,
  PendingDecision,
  Species,
  ToolName,
} from "./types";
import {
  average,
  changeRelation,
  clamp,
  cloneState,
  combatPower,
  countTerritories,
  foodTotal,
  getArea,
  getFaction,
  getMonkey,
  livingFactionMonkeys,
  playerMonkeys,
  pushLog,
  relationBetween,
  roll,
  sample,
  syncAreaMonkeyVisibility,
  uid,
  updateMonkeyStatus,
} from "./utils";

function groupMembers(state: GameState, plan: GroupActionPlan): Monkey[] {
  return plan.monkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter((monkey): monkey is Monkey => monkey !== undefined && monkey.status !== "morto");
}

function spendEnergy(monkeys: Monkey[], amount: number): void {
  monkeys.forEach((monkey) => {
    monkey.energy = clamp(monkey.energy - amount, 0, monkey.maxEnergy);
    monkey.hunger = clamp(monkey.hunger + amount / 5, 0, 100);
    updateMonkeyStatus(monkey);
  });
}

function addToolToFaction(faction: Faction, tool: ToolName): void {
  faction.inventory[tool] = (faction.inventory[tool] ?? 0) + 1;
}

function createRecruit(factionId: string, locationId: AreaId): Monkey {
  const species: Species = sample(["Chimpanzé", "Macaco-prego", "Gibão", "Mandril"]);
  const stats = getInitialStatsForSpecies(species);
  return {
    id: uid("monkey"),
    name: sample(PLAYER_NAMES),
    species,
    skills: getDefaultSkillsForSpecies(species),
    factionId,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    energy: 60 + Math.floor(Math.random() * 25),
    maxEnergy: 100,
    attack: stats.attack,
    defense: stats.defense,
    stealth: stats.stealth,
    intelligence: stats.intelligence,
    charisma: stats.charisma,
    loyalty: 48 + Math.floor(Math.random() * 24),
    morale: 45 + Math.floor(Math.random() * 24),
    hunger: 28,
    foodConsumption: stats.foodConsumption,
    locationId,
    status: "normal",
    role: null,
    persistentRole: null,
    plannedAction: null,
    inventory: [],
    isLeader: false,
  };
}

export function acknowledgeReport(state: GameState): GameState {
  const next = cloneState(state);
  if (next.phase !== "report") {
    return next;
  }
  next.phase = "planning";
  pushLog(next, `Dia ${next.day}: decisões liberadas.`);
  return next;
}

function resolveGroupCollect(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const faction = getFaction(state, state.playerFactionId);
  const members = groupMembers(state, plan);
  const toolBonus = members.some((monkey) => monkey.inventory.includes("Cesto de folhas")) ? 3 : 0;
  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const skill = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "collect" });
    return sum + stats.intelligence + monkey.energy / 18;
  }, 0);
  const dangerPenalty = Math.max(0, area.dangerLevel - 3);
  const amount = Math.max(
    0,
    Math.min(area.currentFood, Math.floor((skill / 4 + toolBonus) * multiplier + Math.random() * 4 - dangerPenalty)),
  );

  area.currentFood -= amount;
  faction.food.bananas += amount;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 10 + area.dangerLevel);

  report.confirmed.push(
    `${members.map((monkey) => monkey.name).join(", ")} coletaram ${amount} banana(s) em ${area.name}.`,
  );

  if (area.dangerLevel >= 6 && roll(0.35)) {
    const hurt = sample(members);
    hurt.hp = clamp(hurt.hp - 2, 0, hurt.maxHp);
    hurt.morale = clamp(hurt.morale - 8, 0, 100);
    updateMonkeyStatus(hurt);
    report.confirmed.push(`${hurt.name} se feriu enfrentando o perigo de ${area.name}.`);
  }
}

function resolveGroupExplore(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const members = groupMembers(state, plan);
  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const skill = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "explore" });
    return sum + stats.stealth + stats.intelligence;
  }, 0) * multiplier;
  area.knownByPlayer = true;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 12 + Math.floor(area.dangerLevel / 2));

  report.confirmed.push(`${members.length} explorador(es) mapearam ${area.name}.`);
  if (hasSilentScout(members) && roll(0.55)) {
    report.confirmed.push(`${area.specialFeature}`);
  } else {
    report.rumors.push(`${area.specialFeature}`);
  }

  if (area.hiddenMonkeyIds.length > 0 || skill > 26) {
    const hidden = area.hiddenMonkeyIds.length;
    report.confirmed.push(
      hidden > 0
        ? `Foram encontrados sinais de ${hidden} macaco(s) escondido(s) em ${area.name}.`
        : `Nenhum inimigo escondido foi confirmado em ${area.name}.`,
    );
  } else if (roll(0.45)) {
    report.suspicions.push(`Rastros antigos em ${area.name} parecem ter sido apagados de propósito.`);
  }
}

function resolveGroupPatrol(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const members = groupMembers(state, plan);
  members.forEach((monkey) => {
    monkey.locationId = area.id;
    monkey.morale = clamp(monkey.morale + 2, 0, 100);
  });
  spendEnergy(members, 8);
  report.confirmed.push(`${members.length} guarda(s) patrulharam ${area.name} e reforçaram a vigilância.`);
}

function resolveGroupNegotiate(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const members = groupMembers(state, plan);
  const targetFactionId =
    area.ownerFactionId && area.ownerFactionId !== state.playerFactionId
      ? area.ownerFactionId
      : state.factions.find((faction) => isActiveRivalFactionId(faction.id) && faction.alive)?.id;

  if (!targetFactionId || !isActiveRivalFactionId(targetFactionId)) {
    report.rumors.push("Não havia ninguém disposto a negociar.");
    return;
  }

  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const charisma = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "negotiate" });
    return sum + stats.charisma + monkey.morale / 20;
  }, 0) * multiplier;
  const relation = relationBetween(state, state.playerFactionId, targetFactionId);
  const target = getFaction(state, targetFactionId);
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 8);

  if (charisma + relation / 4 + Math.random() * 20 > 24) {
    changeRelation(state, state.playerFactionId, targetFactionId, 8);
    report.confirmed.push(`A negociação com ${target.name} melhorou a relação em torno de ${area.name}.`);
    if (target.food.bananas > 8 && roll(0.35)) {
      const traded = 2;
      target.food.bananas -= traded;
      getFaction(state, state.playerFactionId).food.bananas += traded;
      report.confirmed.push(`${target.name} aceitou trocar ${traded} banana(s) por promessas de paz.`);
    }
  } else {
    changeRelation(state, state.playerFactionId, targetFactionId, -6);
    report.rumors.push(`${target.name} rejeitou a conversa e chamou seus diplomatas de oportunistas.`);
  }
}

function resolveGroupSteal(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const members = groupMembers(state, plan);
  const targetFactionId = area.ownerFactionId && area.ownerFactionId !== state.playerFactionId ? area.ownerFactionId : null;
  if (!targetFactionId || !isActiveRivalFactionId(targetFactionId)) {
    report.suspicions.push(`O grupo tentou roubar em ${area.name}, mas não encontrou estoque rival.`);
    spendEnergy(members, 8);
    return;
  }

  const target = getFaction(state, targetFactionId);
  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const stealth = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "steal" });
    return sum + stats.stealth + monkey.energy / 25;
  }, 0) * multiplier + area.stealthModifier * 3;
  const defense =
    livingFactionMonkeys(state, targetFactionId)
      .filter((monkey) => monkey.locationId === area.id)
      .reduce((sum, monkey) => sum + monkey.intelligence + monkey.defense, 0) + area.dangerLevel;

  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 14);

  if (stealth + Math.random() * 18 > defense + Math.random() * 12) {
    const stolen = Math.min(target.food.bananas, 3 + Math.floor(Math.random() * 4));
    target.food.bananas -= stolen;
    getFaction(state, state.playerFactionId).food.bananas += stolen;
    changeRelation(state, state.playerFactionId, targetFactionId, -8);
    report.confirmed.push(`O roubo em ${area.name} trouxe ${stolen} banana(s) sem combate aberto.`);
  } else {
    const hurt = sample(members);
    hurt.hp = clamp(hurt.hp - 3, 0, hurt.maxHp);
    hurt.loyalty = clamp(hurt.loyalty - 4, 0, 100);
    updateMonkeyStatus(hurt);
    changeRelation(state, state.playerFactionId, targetFactionId, -15);
    report.confirmed.push(`O roubo em ${area.name} foi descoberto; ${hurt.name} voltou ferido.`);
  }
}

function resolveGroupRecruit(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const area = getArea(state, plan.areaId);
  const members = groupMembers(state, plan);
  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const charisma = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "recruit" });
    return sum + stats.charisma + monkey.morale / 25;
  }, 0) * multiplier;
  const food = foodTotal(getFaction(state, state.playerFactionId));
  const caveBonus = area.id === "caverna" ? 12 : 0;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 9);

  if (charisma + caveBonus + food / 3 + Math.random() * 12 > 28) {
    const recruit = createRecruit(state.playerFactionId, area.id);
    state.monkeys.push(recruit);
    report.confirmed.push(`${recruit.name}, ${recruit.species}, juntou-se à tribo em ${area.name}.`);
  } else {
    report.rumors.push(`Peregrinos em ${area.name} ouviram a proposta, mas preferiram esperar mais um dia.`);
  }
}

function resolveGroupCraft(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  const members = groupMembers(state, plan);
  const faction = getFaction(state, state.playerFactionId);
  const multiplier = getGroupActionSkillMultiplier(members, plan.actionType);
  const skill = members.reduce((sum, monkey) => {
    const stats = getMonkeyEffectiveStats(monkey, { action: "craft" });
    return sum + stats.intelligence + monkey.energy / 30;
  }, 0) * multiplier;
  spendEnergy(members, 10);

  if (skill + Math.random() * 12 > 18) {
    const tool = sample(TOOLS);
    addToolToFaction(faction, tool);
    sample(members).inventory.push(tool);
    report.confirmed.push(`${members.map((monkey) => monkey.name).join(", ")} criaram ${tool}.`);
  } else {
    report.suspicions.push("A tentativa de criar ferramentas gastou cipós e tempo, mas nada ficou pronto.");
  }
}

function resolveNonCombatGroupPlan(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): void {
  if (plan.actionType === "collect") {
    resolveGroupCollect(state, plan, report);
  } else if (plan.actionType === "explore") {
    resolveGroupExplore(state, plan, report);
  } else if (plan.actionType === "negotiate") {
    resolveGroupNegotiate(state, plan, report);
  } else if (plan.actionType === "steal") {
    resolveGroupSteal(state, plan, report);
  } else if (plan.actionType === "recruit") {
    resolveGroupRecruit(state, plan, report);
  } else if (plan.actionType === "patrol") {
    resolveGroupPatrol(state, plan, report);
  } else if (plan.actionType === "craft") {
    resolveGroupCraft(state, plan, report);
  }
}

function processRoleAssignments(state: GameState, report: DailyReport): void {
  const faction = getFaction(state, state.playerFactionId);
  const assignedToGroup = new Set(
    state.groupPlans.flatMap((plan) => plan.monkeyIds),
  );
  const player = livingFactionMonkeys(state, state.playerFactionId);

  player.forEach((monkey) => {
    if (assignedToGroup.has(monkey.id) || !monkey.role) {
      if (!assignedToGroup.has(monkey.id) && !monkey.role) {
        monkey.morale = clamp(monkey.morale - 1, 0, 100);
      }
      return;
    }

    if (monkey.role === "Coletor") {
      const area = getArea(state, monkey.locationId);
      const stats = getMonkeyEffectiveStats(monkey, { action: "collect" });
      const amount = Math.max(0, Math.min(area.currentFood, Math.floor(stats.intelligence / 2 + Math.random() * 3)));
      area.currentFood -= amount;
      faction.food.bananas += amount;
      spendEnergy([monkey], 8 + Math.floor(area.dangerLevel / 2));
      report.confirmed.push(`${monkey.name} coletou ${amount} banana(s) em ${area.name}.`);
    } else if (monkey.role === "Explorador") {
      const area = sample(state.areas);
      area.knownByPlayer = true;
      spendEnergy([monkey], 9);
      report.rumors.push(`${monkey.name} trouxe pistas sobre ${area.name}: ${area.specialFeature}`);
    } else if (monkey.role === "Guarda") {
      spendEnergy([monkey], 5);
      monkey.loyalty = clamp(monkey.loyalty + 1, 0, 100);
    } else if (monkey.role === "Guerreiro") {
      spendEnergy([monkey], 8);
      monkey.morale = clamp(monkey.morale + 2, 0, 100);
    } else if (monkey.role === "Curandeiro") {
      const patient = player.find((ally) => ally.hp < ally.maxHp && ally.status !== "morto");
      const stats = getMonkeyEffectiveStats(monkey);
      spendEnergy([monkey], 6);
      if (patient && faction.food.herbs > 0) {
        faction.food.herbs -= 1;
        patient.hp = clamp(patient.hp + 4 + Math.floor(stats.intelligence / 3), 0, patient.maxHp);
        patient.morale = clamp(patient.morale + 4, 0, 100);
        updateMonkeyStatus(patient);
        report.confirmed.push(`${monkey.name} tratou os ferimentos de ${patient.name}.`);
      }
    } else if (monkey.role === "Artesão") {
      const stats = getMonkeyEffectiveStats(monkey, { action: "craft" });
      spendEnergy([monkey], 8);
      if (stats.intelligence + Math.random() * 10 > 12) {
        const tool = sample(TOOLS);
        addToolToFaction(faction, tool);
        monkey.inventory.push(tool);
        report.confirmed.push(`${monkey.name} criou ${tool}.`);
      }
    } else if (monkey.role === "Diplomata") {
      const target = state.factions
        .filter((item) => isActiveRivalFactionId(item.id) && item.alive)
        .sort((a, b) => (b.relations[state.playerFactionId] ?? 0) - (a.relations[state.playerFactionId] ?? 0))[0];
      const stats = getMonkeyEffectiveStats(monkey, { action: "negotiate" });
      spendEnergy([monkey], 6);
      if (target) {
        changeRelation(state, state.playerFactionId, target.id, stats.charisma > 5 ? 4 : 2);
        report.rumors.push(`${monkey.name} espalhou palavras de paz para ${target.name}.`);
      }
    }
  });
}

function createCombatFromPlan(
  state: GameState,
  plan: GroupActionPlan,
  report: DailyReport,
): boolean {
  const area = getArea(state, plan.areaId);
  const attackers = groupMembers(state, plan);
  const defenderFactionId =
    area.ownerFactionId && area.ownerFactionId !== state.playerFactionId
      ? area.ownerFactionId
      : state.monkeys.find(
          (monkey) =>
            monkey.locationId === area.id &&
            monkey.factionId !== state.playerFactionId &&
            monkey.status !== "morto",
        )?.factionId;

  if (defenderFactionId && !isActiveRivalFactionId(defenderFactionId)) {
    area.ownerFactionId = state.playerFactionId;
    area.controlledByFactionId = state.playerFactionId;
    attackers.forEach((monkey) => {
      monkey.locationId = area.id;
      monkey.energy = clamp(monkey.energy - 10, 0, monkey.maxEnergy);
      updateMonkeyStatus(monkey);
    });
    report.confirmed.push(`O ataque encontrou ${area.name} sem facção rival oficial. A área foi ocupada.`);
    return false;
  }

  if (!defenderFactionId) {
    area.ownerFactionId = state.playerFactionId;
    area.controlledByFactionId = state.playerFactionId;
    attackers.forEach((monkey) => {
      monkey.locationId = area.id;
      monkey.energy = clamp(monkey.energy - 10, 0, monkey.maxEnergy);
      updateMonkeyStatus(monkey);
    });
    report.confirmed.push(`O ataque encontrou ${area.name} sem defesa clara. A área foi ocupada.`);
    return false;
  }

  let defenders = livingFactionMonkeys(state, defenderFactionId).filter(
    (monkey) => monkey.locationId === area.id,
  );
  if (defenders.length === 0) {
    defenders = livingFactionMonkeys(state, defenderFactionId).slice(0, 4);
    defenders.forEach((monkey) => {
      monkey.locationId = area.id;
    });
  }

  attackers.forEach((monkey) => {
    monkey.locationId = area.id;
    monkey.energy = clamp(monkey.energy - 4, 0, monkey.maxEnergy);
  });

  state.pendingCombat = {
    id: uid("combat"),
    areaId: area.id,
    attackerFactionId: state.playerFactionId,
    defenderFactionId,
    playerSide: "attacker",
    round: 1,
    maxRounds: 3,
    phase: "playerTurn",
    playerMonkeyIds: attackers.map((monkey) => monkey.id),
    enemyMonkeyIds: defenders.slice(0, Math.max(3, attackers.length)).map((monkey) => monkey.id),
    actedMonkeyIds: [],
    defendingMonkeyIds: [],
    protectedMonkeyIds: [],
    enemyMorale: Math.floor(average(defenders.map((monkey) => monkey.morale))) || getFaction(state, defenderFactionId).morale,
    lastEffects: [],
    log: [`Conflito iniciado em ${area.name} contra ${getFaction(state, defenderFactionId).name}.`],
  };

  report.confirmed.push(
    `O grupo de ataque encontrou resistência em ${area.name}. A decisão tática ficou nas mãos do líder.`,
  );
  return true;
}

function createCombatFromEvent(
  state: GameState,
  areaId: AreaId | undefined,
  enemyFactionId: string | undefined,
  report: DailyReport,
): boolean {
  const area = getArea(state, areaId ?? state.selectedAreaId);
  const rivalId =
    enemyFactionId ??
    area.ownerFactionId ??
    state.factions.find((faction) => isActiveRivalFactionId(faction.id) && faction.alive)?.id;
  if (!rivalId || rivalId === state.playerFactionId || !isActiveRivalFactionId(rivalId)) {
    report.suspicions.push("O alerta hostil passou sem inimigos claros.");
    return false;
  }

  const defenders = livingFactionMonkeys(state, state.playerFactionId)
    .filter((monkey) => normalizeAreaId(monkey.locationId) === area.id)
    .slice(0, 4);
  const playerGroup = defenders.length > 0 ? defenders : livingFactionMonkeys(state, state.playerFactionId).slice(0, 3);
  const enemiesHere = livingFactionMonkeys(state, rivalId).filter((monkey) => normalizeAreaId(monkey.locationId) === area.id);
  const enemies = (enemiesHere.length > 0 ? enemiesHere : livingFactionMonkeys(state, rivalId)).slice(0, Math.max(2, playerGroup.length));

  if (playerGroup.length === 0 || enemies.length === 0) {
    report.suspicions.push("A emboscada nao encontrou lutadores suficientes para virar combate aberto.");
    return false;
  }

  playerGroup.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  enemies.forEach((monkey) => {
    monkey.locationId = area.id;
  });

  state.pendingCombat = {
    id: uid("combat"),
    areaId: area.id,
    attackerFactionId: rivalId,
    defenderFactionId: state.playerFactionId,
    playerSide: "defender",
    round: 1,
    maxRounds: 3,
    phase: "playerTurn",
    playerMonkeyIds: playerGroup.map((monkey) => monkey.id),
    enemyMonkeyIds: enemies.map((monkey) => monkey.id),
    actedMonkeyIds: [],
    defendingMonkeyIds: [],
    protectedMonkeyIds: [],
    enemyMorale: Math.floor(average(enemies.map((monkey) => monkey.morale))) || getFaction(state, rivalId).morale,
    lastEffects: [],
    log: [`Emboscada iniciada em ${area.name} contra ${getFaction(state, rivalId).name}.`],
  };
  state.phase = "combat";
  state.workingReport = report;
  pushLog(state, `Emboscada em ${area.name}.`);
  report.confirmed.push(`Uma ameaca hostil virou combate em ${area.name}.`);
  return true;
}

function resetOrdersAndApplyPersistentRoles(state: GameState, nextReport: DailyReport): void {
  state.groupPlans = [];
  livingFactionMonkeys(state, state.playerFactionId).forEach((monkey) => {
    monkey.plannedAction = null;
    monkey.role = null;
    if (!monkey.persistentRole) {
      return;
    }
    const blocked =
      monkey.status === "ferido" ||
      monkey.status === "faminto" ||
      monkey.status === "exausto" ||
      monkey.status === "inconsciente" ||
      monkey.energy < 16;
    if (blocked) {
      nextReport.suspicions.push(
        `${monkey.name} não conseguiu manter a função ${monkey.persistentRole} porque está ${monkey.status}.`,
      );
      return;
    }
    monkey.role = monkey.persistentRole;
    monkey.plannedAction = { kind: "role", role: monkey.persistentRole };
  });
}

function buildScore(state: GameState): GameOverInfo {
  const player = getFaction(state, state.playerFactionId);
  const alive = livingFactionMonkeys(state, state.playerFactionId);
  const tools = Object.values(player.inventory).reduce((sum, count) => sum + (count ?? 0), 0);
  const score =
    alive.length * 12 +
    Math.floor(foodTotal(player) * 2) +
    countTerritories(state, player.id) * 15 +
    player.battlesWon * 25 +
    Math.floor(average(alive.map((monkey) => monkey.morale))) +
    tools * 8 -
    player.deaths * 12 -
    player.deserters * 15;

  return {
    won: false,
    title: "Fim do centésimo dia",
    narrative:
      "A ilha ainda não tem um único soberano. Os sobreviventes contam cicatrizes, estoques e promessas quebradas.",
    score,
    lines: [
      `População viva: ${alive.length}`,
      `Comida armazenada: ${Math.floor(foodTotal(player))}`,
      `Áreas controladas: ${countTerritories(state, player.id)}`,
      `Batalhas vencidas: ${player.battlesWon}`,
      `Moral média: ${Math.floor(average(alive.map((monkey) => monkey.morale)))}`,
      `Ferramentas criadas: ${tools}`,
      `Mortes: ${player.deaths}`,
      `Deserções: ${player.deserters}`,
    ],
  };
}

function factionDailyNeed(state: GameState, factionId: string): number {
  return livingFactionMonkeys(state, factionId).reduce((sum, monkey) => sum + monkey.foodConsumption, 0);
}

function factionFoodProduction(state: GameState, factionId: string): number {
  return state.areas
    .filter((area) => area.ownerFactionId === factionId)
    .reduce((sum, area) => sum + area.currentBananaProduction, 0);
}

function operationalMonkeys(monkeys: Monkey[]): Monkey[] {
  return monkeys.filter(
    (monkey) =>
      monkey.hp > 1 &&
      monkey.energy > 8 &&
      monkey.status !== "morto" &&
      monkey.status !== "inconsciente" &&
      monkey.status !== "exausto",
  );
}

function rivalCannotSurvive(state: GameState, factionId: string): boolean {
  const faction = state.factions.find((item) => item.id === factionId);
  if (!faction || !faction.alive) {
    return true;
  }

  const alive = livingFactionMonkeys(state, faction.id);
  if (alive.length === 0) {
    return true;
  }

  const needed = factionDailyNeed(state, faction.id);
  const foodDays = foodTotal(faction) / Math.max(1, needed);
  const production = factionFoodProduction(state, faction.id);
  const operative = operationalMonkeys(alive);
  return (
    operative.length === 0 ||
    (foodDays < 0.5 && production < Math.max(4, needed)) ||
    (alive.length <= 2 && faction.morale < 25 && countTerritories(state, faction.id) <= 1)
  );
}

function rivalIsWeakened(state: GameState, factionId: string): boolean {
  if (rivalCannotSurvive(state, factionId)) {
    return true;
  }

  const faction = getFaction(state, factionId);
  const alive = livingFactionMonkeys(state, faction.id);
  const foodDays = foodTotal(faction) / Math.max(1, factionDailyNeed(state, faction.id));
  return alive.length <= 4 || faction.morale < 32 || foodDays < 1.2 || countTerritories(state, faction.id) <= 1;
}

function evaluateGameOver(state: GameState, report: DailyReport): GameOverInfo | null {
  const player = getFaction(state, state.playerFactionId);
  const alive = livingFactionMonkeys(state, state.playerFactionId);
  const leader = state.monkeys.find((monkey) => monkey.factionId === state.playerFactionId && monkey.isLeader);
  const rivals = state.factions.filter((faction) => isActiveRivalFactionId(faction.id) && faction.alive);
  const operative = operationalMonkeys(alive);
  const playerNeed = factionDailyNeed(state, state.playerFactionId);
  const playerFoodDays = foodTotal(player) / Math.max(1, playerNeed);
  const averageHunger = average(alive.map((monkey) => monkey.hunger));

  if (!leader || leader.status === "morto" || leader.hp <= 0) {
    return {
      won: false,
      title: "O líder caiu",
      narrative: "Sem seu líder, a facção se dividiu antes do próximo nascer do sol.",
      score: 0,
      lines: ["Derrota por morte do líder."],
    };
  }

  if (alive.length === 0) {
    return {
      won: false,
      title: "A tribo acabou",
      narrative: "Nenhum macaco do jogador sobreviveu para carregar o nome da facção.",
      score: 0,
      lines: ["Derrota porque todos os macacos do jogador morreram."],
    };
  }

  if (operative.length === 0 || alive.every((monkey) => monkey.status === "inconsciente" || monkey.status === "exausto")) {
    return {
      won: false,
      title: "A tribo perdeu a capacidade de agir",
      narrative: "Os poucos sobreviventes não conseguem mais defender estoque, território ou uns aos outros.",
      score: 0,
      lines: ["Derrota porque a facção do jogador ficou sem capacidade real de agir."],
    };
  }

  if (playerFoodDays < 0.35 && averageHunger > 82 && (player.deserters >= 2 || operative.length <= Math.ceil(alive.length / 3))) {
    return {
      won: false,
      title: "Colapso da tribo",
      narrative: "Fome, deserção e exaustão quebraram a organização antes que houvesse uma última ordem útil.",
      score: 0,
      lines: ["Derrota por fome, deserção e incapacidade operacional."],
    };
  }

  const rivalsEliminatedOrUnable = ACTIVE_RIVAL_FACTION_IDS.every((factionId) => rivalCannotSurvive(state, factionId));
  if (rivals.length === 0 || rivalsEliminatedOrUnable) {
    return {
      won: true,
      title: "A ilha reconhece um único clã",
      narrative: "Punho de Pedra e Fruto Dourado ruíram ou já não conseguem sobreviver. Da copa ao mangue, todos sabem qual líder ainda está de pé.",
      score: buildScore(state).score + 250,
      lines: ["Vitória por eliminação ou incapacidade das facções rivais oficiais."],
    };
  }

  const totalFoodProduction = state.areas.reduce((sum, area) => sum + area.currentBananaProduction, 0);
  const playerFoodProduction = factionFoodProduction(state, state.playerFactionId);
  const dominatesFood = totalFoodProduction > 0 && playerFoodProduction / totalFoodProduction > 0.5;
  const rivalsWeakened = ACTIVE_RIVAL_FACTION_IDS.every((factionId) => rivalIsWeakened(state, factionId));
  if (state.day > 10 && dominatesFood && rivalsWeakened) {
    return {
      won: true,
      title: "Domínio das fontes de comida",
      narrative:
        "A tribo controla a maior parte das fontes de comida. Punho de Pedra e Fruto Dourado ainda respiram, mas estão fracos demais para sustentar uma disputa real.",
      score: buildScore(state).score + 180,
      lines: ["Vitória por domínio alimentar com rivais enfraquecidas."],
    };
  }

  if (state.day >= 100) {
    const result = buildScore(state);
    report.confirmed.push(`A campanha chegou ao limite de 100 dias. Pontuação final: ${result.score}.`);
    return result;
  }

  return null;
}

function addDecisionReportLine(report: DailyReport, level: string | undefined, text: string): void {
  if (level === "confirmado") {
    report.confirmed.push(text);
  } else if (level === "rumor") {
    report.rumors.push(text);
  } else {
    report.suspicions.push(text);
  }
}

function describeDecisionEffect(effect: PendingDecision["options"][number]["effects"][number], state: GameState): string | null {
  if (effect.hidden) {
    return null;
  }
  const amount = effect.value ?? 0;
  if (effect.type === "food") {
    return `${amount > 0 ? "+" : ""}${amount} comida`;
  }
  if (effect.type === "morale") {
    return `${amount > 0 ? "+" : ""}${amount} moral da tribo`;
  }
  if (effect.type === "relation" && effect.factionId) {
    const faction = state.factions.find((item) => item.id === effect.factionId);
    return `${amount > 0 ? "+" : ""}${amount} relacao com ${faction?.name ?? "faccao"}`;
  }
  if (effect.type === "loyalty" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    return `${amount > 0 ? "+" : ""}${amount} lealdade${monkey ? ` de ${monkey.name}` : ""}`;
  }
  if (effect.type === "monkeyMorale" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    return `${amount > 0 ? "+" : ""}${amount} moral${monkey ? ` de ${monkey.name}` : ""}`;
  }
  if (effect.type === "hurtMonkey" || effect.type === "hurtRandomPlayer") {
    return "risco de ferimento";
  }
  if (effect.type === "exileMonkey") {
    return "um macaco deixa a tribo";
  }
  if (effect.type === "setRole") {
    return "descanso planejado";
  }
  return null;
}

export function describeDecisionOptionEffects(option: PendingDecision["options"][number], state: GameState): string[] {
  return option.effects
    .map((effect) => describeDecisionEffect(effect, state))
    .filter((line): line is string => Boolean(line));
}

function applyDecisionEffect(
  state: GameState,
  report: DailyReport,
  decision: PendingDecision,
  effect: PendingDecision["options"][number]["effects"][number],
): void {
  const player = getFaction(state, state.playerFactionId);
  const value = effect.value ?? 0;

  if (effect.type === "food") {
    player.food.bananas = Math.max(0, player.food.bananas + value);
    return;
  }

  if (effect.type === "morale") {
    player.morale = clamp(player.morale + value, 0, 100);
    livingFactionMonkeys(state, state.playerFactionId).forEach((monkey) => {
      monkey.morale = clamp(monkey.morale + value, 0, 100);
      updateMonkeyStatus(monkey);
    });
    return;
  }

  if (effect.type === "loyalty" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    if (monkey) {
      monkey.loyalty = clamp(monkey.loyalty + value, 0, 100);
    }
    return;
  }

  if (effect.type === "monkeyMorale" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    if (monkey) {
      monkey.morale = clamp(monkey.morale + value, 0, 100);
      updateMonkeyStatus(monkey);
    }
    return;
  }

  if (effect.type === "relation" && effect.factionId) {
    if (!isActiveRivalFactionId(effect.factionId) || !state.factions.some((faction) => faction.id === effect.factionId)) {
      return;
    }
    changeRelation(state, state.playerFactionId, effect.factionId, value);
    return;
  }

  if (effect.type === "hurtMonkey" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    if (monkey) {
      monkey.hp = clamp(monkey.hp - Math.max(1, value), 0, monkey.maxHp);
      updateMonkeyStatus(monkey);
    }
    return;
  }

  if (effect.type === "hurtRandomPlayer") {
    const candidates = livingFactionMonkeys(state, state.playerFactionId).filter((monkey) => !monkey.isLeader);
    if (candidates.length > 0) {
      const monkey = sample(candidates);
      monkey.hp = clamp(monkey.hp - Math.max(1, value), 0, monkey.maxHp);
      updateMonkeyStatus(monkey);
      report.casualtySummary.push(`${monkey.name} voltou ferido depois da decisao sobre ${decision.title}.`);
    }
    return;
  }

  if (effect.type === "exileMonkey" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    if (monkey) {
      state.monkeys = state.monkeys.filter((item) => item.id !== monkey.id);
      player.deserters += 1;
    }
    return;
  }

  if (effect.type === "setRole" && effect.target) {
    const monkey = state.monkeys.find((item) => item.id === effect.target);
    if (monkey) {
      monkey.role = "Descansando";
      monkey.persistentRole = "Descansando";
      monkey.plannedAction = { kind: "role", role: "Descansando" };
    }
    return;
  }

  if (effect.type === "addStatus" && effect.target && effect.status) {
    getMonkey(state, effect.target).status = effect.status;
    return;
  }

  if (effect.type === "removeStatus" && effect.target) {
    const monkey = getMonkey(state, effect.target);
    monkey.status = "normal";
    updateMonkeyStatus(monkey);
    return;
  }

  if (effect.type === "addReport" && effect.text) {
    addDecisionReportLine(report, effect.reportLevel, effect.text);
    return;
  }

  if (effect.type === "startCombat") {
    createCombatFromEvent(state, effect.areaId, effect.factionId, report);
  }
}

function continueAfterResolution(state: GameState, report: DailyReport): GameState {
  resolveEnemyAI(state, report);
  const decisions = generatePendingDecisions(state, report);
  if (decisions.length > 0) {
    state.pendingDecisions = decisions;
    state.workingReport = report;
    state.phase = "decisions";
    pushLog(state, `${decisions.length} decisao(oes) pendente(s) antes do amanhecer.`);
    return state;
  }

  return finalizeDay(state, report);
}

export function finalizeDay(state: GameState, report: DailyReport): GameState {
  resolveDailyBananaProduction(state, report);
  applyHungerAndRecovery(state, report);
  state = applyDailySkillEffects(state, report);
  summarizeFactionRelations(state, report);

  state.factions.forEach((faction) => {
    if (!isOfficialFactionId(faction.id)) {
      faction.alive = false;
      return;
    }
    if (livingFactionMonkeys(state, faction.id).length === 0) {
      faction.alive = false;
    }
  });

  syncAreaMonkeyVisibility(state);
  const gameOver = evaluateGameOver(state, report);
  state.report = ensureReportHasContent(report);
  state.workingReport = null;
  state.pendingCombat = null;
  state.pendingDecisions = [];

  if (gameOver) {
    state.gameOver = gameOver;
    state.phase = "gameOver";
    pushLog(state, gameOver.title);
    return state;
  }

  state.day += 1;
  resetOrdersAndApplyPersistentRoles(state, state.report);
  state.phase = "report";
  pushLog(state, `Dia ${state.day - 1} encerrado. Relatório preparado.`);
  return state;
}

export function endDay(state: GameState): GameState {
  const next = cloneState(state);
  if (next.phase !== "planning") {
    return next;
  }

  const report = createReport(next.day);
  regenerateAreaFood(next);
  if (resolvePlayerActions(next, report)) {
    return next;
  }

  return continueAfterResolution(next, report);
}

export function resolvePlayerActions(state: GameState, report: DailyReport): boolean {
  const planMembersAreInArea = (plan: GroupActionPlan) =>
    plan.monkeyIds.every((id) => {
      const monkey = state.monkeys.find((item) => item.id === id);
      return monkey && normalizeAreaId(monkey.locationId) === plan.areaId;
    });
  const blockedPlans = state.groupPlans.filter((plan) => !planMembersAreInArea(plan));
  if (blockedPlans.length > 0) {
    const blockedPlanIds = new Set(blockedPlans.map((plan) => plan.id));
    report.suspicions.push("Algumas acoes foram canceladas: os macacos precisam estar no cenario da acao.");
    state.groupPlans = state.groupPlans.filter(planMembersAreInArea);
    state.monkeys.forEach((monkey) => {
      if (monkey.plannedAction?.kind !== "group" || !blockedPlanIds.has(monkey.plannedAction.groupActionId)) {
        return;
      }
      monkey.plannedAction = monkey.persistentRole ? { kind: "role", role: monkey.persistentRole } : null;
      monkey.role = monkey.persistentRole;
    });
  }

  state.groupPlans
    .filter((plan) => plan.actionType !== "attack")
    .forEach((plan) => {
      resolveNonCombatGroupPlan(state, plan, report);
    });

  processRoleAssignments(state, report);

  const attackPlan = state.groupPlans.find((plan) => plan.actionType === "attack");
  if (attackPlan && createCombatFromPlan(state, attackPlan, report)) {
    state.phase = "combat";
    state.workingReport = report;
    pushLog(state, `Combate iniciado em ${getArea(state, attackPlan.areaId).name}.`);
    return true;
  }

  return false;
}

export function chooseCombatAction(
  state: GameState,
  request: CombatActionRequest,
): GameState {
  const next = cloneState(state);
  if (next.phase !== "combat" || !next.pendingCombat || !next.workingReport) {
    return next;
  }

  return performPlayerCombatAction(next, request);
}

export function confirmCombatSummary(state: GameState): GameState {
  const next = cloneState(state);
  if (next.phase !== "combat" || !next.pendingCombat?.result) {
    return next;
  }

  const report = next.workingReport ?? createReport(next.day);
  applyCombatConsequences(next, report);
  const resultTitle = next.pendingCombat.result.title;
  next.pendingCombat = null;
  next.workingReport = report;
  pushLog(next, `Combate encerrado: ${resultTitle}.`);

  if (next.pendingDecisions.length > 0) {
    next.phase = "decisions";
    return next;
  }

  return continueAfterResolution(next, report);
}

export function applyDecisionOption(
  state: GameState,
  decisionId: string,
  optionId: string,
): GameState {
  const next = cloneState(state);
  if (next.phase !== "decisions" || next.pendingDecisions.length === 0) {
    return next;
  }

  const decision = next.pendingDecisions.find((item) => item.id === decisionId);
  const option = decision?.options.find((item) => item.id === optionId);
  if (!decision || !option) {
    return next;
  }

  const report = next.workingReport ?? createReport(next.day);
  option.effects.forEach((effect) => {
    applyDecisionEffect(next, report, decision, effect);
  });
  pushLog(next, `${decision.title}: ${option.label}.`);

  next.pendingDecisions = next.pendingDecisions.filter((item) => item.id !== decision.id);
  next.workingReport = report;

  if ((next as GameState).phase === "combat" && next.pendingCombat) {
    return next;
  }

  if (next.pendingDecisions.length > 0) {
    next.phase = "decisions";
    return next;
  }

  return finalizeDay(next, report);
}

export function describeUnassignedMonkeys(state: GameState): string[] {
  return playerMonkeys(state)
    .filter((monkey) => !monkey.plannedAction && monkey.status !== "morto")
    .map((monkey) => monkey.name);
}

export function actionLabel(actionType: GroupActionType): string {
  return GROUP_ACTION_LABELS[actionType];
}

export function roleForAction(actionType: GroupActionType) {
  return ACTION_ROLE_HINT[actionType];
}
