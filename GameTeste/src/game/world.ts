import {
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  STONE_FACTION_ID,
  WORLD_EVENT_LIMITS,
  isActiveRivalFactionId,
  isOfficialFactionId,
} from "./constants";
import { normalizeAreaId } from "./map";
import { createReport, ensureReportHasContent } from "./reports";
import type {
  Area,
  AreaId,
  DailyReport,
  DiplomaticDecisionResult,
  DiplomaticEffect,
  DiplomaticMemory,
  Faction,
  FactionBehaviorProfile,
  FactionRequestEvent,
  FactionRelation,
  FactionRelationStatus,
  GameState,
  GroupActionType,
  Monkey,
  MonkeyOpinion,
  PendingDecision,
  PlayerReputation,
  Rumor,
  SecretPlan,
  TemporaryPact,
  TheftDetectionLevel,
  TheftDetectionResult,
  TheftEvent,
  TheftEvidence,
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
  roll,
  sample,
  uid,
  updateMonkeyStatus,
} from "./utils";

type MutableGameState = GameState;

const DEFAULT_PLAYER_REPUTATION: PlayerReputation = {
  honor: 50,
  cruelty: 10,
  reliability: 50,
  strength: 35,
  cunning: 20,
};

function relationKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function ranged(random: () => number, min: number, max: number): number {
  return Math.round(min + random() * (max - min));
}

function officialPairDefaults(a: string, b: string): FactionRelation {
  const [factionAId, factionBId] = [a, b].sort();
  const isPlayerStone = relationKey(a, b) === relationKey(PLAYER_FACTION_ID, STONE_FACTION_ID);
  const isPlayerGold = relationKey(a, b) === relationKey(PLAYER_FACTION_ID, GOLD_FACTION_ID);
  const isStoneGold = relationKey(a, b) === relationKey(STONE_FACTION_ID, GOLD_FACTION_ID);

  let score = 0;
  let trust = 40;
  let respect = 20;
  let fear = 5;

  if (isPlayerStone) {
    score = -15;
    trust = 35;
    respect = 30;
    fear = 10;
  } else if (isPlayerGold) {
    score = 10;
    trust = 45;
    respect = 20;
    fear = 5;
  } else if (isStoneGold) {
    score = -20;
    trust = 30;
    respect = 25;
    fear = 15;
  }

  const relation: FactionRelation = {
    factionAId,
    factionBId,
    score,
    trust,
    fear,
    respect,
    resentment: score < 0 ? Math.abs(score) : 0,
    status: "NEUTRAL",
    lastMajorEvents: [],
  };
  relation.status = recalculateRelationStatus(relation);
  return relation;
}

function syncLegacyRelations(state: MutableGameState, relation: FactionRelation): void {
  const factionA = state.factions.find((faction) => faction.id === relation.factionAId);
  const factionB = state.factions.find((faction) => faction.id === relation.factionBId);
  if (!factionA || !factionB) {
    return;
  }
  factionA.relations ??= {};
  factionB.relations ??= {};
  factionA.relations[factionB.id] = relation.score;
  factionB.relations[factionA.id] = relation.score;
}

function setRelation(state: MutableGameState, relation: FactionRelation): void {
  state.factionRelations = [
    ...(state.factionRelations ?? []).filter(
      (item) => relationKey(item.factionAId, item.factionBId) !== relationKey(relation.factionAId, relation.factionBId),
    ),
    relation,
  ];
  syncLegacyRelations(state, relation);
}

function getMutableRelation(state: MutableGameState, a: string, b: string): FactionRelation {
  state.factionRelations ??= [];
  const found = state.factionRelations.find((relation) => relationKey(relation.factionAId, relation.factionBId) === relationKey(a, b));
  if (found) {
    return found;
  }
  const created = officialPairDefaults(a, b);
  setRelation(state, created);
  return created;
}

function defaultOpinion(monkey: Monkey): MonkeyOpinion {
  return {
    loyaltyToLeader: clamp(monkey.loyalty ?? 55, 0, 100),
    fearOfLeader: 12,
    trustInLeader: clamp(monkey.morale ?? 55, 0, 100),
    anger: clamp(monkey.hunger / 2, 0, 100),
    hope: clamp(monkey.morale ?? 55, 0, 100),
  };
}

function reportFor(state: MutableGameState): DailyReport {
  state.workingReport ??= state.report ?? createReport(state.day);
  return state.workingReport;
}

function ensureReportSections(report: DailyReport): DailyReport {
  report.confirmed ??= [];
  report.rumors ??= [];
  report.suspicions ??= [];
  report.tribeReactions ??= [];
  report.diplomacy ??= [];
  report.areaEvents ??= [];
  report.gainsAndLosses ??= [];
  report.hungerSummary ??= [];
  report.casualtySummary ??= [];
  report.relationsSummary ??= [];
  return report;
}

function resetCountersForDay(state: MutableGameState): void {
  if (!state.worldEventCounters || state.worldEventCounters.day !== state.day) {
    state.worldEventCounters = {
      day: state.day,
      internalReactions: 0,
      diplomaticEvents: 0,
      theftEvents: 0,
      rumors: 0,
    };
  }
}

function addKnowledgeLine(
  state: MutableGameState,
  area: Area,
  confirmed: string,
  rumor: string,
  suspicion: string,
  section: "confirmed" | "rumors" | "suspicions" | "areaEvents" | "diplomacy" = "areaEvents",
): void {
  const report = ensureReportSections(reportFor(state));
  const player = livingFactionMonkeys(state, state.playerFactionId);
  const nearby = new Set<AreaId>([area.id, ...area.adjacentAreaIds]);
  const hasObserver = player.some((monkey) => monkey.locationId === area.id);
  const hasScout = player.some((monkey) => {
    const role = monkey.role ?? monkey.persistentRole;
    return nearby.has(monkey.locationId) && (role === "Explorador" || role === "Guarda");
  });

  if (hasObserver || hasScout) {
    report.confirmed.push(confirmed);
    if (section !== "confirmed") {
      report[section].push(confirmed);
    }
  } else if (area.knownByPlayer || roll(0.45)) {
    report.rumors.push(rumor);
    if (section !== "rumors") {
      report[section].push(rumor);
    }
  } else {
    report.suspicions.push(suspicion);
    if (section !== "suspicions") {
      report[section].push(suspicion);
    }
  }
}

function factionDailyNeed(state: GameState, factionId: string): number {
  return livingFactionMonkeys(state, factionId).reduce((sum, monkey) => sum + monkey.foodConsumption, 0);
}

function updateBehaviorMetrics(state: MutableGameState): void {
  Object.values(state.factionBehaviorProfiles ?? {}).forEach((profile) => {
    const faction = state.factions.find((item) => item.id === profile.factionId);
    if (!faction) {
      return;
    }
    const need = Math.max(1, factionDailyNeed(state, faction.id));
    const days = foodTotal(faction) / need;
    profile.foodDesperation = clamp(Math.round(100 - days * 30), 0, 100);
  });
}

function factionName(state: GameState, factionId: string): string {
  return state.factions.find((faction) => faction.id === factionId)?.name ?? "Uma faccao";
}

function otherRival(factionId: string): string {
  return factionId === STONE_FACTION_ID ? GOLD_FACTION_ID : STONE_FACTION_ID;
}

function closestUsefulArea(state: GameState, factionId: string, enemyFactionId?: string): AreaId {
  const owned = state.areas
    .filter((area) => area.ownerFactionId === enemyFactionId || area.ownerFactionId === factionId)
    .sort((a, b) => b.currentBananaProduction + b.currentFood - (a.currentBananaProduction + a.currentFood));
  return (owned[0] ?? state.areas[0]).id;
}

