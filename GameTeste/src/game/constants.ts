import type { GroupActionType, Role, Species, Terrain, ToolName } from "./types";

export const PLAYER_FACTION_ID = "player";
export const STONE_FACTION_ID = "stone";
export const SHADOW_FACTION_ID = "shadow";
export const GOLD_FACTION_ID = "gold";

export const ROLES: Role[] = [
  "Coletor",
  "Explorador",
  "Guarda",
  "Guerreiro",
  "Curandeiro",
  "Artesão",
  "Diplomata",
  "Descansando",
];

export const GROUP_ACTION_LABELS: Record<GroupActionType, string> = {
  collect: "Coletar comida",
  explore: "Explorar área",
  attack: "Atacar",
  negotiate: "Negociar",
  steal: "Roubar",
  recruit: "Recrutar peregrinos",
  patrol: "Patrulhar",
  craft: "Criar ferramentas",
};

export const ACTION_ROLE_HINT: Record<GroupActionType, Role> = {
  collect: "Coletor",
  explore: "Explorador",
  attack: "Guerreiro",
  negotiate: "Diplomata",
  steal: "Explorador",
  recruit: "Diplomata",
  patrol: "Guarda",
  craft: "Artesão",
};

export const SPECIES_PROFILES: Record<
  Species,
  {
    maxHp: number;
    attack: number;
    defense: number;
    stealth: number;
    intelligence: number;
    charisma: number;
    foodConsumption: number;
    text: string;
  }
> = {
  Gorila: {
    maxHp: 18,
    attack: 8,
    defense: 7,
    stealth: 1,
    intelligence: 3,
    charisma: 4,
    foodConsumption: 2,
    text: "HP e combate altos, furtividade baixa, intimidação forte.",
  },
  Chimpanzé: {
    maxHp: 12,
    attack: 5,
    defense: 4,
    stealth: 4,
    intelligence: 6,
    charisma: 6,
    foodConsumption: 1,
    text: "Equilibrado, bom líder, inteligente e carismático.",
  },
  "Macaco-prego": {
    maxHp: 9,
    attack: 3,
    defense: 3,
    stealth: 6,
    intelligence: 8,
    charisma: 4,
    foodConsumption: 1,
    text: "Muito inteligente, bom com ferramentas e furtivo.",
  },
  Mandril: {
    maxHp: 11,
    attack: 7,
    defense: 4,
    stealth: 3,
    intelligence: 4,
    charisma: 3,
    foodConsumption: 1.5,
    text: "Ataque e intimidação altos, moral mais instável.",
  },
  Gibão: {
    maxHp: 8,
    attack: 3,
    defense: 2,
    stealth: 8,
    intelligence: 5,
    charisma: 5,
    foodConsumption: 0.75,
    text: "Ágil, furtivo e excelente explorador.",
  },
};

export const TERRAIN_LABELS: Record<Terrain, string> = {
  floresta: "Floresta",
  pântano: "Pântano",
  montanha: "Montanha",
  praia: "Praia",
  ruínas: "Ruínas",
  rio: "Rio",
  campo: "Campo",
  aldeia: "Aldeia",
  caverna: "Caverna",
};

export const TERRAIN_ICONS: Record<Terrain, string> = {
  floresta: "🌿",
  pântano: "☁",
  montanha: "▲",
  praia: "◒",
  ruínas: "⌁",
  rio: "≈",
  campo: "◇",
  aldeia: "⌂",
  caverna: "●",
};

export const TERRAIN_CLASS: Record<Terrain, string> = {
  floresta: "terrain-forest",
  pântano: "terrain-swamp",
  montanha: "terrain-mountain",
  praia: "terrain-beach",
  ruínas: "terrain-ruins",
  rio: "terrain-river",
  campo: "terrain-field",
  aldeia: "terrain-village",
  caverna: "terrain-cave",
};

export const TOOLS: ToolName[] = [
  "Lança de bambu",
  "Pedra afiada",
  "Corda de cipó",
  "Cesto de folhas",
  "Máscara de lama",
  "Tambor tribal",
  "Armadilha de cipó",
  "Catapulta improvisada",
];

export const PLAYER_NAMES = [
  "Naru",
  "Bako",
  "Koba",
  "Sabi",
  "Momo",
  "Tala",
  "Goro",
  "Luma",
  "Pako",
  "Riku",
  "Zuri",
  "Bira",
  "Tiko",
  "Yama",
];

export const ENEMY_NAMES = [
  "Brugo",
  "Dakar",
  "Manda",
  "Raska",
  "Vorno",
  "Suru",
  "Neka",
  "Fara",
  "Orun",
  "Kito",
  "Jaga",
  "Pira",
  "Leko",
  "Tamu",
  "Iru",
  "Zako",
];
