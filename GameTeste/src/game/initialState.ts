import {
  ENEMY_NAMES,
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  PLAYER_NAMES,
  SHADOW_FACTION_ID,
  SPECIES_PROFILES,
  STONE_FACTION_ID,
} from "./constants";
import { createReport } from "./reports";
import type { Area, Faction, FoodStock, GameState, Monkey, Species } from "./types";
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
    intimidation: aiPersonality === "stone" ? 18 : aiPersonality === "shadow" ? 4 : 8,
    stealthBias: aiPersonality === "shadow" ? 18 : aiPersonality === "stone" ? -6 : 4,
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
  set(PLAYER_FACTION_ID, SHADOW_FACTION_ID, -8);
  set(PLAYER_FACTION_ID, GOLD_FACTION_ID, 8);
  set(STONE_FACTION_ID, SHADOW_FACTION_ID, -35);
  set(STONE_FACTION_ID, GOLD_FACTION_ID, -12);
  set(SHADOW_FACTION_ID, GOLD_FACTION_ID, -4);
}

function createMonkey(
  name: string,
  species: Species,
  factionId: string,
  locationId: string,
  isLeader = false,
): Monkey {
  const profile = SPECIES_PROFILES[species];
  const leaderBonus = isLeader ? 2 : 0;

  return {
    id: uid("monkey"),
    name,
    species,
    factionId,
    hp: profile.maxHp + leaderBonus,
    maxHp: profile.maxHp + leaderBonus,
    energy: 82 + Math.floor(Math.random() * 12),
    maxEnergy: 100,
    attack: profile.attack + (isLeader ? 1 : 0),
    defense: profile.defense + (isLeader ? 1 : 0),
    stealth: profile.stealth,
    intelligence: profile.intelligence + (isLeader ? 1 : 0),
    charisma: profile.charisma + (isLeader ? 2 : 0),
    loyalty: isLeader ? 100 : 55 + Math.floor(Math.random() * 25),
    morale: 55 + Math.floor(Math.random() * 22),
    hunger: 12 + Math.floor(Math.random() * 12),
    foodConsumption: profile.foodConsumption,
    locationId,
    status: "normal",
    role: null,
    persistentRole: null,
    plannedAction: null,
    inventory: [],
    isLeader,
  };
}

const areas = (playerId: string): Area[] => [
  {
    id: "aldeia-cipo",
    name: "Aldeia do Cipó",
    shortName: "Cipó",
    terrain: "aldeia",
    x: 2,
    y: 0,
    currentFood: 7,
    maxFood: 12,
    foodRegenRate: 2,
    dangerLevel: 2,
    stealthModifier: 0,
    combatModifier: 1,
    ownerFactionId: playerId,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Centro da tribo. Guardas protegem melhor o estoque aqui.",
  },
  {
    id: "floresta-bananeiras",
    name: "Floresta das Bananeiras",
    shortName: "Bananeiras",
    terrain: "floresta",
    x: 1,
    y: 1,
    currentFood: 18,
    maxFood: 24,
    foodRegenRate: 4,
    dangerLevel: 3,
    stealthModifier: 2,
    combatModifier: 0,
    ownerFactionId: playerId,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Muita comida e cobertura boa para furtividade.",
  },
  {
    id: "pantano-mosquitos",
    name: "Pântano dos Mosquitos",
    shortName: "Pântano",
    terrain: "pântano",
    x: 3,
    y: 1,
    currentFood: 9,
    maxFood: 14,
    foodRegenRate: 2,
    dangerLevel: 7,
    stealthModifier: 2,
    combatModifier: -1,
    ownerFactionId: null,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Perigoso; reduz energia e esconde rastros.",
  },
  {
    id: "ruinas-antigas",
    name: "Ruínas Antigas",
    shortName: "Ruínas",
    terrain: "ruínas",
    x: 0,
    y: 2,
    currentFood: 6,
    maxFood: 10,
    foodRegenRate: 1,
    dangerLevel: 5,
    stealthModifier: 1,
    combatModifier: 0,
    ownerFactionId: SHADOW_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Chance de encontrar ferramentas esquecidas.",
  },
  {
    id: "praia-cascos",
    name: "Praia dos Cascos",
    shortName: "Praia",
    terrain: "praia",
    x: 4,
    y: 2,
    currentFood: 8,
    maxFood: 12,
    foodRegenRate: 2,
    dangerLevel: 3,
    stealthModifier: -1,
    combatModifier: 0,
    ownerFactionId: GOLD_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Objetos úteis chegam com a maré.",
  },
  {
    id: "montanha-gorilas",
    name: "Montanha dos Gorilas",
    shortName: "Montanha",
    terrain: "montanha",
    x: 2,
    y: 2,
    currentFood: 7,
    maxFood: 11,
    foodRegenRate: 1,
    dangerLevel: 6,
    stealthModifier: -2,
    combatModifier: 3,
    ownerFactionId: STONE_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Bônus de combate para tropas fortes.",
  },
  {
    id: "vale-frutas",
    name: "Vale das Frutas",
    shortName: "Vale",
    terrain: "floresta",
    x: 1,
    y: 3,
    currentFood: 15,
    maxFood: 20,
    foodRegenRate: 3,
    dangerLevel: 3,
    stealthModifier: 1,
    combatModifier: 0,
    ownerFactionId: GOLD_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Fonte de comida disputada por facções diplomáticas.",
  },
  {
    id: "caverna-exilados",
    name: "Caverna dos Exilados",
    shortName: "Caverna",
    terrain: "caverna",
    x: 3,
    y: 3,
    currentFood: 5,
    maxFood: 9,
    foodRegenRate: 1,
    dangerLevel: 5,
    stealthModifier: 2,
    combatModifier: 1,
    ownerFactionId: null,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Chance maior de recrutar peregrinos e exilados.",
  },
  {
    id: "rio-barrento",
    name: "Rio Barrento",
    shortName: "Rio",
    terrain: "rio",
    x: 2,
    y: 4,
    currentFood: 10,
    maxFood: 15,
    foodRegenRate: 3,
    dangerLevel: 4,
    stealthModifier: 0,
    combatModifier: 0,
    ownerFactionId: null,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Rota estratégica; facilita patrulhas e fugas.",
  },
  {
    id: "campo-aberto",
    name: "Campo Aberto",
    shortName: "Campo",
    terrain: "campo",
    x: 0,
    y: 4,
    currentFood: 8,
    maxFood: 13,
    foodRegenRate: 2,
    dangerLevel: 4,
    stealthModifier: -2,
    combatModifier: 1,
    ownerFactionId: STONE_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Pouca cobertura, bom para confrontos diretos.",
  },
  {
    id: "bosque-alto",
    name: "Bosque Alto",
    shortName: "Bosque",
    terrain: "floresta",
    x: 4,
    y: 4,
    currentFood: 12,
    maxFood: 17,
    foodRegenRate: 3,
    dangerLevel: 4,
    stealthModifier: 3,
    combatModifier: -1,
    ownerFactionId: SHADOW_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Excelente para emboscadas e espionagem.",
  },
  {
    id: "pedra-trovao",
    name: "Pedra do Trovão",
    shortName: "Trovão",
    terrain: "montanha",
    x: 2,
    y: 5,
    currentFood: 6,
    maxFood: 10,
    foodRegenRate: 1,
    dangerLevel: 8,
    stealthModifier: -1,
    combatModifier: 2,
    ownerFactionId: STONE_FACTION_ID,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Local sagrado; vitórias aqui aumentam moral.",
  },
];