export function generateFactionBehaviorProfile(factionId: string, seed = `${factionId}-${Date.now()}`): FactionBehaviorProfile {
  const random = seededRandom(`${seed}-${factionId}`);

  if (factionId === STONE_FACTION_ID) {
    return {
      factionId,
      aggression: ranged(random, 65, 90),
      diplomacy: ranged(random, 20, 48),
      honor: ranged(random, 45, 78),
      greed: ranged(random, 35, 62),
      paranoia: ranged(random, 30, 58),
      betrayalChance: ranged(random, 12, 38),
      riskTolerance: ranged(random, 55, 82),
      foodDesperation: 0,
      revengeFocus: ranged(random, 35, 68),
    };
  }

  if (factionId === GOLD_FACTION_ID) {
    return {
      factionId,
      aggression: ranged(random, 28, 62),
      diplomacy: ranged(random, 70, 94),
      honor: ranged(random, 25, 58),
      greed: ranged(random, 48, 82),
      paranoia: ranged(random, 38, 72),
      betrayalChance: ranged(random, 18, 68),
      riskTolerance: ranged(random, 30, 62),
      foodDesperation: 0,
      revengeFocus: ranged(random, 18, 52),
    };
  }

  return {
    factionId,
    aggression: 50,
    diplomacy: 50,
    honor: 50,
    greed: 35,
    paranoia: 25,
    betrayalChance: 10,
    riskTolerance: 45,
    foodDesperation: 0,
    revengeFocus: 25,
  };
}

export function recalculateRelationStatus(relation: FactionRelation): FactionRelationStatus {
  if (relation.allianceUntilDay && relation.status === "TEMPORARY_ALLIANCE") {
    return "TEMPORARY_ALLIANCE";
  }
  if (relation.truceUntilDay && relation.status === "TRUCE") {
    return "TRUCE";
  }
  if (relation.score <= -70) {
    return "WAR";
  }
  if (relation.score <= -35) {
    return "HOSTILE";
  }
  if (relation.score <= -10) {
    return "TENSE";
  }
  if (relation.score <= 20) {
    return "NEUTRAL";
  }
  return "FRIENDLY";
}

export function getFactionRelation(gameState: GameState, factionAId: string, factionBId: string): FactionRelation {
  const found = (gameState.factionRelations ?? []).find(
    (relation) => relationKey(relation.factionAId, relation.factionBId) === relationKey(factionAId, factionBId),
  );
  return structuredClone(found ?? officialPairDefaults(factionAId, factionBId)) as FactionRelation;
}

export function initializeFactionRelations(gameState: GameState): GameState {
  const next = cloneState(gameState);
  next.report = ensureReportSections(next.report ?? createReport(next.day));
  if (next.workingReport) {
    next.workingReport = ensureReportSections(next.workingReport);
  }
  next.factionRelations = Array.isArray(next.factionRelations) ? next.factionRelations : [];
  next.factionBehaviorProfiles = next.factionBehaviorProfiles ?? {};
  next.temporaryPacts = Array.isArray(next.temporaryPacts) ? next.temporaryPacts : [];
  next.theftEvents = Array.isArray(next.theftEvents) ? next.theftEvents : [];
  next.rumors = Array.isArray(next.rumors) ? next.rumors : [];
  next.secretPlans = Array.isArray(next.secretPlans) ? next.secretPlans : [];
  next.internalEvents = Array.isArray(next.internalEvents) ? next.internalEvents : [];
  next.factionRequests = Array.isArray(next.factionRequests) ? next.factionRequests : [];
  next.playerReputation = next.playerReputation ?? { ...DEFAULT_PLAYER_REPUTATION };

  next.monkeys = next.monkeys.map((monkey) => ({
    ...monkey,
    opinion: monkey.opinion ?? defaultOpinion(monkey),
  }));

  next.factions.forEach((faction) => {
    faction.relations ??= {};
  });

  next.factions
    .filter((faction) => isOfficialFactionId(faction.id))
    .forEach((faction, index, factions) => {
      factions.slice(index + 1).forEach((other) => {
        const existing = next.factionRelations.find(
          (relation) => relationKey(relation.factionAId, relation.factionBId) === relationKey(faction.id, other.id),
        );
        const relation = existing ?? officialPairDefaults(faction.id, other.id);
        relation.score = clamp(relation.score, -100, 100);
        relation.trust = clamp(relation.trust, 0, 100);
        relation.fear = clamp(relation.fear, 0, 100);
        relation.respect = clamp(relation.respect, 0, 100);
        relation.resentment = clamp(relation.resentment, 0, 100);
        relation.status = recalculateRelationStatus(relation);
        setRelation(next, relation);
      });
    });

  [STONE_FACTION_ID, GOLD_FACTION_ID].forEach((factionId) => {
    next.factionBehaviorProfiles[factionId] ??= generateFactionBehaviorProfile(factionId, `${next.day}-${next.logs?.[0] ?? "new"}`);
  });

  resetCountersForDay(next);
  updateBehaviorMetrics(next);
  return next;
}

export function updateFactionRelation(
  gameState: GameState,
  factionAId: string,
  factionBId: string,
  memory: DiplomaticMemory,
): GameState {
  const next = initializeFactionRelations(gameState);
  const relation = getMutableRelation(next, factionAId, factionBId);
  relation.score = clamp(relation.score + (memory.impact.score ?? 0), -100, 100);
  relation.trust = clamp(relation.trust + (memory.impact.trust ?? 0), 0, 100);
  relation.fear = clamp(relation.fear + (memory.impact.fear ?? 0), 0, 100);
  relation.respect = clamp(relation.respect + (memory.impact.respect ?? 0), 0, 100);
  relation.resentment = clamp(relation.resentment + (memory.impact.resentment ?? 0), 0, 100);
  relation.lastMajorEvents = [memory, ...(relation.lastMajorEvents ?? [])].slice(0, 8);
  relation.status = recalculateRelationStatus(relation);
  setRelation(next, relation);
  return next;
}

export function createTemporaryPact(params: {
  gameState: GameState;
  factions: string[];
  type: TemporaryPact["type"];
  durationDays?: number;
  terms?: string[];
  trustModifier?: number;
  secretBetrayalPlan?: TemporaryPact["secretBetrayalPlan"];
}): GameState {
  const next = initializeFactionRelations(params.gameState);
  const durationDays = params.durationDays ?? 3 + Math.floor(Math.random() * 6);
  const pact: TemporaryPact = {
    id: uid("pact"),
    factions: [...new Set(params.factions)].sort(),
    type: params.type,
    startDay: next.day,
    endDay: next.day + durationDays,
    terms: params.terms ?? [],
    trustModifier: params.trustModifier ?? 4,
    secretBetrayalPlan: params.secretBetrayalPlan,
  };
  next.temporaryPacts = [...next.temporaryPacts, pact];

  if (pact.factions.length >= 2) {
    const relation = getMutableRelation(next, pact.factions[0], pact.factions[1]);
    relation.score = clamp(relation.score + pact.trustModifier, -100, 100);
    relation.trust = clamp(relation.trust + pact.trustModifier, 0, 100);
    relation.status = pact.type === "TEMPORARY_ALLIANCE" ? "TEMPORARY_ALLIANCE" : "TRUCE";
    if (pact.type === "TEMPORARY_ALLIANCE") {
      relation.allianceUntilDay = pact.endDay;
    } else {
      relation.truceUntilDay = pact.endDay;
    }
    setRelation(next, relation);
  }

  return next;
}

export function expireTemporaryPacts(gameState: GameState): GameState {
  const next = initializeFactionRelations(gameState);
  const expired = next.temporaryPacts.filter((pact) => pact.endDay < next.day);
  next.temporaryPacts = next.temporaryPacts.filter((pact) => pact.endDay >= next.day);
  expired.forEach((pact) => {
    if (pact.factions.length < 2) {
      return;
    }
    const relation = getMutableRelation(next, pact.factions[0], pact.factions[1]);
    if (relation.truceUntilDay && relation.truceUntilDay < next.day) {
      relation.truceUntilDay = undefined;
    }
    if (relation.allianceUntilDay && relation.allianceUntilDay < next.day) {
      relation.allianceUntilDay = undefined;
    }
    relation.status = recalculateRelationStatus({ ...relation, status: "NEUTRAL" });
    setRelation(next, relation);
    const report = ensureReportSections(reportFor(next));
    report.diplomacy.push(`A ${pact.type === "TRUCE" ? "tregua" : "alianca"} entre ${pact.factions.map((id) => factionName(next, id)).join(" e ")} chegou ao fim.`);
  });
  return next;
}

