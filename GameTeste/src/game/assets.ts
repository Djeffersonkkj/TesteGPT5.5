const monkey = (name: string) => new URL(`../../imagens/macacos/${name}`, import.meta.url).href;

const iconUrls = {
  playerFlag: new URL("../../imagens/icones/13_estandarte_jogador_macaco.png", import.meta.url).href,
  stoneFlag: new URL("../../imagens/icones/14_estandarte_punho_de_pedra.png", import.meta.url).href,
  goldFlag: new URL("../../imagens/icones/16_estandarte_fruto_dourado.png", import.meta.url).href,
  hp: new URL("../../imagens/icones/01_vida_coracao.png", import.meta.url).href,
  energy: new URL("../../imagens/icones/02_energia_raio.png", import.meta.url).href,
  food: new URL("../../imagens/icones/03_comida_coco.png", import.meta.url).href,
  population: new URL("../../imagens/icones/04_populacao_macaco.png", import.meta.url).href,
  diplomacy: new URL("../../imagens/icones/05_diplomacia_aperto_maos.png", import.meta.url).href,
  stealth: new URL("../../imagens/icones/06_sombra_furtividade.png", import.meta.url).href,
  knowledge: new URL("../../imagens/icones/07_conhecimento_livro.png", import.meta.url).href,
  morale: new URL("../../imagens/icones/08_moral_macaco_estrelas.png", import.meta.url).href,
  attack: new URL("../../imagens/icones/09_ataque_espada.png", import.meta.url).href,
  defense: new URL("../../imagens/icones/10_defesa_escudo.png", import.meta.url).href,
  day: new URL("../../imagens/icones/11_clima_sol.png", import.meta.url).href,
  vision: new URL("../../imagens/icones/12_visao_olho.png", import.meta.url).href,
};

export const ASSETS = {
  factions: {
    player: iconUrls.playerFlag,
    stone: iconUrls.stoneFlag,
    gold: iconUrls.goldFlag,
  },
  icons: {
    hp: iconUrls.hp,
    energy: iconUrls.energy,
    food: iconUrls.food,
    population: iconUrls.population,
    diplomacy: iconUrls.diplomacy,
    stealth: iconUrls.stealth,
    knowledge: iconUrls.knowledge,
    morale: iconUrls.morale,
    attack: iconUrls.attack,
    defense: iconUrls.defense,
    day: iconUrls.day,
    vision: iconUrls.vision,
  },
  monkeys: [
    monkey("macaco_01.png"),
    monkey("macaco_02.png"),
    monkey("macaco_03.png"),
    monkey("macaco_04.png"),
    monkey("macaco_05.png"),
    monkey("macaco_06.png"),
    monkey("macaco_07.png"),
    monkey("macaco_08.png"),
    monkey("macaco_09.png"),
    monkey("macaco_10.png"),
    monkey("macaco_11.png"),
    monkey("macaco_12.png"),
    monkey("macaco_13.png"),
    monkey("macaco_14.png"),
    monkey("macaco_15.png"),
    monkey("macaco_16.png"),
  ],
};

export function factionFlag(factionId: string | null | undefined): string | undefined {
  if (!factionId) {
    return undefined;
  }
  return ASSETS.factions[factionId as keyof typeof ASSETS.factions];
}

export function monkeyPortrait(index: number): string {
  return ASSETS.monkeys[index % ASSETS.monkeys.length];
}
