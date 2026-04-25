import { GOLD_FACTION_ID, STONE_FACTION_ID } from "./constants";
import type { DailyReport, GameState, GroupActionPlan, Monkey, PendingDecision } from "./types";
import {
  clamp,
  getFaction,
  livingFactionMonkeys,
  roll,
  sample,
  updateMonkeyStatus,
} from "./utils";

function guardScore(monkeys: Monkey[]): number {
  return monkeys
    .filter((monkey) => monkey.role === "Guarda" || monkey.role === "Guerreiro")
    .reduce((sum, monkey) => sum + monkey.intelligence + monkey.defense + monkey.energy / 20, 0);
}

function decisionId(type: string): string {
  return `${type}-${Math.random().toString(36).slice(2, 9)}`;
}

function pushed<T>(items: T[], max: number, item: T): void {
  if (items.length < max) {
    items.push(item);
  }
}

function createInternalTheftDecision(
  state: GameState,
  suspect: Monkey,
  guards: number,
): PendingDecision {
  const hasWitness = guards > 24;
  return {
    id: decisionId("internal-theft"),
    type: "internal_theft",
    title: "Roubo interno",
    description: hasWitness
      ? `${suspect.name} foi visto saindo do deposito de comida tarde da noite.`
      : "Um macaco foi visto perto do deposito durante a noite, mas os guardas nao tem certeza de quem era.",
    knownLevel: hasWitness ? "confirmado" : "suspeita",
    targetMonkeyId: suspect.id,
    options: [
      {
        id: "investigate",
        label: "Investigar amanha",
        description: "Adia a punicao e registra o caso para a tribo observar melhor.",
        effects: [
          {
            type: "addReport",
            reportLevel: "suspeita",
            text: hasWitness
              ? `${suspect.name} ficara sob observacao antes de qualquer punicao.`
              : "A guarda vai procurar testemunhas antes de acusar alguem pelo sumico de comida.",
          },
          { type: "loyalty", target: suspect.id, value: -2, hidden: !hasWitness },
        ],
      },
      {
        id: "forgive",
        label: "Perdoar e ignorar",
        description: "Evita conflito aberto, mas a comida perdida nao volta.",
        effects: [
          { type: "food", value: -2 },
          { type: "morale", value: 2 },
          { type: "loyalty", target: suspect.id, value: 4, hidden: !hasWitness },
          { type: "addReport", reportLevel: "rumor", text: "A tribo ouviu que o lider preferiu evitar uma acusacao sem prova clara." },
        ],
      },
      {
        id: "punish",
        label: hasWitness ? `Punir ${suspect.name}` : "Punir o principal suspeito",
        description: "Mostra controle, mas pode abalar a moral se a prova for fraca.",
        effects: [
          { type: "morale", value: hasWitness ? -2 : -6 },
          { type: "loyalty", target: suspect.id, value: -14, hidden: !hasWitness },
          {
            type: "hurtMonkey",
            target: suspect.id,
            value: 1,
            hidden: !hasWitness,
          },
          {
            type: "addReport",
            reportLevel: hasWitness ? "confirmado" : "suspeita",
            text: hasWitness
              ? `${suspect.name} foi punido pelo roubo no deposito.`
              : "Um suspeito foi punido, mas parte da tribo ainda duvida da acusacao.",
          },
        ],
      },
      {
        id: "guard",
        label: "Aumentar guarda no deposito",
        description: "Custa energia social, mas reduz novos sumicos.",
        effects: [
          { type: "morale", value: -1 },
          { type: "addReport", reportLevel: "confirmado", text: "A guarda do deposito foi reforcada para a proxima noite." },
        ],
      },
    ],
  };
}

