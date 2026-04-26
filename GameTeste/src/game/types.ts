export type Species =
  | "Gorila"
  | "Chimpanzé"
  | "Macaco-prego"
  | "Mandril"
  | "Gibão";

export type MonkeySpecies = Species;

export interface MonkeyStats {
  maxHp: number;
  attack: number;
  defense: number;
  stealth: number;
  intelligence: number;
  charisma: number;
  morale: number;
  foodConsumption: number;
}

export type SkillEffect = {
  stat?: keyof MonkeyStats;
  modifierType: "flat" | "percent";
  value: number;
  condition?: string;
};

export type MonkeySkill = {
  id: string;
  name: string;
  description: string;
  trigger: "passive" | "combat" | "daily" | "support" | "exploration" | "food";
  effects: SkillEffect[];
};

export type Terrain =
  | "floresta"
  | "pântano"
  | "montanha"
  | "praia"
  | "ruínas"
  | "rio"
  | "campo"
  | "aldeia"
  | "caverna";

export type AreaId =
  | "aldeia-cipo"
  | "bananeiras"
  | "pantano"
  | "ruinas"
  | "montanha"
  | "praia"
  | "vale"
  | "caverna"
  | "rio"
  | "campo"
  | "bosque"
  | "trovao";

export type MonkeyStatus =
  | "normal"
  | "ferido"
  | "faminto"
  | "exausto"
  | "inconsciente"
  | "morto";

export type Role =
  | "Coletor"
  | "Explorador"
  | "Guarda"
  | "Guerreiro"
  | "Curandeiro"
  | "Artesão"
  | "Diplomata"
  | "Descansando";

export type DailyRole = Role;

export type FactionArchetype = {
  factionId: string;
  name: string;
  speciesWeights: Record<MonkeySpecies, number>;
  preferredRoles: DailyRole[];
  behaviorBias: {
    aggression: number;
    diplomacy: number;
    stealth: number;
    foodFocus: number;
    expansion: number;
    riskTolerance: number;
  };
};

export type GroupActionType =
  | "collect"
  | "explore"
  | "attack"
  | "negotiate"
  | "steal"
  | "investigate"
  | "recruit"
  | "patrol"
  | "craft";

export type ToolName =
  | "Lança de bambu"
  | "Pedra afiada"
  | "Corda de cipó"
  | "Cesto de folhas"
  | "Máscara de lama"
  | "Tambor tribal"
  | "Armadilha de cipó"
  | "Catapulta improvisada";

export type FactionId = string;

export type DecisionKnownLevel = "confirmado" | "rumor" | "suspeita";

export interface DecisionEffect {
  type: string;
  value?: number;
  target?: string;
  text?: string;
  reportLevel?: DecisionKnownLevel;
  status?: MonkeyStatus;
  areaId?: AreaId;
  factionId?: FactionId;
  hidden?: boolean;
}

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  effects: DecisionEffect[];
}

export interface PendingDecision {
  id: string;
  type: string;
  title: string;
  description: string;
  knownLevel: DecisionKnownLevel;
  options: DecisionOption[];
  sourceFaction?: FactionId;
  targetMonkeyId?: string;
  areaId?: AreaId;
}

export type GamePhase = "report" | "planning" | "resolution" | "decisions" | "combat" | "gameOver";

export type PlannedAction =
  | {
      kind: "role";
      role: Role;
    }
  | {
      kind: "group";
      groupActionId: string;
      actionType: GroupActionType;
      areaId: AreaId;
    };

export interface FoodStock {
  bananas: number;
  rareFruits: number;
  roots: number;
  cleanWater: number;
  herbs: number;
}

export type FactionRelationStatus =
  | "WAR"
  | "HOSTILE"
  | "TENSE"
  | "NEUTRAL"
  | "FRIENDLY"
  | "TRUCE"
  | "TEMPORARY_ALLIANCE";

export type DiplomaticMemoryType =
  | "ATTACKED_US"
  | "HELPED_IN_COMBAT"
  | "BROKE_TRUCE"
  | "SHARED_FOOD"
  | "STOLE_FOOD"
  | "RETURNED_PRISONER"
  | "KILLED_LEADER"
  | "SPARED_WOUNDED"
  | "ABANDONED_ALLY"
  | "NEGOTIATED_FAIRLY"
  | "THREATENED_US"
  | "DEFENDED_OUR_AREA"
  | "BETRAYED_US"
  | "FOUGHT_COMMON_ENEMY";

