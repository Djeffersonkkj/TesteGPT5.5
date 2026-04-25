import {
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  SHADOW_FACTION_ID,
  STONE_FACTION_ID,
} from "./constants";
import type { Area, AreaId, GameState } from "./types";

const bananeirasImage = new URL(
  "../../imagens/floresta_bananeiras_sem_fundo_cortado.png",
  import.meta.url,
).href;
const pantanoImage = new URL(
  "../../imagens/pantano_mosquitos_sem_fundo_cortado.png",
  import.meta.url,
).href;
const ruinasImage = new URL(
  "../../imagens/ruinas_antigas_final_sem_fundo.png",
  import.meta.url,
).href;
const montanhaImage = new URL(
  "../../imagens/montanha_gorilas_sem_fundo_refeito.png",
  import.meta.url,
).href;
const praiaImage = new URL(
  "../../imagens/praia_dos_cascos_final_sem_fundo.png",
  import.meta.url,
).href;
const valeImage = new URL("../../imagens/vale_frutas_sem_fundo_refeito.png", import.meta.url).href;
const cavernaImage = new URL("../../imagens/caverna_exilados_sem_fundo.png", import.meta.url).href;
const rioImage = new URL("../../imagens/rio_barrento_sem_fundo.png", import.meta.url).href;
const campoImage = new URL(
  "../../imagens/campo_aberto_sem_fundo_cortado.png",
  import.meta.url,
).href;

export const AREA_IDS: AreaId[] = [
  "aldeia-cipo",
  "bananeiras",
  "pantano",
  "ruinas",
  "montanha",
  "praia",
  "vale",
  "caverna",
  "rio",
  "campo",
  "bosque",
  "trovao",
];

const LEGACY_AREA_IDS: Record<string, AreaId> = {
  "aldeia-cipo": "aldeia-cipo",
  "floresta-bananeiras": "bananeiras",
  "pantano-mosquitos": "pantano",
  "ruinas-antigas": "ruinas",
  "montanha-gorilas": "montanha",
  "praia-cascos": "praia",
  "vale-frutas": "vale",
  "caverna-exilados": "caverna",
  "rio-barrento": "rio",
  "campo-aberto": "campo",
  "bosque-alto": "bosque",
  "pedra-trovao": "trovao",
};

