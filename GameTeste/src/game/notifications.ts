import type { GameState, Monkey } from "./types";
import { foodTotal, playerMonkeys } from "./utils";

export interface TribeNotifications {
  hungry: Monkey[];
  tired: Monkey[];
  injured: Monkey[];
  unhappy: Monkey[];
  withoutRole: Monkey[];
  pendingDecision: Monkey[];
  foodLow: boolean;
  moraleLow: boolean;
  reportAvailable: boolean;
}

export function getTribeNotifications(state: GameState): TribeNotifications {
  const monkeys = playerMonkeys(state);
  const player = state.factions.find((faction) => faction.id === state.playerFactionId)!;
  const food = foodTotal(player);

  return {
    hungry: monkeys.filter((monkey) => monkey.status === "faminto" || monkey.hunger >= 65),
    tired: monkeys.filter((monkey) => monkey.status === "exausto" || monkey.energy <= 22),
    injured: monkeys.filter(
      (monkey) =>
        monkey.status === "ferido" ||
        monkey.status === "inconsciente" ||
        monkey.hp < monkey.maxHp * 0.45,
    ),
    unhappy: monkeys.filter((monkey) => monkey.morale < 45 || monkey.loyalty < 40),
    withoutRole: monkeys.filter((monkey) => !monkey.role && !monkey.persistentRole),
    pendingDecision: monkeys.filter((monkey) => !monkey.plannedAction),
    foodLow: food <= monkeys.length * 2,
    moraleLow: player.morale < 45 || monkeys.some((monkey) => monkey.morale < 35),
    reportAvailable: state.report.confirmed.length + state.report.rumors.length + state.report.suspicions.length > 0,
  };
}

export function getNotificationSummary(details: TribeNotifications): string[] {
  const summary: string[] = [];

  if (details.hungry.length > 0) {
    summary.push(`${details.hungry.length} com fome`);
  }
  if (details.tired.length > 0) {
    summary.push(`${details.tired.length} cansado(s)`);
  }
  if (details.injured.length > 0) {
    summary.push(`${details.injured.length} ferido(s)`);
  }
  if (details.moraleLow || details.unhappy.length > 0) {
    summary.push("Moral baixa");
  }
  if (details.foodLow) {
    summary.push("Comida acabando");
  }
  if (details.pendingDecision.length > 0) {
    summary.push("Acao pendente");
  }
  if (details.reportAvailable) {
    summary.push("Relatorio disponivel");
  }

  return summary;
}
