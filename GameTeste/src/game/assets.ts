const icon = (name: string) => new URL(`../../imagens/icones/${name}`, import.meta.url).href;
const monkey = (name: string) => new URL(`../../imagens/macacos/${name}`, import.meta.url).href;

export const ASSETS = {
  factions: {
    player: icon("13_estandarte_jogador_macaco.png"),
    stone: icon("14_estandarte_punho_de_pedra.png"),
    shadow: icon("15_estandarte_sombra_das_copas.png"),
    gold: icon("16_estandarte_fruto_dourado.png"),
  },
  icons: {
    hp: icon("01_vida_coracao.png"),
    energy: icon("02_energia_raio.png"),
    food: icon("03_comida_coco.png"),
    population: icon("04_populacao_macaco.png"),
    diplomacy: icon("05_diplomacia_aperto_maos.png"),
    stealth: icon("06_sombra_furtividade.png"),
    knowledge: icon("07_conhecimento_livro.png"),
    morale: icon("08_moral_macaco_estrelas.png"),
    attack: icon("09_ataque_espada.png"),
    defense: icon("10_defesa_escudo.png"),
    day: icon("11_clima_sol.png"),
    vision: icon("12_visao_olho.png"),
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