export function checkPactViolation(
  gameState: GameState,
  action: { factionId: string; targetFactionId: string; actionType: GroupActionType | "attack" | "steal" },
): GameState {
  let next = initializeFactionRelations(gameState);
  const pact = next.temporaryPacts.find(
    (item) => item.endDay >= next.day && item.factions.includes(action.factionId) && item.factions.includes(action.targetFactionId),
  );
  if (!pact || (action.actionType !== "attack" && action.actionType !== "steal")) {
    return next;
  }

  next = updateFactionRelation(next, action.factionId, action.targetFactionId, {
    day: next.day,
    type: action.actionType === "attack" ? "BROKE_TRUCE" : "STOLE_FOOD",
    description: `${factionName(next, action.factionId)} violou ${pact.type}.`,
    impact: {
      score: action.actionType === "attack" ? -35 : -14,
      trust: action.actionType === "attack" ? -40 : -16,
      resentment: action.actionType === "attack" ? 28 : 12,
      fear: action.actionType === "attack" ? 8 : 0,
    },
  });
  next.temporaryPacts = next.temporaryPacts.filter((item) => item.id !== pact.id);
  if (action.factionId === next.playerFactionId) {
    next = updatePlayerReputation(next, { type: "BROKE_TRUCE" });
  }
  return next;
}

function pactBetween(state: GameState, a: string, b: string): TemporaryPact | undefined {
  return (state.temporaryPacts ?? []).find(
    (pact) => pact.endDay >= state.day && pact.factions.includes(a) && pact.factions.includes(b),
  );
}

function chooseAIConflictAction(
  state: GameState,
  attackerId: string,
  defenderId: string,
  area: Area,
): "combat" | "steal" | "negotiate" | "truce" | "retreat" {
  const attackerProfile = state.factionBehaviorProfiles[attackerId] ?? generateFactionBehaviorProfile(attackerId);
  const defenderProfile = state.factionBehaviorProfiles[defenderId] ?? generateFactionBehaviorProfile(defenderId);
  const relation = getFactionRelation(state, attackerId, defenderId);
  const attacker = getFaction(state, attackerId);
  const defender = getFaction(state, defenderId);
  const attackerMonkeys = livingFactionMonkeys(state, attackerId).filter((monkey) => monkey.locationId === area.id);
  const defenderMonkeys = livingFactionMonkeys(state, defenderId).filter((monkey) => monkey.locationId === area.id);
  const powerBalance = combatPower(attackerMonkeys.length ? attackerMonkeys : livingFactionMonkeys(state, attackerId).slice(0, 3)) -
    combatPower(defenderMonkeys.length ? defenderMonkeys : livingFactionMonkeys(state, defenderId).slice(0, 3));
  const hungerPressure = attackerProfile.foodDesperation + (foodTotal(attacker) < factionDailyNeed(state, attacker.id) * 1.5 ? 18 : 0);
  const pact = pactBetween(state, attackerId, defenderId);

  if (pact && attackerProfile.honor + relation.trust > attackerProfile.betrayalChance + attackerProfile.greed) {
    return hungerPressure > 75 && attackerProfile.greed > 55 ? "steal" : "retreat";
  }

  if (relation.status === "WAR" || relation.score <= -65) {
    return powerBalance > -10 || attackerProfile.aggression > 78 ? "combat" : "retreat";
  }
  if (hungerPressure > 72 && attackerProfile.greed + attackerProfile.paranoia > defenderProfile.diplomacy) {
    return "steal";
  }
  if (relation.score <= -25 && attackerProfile.aggression + attackerProfile.riskTolerance > 120) {
    return "combat";
  }
  if (relation.score > -18 && attackerProfile.diplomacy > 55 && roll(0.35)) {
    return "truce";
  }
  if (attackerProfile.diplomacy > attackerProfile.aggression && roll(0.55)) {
    return "negotiate";
  }
  return roll(0.35) ? "combat" : "retreat";
}

function chooseAIMembers(state: GameState, factionId: string, areaId: AreaId, count: number): Monkey[] {
  const present = livingFactionMonkeys(state, factionId).filter((monkey) => monkey.locationId === areaId);
  const candidates = present.length > 0 ? present : livingFactionMonkeys(state, factionId);
  return [...candidates]
    .sort((a, b) => b.attack + b.defense + b.energy / 20 - (a.attack + a.defense + a.energy / 20))
    .slice(0, count);
}

function applyAIDamage(monkeys: Monkey[], amount: number): void {
  monkeys.slice(0, 2).forEach((monkey) => {
    monkey.hp = clamp(monkey.hp - amount, 0, monkey.maxHp);
    monkey.energy = clamp(monkey.energy - 8, 0, monkey.maxEnergy);
    monkey.morale = clamp(monkey.morale - 6, 0, 100);
    updateMonkeyStatus(monkey);
  });
}

export function resolveAIFactionConflicts(gameState: GameState): GameState {
  let next = initializeFactionRelations(gameState);
  const report = ensureReportSections(reportFor(next));
  const rivalIds = [STONE_FACTION_ID, GOLD_FACTION_ID].filter((id) => next.factions.some((faction) => faction.id === id && faction.alive));

  if (rivalIds.length < 2) {
    return next;
  }

  const candidates = next.areas.filter((area) => {
    const present = rivalIds.filter((factionId) =>
      livingFactionMonkeys(next, factionId).some((monkey) => monkey.locationId === area.id),
    );
    const nearbyConflict = area.ownerFactionId && rivalIds.includes(area.ownerFactionId)
      ? area.adjacentAreaIds.some((adjacentId) => {
          const adjacent = getArea(next, adjacentId);
          return adjacent.ownerFactionId && rivalIds.includes(adjacent.ownerFactionId) && adjacent.ownerFactionId !== area.ownerFactionId;
        })
      : false;
    return present.length > 1 || nearbyConflict || (area.currentBananaProduction >= 22 && area.ownerFactionId && rivalIds.includes(area.ownerFactionId));
  });

  const area = [...candidates].sort(
    (a, b) => b.currentBananaProduction + b.currentFood - (a.currentBananaProduction + a.currentFood),
  )[0];
  if (!area) {
    return next;
  }

  const owner = area.ownerFactionId && rivalIds.includes(area.ownerFactionId) ? area.ownerFactionId : sample(rivalIds);
  const attackerId = owner === STONE_FACTION_ID ? GOLD_FACTION_ID : STONE_FACTION_ID;
  const defenderId = owner;
  const attacker = getFaction(next, attackerId);
  const defender = getFaction(next, defenderId);
  const action = chooseAIConflictAction(next, attackerId, defenderId, area);

  if (action === "retreat") {
    if (roll(0.35)) {
      report.suspicions.push(`Algumas areas perto de ${area.name} amanheceram silenciosas demais.`);
    }
    return next;
  }

  if (action === "truce") {
    next = createTemporaryPact({
      gameState: next,
      factions: [attackerId, defenderId],
      type: "TRUCE",
      durationDays: 3 + Math.floor(Math.random() * 4),
      terms: [`Evitar ataques diretos em ${area.name}.`],
      trustModifier: 5,
    });
    ensureReportSections(reportFor(next)).diplomacy.push(`${attacker.name} e ${defender.name} aceitaram uma tregua curta perto de ${area.name}.`);
    return next;
  }

  if (action === "negotiate") {
    next = updateFactionRelation(next, attackerId, defenderId, {
      day: next.day,
      type: "NEGOTIATED_FAIRLY",
      description: `${attacker.name} negociou com ${defender.name} por ${area.name}.`,
      impact: { score: 4, trust: 3, resentment: -3 },
    });
    ensureReportSections(reportFor(next)).diplomacy.push(`${attacker.name} e ${defender.name} trocaram emissarios perto de ${area.name}.`);
    return next;
  }

  if (action === "steal") {
    const thieves = chooseAIMembers(next, attackerId, area.id, 3).map((monkey) => monkey.id);
    next = attemptBananaTheft({
      gameState: next,
      thiefFactionId: attackerId,
      victimFactionId: defenderId,
      areaId: area.id,
      thiefMonkeyIds: thieves,
    });
    return next;
  }

  const attackers = chooseAIMembers(next, attackerId, area.id, 4);
  const defenders = chooseAIMembers(next, defenderId, area.id, 4);
  attackers.forEach((monkey) => {
    monkey.locationId = area.id;
    monkey.energy = clamp(monkey.energy - 10, 0, monkey.maxEnergy);
    updateMonkeyStatus(monkey);
  });
  defenders.forEach((monkey) => {
    monkey.locationId = area.id;
    monkey.energy = clamp(monkey.energy - 8, 0, monkey.maxEnergy);
    updateMonkeyStatus(monkey);
  });

  const attackPower = combatPower(attackers) + next.factionBehaviorProfiles[attackerId].aggression / 8;
  const defensePower = combatPower(defenders) + area.combatModifier * 2 + next.factionBehaviorProfiles[defenderId].riskTolerance / 12;
  const attackersWin = attackPower + Math.random() * 18 > defensePower + Math.random() * 16;
  applyAIDamage(attackersWin ? defenders : attackers, attackersWin ? 3 : 2);
  applyAIDamage(attackersWin ? attackers : defenders, 1);

  if (attackersWin && roll(0.45)) {
    area.ownerFactionId = attackerId;
    area.controlledByFactionId = attackerId;
  }

  next = updateFactionRelation(next, attackerId, defenderId, {
    day: next.day,
    type: "ATTACKED_US",
    description: `${attacker.name} atacou ${defender.name} em ${area.name}.`,
    impact: { score: -12, trust: -8, fear: attackersWin ? 5 : 1, respect: attackersWin ? 4 : 0, resentment: 10 },
  });

  addKnowledgeLine(
    next,
    area,
    `Exploradores viram guerreiros do ${attacker.name} atacando o ${defender.name} em ${area.name}.`,
    `Ha sinais de combate entre duas tribos perto de ${area.name}.`,
    `Algumas areas perto de ${area.name} amanheceram silenciosas demais. Pode ter havido confronto durante a noite.`,
  );

  return next;
}

