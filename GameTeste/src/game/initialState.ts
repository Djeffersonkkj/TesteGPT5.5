import {
  ENEMY_NAMES,
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  PLAYER_NAMES,
  STONE_FACTION_ID,
} from "./constants";
import { createMapAreas, normalizeAreaId } from "./map";
import { createReport } from "./reports";
import { getDefaultSkillsForSpecies, getInitialStatsForSpecies } from "./skills";
import type {
  AreaId,
  DailyRole,
  Faction,
  FactionArchetype,
  FoodStock,
  GameState,
  Monkey,
  MonkeySpecies,
  Species,
} from "./types";
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

const SPECIES: MonkeySpecies[] = ["Gorila", "Chimpanzé", "Macaco-prego", "Mandril", "Gibão"];

export const PLAYER_ARCHETYPE: FactionArchetype = {
  factionId: PLAYER_FACTION_ID,
  name: "Jogador",
  speciesWeights: {
    Gorila: 20,
    Chimpanzé: 25,
    "Macaco-prego": 20,
    Mandril: 15,
    Gibão: 20,
  },
  preferredRoles: ["Guerreiro", "Explorador", "Coletor", "Artesão", "Diplomata", "Guarda"],
  behaviorBias: {
    aggression: 50,
    diplomacy: 50,
    stealth: 50,
    foodFocus: 55,
    expansion: 50,
    riskTolerance: 45,
  },
};

export const STONE_ARCHETYPE: FactionArchetype = {
  factionId: STONE_FACTION_ID,
  name: "Punho de Pedra",
  speciesWeights: {
    Gorila: 35,
    Mandril: 30,
    Chimpanzé: 15,
    "Macaco-prego": 10,
    Gibão: 10,
  },
  preferredRoles: ["Guerreiro", "Guarda", "Coletor", "Explorador"],
  behaviorBias: {
    aggression: 85,
    diplomacy: 20,
    stealth: 25,
    foodFocus: 65,
    expansion: 75,
    riskTolerance: 70,
  },
};

export const GOLD_ARCHETYPE: FactionArchetype = {
  factionId: GOLD_FACTION_ID,
  name: "Fruto Dourado",
  speciesWeights: {
    Chimpanzé: 35,
    "Macaco-prego": 25,
    Gibão: 20,
    Gorila: 10,
    Mandril: 10,
  },
  preferredRoles: ["Diplomata", "Coletor", "Curandeiro", "Artesão", "Explorador", "Guerreiro"],
  behaviorBias: {
    aggression: 38,
    diplomacy: 82,
    stealth: 55,
    foodFocus: 78,
    expansion: 48,
    riskTolerance: 35,
  },
};

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

function weightedSpecies(weights: Record<MonkeySpecies, number>): MonkeySpecies {
  const total = SPECIES.reduce((sum, species) => sum + Math.max(0, weights[species] ?? 0), 0);
  let roll = Math.random() * total;
  for (const species of SPECIES) {
    roll -= Math.max(0, weights[species] ?? 0);
    if (roll <= 0) {
      return species;
    }
  }
  return "Chimpanzé";
}

function weightsWithLeaderInfluence(
  weights: Record<MonkeySpecies, number>,
  leaderSpecies?: MonkeySpecies,
): Record<MonkeySpecies, number> {
  if (!leaderSpecies) {
    return { ...weights };
  }

  const currentLeaderWeight = weights[leaderSpecies] ?? 0;
  const nextLeaderWeight = currentLeaderWeight + 10;
  const otherTotal = SPECIES.filter((species) => species !== leaderSpecies).reduce(
    (sum, species) => sum + weights[species],
    0,
  );
  const targetOtherTotal = Math.max(0, 100 - nextLeaderWeight);
  const scale = otherTotal > 0 ? targetOtherTotal / otherTotal : 0;

  return Object.fromEntries(
    SPECIES.map((species) => [
      species,
      species === leaderSpecies ? nextLeaderWeight : Math.max(0, weights[species] * scale),
    ]),
  ) as Record<MonkeySpecies, number>;
}

function replaceNonLeaderSpecies(
  speciesList: MonkeySpecies[],
  requiredSpecies: MonkeySpecies,
  includeLeader: boolean,
): void {
  const start = includeLeader ? 1 : 0;
  const index = speciesList.findIndex((species, candidateIndex) => candidateIndex >= start && species !== requiredSpecies);
  speciesList[index >= 0 ? index : speciesList.length - 1] = requiredSpecies;
}

function ensureMinimumComposition(
  speciesList: MonkeySpecies[],
  archetype: FactionArchetype,
  includeLeader: boolean,
): MonkeySpecies[] {
  const next = [...speciesList];
  const hasAny = (options: MonkeySpecies[]) => next.some((species) => options.includes(species));
  const countAny = (options: MonkeySpecies[]) => next.filter((species) => options.includes(species)).length;

  if (archetype.factionId === PLAYER_FACTION_ID) {
    if (!hasAny(["Gorila", "Mandril"])) {
      replaceNonLeaderSpecies(next, "Gorila", includeLeader);
    }
    if (!hasAny(["Gibão", "Macaco-prego"])) {
      replaceNonLeaderSpecies(next, "Gibão", includeLeader);
    }
    if (!hasAny(["Chimpanzé", "Macaco-prego"])) {
      replaceNonLeaderSpecies(next, "Chimpanzé", includeLeader);
    }
  } else if (archetype.factionId === STONE_FACTION_ID) {
    while (countAny(["Gorila", "Mandril"]) < 2) {
      replaceNonLeaderSpecies(next, countAny(["Gorila"]) === 0 ? "Gorila" : "Mandril", includeLeader);
    }
  } else if (archetype.factionId === GOLD_FACTION_ID) {
    if (!hasAny(["Chimpanzé", "Macaco-prego"])) {
      replaceNonLeaderSpecies(next, "Chimpanzé", includeLeader);
    }
    if (!hasAny(["Macaco-prego", "Gibão"])) {
      replaceNonLeaderSpecies(next, "Macaco-prego", includeLeader);
    }
    if (!hasAny(["Gorila", "Mandril"])) {
      replaceNonLeaderSpecies(next, "Mandril", includeLeader);
    }
  }

  if (new Set(next).size === 1 && next.length > 1) {
    const fallback = next[0] === "Chimpanzé" ? "Gibão" : "Chimpanzé";
    replaceNonLeaderSpecies(next, fallback, includeLeader);
  }

  return next;
}