export type DiplomaticMemory = {
  day: number;
  type: DiplomaticMemoryType;
  description: string;
  impact: {
    score?: number;
    trust?: number;
    fear?: number;
    respect?: number;
    resentment?: number;
  };
};

export type FactionRelation = {
  factionAId: string;
  factionBId: string;
  score: number;
  status: FactionRelationStatus;
  trust: number;
  fear: number;
  respect: number;
  resentment: number;
  lastMajorEvents: DiplomaticMemory[];
  truceUntilDay?: number;
  allianceUntilDay?: number;
};

export type FactionBehaviorProfile = {
  factionId: string;
  aggression: number;
  diplomacy: number;
  honor: number;
  greed: number;
  paranoia: number;
  betrayalChance: number;
  riskTolerance: number;
  foodDesperation: number;
  revengeFocus: number;
};

export type DiplomaticAction =
  | "REQUEST_TRUCE"
  | "REQUEST_FOOD_TRADE"
  | "REQUEST_MILITARY_HELP"
  | "OFFER_FOOD"
  | "THREATEN"
  | "PROPOSE_TEMPORARY_ALLIANCE"
  | "REQUEST_SAFE_PASSAGE"
  | "ACCUSE_OF_THEFT";

export type DiplomaticEffect = {
  type:
    | "RELATION"
    | "REPUTATION"
    | "PACT"
    | "SECRET_PLAN"
    | "FOOD"
    | "REPORT"
    | "REQUEST";
  factionId?: string;
  targetFactionId?: string;
  value?: number;
  text?: string;
  pactId?: string;
  secretPlanId?: string;
};

export type DiplomaticDecisionResult = {
  accepted: boolean;
  hiddenIntent?: "HONEST" | "OPPORTUNISTIC" | "BETRAYAL" | "DELAY" | "EXPLOIT";
  publicMessage: string;
  privateReason?: string;
  effects: DiplomaticEffect[];
};

export type TemporaryPact = {
  id: string;
  factions: string[];
  type: "TRUCE" | "TEMPORARY_ALLIANCE" | "SAFE_PASSAGE";
  startDay: number;
  endDay: number;
  terms: string[];
  trustModifier: number;
  secretBetrayalPlan?: {
    factionId: string;
    plannedDay: number;
    reason: string;
  };
};

export type MonkeyOpinion = {
  loyaltyToLeader: number;
  fearOfLeader: number;
  trustInLeader: number;
  anger: number;
  hope: number;
};

export type InternalEventEffect = {
  type:
    | "MORALE"
    | "OPINION"
    | "RELATION"
    | "REPUTATION"
    | "PACT"
    | "INVESTIGATION"
    | "REPORT";
  value?: number;
  target?: string;
  factionId?: string;
  text?: string;
};

export type InternalEventChoice = {
  id: string;
  label: string;
  description: string;
  effects: InternalEventEffect[];
};

export type InternalEvent = {
  id: string;
  day: number;
  title: string;
  description: string;
  choices: InternalEventChoice[];
  expiresAtDay?: number;
};

export type TheftDetectionLevel = "NONE" | "SUSPICION" | "PARTIAL" | "CONFIRMED";

export type TheftEvidence = {
  type:
    | "FOOTPRINTS"
    | "BROKEN_STORAGE"
    | "WITNESS"
    | "DROPPED_ITEM"
    | "SCENT"
    | "BANANA_PEELS"
    | "TOOL_MARKS"
    | "KNOWN_STYLE";
  description: string;
  pointsToFactionId?: string;
  reliability: number;
};

export type TheftEvent = {
  id: string;
  day: number;
  areaId: AreaId;
  thiefFactionId: string;
  thiefMonkeyIds: string[];
  victimFactionId: string;
  bananasStolen: number;
  detected: boolean;
  detectionLevel: TheftDetectionLevel;
  evidence: TheftEvidence[];
  resolved: boolean;
};

export type TheftDetectionResult = {
  detected: boolean;
  detectionLevel: TheftDetectionLevel;
  evidence: TheftEvidence[];
  caughtMonkeyIds?: string[];
};

