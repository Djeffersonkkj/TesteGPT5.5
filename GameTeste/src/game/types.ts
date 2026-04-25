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

export type GroupActionType =
  | "collect"
  | "explore"
  | "attack"
  | "negotiate"
  | "steal"
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
  phase?: "playerTurn" | "enemyTurn" | "summary";
  playerMonkeyIds: string[];
  enemyMonkeyIds: string[];
  actedMonkeyIds?: string[];
  defendingMonkeyIds?: string[];
  protectedMonkeyIds?: string[];
  enemyMorale?: number;
  lastEffects?: CombatEffect[];
  result?: CombatResult;
  log: string[];
}

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
  foodDelta: number;
  moraleDelta: number;
  relationDelta: number;
  territoryChanged: boolean;
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
  logs: string[];
  gameOver: GameOverInfo | null;
}
