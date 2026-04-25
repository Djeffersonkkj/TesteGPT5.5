import { resolveEnemyAI } from "./ai";
import { ACTION_ROLE_HINT, GROUP_ACTION_LABELS, PLAYER_NAMES, SPECIES_PROFILES, TOOLS } from "./constants";
import { resolveCombatRound, type CombatOption } from "./combat";
import { applyHungerAndRecovery, regenerateAreaFood, summarizeFactionRelations } from "./economy";
import { resolveInternalEvents } from "./events";
import { canActInArea, getPlayerMainAreaId } from "./map";
import { createReport, ensureReportHasContent } from "./reports";
import type {
  DailyReport,
  AreaId,
  Faction,
  GameOverInfo,
  GameState,
  GroupActionPlan,
  GroupActionType,
  Monkey,
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
  const profile = SPECIES_PROFILES[species];
  return {
    id: uid("monkey"),
    name: sample(PLAYER_NAMES),
    species,
    factionId,
    hp: profile.maxHp,
    maxHp: profile.maxHp,
    energy: 60 + Math.floor(Math.random() * 25),
    maxEnergy: 100,
    attack: profile.attack,
    defense: profile.defense,
    stealth: profile.stealth,
    intelligence: profile.intelligence,
    charisma: profile.charisma,
    loyalty: 48 + Math.floor(Math.random() * 24),
    morale: 45 + Math.floor(Math.random() * 24),
    hunger: 28,
    foodConsumption: profile.foodConsumption,
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
  const skill = members.reduce((sum, monkey) => sum + monkey.intelligence + monkey.energy / 18, 0);
  const dangerPenalty = Math.max(0, area.dangerLevel - 3);
  const amount = Math.max(
    0,
    Math.min(area.currentFood, Math.floor(skill / 4 + toolBonus + Math.random() * 4 - dangerPenalty)),
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
  const skill = members.reduce((sum, monkey) => sum + monkey.stealth + monkey.intelligence, 0);
  area.knownByPlayer = true;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 12 + Math.floor(area.dangerLevel / 2));

  report.confirmed.push(`${members.length} explorador(es) mapearam ${area.name}.`);
  report.rumors.push(`${area.specialFeature}`);

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
      : state.factions.find((faction) => !faction.isPlayer && faction.alive)?.id;

  if (!targetFactionId) {
    report.rumors.push("Não havia ninguém disposto a negociar.");
    return;
  }

  const charisma = members.reduce((sum, monkey) => sum + monkey.charisma + monkey.morale / 20, 0);
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
  if (!targetFactionId) {
    report.suspicions.push(`O grupo tentou roubar em ${area.name}, mas não encontrou estoque rival.`);
    spendEnergy(members, 8);
    return;
  }

  const target = getFaction(state, targetFactionId);
  const stealth = members.reduce((sum, monkey) => sum + monkey.stealth + monkey.energy / 25, 0) + area.stealthModifier * 3;
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
  const charisma = members.reduce((sum, monkey) => sum + monkey.charisma + monkey.morale / 25, 0);
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
  const skill = members.reduce((sum, monkey) => sum + monkey.intelligence + monkey.energy / 30, 0);
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
      const amount = Math.max(0, Math.min(area.currentFood, Math.floor(monkey.intelligence / 2 + Math.random() * 3)));
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
      spendEnergy([monkey], 6);
      if (patient && faction.food.herbs > 0) {
        faction.food.herbs -= 1;
        patient.hp = clamp(patient.hp + 4 + Math.floor(monkey.intelligence / 3), 0, patient.maxHp);
        patient.morale = clamp(patient.morale + 4, 0, 100);
        updateMonkeyStatus(patient);
        report.confirmed.push(`${monkey.name} tratou os ferimentos de ${patient.name}.`);
      }
    } else if (monkey.role === "Artesão") {
      spendEnergy([monkey], 8);
      if (monkey.intelligence + Math.random() * 10 > 12) {
        const tool = sample(TOOLS);
        addToolToFaction(faction, tool);
        monkey.inventory.push(tool);
        report.confirmed.push(`${monkey.name} criou ${tool}.`);
      }
    } else if (monkey.role === "Diplomata") {
      const target = state.factions
        .filter((item) => !item.isPlayer && item.alive)
        .sort((a, b) => (b.relations[state.playerFactionId] ?? 0) - (a.relations[state.playerFactionId] ?? 0))[0];
      spendEnergy([monkey], 6);
      if (target) {
        changeRelation(state, state.playerFactionId, target.id, monkey.charisma > 5 ? 4 : 2);
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

  if (!defenderFactionId) {
    area.ownerFactionId = state.playerFactionId;
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
    playerMonkeyIds: attackers.map((monkey) => monkey.id),
    enemyMonkeyIds: defenders.slice(0, Math.max(3, attackers.length)).map((monkey) => monkey.id),
    log: [`Conflito iniciado em ${area.name} contra ${getFaction(state, defenderFactionId).name}.`],
  };

  report.confirmed.push(
    `O grupo de ataque encontrou resistência em ${area.name}. A decisão tática ficou nas mãos do líder.`,
  );
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

function evaluateGameOver(state: GameState, report: DailyReport): GameOverInfo | null {
  const player = getFaction(state, state.playerFactionId);
  const alive = livingFactionMonkeys(state, state.playerFactionId);
  const leader = state.monkeys.find((monkey) => monkey.factionId === state.playerFactionId && monkey.isLeader);
  const rivals = state.factions.filter((faction) => !faction.isPlayer && faction.alive);

  if (!leader || leader.status === "morto" || leader.hp <= 0) {
    return {
      won: false,
      title: "O líder caiu",
      narrative: "Sem seu líder, a facção se dividiu antes do próximo nascer do sol.",
      score: 0,
      lines: ["Derrota por morte do líder."],
    };
  }

  if (alive.length === 0 || alive.every((monkey) => monkey.status === "inconsciente" || monkey.status === "exausto")) {
    return {
      won: false,
      title: "A tribo perdeu a capacidade de agir",
      narrative: "Os poucos sobreviventes não conseguem mais defender estoque, território ou uns aos outros.",
      score: 0,
      lines: ["Derrota por colapso da facção."],
    };
  }

  if (rivals.length === 0) {
    return {
      won: true,
      title: "A ilha reconhece um único clã",
      narrative: "As facções rivais ruíram. Da copa ao mangue, todos sabem qual líder ainda está de pé.",
      score: buildScore(state).score + 250,
      lines: ["Vitória por eliminação das facções rivais."],
    };
  }

  if (state.day > 10 && countTerritories(state, state.playerFactionId) >= 8) {
    return {
      won: true,
      title: "Domínio das fontes de comida",
      narrative:
        "A tribo controla a maior parte das áreas férteis. Os rivais ainda respiram, mas dependem de migalhas.",
      score: buildScore(state).score + 180,
      lines: ["Vitória por controle territorial e alimentar."],
    };
  }

  if (state.day >= 100) {
    const result = buildScore(state);
    report.confirmed.push(`A campanha chegou ao limite de 100 dias. Pontuação final: ${result.score}.`);
    return result;
  }

  return null;
}

function finalizeDay(state: GameState, report: DailyReport): GameState {
  resolveEnemyAI(state, report);
  applyHungerAndRecovery(state, report);
  resolveInternalEvents(state, report);
  summarizeFactionRelations(state, report);

  state.factions.forEach((faction) => {
    if (livingFactionMonkeys(state, faction.id).length === 0) {
      faction.alive = false;
    }
  });

  syncAreaMonkeyVisibility(state);
  const gameOver = evaluateGameOver(state, report);
  state.report = ensureReportHasContent(report);
  state.workingReport = null;
  state.pendingCombat = null;

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
  const originAreaId = getPlayerMainAreaId(next);
  const blockedPlans = next.groupPlans.filter((plan) => !canActInArea(originAreaId, plan.areaId));
  if (blockedPlans.length > 0) {
    report.suspicions.push("Algumas ações foram canceladas: os macacos só podem se mover para áreas adjacentes.");
    next.groupPlans = next.groupPlans.filter((plan) => canActInArea(originAreaId, plan.areaId));
  }

  next.groupPlans
    .filter((plan) => plan.actionType !== "attack")
    .forEach((plan) => {
      resolveNonCombatGroupPlan(next, plan, report);
    });

  processRoleAssignments(next, report);

  const attackPlan = next.groupPlans.find((plan) => plan.actionType === "attack");
  if (attackPlan && createCombatFromPlan(next, attackPlan, report)) {
    next.phase = "combat";
    next.workingReport = report;
    pushLog(next, `Combate iniciado em ${getArea(next, attackPlan.areaId).name}.`);
    return next;
  }

  return finalizeDay(next, report);
}

export function chooseCombatTactic(
  state: GameState,
  tactic: CombatOption["id"],
): GameState {
  const next = cloneState(state);
  if (next.phase !== "combat" || !next.pendingCombat || !next.workingReport) {
    return next;
  }

  const result = resolveCombatRound(next, tactic);
  if (!result.finished) {
    return result.state;
  }

  return finalizeDay(result.state, result.state.workingReport ?? createReport(result.state.day));
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
