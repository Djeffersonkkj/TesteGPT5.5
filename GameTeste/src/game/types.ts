export type Species =
  | "Gorila"
  | "Chimpanzé"
  | "Macaco-prego"
  | "Mandril"
  | "Gibão";

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

export type GamePhase = "report" | "planning" | "combat" | "gameOver";

export type PlannedAction =
  | {
      kind: "role";
      role: Role;
    }
  | {
      kind: "group";
      groupActionId: string;
      actionType: GroupActionType;
      areaId: string;
    };

export interface FoodStock {
  bananas: number;
  rareFruits: number;
  roots: number;
  cleanWater: number;
  herbs: number;
}

export interface Area {
  id: string;
  name: string;
  shortName: string;
  terrain: Terrain;
  x: number;
  y: number;
  currentFood: number;
  maxFood: number;
  foodRegenRate: number;
  dangerLevel: number;
  stealthModifier: number;
  combatModifier: number;
  ownerFactionId: string | null;
  knownByPlayer: boolean;
  visibleMonkeyIds: string[];
  hiddenMonkeyIds: string[];
  specialFeature: string;
}

export interface Monkey {
  id: string;
  name: string;
  species: Species;
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
  locationId: string;
  status: MonkeyStatus;
  role: Role | null;
  persistentRole: Role | null;
  plannedAction: PlannedAction | null;
  inventory: ToolName[];
  isLeader: boolean;
}

export type AiPersonality = "player" | "stone" | "shadow" | "gold";

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
  areaId: string;
  monkeyIds: string[];
}

export interface PendingCombat {
  id: string;
  areaId: string;
  attackerFactionId: string;
  defenderFactionId: string;
  playerSide: "attacker" | "defender";
  round: number;
  maxRounds: number;
  playerMonkeyIds: string[];
  enemyMonkeyIds: string[];
  log: string[];
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
  selectedAreaId: string;
  areas: Area[];
  factions: Faction[];
  monkeys: Monkey[];
  report: DailyReport;
  workingReport: DailyReport | null;
  groupPlans: GroupActionPlan[];
  pendingCombat: PendingCombat | null;
  logs: string[];
  gameOver: GameOverInfo | null;
}