export function evaluateMilitaryHelpRequest(params: {
  gameState: GameState;
  requesterFactionId: string;
  targetAllyFactionId: string;
  enemyFactionId: string;
  areaId: string;
  offeredBananas?: number;
}): DiplomaticDecisionResult {
  const state = initializeFactionRelations(params.gameState);
  const ally = getFaction(state, params.targetAllyFactionId);
  const enemy = getFaction(state, params.enemyFactionId);
  const relation = getFactionRelation(state, params.requesterFactionId, params.targetAllyFactionId);
  const enemyRelation = getFactionRelation(state, params.targetAllyFactionId, params.enemyFactionId);
  const profile = state.factionBehaviorProfiles[params.targetAllyFactionId] ?? generateFactionBehaviorProfile(params.targetAllyFactionId);
  const reputation = state.playerReputation ?? DEFAULT_PLAYER_REPUTATION;
  const offered = params.offeredBananas ?? 0;
  const commonEnemy = enemyRelation.score < -18 || enemyRelation.status === "HOSTILE" || enemyRelation.status === "WAR";
  const area = state.areas.find((item) => item.id === normalizeAreaId(params.areaId));
  const distancePenalty = area && area.ownerFactionId === params.targetAllyFactionId ? 0 : 8;
  const hungerPressure = profile.foodDesperation;

  let score =
    relation.score * 0.35 +
    relation.trust * 0.25 +
    relation.respect * 0.25 +
    (commonEnemy ? 22 : -8) +
    offered * 1.6 -
    distancePenalty +
    profile.riskTolerance * 0.12 +
    profile.diplomacy * 0.08 -
    relation.resentment * 0.18;

  if (params.targetAllyFactionId === STONE_FACTION_ID) {
    score += reputation.strength * 0.28 + reputation.honor * 0.22 - reputation.cunning * 0.12;
  }
  if (params.targetAllyFactionId === GOLD_FACTION_ID) {
    score += reputation.reliability * 0.18 + profile.greed * 0.14 + offered * 0.8 - reputation.cruelty * 0.08;
  }
  if (hungerPressure > 70 && offered <= 0) {
    score -= 18;
  }

  const acceptsForPrice = score > 32 || (offered > 0 && score > 18);
  const accepted = score > 42 || acceptsForPrice;
  const hiddenIntent = (() => {
    if (!accepted) {
      return undefined;
    }
    const betrayalPressure = profile.betrayalChance + profile.greed + profile.paranoia - relation.trust - reputation.strength / 2;
    if (params.targetAllyFactionId === GOLD_FACTION_ID && betrayalPressure > 90) {
      return Math.random() < 0.55 ? "EXPLOIT" : "BETRAYAL";
    }
    if (betrayalPressure > 110) {
      return "DELAY";
    }
    if (profile.greed > 72 && offered <= 0) {
      return "OPPORTUNISTIC";
    }
    return "HONEST";
  })();

  if (!accepted) {
    return {
      accepted: false,
      publicMessage:
        params.targetAllyFactionId === STONE_FACTION_ID
          ? `${ally.name} cospe no chao. Eles dizem que sua guerra contra ${enemy.name} nao e problema deles.`
          : `${ally.name} responde com cortesia fria: neste momento, ajudar contra ${enemy.name} seria imprudente.`,
      privateReason: `Pontuacao insuficiente (${Math.round(score)}).`,
      effects: [],
    };
  }

  const effects: DiplomaticEffect[] = [
    { type: "RELATION", factionId: params.targetAllyFactionId, targetFactionId: params.requesterFactionId, value: 5 },
    { type: "PACT", factionId: params.targetAllyFactionId, targetFactionId: params.requesterFactionId },
  ];
  if (hiddenIntent && hiddenIntent !== "HONEST") {
    effects.push({ type: "SECRET_PLAN", factionId: params.targetAllyFactionId, targetFactionId: params.requesterFactionId });
  }

  return {
    accepted: true,
    hiddenIntent,
    publicMessage:
      params.targetAllyFactionId === STONE_FACTION_ID
        ? `${ally.name} aceita lutar ao seu lado. Eles dizem que respeitam forca demonstrada em batalha.`
        : `${ally.name} concorda em ajudar e sugere uma acao coordenada contra ${enemy.name}.`,
    privateReason: `Pontuacao ${Math.round(score)}; intencao ${hiddenIntent ?? "none"}.`,
    effects,
  };
}

export function requestMilitaryHelp(params: {
  gameState: GameState;
  targetAllyFactionId: string;
  enemyFactionId: string;
  areaId: AreaId;
  offeredBananas?: number;
}): GameState {
  let next = initializeFactionRelations(params.gameState);
  const decision = evaluateMilitaryHelpRequest({
    gameState: next,
    requesterFactionId: next.playerFactionId,
    targetAllyFactionId: params.targetAllyFactionId,
    enemyFactionId: params.enemyFactionId,
    areaId: params.areaId,
    offeredBananas: params.offeredBananas,
  });
  const report = ensureReportSections(next.report);
  report.diplomacy.push(decision.publicMessage);
  pushLog(next, decision.publicMessage);

  if (!decision.accepted) {
    next = updateFactionRelation(next, next.playerFactionId, params.targetAllyFactionId, {
      day: next.day,
      type: "NEGOTIATED_FAIRLY",
      description: `Pedido de ajuda militar recusado por ${factionName(next, params.targetAllyFactionId)}.`,
      impact: { score: -2, trust: -1 },
    });
    return next;
  }

  next = createTemporaryPact({
    gameState: next,
    factions: [next.playerFactionId, params.targetAllyFactionId],
    type: "TEMPORARY_ALLIANCE",
    durationDays: 3 + Math.floor(Math.random() * 3),
    terms: [`Apoio contra ${factionName(next, params.enemyFactionId)} em ${getArea(next, params.areaId).name}.`],
    trustModifier: 6,
  });

  const allies = livingFactionMonkeys(next, params.targetAllyFactionId)
    .sort((a, b) => b.attack + b.defense - (a.attack + a.defense))
    .slice(0, 2);
  allies.forEach((monkey) => {
    monkey.locationId = params.areaId;
    monkey.morale = clamp(monkey.morale + 3, 0, 100);
  });

  if (decision.hiddenIntent && decision.hiddenIntent !== "HONEST") {
    const type = decision.hiddenIntent === "BETRAYAL" ? "FAKE_ALLIANCE" : "CAPTURE_AREA_AFTER_HELP";
    next = createSecretPlan({
      gameState: next,
      factionId: params.targetAllyFactionId,
      targetFactionId: next.playerFactionId,
      type,
      executeAfterDay: next.day + 2 + Math.floor(Math.random() * 4),
      areaId: params.areaId,
      reason: decision.privateReason ?? "O acordo parecia vantajoso demais para ser honesto.",
    });
  }
  return next;
}