function createDesertionDecision(monkey: Monkey): PendingDecision {
  return {
    id: decisionId("desertion-threat"),
    type: "desertion_threat",
    title: "Ameaca de desercao",
    description: `${monkey.name} esta descontente e falou em abandonar a tribo antes do proximo amanhecer.`,
    knownLevel: "confirmado",
    targetMonkeyId: monkey.id,
    options: [
      {
        id: "persuade",
        label: "Conversar em particular",
        description: "Gasta comida e paciencia para tentar recuperar confianca.",
        effects: [
          { type: "food", value: -1 },
          { type: "loyalty", target: monkey.id, value: 10 },
          { type: "morale", value: 2 },
          { type: "addReport", reportLevel: "confirmado", text: `${monkey.name} aceitou ficar depois de uma conversa com o lider.` },
        ],
      },
      {
        id: "rest",
        label: "Dar descanso amanha",
        description: "Reduz pressao imediata e melhora a moral do macaco.",
        effects: [
          { type: "setRole", target: monkey.id },
          { type: "loyalty", target: monkey.id, value: 6 },
          { type: "monkeyMorale", target: monkey.id, value: 8 },
          { type: "addReport", reportLevel: "confirmado", text: `${monkey.name} recebeu descanso para esfriar os animos.` },
        ],
      },
      {
        id: "exile",
        label: "Expulsar antes que fuja",
        description: "Remove o risco interno, mas marca a tribo como dura.",
        effects: [
          { type: "exileMonkey", target: monkey.id },
          { type: "morale", value: -5 },
          { type: "addReport", reportLevel: "confirmado", text: `${monkey.name} foi expulso da tribo.` },
        ],
      },
      {
        id: "warn",
        label: "Fazer advertencia publica",
        description: "Segura a disciplina, mas piora a lealdade do descontente.",
        effects: [
          { type: "loyalty", target: monkey.id, value: -8 },
          { type: "morale", value: -3 },
          { type: "addReport", reportLevel: "rumor", text: "A advertencia publica dividiu opinioes ao redor da fogueira." },
        ],
      },
    ],
  };
}

function createRuinDecision(plan: GroupActionPlan): PendingDecision {
  return {
    id: decisionId("dangerous-ruin"),
    type: "dangerous_ruin",
    title: "Ruina perigosa",
    description: "Exploradores encontraram uma passagem instavel nas ruinas. Ha marcas antigas e cheiro de pedra molhada.",
    knownLevel: "rumor",
    areaId: plan.areaId,
    options: [
      {
        id: "seal",
        label: "Selar a entrada",
        description: "Evita risco imediato, mas perde a chance de descobrir algo.",
        effects: [
          { type: "morale", value: 1 },
          { type: "addReport", reportLevel: "confirmado", text: "A passagem instavel das ruinas foi marcada como perigosa." },
        ],
      },
      {
        id: "send-scout",
        label: "Mandar um explorador observar",
        description: "Pode revelar pistas sem assumir combate agora.",
        effects: [
          { type: "addReport", reportLevel: "rumor", text: "Um explorador vai observar as ruinas com cuidado no proximo dia." },
        ],
      },
      {
        id: "enter",
        label: "Entrar apesar do risco",
        description: "Pode revelar comida rara, mas tambem pode virar uma emboscada.",
        effects: [
          { type: "startCombat", factionId: STONE_FACTION_ID, areaId: plan.areaId },
          { type: "addReport", reportLevel: "suspeita", text: "A exploracao profunda das ruinas chamou uma patrulha hostil." },
        ],
      },
    ],
  };
}

function createFactionOfferDecision(state: GameState, factionId: string): PendingDecision {
  const faction = getFaction(state, factionId);
  const isStone = factionId === STONE_FACTION_ID;
  return {
    id: decisionId("faction-offer"),
    type: "faction_offer",
    title: isStone ? "Alianca temporaria" : "Oferta de paz por comida",
    description: isStone
      ? "Um emissario do Punho de Pedra propos uma alianca curta contra inimigos comuns."
      : `${faction.name} oferece comida em troca de uma promessa de paz por alguns dias.`,
    knownLevel: "confirmado",
    sourceFaction: faction.id,
    options: [
      {
        id: "accept",
        label: "Aceitar acordo",
        description: "Melhora relacao agora, mas pode parecer fraqueza para outros rivais.",
        effects: [
          { type: "relation", factionId: faction.id, value: isStone ? 12 : 10 },
          { type: "food", value: isStone ? 0 : 3 },
          { type: "addReport", reportLevel: "confirmado", text: `A tribo aceitou um acordo temporario com ${faction.name}.` },
        ],
      },
      {
        id: "reject",
        label: "Recusar",
        description: "Mantem independencia, mas piora o clima diplomatico.",
        effects: [
          { type: "relation", factionId: faction.id, value: -6 },
          { type: "morale", value: 1 },
          { type: "addReport", reportLevel: "confirmado", text: `A proposta de ${faction.name} foi recusada.` },
        ],
      },
      {
        id: "stall",
        label: "Responder com cautela",
        description: "Nao fecha acordo, mas evita ruptura imediata.",
        effects: [
          { type: "relation", factionId: faction.id, value: 2 },
          { type: "addReport", reportLevel: "rumor", text: `Mensageiros de ${faction.name} esperam uma resposta mais clara amanha.` },
        ],
      },
    ],
  };
}