export type SecretPlan = {
  id: string;
  factionId: string;
  targetFactionId: string;
  type:
    | "BETRAY_TRUCE"
    | "STEAL_FOOD"
    | "AMBUSH"
    | "FAKE_ALLIANCE"
    | "SPREAD_RUMOR"
    | "ABANDON_IN_BATTLE"
    | "CAPTURE_AREA_AFTER_HELP";
  createdDay: number;
  executeAfterDay: number;
  areaId?: AreaId;
  discovered: boolean;
  cancelled: boolean;
  reason: string;
};

export type FactionRequestEvent = {
  id: string;
  day: number;
  fromFactionId: string;
  requestType:
    | "HELP_IN_BATTLE"
    | "FOOD_AID"
    | "TRUCE"
    | "SAFE_PASSAGE"
    | "JOIN_ATTACK"
    | "TRADE_INFORMATION"
    | "RETURN_PRISONER";
  targetFactionId?: string;
  areaId?: AreaId;
  description: string;
  choices: FactionRequestChoice[];
  hiddenIntent?: "HONEST" | "DESPERATE" | "MANIPULATIVE" | "TRAP" | "TEST";
};

export type FactionRequestChoice = {
  id: string;
  label: string;
  description: string;
  effects: DiplomaticEffect[];
};

export type PlayerReputation = {
  honor: number;
  cruelty: number;
  reliability: number;
  strength: number;
  cunning: number;
};

export type Rumor = {
  id: string;
  day: number;
  source?: string;
  targetFactionId?: string;
  areaId?: AreaId;
  content: string;
  truthLevel: "FALSE" | "PARTIAL" | "TRUE";
  discoveredTruth?: boolean;
  relatedEventId?: string;
};

export type WorldEventCounters = {
  day: number;
  internalReactions: number;
  diplomaticEvents: number;
  theftEvents: number;
  rumors: number;
};

export interface Area {
  id: AreaId;
  name: string;
  shortName: string;
  terrain: Terrain;
  biome?: string;
  image: string;
  isStartingBase?: boolean;
  visualPosition?: {
    row: number;
    col: number;
  };
  adjacentAreaIds: AreaId[];
  currentFood: number;
  maxFood: number;
  foodRegenRate: number;
  baseBananaProduction: number;
  currentBananaProduction: number;
  minimumBananaProduction: number;
  scarcityRate: number;
  dangerLevel: number;
  stealthModifier: number;
  combatModifier: number;
  ownerFactionId: string | null;
  controlledByFactionId?: string | null;
  knownByPlayer: boolean;
  visibleMonkeyIds: string[];
  hiddenMonkeyIds: string[];
  specialFeature: string;
}

export type MapArea = Area;

export interface FactionFoodResult {
  factionId: string;
  areaId: AreaId;
  bananasGained: number;
  monkeyCount: number;
  percentage: number;
}

export interface Monkey {
  id: string;
  name: string;
  species: Species;
  skills: MonkeySkill[];
  factionId: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  stealth: number;
  intelligence: number;
  charisma: number;
  loyalty: number;
  morale: number;
  hunger: number;
  foodConsumption: number;
  locationId: AreaId;
  status: MonkeyStatus;
  role: Role | null;
  persistentRole: Role | null;
  plannedAction: PlannedAction | null;
  inventory: ToolName[];
  isLeader: boolean;
  opinion?: MonkeyOpinion;
}

export type AiPersonality = "player" | "stone" | "gold";

export interface Faction {
  id: string;
  name: string;
  color: string;
  accent: string;
  isPlayer: boolean;
  alive: boolean;
  aiPersonality: AiPersonality;
  food: FoodStock;
  morale: number;
  reputation: number;
  intimidation: number;
  stealthBias: number;
  diplomacyBias: number;
  inventory: Partial<Record<ToolName, number>>;
  relations: Record<string, number>;
  battlesWon: number;
  deaths: number;
  deserters: number;
}

export interface DailyReport {
  day: number;
  title: string;
  confirmed: string[];
  rumors: string[];
  suspicions: string[];
  tribeReactions: string[];
  diplomacy: string[];
  areaEvents: string[];
  gainsAndLosses: string[];
  hungerSummary: string[];
  casualtySummary: string[];
  relationsSummary: string[];
}

export interface GroupActionPlan {
  id: string;
  actionType: GroupActionType;
  areaId: AreaId;
  monkeyIds: string[];
}