function roleForSpecies(species: MonkeySpecies, archetype: FactionArchetype, isLeader: boolean): DailyRole {
  if (isLeader && archetype.factionId === PLAYER_FACTION_ID) {
    return "Guerreiro";
  }

  const candidates: Record<MonkeySpecies, DailyRole[]> = {
    Gorila: ["Guerreiro", "Guarda", "Coletor"],
    Chimpanzé: ["Diplomata", "Curandeiro", "Coletor", "Guarda"],
    "Macaco-prego": ["Artesão", "Coletor", "Explorador"],
    Mandril: ["Guerreiro", "Guarda"],
    Gibão: ["Explorador", "Coletor"],
  };

  return candidates[species].find((role) => archetype.preferredRoles.includes(role)) ?? candidates[species][0];
}

function nextName(pool: string[], index: number, usedNames: Set<string>): string {
  const base = pool[index % pool.length] ?? `Macaco ${index + 1}`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }

  let suffix = 2;
  while (usedNames.has(`${base} ${suffix}`)) {
    suffix += 1;
  }
  const name = `${base} ${suffix}`;
  usedNames.add(name);
  return name;
}

function ensureUniqueNames(monkeys: Monkey[]): void {
  const seen = new Map<string, number>();
  monkeys.forEach((monkey) => {
    const count = seen.get(monkey.name) ?? 0;
    seen.set(monkey.name, count + 1);
    if (count > 0) {
      monkey.name = `${monkey.name} ${count + 1}`;
    }
  });
}

function createMonkey(
  name: string,
  species: MonkeySpecies,
  factionId: string,
  locationId: AreaId,
  role: DailyRole,
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
    role,
    persistentRole: role,
    plannedAction: { kind: "role", role },
    inventory: [],
    isLeader,
  };
}

export function generateFactionMonkeys(params: {
  faction: Faction;
  archetype: FactionArchetype;
  count: number;
  leaderSpecies?: MonkeySpecies;
  startingAreaId: string;
  includeLeader?: boolean;
}): Monkey[] {
  const includeLeader = params.includeLeader ?? true;
  const locationId = normalizeAreaId(params.startingAreaId);
  const leaderSpecies = params.leaderSpecies ?? weightedSpecies(params.archetype.speciesWeights);
  const weights =
    params.archetype.factionId === PLAYER_FACTION_ID
      ? weightsWithLeaderInfluence(params.archetype.speciesWeights, leaderSpecies)
      : params.archetype.speciesWeights;
  const speciesList: MonkeySpecies[] = [];

  if (includeLeader) {
    speciesList.push(leaderSpecies);
  }
  while (speciesList.length < params.count) {
    speciesList.push(weightedSpecies(weights));
  }

  const finalSpecies = ensureMinimumComposition(speciesList, params.archetype, includeLeader);
  const pool = params.faction.isPlayer ? PLAYER_NAMES : ENEMY_NAMES;
  const usedNames = new Set<string>();

  return finalSpecies.map((species, index) => {
    const isLeader = includeLeader && index === 0;
    const role = roleForSpecies(species, params.archetype, isLeader);
    return createMonkey(
      nextName(pool, index, usedNames),
      species,
      params.faction.id,
      locationId,
      role,
      isLeader,
    );
  });
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
  const playerFaction = factions.find((faction) => faction.id === PLAYER_FACTION_ID)!;
  const stoneFaction = factions.find((faction) => faction.id === STONE_FACTION_ID)!;
  const goldFaction = factions.find((faction) => faction.id === GOLD_FACTION_ID)!;
  const playerMonkeys = generateFactionMonkeys({
    faction: playerFaction,
    archetype: PLAYER_ARCHETYPE,
    count: 9,
    leaderSpecies: options.leaderSpecies,
    startingAreaId: "vale",
    includeLeader: true,
  });
  playerMonkeys[0].name = options.leaderName.trim() || "Aru";
  const monkeys = [
    ...playerMonkeys,
    ...generateFactionMonkeys({
      faction: stoneFaction,
      archetype: STONE_ARCHETYPE,
      count: 10,
      leaderSpecies: "Gorila",
      startingAreaId: "montanha",
      includeLeader: true,
    }),
    ...generateFactionMonkeys({
      faction: goldFaction,
      archetype: GOLD_ARCHETYPE,
      count: 10,
      leaderSpecies: "Chimpanzé",
      startingAreaId: "campo",
      includeLeader: true,
    }),
  ];
  const stoneLeader = monkeys.find((monkey) => monkey.factionId === STONE_FACTION_ID && monkey.isLeader);
  const goldLeader = monkeys.find((monkey) => monkey.factionId === GOLD_FACTION_ID && monkey.isLeader);
  if (stoneLeader) {
    stoneLeader.name = "Urgo";
  }
  if (goldLeader) {
    goldLeader.name = "Doura";
  }
  ensureUniqueNames(monkeys);

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
    monkeys,
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