export function calculateTheftDetection(params: {
  gameState: GameState;
  thiefFactionId: string;
  victimFactionId: string;
  areaId: string;
  thiefMonkeyIds: string[];
}): TheftDetectionResult {
  const state = initializeFactionRelations(params.gameState);
  const area = getArea(state, normalizeAreaId(params.areaId));
  const thieves = params.thiefMonkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter((monkey): monkey is Monkey => Boolean(monkey));
  const guards = livingFactionMonkeys(state, params.victimFactionId).filter((monkey) => {
    const role = monkey.role ?? monkey.persistentRole;
    return monkey.locationId === area.id && (role === "Guarda" || role === "Guerreiro");
  });
  const thiefProfile = state.factionBehaviorProfiles[params.thiefFactionId] ?? generateFactionBehaviorProfile(params.thiefFactionId);
  const stealthScore =
    average(thieves.map((monkey) => monkey.stealth + monkey.energy / 20)) +
    (getFaction(state, params.thiefFactionId).inventory["Máscara de lama"] ? 5 : 0) +
    (getFaction(state, params.thiefFactionId).inventory["Corda de cipó"] ? 3 : 0) +
    area.stealthModifier * 2 +
    thiefProfile.paranoia / 18;
  const guardScore =
    guards.reduce((sum, monkey) => {
      const speciesBonus =
        monkey.species === "Gorila"
          ? 4
          : monkey.species === "Chimpanzé"
            ? 3
            : monkey.species === "Macaco-prego"
              ? 4
              : monkey.species === "Mandril"
                ? 3
                : monkey.species === "Gibão"
                  ? 5
                  : 0;
      return sum + monkey.defense + monkey.intelligence + monkey.energy / 25 + speciesBonus;
    }, 0) + area.dangerLevel;
  const margin = guardScore + Math.random() * 18 - (stealthScore + Math.random() * 16);
  const evidence: TheftEvidence[] = [];

  if (margin > -8) {
    evidence.push({
      type: "FOOTPRINTS",
      description: "Pegadas foram vistas perto do estoque.",
      reliability: clamp(35 + margin * 2, 20, 75),
    });
  }
  if (margin > 2) {
    evidence.push({
      type: "WITNESS",
      description: `Um guarda viu uma silhueta fugindo em direcao a ${area.name}.`,
      pointsToFactionId: margin > 10 ? params.thiefFactionId : undefined,
      reliability: clamp(45 + margin * 2, 30, 90),
    });
  }
  if (margin > 12 || (guards.some((monkey) => monkey.species === "Macaco-prego") && margin > 6)) {
    evidence.push({
      type: "KNOWN_STYLE",
      description: `As marcas lembram o metodo usado por ${factionName(state, params.thiefFactionId)}.`,
      pointsToFactionId: params.thiefFactionId,
      reliability: clamp(58 + margin, 45, 95),
    });
  }

  const detectionLevel: TheftDetectionLevel =
    margin <= -10 ? "NONE" : margin <= 2 ? "SUSPICION" : margin <= 12 ? "PARTIAL" : "CONFIRMED";

  return {
    detected: detectionLevel !== "NONE",
    detectionLevel,
    evidence,
    caughtMonkeyIds: detectionLevel === "CONFIRMED" && thieves.length > 0 ? [sample(thieves).id] : undefined,
  };
}

function theftReportLine(state: GameState, event: TheftEvent): string {
  const area = getArea(state, event.areaId);
  if (event.detectionLevel === "NONE") {
    return `${event.bananasStolen} banana(s) desapareceram durante a noite em ${area.name}.`;
  }
  if (event.detectionLevel === "SUSPICION") {
    return `Bananas sumiram do estoque em ${area.name}. Ha pegadas pequenas perto do armazem.`;
  }
  if (event.detectionLevel === "PARTIAL") {
    const pointed = event.evidence.find((evidence) => evidence.pointsToFactionId)?.pointsToFactionId;
    return `Um guarda viu uma silhueta fugindo de ${area.name}${pointed ? `. Parece ter sido alguem do ${factionName(state, pointed)}, mas nao ha certeza.` : ", mas nao conseguiu identificar a faccao."}`;
  }
  return `Um ladrao inimigo foi pego tentando roubar bananas em ${area.name}. Ele carregava marcas do ${factionName(state, event.thiefFactionId)}.`;
}

export function attemptBananaTheft(params: {
  gameState: GameState;
  thiefFactionId: string;
  victimFactionId: string;
  areaId: string;
  thiefMonkeyIds: string[];
}): GameState {
  let next = initializeFactionRelations(params.gameState);
  resetCountersForDay(next);
  if ((next.worldEventCounters?.theftEvents ?? 0) >= WORLD_EVENT_LIMITS.maxTheftEventsPerDay) {
    return next;
  }

  const area = getArea(next, normalizeAreaId(params.areaId));
  const thief = getFaction(next, params.thiefFactionId);
  const victim = getFaction(next, params.victimFactionId);
  const profile = next.factionBehaviorProfiles[params.thiefFactionId] ?? generateFactionBehaviorProfile(params.thiefFactionId);
  const maxStolen = Math.max(0, Math.min(victim.food.bananas, 2 + Math.floor((profile.greed + profile.foodDesperation) / 35)));
  if (maxStolen <= 0) {
    return next;
  }

  const detection = calculateTheftDetection({
    gameState: next,
    thiefFactionId: params.thiefFactionId,
    victimFactionId: params.victimFactionId,
    areaId: area.id,
    thiefMonkeyIds: params.thiefMonkeyIds,
  });
  const successChance = clamp(0.72 + profile.foodDesperation / 350 + area.stealthModifier / 20 - (detection.detectionLevel === "CONFIRMED" ? 0.28 : 0), 0.18, 0.9);
  const succeeded = roll(successChance);
  const bananasStolen = succeeded ? maxStolen : Math.max(0, Math.floor(maxStolen / 2));

  if (bananasStolen > 0) {
    victim.food.bananas = Math.max(0, victim.food.bananas - bananasStolen);
    thief.food.bananas += bananasStolen;
  }

  const event: TheftEvent = {
    id: uid("theft"),
    day: next.day,
    areaId: area.id,
    thiefFactionId: params.thiefFactionId,
    thiefMonkeyIds: params.thiefMonkeyIds,
    victimFactionId: params.victimFactionId,
    bananasStolen,
    detected: detection.detected,
    detectionLevel: detection.detectionLevel,
    evidence: detection.evidence,
    resolved: detection.detectionLevel === "CONFIRMED",
  };
  next.theftEvents = [event, ...next.theftEvents].slice(0, 24);
  next.worldEventCounters!.theftEvents += 1;

  if (detection.detectionLevel === "CONFIRMED" || (params.victimFactionId !== next.playerFactionId && detection.detected)) {
    next = updateFactionRelation(next, params.thiefFactionId, params.victimFactionId, {
      day: next.day,
      type: "STOLE_FOOD",
      description: `${thief.name} roubou bananas de ${victim.name} em ${area.name}.`,
      impact: { score: -10, trust: -12, resentment: 8 },
    });
  }

  const report = ensureReportSections(reportFor(next));
  const line = theftReportLine(next, event);
  if (params.victimFactionId === next.playerFactionId) {
    if (event.detectionLevel === "CONFIRMED") {
      report.confirmed.push(line);
    } else if (event.detectionLevel === "NONE") {
      report.suspicions.push(line);
    } else {
      report.suspicions.push(line);
    }
    report.gainsAndLosses.push(`-${bananasStolen} bananas desaparecidas`);
  } else if (area.knownByPlayer && event.detected) {
    report.rumors.push(`${factionName(next, params.victimFactionId)} pode ter perdido bananas perto de ${area.name}.`);
  }

  detection.caughtMonkeyIds?.forEach((id) => {
    const monkey = next.monkeys.find((item) => item.id === id);
    if (monkey) {
      monkey.hp = clamp(monkey.hp - 2, 0, monkey.maxHp);
      monkey.morale = clamp(monkey.morale - 8, 0, 100);
      updateMonkeyStatus(monkey);
    }
  });

  return next;
}