function createPlayerMonkeys(options: StartOptions): Monkey[] {
  const leaderName = options.leaderName.trim() || "Aru";
  const monkeys: Monkey[] = [
    createMonkey(leaderName, options.leaderSpecies, PLAYER_FACTION_ID, "aldeia-cipo", true),
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
    const locationId = index < 7 ? "aldeia-cipo" : "floresta-bananeiras";
    monkeys.push(createMonkey(PLAYER_NAMES[index], species, PLAYER_FACTION_ID, locationId));
  });

  return monkeys;
}

function createEnemyMonkeys(): Monkey[] {
  const monkeys: Monkey[] = [];
  const addGroup = (
    factionId: string,
    locationIds: string[],
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
    ["montanha-gorilas", "campo-aberto", "pedra-trovao"],
    ["Gorila", "Mandril", "Gorila", "Chimpanzé"],
    10,
    "Urgo",
  );
  addGroup(
    SHADOW_FACTION_ID,
    ["bosque-alto", "ruinas-antigas"],
    ["Gibão", "Macaco-prego", "Gibão", "Chimpanzé"],
    9,
    "Ssha",
  );
  addGroup(
    GOLD_FACTION_ID,
    ["vale-frutas", "praia-cascos"],
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
      "#f7b733",
      "#5d3700",
      "player",
      true,
    ),
    createFaction(STONE_FACTION_ID, "Punho de Pedra", "#9b4d35", "#2d1711", "stone"),
    createFaction(SHADOW_FACTION_ID, "Sombra das Copas", "#416a59", "#10231b", "shadow"),
    createFaction(GOLD_FACTION_ID, "Fruto Dourado", "#d9a441", "#3c2600", "gold"),
  ];
  wireRelations(factions);

  const report = createReport(0, "Prólogo da Ilha");
  report.confirmed.push(
    "A tribo acordou na Aldeia do Cipó com um estoque curto e muitas bocas para alimentar.",
  );
  report.confirmed.push(
    "Batedores confirmaram a presença do Punho de Pedra, da Sombra das Copas e do Fruto Dourado na ilha.",
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
    selectedAreaId: "aldeia-cipo",
    areas: areas(PLAYER_FACTION_ID),
    factions,
    monkeys: [...createPlayerMonkeys(options), ...createEnemyMonkeys()],
    report,
    workingReport: null,
    groupPlans: [],
    pendingCombat: null,
    logs: ["A campanha começou na Aldeia do Cipó."],
    gameOver: null,
  };

  syncAreaMonkeyVisibility(state);
  return state;
}