export interface PendingCombat {
  id: string;
  areaId: AreaId;
  attackerFactionId: string;
  defenderFactionId: string;
  playerSide: "attacker" | "defender";
  round: number;
  maxRounds: number;
  config?: CombatConfig;
  combatType?: CombatType;
  phase?: "playerTurn" | "enemyTurn" | "roundSummary" | "summary";
  playerMonkeyIds: string[];
  enemyMonkeyIds: string[];
  actedMonkeyIds?: string[];
  defendingMonkeyIds?: string[];
  protectedMonkeyIds?: string[];
  exposedMonkeyIds?: string[];
  enemyMorale?: number;
  lastEffects?: CombatEffect[];
  lastRoundSummary?: string;
  currentPlayerChoice?: CombatActionId | null;
  initialPlayerForce?: number;
  initialEnemyForce?: number;
  result?: CombatResult;
  log: string[];
}

export type CombatType = "common" | "importantArea" | "leader" | "ambush";

export type CombatConfig = {
  maxRounds: number;
  decisiveCombatExtraRound?: boolean;
  autoRetreatWhenLosingBadly?: boolean;
};

export type CombatActionId =
  | "attack"
  | "ambush"
  | "defend"
  | "focusLeader"
  | "intimidate"
  | "flee"
  | "surrender"
  | "protect"
  | "useTool"
  | "saveEnergy";

export type CombatChoice =
  | "DIRECT_ATTACK"
  | "DEFEND"
  | "INTIMIDATE"
  | "FLEE"
  | "AMBUSH"
  | "SAVE_ENERGY"
  | "FOCUS_LEADER"
  | "PROTECT_WOUNDED"
  | "USE_TOOL"
  | "NEGOTIATE_SURRENDER";

export interface CombatUnit {
  id: string;
  monkeyId?: string;
  name: string;
  factionId: string;
  team: "player" | "enemy";
  hp: number;
  maxHp: number;
  energy: number;
  attack: number;
  defense: number;
  stealth: number;
  charisma: number;
  morale: number;
  position: { x: number; y: number };
  hasActed: boolean;
  status: string[];
  sprite?: string;
}

export interface CombatEffect {
  unitId: string;
  kind: "hit" | "defend" | "heal" | "intimidate" | "miss";
  text: string;
}

export interface CombatResult {
  outcome: "victory" | "defeat" | "flee" | "draw" | "surrender" | "enemyFled";
  title: string;
  reason: string;
  lines: string[];
  playerDeadIds: string[];
  playerInjuredIds: string[];
  enemyDeadIds: string[];
  damageCaused?: number;
  damageReceived?: number;
  energyLoss?: number;
  moraleChange?: number;
  fledFactionId?: string;
  surrenderedFactionId?: string;
  dailyReportLines?: string[];
  foodDelta: number;
  moraleDelta: number;
  relationDelta: number;
  territoryChanged: boolean;
}

export interface CombatRoundResult {
  rounds: number;
  outcome: "attackersWin" | "defendersWin" | "draw" | "attackersFled" | "defendersFled" | "surrender";
  damageCaused: number;
  damageReceived: number;
  injuredIds: string[];
  deadIds: string[];
  attackerEnergyLoss: number;
  defenderEnergyLoss: number;
  attackerMoraleDelta: number;
  defenderMoraleDelta: number;
  fledFactionId?: string;
  surrenderedFactionId?: string;
  log: string[];
  dailyReportLines: string[];
}

export interface GameOverInfo {
  won: boolean;
  title: string;
  narrative: string;
  score: number;
  lines: string[];
}

export interface GameState {
  day: number;
  phase: GamePhase;
  playerFactionId: string;
  selectedAreaId: AreaId;
  areas: Area[];
  factions: Faction[];
  monkeys: Monkey[];
  report: DailyReport;
  workingReport: DailyReport | null;
  groupPlans: GroupActionPlan[];
  pendingDecisions: PendingDecision[];
  pendingCombat: PendingCombat | null;
  factionRelations: FactionRelation[];
  factionBehaviorProfiles: Record<string, FactionBehaviorProfile>;
  temporaryPacts: TemporaryPact[];
  theftEvents: TheftEvent[];
  rumors: Rumor[];
  secretPlans: SecretPlan[];
  internalEvents: InternalEvent[];
  factionRequests: FactionRequestEvent[];
  playerReputation: PlayerReputation;
  worldEventCounters?: WorldEventCounters;
  logs: string[];
  gameOver: GameOverInfo | null;
}