export function resolveInvestigationAction(params: {
  gameState: GameState;
  investigatorMonkeyIds: string[];
  areaId?: string;
  targetEventId?: string;
  targetFactionId?: string;
}): GameState {
  let next = initializeFactionRelations(params.gameState);
  const investigators = params.investigatorMonkeyIds
    .map((id) => next.monkeys.find((monkey) => monkey.id === id))
    .filter((monkey): monkey is Monkey => Boolean(monkey && monkey.status !== "morto"));
  if (investigators.length === 0) {
    return next;
  }

  const areaId = params.areaId ? normalizeAreaId(params.areaId) : undefined;
  const area = areaId ? getArea(next, areaId) : undefined;
  const skill =
    investigators.reduce((sum, monkey) => {
      const speciesBonus =
        monkey.species === "Chimpanzé"
          ? 4
          : monkey.species === "Macaco-prego"
            ? 5
            : monkey.species === "Gibão"
              ? 4
              : 0;
      return sum + monkey.intelligence + monkey.stealth * 0.65 + monkey.energy / 25 + speciesBonus;
    }, 0) + (area?.dangerLevel ?? 0);
  investigators.forEach((monkey) => {
    monkey.energy = clamp(monkey.energy - 8, 0, monkey.maxEnergy);
    updateMonkeyStatus(monkey);
  });

  const report = ensureReportSections(reportFor(next));
  const theft = next.theftEvents.find((event) => {
    if (event.resolved) {
      return false;
    }
    if (params.targetEventId && event.id !== params.targetEventId) {
      return false;
    }
    if (areaId && event.areaId !== areaId) {
      return false;
    }
    if (params.targetFactionId && event.thiefFactionId !== params.targetFactionId && event.victimFactionId !== params.targetFactionId) {
      return false;
    }
    return true;
  });

  if (theft) {
    const agePenalty = Math.max(0, next.day - theft.day) * 5;
    const difficulty = theft.detectionLevel === "NONE" ? 34 : theft.detectionLevel === "SUSPICION" ? 25 : 18;
    const success = skill + Math.random() * 20 - agePenalty > difficulty;
    if (success) {
      theft.detectionLevel = theft.detectionLevel === "NONE" ? "SUSPICION" : theft.detectionLevel === "SUSPICION" ? "PARTIAL" : "CONFIRMED";
      theft.detected = true;
      theft.evidence.push({
        type: "TOOL_MARKS",
        description: `Os investigadores encontraram marcas de ferramenta perto de ${getArea(next, theft.areaId).name}.`,
        pointsToFactionId: theft.detectionLevel === "CONFIRMED" ? theft.thiefFactionId : undefined,
        reliability: clamp(Math.round(skill + 25), 35, 95),
      });
      theft.resolved = theft.detectionLevel === "CONFIRMED";
      const line =
        theft.detectionLevel === "CONFIRMED"
          ? `A investigacao confirmou que ${factionName(next, theft.thiefFactionId)} roubou bananas em ${getArea(next, theft.areaId).name}.`
          : `Os investigadores encontraram novas pistas em ${getArea(next, theft.areaId).name}, mas ainda falta prova final.`;
      report.confirmed.push(line);
      report.suspicions.push(line);
      return next;
    }
    report.suspicions.push(`A investigacao em ${getArea(next, theft.areaId).name} nao encontrou prova nova.`);
    if (roll(0.12)) {
      const hurt = sample(investigators);
      hurt.hp = clamp(hurt.hp - 1, 0, hurt.maxHp);
      updateMonkeyStatus(hurt);
      report.casualtySummary.push(`${hurt.name} caiu numa armadilha simples durante a investigacao.`);
    }
    return next;
  }

  const secretPlan = next.secretPlans.find((plan) => {
    if (plan.discovered || plan.cancelled) {
      return false;
    }
    if (params.targetFactionId && plan.factionId !== params.targetFactionId && plan.targetFactionId !== params.targetFactionId) {
      return false;
    }
    return !areaId || plan.areaId === areaId;
  });
  if (secretPlan && skill + Math.random() * 18 > 34 + Math.max(0, secretPlan.executeAfterDay - next.day) * 2) {
    secretPlan.discovered = true;
    report.confirmed.push(`A investigacao revelou um plano secreto do ${factionName(next, secretPlan.factionId)}: ${secretPlan.reason}`);
    return next;
  }

  const rumor = next.rumors.find((item) => !item.discoveredTruth && (!areaId || item.areaId === areaId));
  if (rumor && skill + Math.random() * 16 > 24) {
    rumor.discoveredTruth = true;
    const line =
      rumor.truthLevel === "TRUE"
        ? `A investigacao confirmou o rumor: ${rumor.content}`
        : rumor.truthLevel === "PARTIAL"
          ? `A investigacao mostrou que o rumor era so parcialmente verdadeiro: ${rumor.content}`
          : `A investigacao desmentiu o rumor: ${rumor.content}`;
    report.confirmed.push(line);
    return next;
  }

  report.suspicions.push(area ? `Nada conclusivo foi encontrado em ${area.name}.` : "A investigacao nao encontrou pista clara.");
  return next;
}

export function resolveGuardDuty(gameState: GameState): GameState {
  const next = initializeFactionRelations(gameState);
  const report = ensureReportSections(reportFor(next));
  const guards = playerMonkeys(next).filter((monkey) => {
    const role = monkey.role ?? monkey.persistentRole;
    return role === "Guarda";
  });
  if (guards.length === 0) {
    return next;
  }

  const byArea = new Map<AreaId, Monkey[]>();
  guards.forEach((guard) => {
    byArea.set(guard.locationId, [...(byArea.get(guard.locationId) ?? []), guard]);
  });

  byArea.forEach((areaGuards, areaId) => {
    const area = getArea(next, areaId);
    const score = areaGuards.reduce((sum, monkey) => {
      const bonus =
        monkey.species === "Gorila"
          ? 5
          : monkey.species === "Chimpanzé"
            ? 4
            : monkey.species === "Macaco-prego"
              ? 4
              : monkey.species === "Mandril"
                ? 4
                : monkey.species === "Gibão"
                  ? 5
                  : 0;
      return sum + monkey.defense + monkey.intelligence + monkey.energy / 20 + bonus;
    }, 0);
    areaGuards.forEach((guard) => {
      guard.energy = clamp(guard.energy - 4, 0, guard.maxEnergy);
      guard.loyalty = clamp(guard.loyalty + 1, 0, 100);
      guard.opinion = {
        ...(guard.opinion ?? defaultOpinion(guard)),
        trustInLeader: clamp((guard.opinion?.trustInLeader ?? guard.morale) + 1, 0, 100),
      };
      updateMonkeyStatus(guard);
    });

    if (area.hiddenMonkeyIds.length > 0 && score + Math.random() * 18 > 24) {
      area.visibleMonkeyIds = [...new Set([...area.visibleMonkeyIds, ...area.hiddenMonkeyIds])];
      area.hiddenMonkeyIds = [];
      report.confirmed.push(`Guardas revelaram movimentacao inimiga escondida em ${area.name}.`);
      report.areaEvents.push(`Patrulhas reforcaram o controle de ${area.name}.`);
      return;
    }

    if (score > 28 && roll(0.35)) {
      report.areaEvents.push(`A guarda em ${area.name} espantou movimentos suspeitos antes que virassem problema.`);
    } else if (score < 12 && roll(0.25)) {
      report.suspicions.push(`A guarda em ${area.name} falhou por cansaco e deixou trilhas sem verificar.`);
    }
  });

  return next;
}

export function createSecretPlan(params: {
  gameState: GameState;
  factionId: string;
  targetFactionId: string;
  type: SecretPlan["type"];
  executeAfterDay?: number;
  areaId?: string;
  reason: string;
}): GameState {
  const next = initializeFactionRelations(params.gameState);
  const plan: SecretPlan = {
    id: uid("secret"),
    factionId: params.factionId,
    targetFactionId: params.targetFactionId,
    type: params.type,
    createdDay: next.day,
    executeAfterDay: params.executeAfterDay ?? next.day + 3 + Math.floor(Math.random() * 5),
    areaId: params.areaId ? normalizeAreaId(params.areaId) : undefined,
    discovered: false,
    cancelled: false,
    reason: params.reason,
  };
  next.secretPlans = [plan, ...next.secretPlans].slice(0, 20);
  return next;
}