export function generatePendingDecisions(state: GameState, report: DailyReport): PendingDecision[] {
  const decisions: PendingDecision[] = [];
  const playerFaction = getFaction(state, state.playerFactionId);
  const player = livingFactionMonkeys(state, state.playerFactionId);
  const guards = guardScore(player);
  const troubled = player.filter(
    (monkey) =>
      !monkey.isLeader &&
      monkey.status !== "morto" &&
      (monkey.loyalty < 34 || monkey.morale < 30 || monkey.hunger > 74),
  );

  const hungrySuspect = troubled.find((monkey) => monkey.hunger > 74);
  if (hungrySuspect && playerFaction.food.bananas > 1 && roll(0.7)) {
    pushed(decisions, 3, createInternalTheftDecision(state, hungrySuspect, guards));
  }

  const deserter = troubled.find((monkey) => monkey.loyalty < 34 || monkey.morale < 26);
  if (deserter && deserter.id !== hungrySuspect?.id && roll(0.55)) {
    pushed(decisions, 3, createDesertionDecision(deserter));
  }

  const riskyExplore = state.groupPlans.find((plan) => {
    const area = state.areas.find((item) => item.id === plan.areaId);
    return plan.actionType === "explore" && area && (area.id === "ruinas" || area.dangerLevel >= 7);
  });
  if (riskyExplore && roll(0.8)) {
    pushed(decisions, 3, createRuinDecision(riskyExplore));
  }

  const gold = state.factions.find((faction) => faction.id === GOLD_FACTION_ID && faction.alive);
  if (gold && (state.day === 1 || roll(0.35))) {
    pushed(decisions, 3, createFactionOfferDecision(state, gold.id));
  } else if (state.factions.some((faction) => faction.id === STONE_FACTION_ID && faction.alive) && roll(0.25)) {
    pushed(decisions, 3, createFactionOfferDecision(state, STONE_FACTION_ID));
  }

  if (decisions.length > 0) {
    report.rumors.push(`${decisions.length} assunto(s) exigem decisao do lider antes do amanhecer.`);
  }

  return decisions;
}

export function resolveInternalEvents(state: GameState, report: DailyReport): void {
  const playerFaction = getFaction(state, state.playerFactionId);
  const playerMonkeys = livingFactionMonkeys(state, state.playerFactionId);
  const guards = guardScore(playerMonkeys);
  const troubled = playerMonkeys.filter(
    (monkey) =>
      !monkey.isLeader &&
      monkey.status !== "morto" &&
      (monkey.loyalty < 34 || monkey.morale < 28 || monkey.hunger > 78),
  );

  if (troubled.length === 0) {
    return;
  }

  const suspect = sample(troubled);
  const chance = clamp((100 - suspect.loyalty + (100 - suspect.morale)) / 260, 0.06, 0.42);

  if (!roll(chance)) {
    return;
  }

  if (suspect.hunger > 78 && playerFaction.food.bananas > 1) {
    const stolen = Math.min(3, playerFaction.food.bananas);
    playerFaction.food.bananas -= stolen;
    suspect.loyalty = clamp(suspect.loyalty - 8, 0, 100);
    if (guards > 20) {
      report.suspicions.push(`${suspect.name} foi visto perto do estoque antes de ${stolen} banana(s) sumirem.`);
    } else {
      report.suspicions.push(`${stolen} banana(s) desapareceram durante a noite.`);
    }
    return;
  }

  if (suspect.loyalty < 28 && roll(0.45)) {
    state.monkeys = state.monkeys.filter((monkey) => monkey.id !== suspect.id);
    playerFaction.deserters += 1;

    if (guards > 24) {
      report.confirmed.push(`${suspect.name} desertou e sumiu pelas trilhas do Bosque Alto.`);
    } else {
      report.suspicions.push("Um macaco deixou a tribo durante a noite, mas ninguém viu o rosto.");
    }
    return;
  }

  suspect.morale = clamp(suspect.morale - 8, 0, 100);
  suspect.energy = clamp(suspect.energy - 8, 0, suspect.maxEnergy);
  updateMonkeyStatus(suspect);
  report.suspicions.push(`${suspect.name} recusou parte das ordens e pediu descanso.`);
}
