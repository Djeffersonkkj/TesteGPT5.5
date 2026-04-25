import {
  ENEMY_NAMES,
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  PLAYER_NAMES,
  STONE_FACTION_ID,
} from "./constants";
import { createMapAreas } from "./map";
import { createReport } from "./reports";
import { getDefaultSkillsForSpecies, getInitialStatsForSpecies } from "./skills";
import type { AreaId, Faction, FoodStock, GameState, Monkey, Species } from "./types";
import { syncAreaMonkeyVisibility, uid } from "./utils";

interface StartOptions {
  leaderName: string;
  leaderSpecies: Species;
  factionName?: string;
}

const baseFood = (bananas: number): FoodStock => ({
  bananas,
  rareFruits: 0,
  roots: 2,
  cleanWater: 4,
  herbs: 1,
});

function createFaction(
  id: string,
  name: string,
  color: string,
  accent: string,
  aiPersonality: Faction["aiPersonality"],
  isPlayer = false,
): Faction {
  return {
    id,
    name,
    color,
    accent,
    isPlayer,
    alive: true,
    aiPersonality,
    food: baseFood(isPlayer ? 26 : 22),
    morale: isPlayer ? 62 : 58,
    reputation: isPlayer ? 0 : -4,
    intimidation: aiPersonality === "stone" ? 18 : 8,
    stealthBias: aiPersonality === "stone" ? -6 : 4,
    diplomacyBias: aiPersonality === "gold" ? 18 : aiPersonality === "stone" ? -8 : 4,
    inventory: {},
    relations: {},
    battlesWon: 0,
    deaths: 0,
    deserters: 0,
  };
}

function wireRelations(factions: Faction[]): void {
  factions.forEach((faction) => {
    factions.forEach((other) => {
      if (faction.id !== other.id) {
        faction.relations[other.id] = 0;
      }
    });
  });

  const set = (a: string, b: string, value: number) => {
    const factionA = factions.find((item) => item.id === a)!;
    const factionB = factions.find((item) => item.id === b)!;
    factionA.relations[b] = value;
    factionB.relations[a] = value;
  };

  set(PLAYER_FACTION_ID, STONE_FACTION_ID, -20);
  set(PLAYER_FACTION_ID, GOLD_FACTION_ID, 8);
  set(STONE_FACTION_ID, GOLD_FACTION_ID, -12);
}

function createMonkey(
  name: string,
  species: Species,
  factionId: string,
  locationId: AreaId,
  isLeader = false,
): Monkey {
  const stats = getInitialStatsForSpecies(species, isLeader);

  return {
    id: uid("monkey"),
    name,
    species,
    skills: getDefaultSkillsForSpecies(species),
    factionId,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    energy: 82 + Math.floor(Math.random() * 12),
    maxEnergy: 100,
    attack: stats.attack,
    defense: stats.defense,
    stealth: stats.stealth,
    intelligence: stats.intelligence,
    charisma: stats.charisma,
    loyalty: isLeader ? 100 : 55 + Math.floor(Math.random() * 25),
    morale: 55 + Math.floor(Math.random() * 22),
    hunger: 12 + Math.floor(Math.random() * 12),
    foodConsumption: stats.foodConsumption,
    locationId,
    status: "normal",
    role: null,
    persistentRole: null,
    plannedAction: null,
    inventory: [],
    isLeader,
  };
}

function createPlayerMonkeys(options: StartOptions): Monkey[] {
  const leaderName = options.leaderName.trim() || "Aru";
  const monkeys: Monkey[] = [
    createMonkey(leaderName, options.leaderSpecies, PLAYER_FACTION_ID, "vale", true),
  ];

  const speciesCycle: Species[] = [
    "Chimpanzé",
    "Macaco-prego",
    "Gibão",
    "Mandril",
    "Chimpanzé",
    "Gorila",
    "Macaco-prego",
    "Gibão",
    "Chimpanzé",
    "Mandril",
    "Macaco-prego",
  ];

  speciesCycle.forEach((species, index) => {
    monkeys.push(createMonkey(PLAYER_NAMES[index], species, PLAYER_FACTION_ID, "vale"));
  });

  return monkeys;
}

function createEnemyMonkeys(): Monkey[] {
  const monkeys: Monkey[] = [];
  const addGroup = (
    factionId: string,
    locationIds: AreaId[],
    species: Species[],
    count: number,
    leaderName: string,
  ) => {
    monkeys.push(createMonkey(leaderName, species[0], factionId, locationIds[0], true));
    for (let index = 1; index < count; index += 1) {
      monkeys.push(
        createMonkey(
          ENEMY_NAMES[(monkeys.length + index) % ENEMY_NAMES.length],
          species[index % species.length],
          factionId,
          locationIds[index % locationIds.length],
        ),
      );
    }
  };

  addGroup(
    STONE_FACTION_ID,
    ["montanha"],
    ["Gorila", "Gorila", "Mandril", "Gorila", "Chimpanzé"],
    10,
    "Urgo",
  );
  addGroup(
    GOLD_FACTION_ID,
    ["campo"],
    ["Chimpanzé", "Macaco-prego", "Gibão", "Mandril"],
    9,
    "Doura",
  );

  return monkeys;
}

export function createInitialState(options: StartOptions): GameState {
  const factions = [
    createFaction(
      PLAYER_FACTION_ID,
      options.factionName?.trim() || `Clã de ${options.leaderName.trim() || "Aru"}`,
      "#2fb35a",
      "#0f3f25",
      "player",
      true,
    ),
    createFaction(STONE_FACTION_ID, "Punho de Pedra", "#b5152b", "#3a0711", "stone"),
    createFaction(GOLD_FACTION_ID, "Fruto Dourado", "#e4c72f", "#3c3000", "gold"),
  ];
  wireRelations(factions);

  const report = createReport(0, "Prólogo da Ilha");
  report.confirmed.push(
    "A tribo acordou no Vale das Frutas com um estoque curto e muitas bocas para alimentar.",
  );
  report.confirmed.push(
    "Batedores confirmaram a presença do Punho de Pedra e do Fruto Dourado na ilha.",
  );
  report.rumors.push("Peregrinos dizem que a Floresta das Bananeiras ainda tem cachos suficientes para poucos dias.");
  report.suspicions.push("Alguém contou marcas recentes perto do estoque, mas ninguém sabe de qual facção eram.");
  report.hungerSummary.push("O estoque inicial sustenta a tribo por pouco tempo. Coletar comida será urgente.");
  report.casualtySummary.push("Nenhum ferido grave no começo da campanha.");
  report.relationsSummary.push("O Punho de Pedra observa com hostilidade; o Fruto Dourado ainda aceita conversa.");

  const state: GameState = {
    day: 1,
    phase: "report",
    playerFactionId: PLAYER_FACTION_ID,
    selectedAreaId: "vale",
    areas: createMapAreas(),
    factions,
    monkeys: [...createPlayerMonkeys(options), ...createEnemyMonkeys()],
    report,
    workingReport: null,
    groupPlans: [],
    pendingDecisions: [],
    pendingCombat: null,
    logs: ["A campanha começou no Vale das Frutas."],
    gameOver: null,
  };

  syncAreaMonkeyVisibility(state);
  return state;
}