export function tryDiscoverSecretPlan(params: {
  gameState: GameState;
  investigatorFactionId: string;
  targetFactionId?: string;
  areaId?: string;
  investigationPower?: number;
}): GameState {
  const next = initializeFactionRelations(params.gameState);
  const plan = next.secretPlans.find((item) => {
    if (item.discovered || item.cancelled) {
      return false;
    }
    if (params.targetFactionId && item.factionId !== params.targetFactionId) {
      return false;
    }
    return !params.areaId || item.areaId === normalizeAreaId(params.areaId);
  });
  if (!plan) {
    return next;
  }
  const power = params.investigationPower ?? 25;
  if (power + Math.random() * 20 > 36 + Math.max(0, plan.executeAfterDay - next.day) * 2) {
    plan.discovered = true;
    if (params.investigatorFactionId === next.playerFactionId) {
      const report = ensureReportSections(reportFor(next));
      report.confirmed.push(`Batedores descobriram um plano secreto do ${factionName(next, plan.factionId)}.`);
    }
  }
  return next;
}

export function resolveSecretPlans(gameState: GameState): GameState {
  let next = initializeFactionRelations(gameState);
  const duePlans = next.secretPlans.filter((plan) => !plan.cancelled && !plan.discovered && plan.executeAfterDay <= next.day);
  for (const plan of duePlans.slice(0, 2)) {
    const areaId = plan.areaId ?? closestUsefulArea(next, plan.factionId, plan.targetFactionId);
    if (plan.type === "STEAL_FOOD" || plan.type === "FAKE_ALLIANCE") {
      const thieves = livingFactionMonkeys(next, plan.factionId).slice(0, 3).map((monkey) => monkey.id);
      next = attemptBananaTheft({
        gameState: next,
        thiefFactionId: plan.factionId,
        victimFactionId: plan.targetFactionId,
        areaId,
        thiefMonkeyIds: thieves,
      });
    } else if (plan.type === "BETRAY_TRUCE" || plan.type === "AMBUSH" || plan.type === "CAPTURE_AREA_AFTER_HELP") {
      next = checkPactViolation(next, {
        factionId: plan.factionId,
        targetFactionId: plan.targetFactionId,
        actionType: "attack",
      });
      const area = getArea(next, areaId);
      const report = ensureReportSections(reportFor(next));
      report.diplomacy.push(`${factionName(next, plan.factionId)} transformou um acordo em vantagem perto de ${area.name}.`);
      if (area.ownerFactionId === plan.targetFactionId && roll(0.4)) {
        area.ownerFactionId = plan.factionId;
        area.controlledByFactionId = plan.factionId;
      }
    } else if (plan.type === "SPREAD_RUMOR") {
      const rumor: Rumor = {
        id: uid("rumor"),
        day: next.day,
        source: factionName(next, plan.factionId),
        targetFactionId: plan.targetFactionId,
        areaId,
        content: `${factionName(next, plan.targetFactionId)} estaria escondendo comida em ${getArea(next, areaId).name}.`,
        truthLevel: "PARTIAL",
        relatedEventId: plan.id,
      };
      next.rumors = [
        rumor,
        ...next.rumors,
      ].slice(0, 24);
      ensureReportSections(reportFor(next)).rumors.push(next.rumors[0].content);
    }
    plan.cancelled = true;
  }
  return next;
}

export function resolveInternalTribeReactions(gameState: GameState): GameState {
  const next = initializeFactionRelations(gameState);
  resetCountersForDay(next);
  const report = ensureReportSections(reportFor(next));
  const player = getFaction(next, next.playerFactionId);
  const monkeys = playerMonkeys(next);
  const reactions: string[] = [];
  const hungry = monkeys.filter((monkey) => monkey.hunger > 70);
  const wounded = monkeys.filter((monkey) => monkey.status === "ferido" || monkey.status === "inconsciente");
  const wonLine = [...report.confirmed, ...report.casualtySummary].some((line) => line.toLowerCase().includes("vitoria") || line.toLowerCase().includes("fugiu"));
  const truceLine = report.diplomacy.some((line) => line.toLowerCase().includes("tregua"));
  const betrayedLine = [...report.diplomacy, ...report.suspicions].some((line) => line.toLowerCase().includes("trai") || line.toLowerCase().includes("plano secreto"));

  if (hungry.length > 0) {
    monkeys.forEach((monkey) => {
      monkey.opinion = monkey.opinion ?? defaultOpinion(monkey);
      monkey.opinion.anger = clamp(monkey.opinion.anger + 3, 0, 100);
      monkey.opinion.trustInLeader = clamp(monkey.opinion.trustInLeader - 2, 0, 100);
    });
    player.morale = clamp(player.morale - 1, 0, 100);
    reactions.push("A fome deixou parte da tribo irritada e menos confiante nas proximas ordens.");
  }

  if (wonLine) {
    monkeys.forEach((monkey) => {
      monkey.opinion = monkey.opinion ?? defaultOpinion(monkey);
      monkey.opinion.hope = clamp(monkey.opinion.hope + 4, 0, 100);
      monkey.loyalty = clamp(monkey.loyalty + 1, 0, 100);
    });
    reactions.push("Alguns jovens macacos ficaram animados ao ver rivais recuando.");
  }

  if (wounded.length > 0 && monkeys.some((monkey) => monkey.role === "Curandeiro" || monkey.role === "Guarda")) {
    wounded.forEach((monkey) => {
      monkey.opinion = monkey.opinion ?? defaultOpinion(monkey);
      monkey.opinion.trustInLeader = clamp(monkey.opinion.trustInLeader + 3, 0, 100);
    });
    reactions.push("Os feridos notaram que foram protegidos. A confianca no lider aumentou um pouco.");
  }

  if (truceLine) {
    reactions.push("Parte da tribo discutiu a tregua; os cautelosos aprovaram, os mais agressivos rangeram os dentes.");
    if (next.internalEvents.length < 3 && roll(0.28)) {
      next.internalEvents.push({
        id: uid("internal"),
        day: next.day,
        title: "Debate sobre tregua",
        description: "Dois macacos discutem se a tregua fortalece a tribo ou deixa o inimigo respirar.",
        expiresAtDay: next.day + 2,
        choices: [
          {
            id: "defend-truce",
            label: "Defender a tregua",
            description: "Aumenta confianca dos diplomaticos, mas frustra os agressivos.",
            effects: [{ type: "MORALE", value: 1 }, { type: "REPUTATION", value: 2, text: "honor" }],
          },
          {
            id: "strategy",
            label: "Dizer que e estrategia",
            description: "Mantem a tribo unida sem parecer fraca.",
            effects: [{ type: "MORALE", value: 1 }],
          },
          {
            id: "break",
            label: "Romper a tregua",
            description: "Agrada os agressivos, mas prejudica reputacao.",
            effects: [{ type: "REPUTATION", value: -5, text: "reliability" }],
          },
        ],
      });
    }
  }

  if (betrayedLine) {
    monkeys.forEach((monkey) => {
      monkey.opinion = monkey.opinion ?? defaultOpinion(monkey);
      monkey.opinion.anger = clamp(monkey.opinion.anger + 5, 0, 100);
    });
    reactions.push("A suspeita de manipulacao acendeu raiva e desejo de vinganca na tribo.");
  }

  reactions.slice(0, WORLD_EVENT_LIMITS.maxInternalReactionsPerDay).forEach((line) => {
    if ((next.worldEventCounters?.internalReactions ?? 0) >= WORLD_EVENT_LIMITS.maxInternalReactionsPerDay) {
      return;
    }
    report.tribeReactions.push(line);
    next.worldEventCounters!.internalReactions += 1;
  });

  return next;
}

export function updatePlayerReputation(
  gameState: GameState,
  event: { type: string; discovered?: boolean; victory?: boolean; cruel?: boolean },
): GameState {
  const next = initializeFactionRelations(gameState);
  const rep = next.playerReputation;
  if (event.type === "HONORED_TRUCE") {
    rep.honor = clamp(rep.honor + 4, 0, 100);
    rep.reliability = clamp(rep.reliability + 4, 0, 100);
  } else if (event.type === "BROKE_TRUCE") {
    rep.reliability = clamp(rep.reliability - 12, 0, 100);
    rep.cunning = clamp(rep.cunning + 5, 0, 100);
  } else if (event.type === "SPARED_WOUNDED") {
    rep.honor = clamp(rep.honor + 4, 0, 100);
  } else if (event.type === "STEAL") {
    rep.cunning = clamp(rep.cunning + 4, 0, 100);
    if (event.discovered) {
      rep.reliability = clamp(rep.reliability - 8, 0, 100);
    }
  } else if (event.type === "BATTLE_WON") {
    rep.strength = clamp(rep.strength + 5, 0, 100);
  } else if (event.type === "ABANDONED_ALLY") {
    rep.reliability = clamp(rep.reliability - 8, 0, 100);
    rep.cruelty = clamp(rep.cruelty + 5, 0, 100);
  } else if (event.type === "THREATEN") {
    rep.cruelty = clamp(rep.cruelty + 4, 0, 100);
  }
  return next;
}