export const MAP_AREAS: Area[] = [
  {
    id: "aldeia-cipo",
    name: "Aldeia do Cipó",
    shortName: "Cipó",
    terrain: "aldeia",
    image: bananeirasImage,
    ownerFactionId: null,
    visualPosition: { row: 3, col: 3 },
    adjacentAreaIds: ["bananeiras", "pantano"],
    currentFood: 7,
    maxFood: 12,
    foodRegenRate: 2,
    dangerLevel: 2,
    stealthModifier: 0,
    combatModifier: 1,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "A base vermelha vigia as trilhas altas da ilha.",
  },
  {
    id: "bananeiras",
    name: "Floresta das Bananeiras",
    shortName: "Bananeiras",
    terrain: "floresta",
    image: bananeirasImage,
    ownerFactionId: null,
    visualPosition: { row: 2, col: 2 },
    adjacentAreaIds: ["aldeia-cipo", "pantano", "ruinas", "montanha"],
    currentFood: 18,
    maxFood: 24,
    foodRegenRate: 4,
    dangerLevel: 3,
    stealthModifier: 2,
    combatModifier: 0,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Muita comida e cobertura boa para furtividade.",
  },
  {
    id: "pantano",
    name: "Pântano dos Mosquitos",
    shortName: "Pântano",
    terrain: "pântano",
    image: pantanoImage,
    ownerFactionId: null,
    visualPosition: { row: 2, col: 4 },
    adjacentAreaIds: ["aldeia-cipo", "bananeiras", "montanha", "praia"],
    currentFood: 9,
    maxFood: 14,
    foodRegenRate: 2,
    dangerLevel: 7,
    stealthModifier: 2,
    combatModifier: -1,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Perigoso; reduz energia e esconde rastros.",
  },
  {
    id: "ruinas",
    name: "Ruínas Antigas",
    shortName: "Ruínas",
    terrain: "ruínas",
    image: ruinasImage,
    ownerFactionId: null,
    visualPosition: { row: 3, col: 1 },
    adjacentAreaIds: ["bananeiras", "montanha", "vale"],
    currentFood: 6,
    maxFood: 10,
    foodRegenRate: 1,
    dangerLevel: 5,
    stealthModifier: 1,
    combatModifier: 0,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Chance de encontrar ferramentas esquecidas.",
  },
  {
    id: "montanha",
    name: "Base dos Gorilas",
    shortName: "Base Gorila",
    terrain: "montanha",
    image: montanhaImage,
    ownerFactionId: STONE_FACTION_ID,
    isStartingBase: true,
    visualPosition: { row: 1, col: 3 },
    adjacentAreaIds: ["bananeiras", "pantano", "ruinas", "praia", "caverna", "rio"],
    currentFood: 7,
    maxFood: 11,
    foodRegenRate: 1,
    dangerLevel: 6,
    stealthModifier: -2,
    combatModifier: 3,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Base do Punho de Pedra; ha mais gorilas protegendo o centro da ilha.",
  },
  {
    id: "praia",
    name: "Praia dos Cascos",
    shortName: "Praia",
    terrain: "praia",
    image: praiaImage,
    ownerFactionId: null,
    visualPosition: { row: 3, col: 5 },
    adjacentAreaIds: ["pantano", "montanha", "campo"],
    currentFood: 8,
    maxFood: 12,
    foodRegenRate: 2,
    dangerLevel: 3,
    stealthModifier: -1,
    combatModifier: 0,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Objetos úteis chegam com a maré.",
  },
  {
    id: "vale",
    name: "Vale das Frutas",
    shortName: "Vale",
    terrain: "floresta",
    image: valeImage,
    ownerFactionId: PLAYER_FACTION_ID,
    isStartingBase: true,
    visualPosition: { row: 4, col: 0 },
    adjacentAreaIds: ["ruinas", "caverna"],
    currentFood: 15,
    maxFood: 20,
    foodRegenRate: 3,
    dangerLevel: 3,
    stealthModifier: 1,
    combatModifier: 0,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Base verde do jogador e fonte de comida disputada.",
  },
  {
    id: "caverna",
    name: "Caverna dos Exilados",
    shortName: "Caverna",
    terrain: "caverna",
    image: cavernaImage,
    ownerFactionId: null,
    visualPosition: { row: 4, col: 2 },
    adjacentAreaIds: ["montanha", "vale", "rio"],
    currentFood: 5,
    maxFood: 9,
    foodRegenRate: 1,
    dangerLevel: 5,
    stealthModifier: 2,
    combatModifier: 1,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Chance maior de recrutar peregrinos e exilados.",
  },
  {
    id: "rio",
    name: "Rio Barrento",
    shortName: "Rio",
    terrain: "rio",
    image: rioImage,
    ownerFactionId: null,
    visualPosition: { row: 4, col: 4 },
    adjacentAreaIds: ["montanha", "caverna", "campo"],
    currentFood: 10,
    maxFood: 15,
    foodRegenRate: 3,
    dangerLevel: 4,
    stealthModifier: 0,
    combatModifier: 0,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Rota estratégica; facilita patrulhas e fugas.",
  },
  {
    id: "campo",
    name: "Campo Aberto",
    shortName: "Campo",
    terrain: "campo",
    image: campoImage,
    ownerFactionId: GOLD_FACTION_ID,
    isStartingBase: true,
    visualPosition: { row: 4, col: 6 },
    adjacentAreaIds: ["praia", "rio"],
    currentFood: 8,
    maxFood: 13,
    foodRegenRate: 2,
    dangerLevel: 4,
    stealthModifier: -2,
    combatModifier: 1,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Base amarela com pouca cobertura e boa linha de ataque.",
  },
  {
    id: "bosque",
    name: "Bosque Alto",
    shortName: "Bosque",
    terrain: "floresta",
    image: bananeirasImage,
    ownerFactionId: SHADOW_FACTION_ID,
    adjacentAreaIds: ["ruinas", "montanha", "trovao"],
    currentFood: 12,
    maxFood: 17,
    foodRegenRate: 3,
    dangerLevel: 4,
    stealthModifier: 3,
    combatModifier: -1,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Área interna usada por eventos, emboscadas e espionagem.",
  },
  {
    id: "trovao",
    name: "Pedra do Trovão",
    shortName: "Trovão",
    terrain: "montanha",
    image: montanhaImage,
    ownerFactionId: null,
    adjacentAreaIds: ["bosque", "montanha", "campo"],
    currentFood: 6,
    maxFood: 10,
    foodRegenRate: 1,
    dangerLevel: 8,
    stealthModifier: -1,
    combatModifier: 2,
    knownByPlayer: true,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
    specialFeature: "Área interna sagrada; vitórias aqui aumentam moral.",
  },
];

export function createMapAreas(): Area[] {
  return MAP_AREAS.map((area) => ({
    ...area,
    adjacentAreaIds: [...area.adjacentAreaIds],
    visualPosition: area.visualPosition ? { ...area.visualPosition } : undefined,
    visibleMonkeyIds: [],
    hiddenMonkeyIds: [],
  }));
}

export function isAreaId(areaId: string | undefined): areaId is AreaId {
  return Boolean(areaId && AREA_IDS.includes(areaId as AreaId));
}

export function normalizeAreaId(areaId: string | undefined): AreaId {
  if (!areaId) {
    return "vale";
  }
  if (isAreaId(areaId)) {
    return areaId;
  }
  return LEGACY_AREA_IDS[areaId] ?? "vale";
}

export function canMoveToArea(currentAreaId: AreaId, targetAreaId: AreaId): boolean {
  const currentArea = MAP_AREAS.find((area) => area.id === currentAreaId);
  if (!currentArea) {
    return false;
  }

  return currentArea.adjacentAreaIds.includes(targetAreaId);
}

export function canActInArea(currentAreaId: AreaId, targetAreaId: AreaId): boolean {
  return currentAreaId === targetAreaId || canMoveToArea(currentAreaId, targetAreaId);
}

export function getPlayerMainAreaId(state: GameState): AreaId {
  const counts = new Map<AreaId, number>();
  state.monkeys
    .filter((monkey) => monkey.factionId === state.playerFactionId && monkey.status !== "morto")
    .forEach((monkey) => {
      const areaId = normalizeAreaId(monkey.locationId);
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
    });

  let mainAreaId = normalizeAreaId(state.selectedAreaId);
  let bestCount = 0;
  counts.forEach((count, areaId) => {
    if (count > bestCount) {
      bestCount = count;
      mainAreaId = areaId;
    }
  });

  return mainAreaId;
}

export function isVisualArea(area: Area): boolean {
  return Boolean(area.visualPosition);
}
