import { SHADOW_FACTION_ID } from "./constants";
import type { DailyReport, GameState, Monkey } from "./types";
import {
  changeRelation,
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
    suspect.factionId = SHADOW_FACTION_ID;
    suspect.locationId = "bosque-alto";
    suspect.role = null;
    suspect.persistentRole = null;
    suspect.plannedAction = null;
    playerFaction.deserters += 1;
    changeRelation(state, state.playerFactionId, SHADOW_FACTION_ID, -12);

    if (guards > 24) {
      report.confirmed.push(`${suspect.name} desertou e foi rastreado indo na direção da Sombra das Copas.`);
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