export function generateDynamicRumors(gameState: GameState): GameState {
  const next = initializeFactionRelations(gameState);
  resetCountersForDay(next);
  const report = ensureReportSections(reportFor(next));
  const slots = WORLD_EVENT_LIMITS.maxRumorsPerDay - (next.worldEventCounters?.rumors ?? 0);
  if (slots <= 0) {
    return next;
  }

  const candidates: Rumor[] = [];
  const gold = getFactionRelation(next, next.playerFactionId, GOLD_FACTION_ID);
  const stone = getFactionRelation(next, next.playerFactionId, STONE_FACTION_ID);
  const richArea = [...next.areas].sort((a, b) => b.currentBananaProduction - a.currentBananaProduction)[0];

  if (gold.trust < 38 || next.factionBehaviorProfiles[GOLD_FACTION_ID]?.betrayalChance > 55) {
    candidates.push({
      id: uid("rumor"),
      day: next.day,
      targetFactionId: GOLD_FACTION_ID,
      areaId: richArea?.id,
      content: `Dizem que o Fruto Dourado esta escondendo intencoes perto de ${richArea?.name ?? "uma area rica"}.`,
      truthLevel: next.secretPlans.some((plan) => plan.factionId === GOLD_FACTION_ID && !plan.discovered) ? "TRUE" : "PARTIAL",
    });
  }

  if (stone.respect > 35 || next.factionBehaviorProfiles[STONE_FACTION_ID]?.honor > 65) {
    candidates.push({
      id: uid("rumor"),
      day: next.day,
      targetFactionId: STONE_FACTION_ID,
      content: "Ha quem diga que o Punho de Pedra respeita lideres que lutam na linha de frente.",
      truthLevel: "TRUE",
    });
  }

  if (next.theftEvents.some((event) => !event.resolved)) {
    candidates.push({
      id: uid("rumor"),
      day: next.day,
      content: "Um macaco jura ter visto alguem sabotando o armazem.",
      truthLevel: "PARTIAL",
      relatedEventId: next.theftEvents.find((event) => !event.resolved)?.id,
    });
  }

  candidates.slice(0, slots).forEach((rumor) => {
    next.rumors = [rumor, ...next.rumors].slice(0, 24);
    report.rumors.push(rumor.content);
    next.worldEventCounters!.rumors += 1;
  });

  return next;
}

export function maybeCreateFactionRequest(gameState: GameState): GameState {
  const next = initializeFactionRelations(gameState);
  resetCountersForDay(next);
  if ((next.worldEventCounters?.diplomaticEvents ?? 0) >= WORLD_EVENT_LIMITS.maxDiplomaticEventsPerDay) {
    return next;
  }
  if (next.day < 2 || next.day % (3 + (next.day % 4)) !== 0 || roll(0.35)) {
    return next;
  }

  const fromFactionId = roll(0.5) ? STONE_FACTION_ID : GOLD_FACTION_ID;
  const from = getFaction(next, fromFactionId);
  const enemy = otherRival(fromFactionId);
  const profile = next.factionBehaviorProfiles[fromFactionId] ?? generateFactionBehaviorProfile(fromFactionId);
  const hungry = profile.foodDesperation > 55;
  const areaId = closestUsefulArea(next, fromFactionId, enemy);
  const requestType: FactionRequestEvent["requestType"] = hungry ? "FOOD_AID" : getFactionRelation(next, fromFactionId, enemy).score < -30 ? "HELP_IN_BATTLE" : "TRADE_INFORMATION";
  const hiddenIntent: FactionRequestEvent["hiddenIntent"] =
    fromFactionId === GOLD_FACTION_ID && profile.betrayalChance + profile.greed > 120
      ? "MANIPULATIVE"
      : hungry
        ? "DESPERATE"
        : "HONEST";

  const request: FactionRequestEvent = {
    id: uid("request"),
    day: next.day,
    fromFactionId,
    requestType,
    targetFactionId: requestType === "HELP_IN_BATTLE" ? enemy : undefined,
    areaId,
    hiddenIntent,
    description:
      requestType === "FOOD_AID"
        ? `${from.name} pede bananas em troca de informacao.`
        : requestType === "HELP_IN_BATTLE"
          ? `${from.name} pede ajuda contra ${factionName(next, enemy)} em ${getArea(next, areaId).name}.`
          : `${from.name} oferece informacao em troca de uma promessa de passagem segura.`,
    choices: [
      { id: "accept", label: "Aceitar", description: "Melhora a relacao, mas cria expectativa futura.", effects: [{ type: "RELATION", factionId: fromFactionId, value: 8 }] },
      { id: "reject", label: "Recusar", description: "Evita custo imediato.", effects: [{ type: "RELATION", factionId: fromFactionId, value: -5 }] },
      { id: "investigate", label: "Investigar antes", description: "Adia a resposta e pode revelar intencao oculta.", effects: [{ type: "REPORT", text: "A tribo vai investigar a proposta antes de responder." }] },
    ],
  };

  next.factionRequests = [
    request,
    ...next.factionRequests,
  ].slice(0, 8);
  next.worldEventCounters!.diplomaticEvents += 1;
  ensureReportSections(reportFor(next)).diplomacy.push(next.factionRequests[0].description);
  return next;
}

export function createFactionRequestDecision(state: GameState, request: NonNullable<GameState["factionRequests"]>[number]): PendingDecision {
  const source = getFaction(state, request.fromFactionId);
  return {
    id: `faction-request-${request.id}`,
    type: "faction_request",
    title: `Pedido do ${source.name}`,
    description: request.description,
    knownLevel: "confirmado",
    sourceFaction: request.fromFactionId,
    areaId: request.areaId,
    options: [
      {
        id: "accept",
        label: "Aceitar",
        description: "Ajuda agora e melhora relacao, com risco de ser usado depois.",
        effects: [
          { type: "relation", factionId: request.fromFactionId, value: 8 },
          { type: "food", value: request.requestType === "FOOD_AID" ? -3 : 0 },
          { type: "addReport", reportLevel: "confirmado", text: `A tribo aceitou o pedido do ${source.name}.` },
          { type: "reputation", value: 3, target: "reliability" },
        ],
      },
      {
        id: "reject",
        label: "Recusar",
        description: "Preserva recursos, mas piora o clima.",
        effects: [
          { type: "relation", factionId: request.fromFactionId, value: -5 },
          { type: "addReport", reportLevel: "rumor", text: `O pedido do ${source.name} foi recusado.` },
        ],
      },
      {
        id: "payment",
        label: "Pedir pagamento",
        description: "Pode render bananas ou informacao, mas soa oportunista.",
        effects: [
          { type: "relation", factionId: request.fromFactionId, value: -1 },
          { type: "food", value: request.requestType === "FOOD_AID" ? 0 : 2 },
          { type: "reputation", value: 2, target: "cunning" },
          { type: "addReport", reportLevel: "confirmado", text: `A tribo exigiu pagamento antes de ajudar o ${source.name}.` },
        ],
      },
      {
        id: "investigate",
        label: "Investigar antes",
        description: "Busca sinais de armadilha antes de responder.",
        effects: [
          { type: "addReport", reportLevel: "suspeita", text: `A proposta do ${source.name} sera investigada antes de uma resposta final.` },
        ],
      },
    ],
  };
}

export function buildDailyReport(gameState: GameState): DailyReport {
  const report = ensureReportSections(gameState.report ?? createReport(gameState.day));
  if (gameState.rumors?.length) {
    gameState.rumors
      .filter((rumor) => rumor.day === gameState.day && !report.rumors.includes(rumor.content))
      .slice(0, WORLD_EVENT_LIMITS.maxRumorsPerDay)
      .forEach((rumor) => report.rumors.push(rumor.content));
  }
  return ensureReportHasContent(report);
}
