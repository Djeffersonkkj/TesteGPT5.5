import { PLAYER_FACTION_ID } from "./constants";
import type { DailyReport, Faction, GameState, Monkey } from "./types";
import {
  average,
  clamp,
  factionMonkeys,
  foodTotal,
  getFaction,
  livingFactionMonkeys,
  updateMonkeyStatus,
} from "./utils";

export function regenerateAreaFood(state: GameState): void {
  state.areas.forEach((area) => {
    area.currentFood = clamp(area.currentFood + area.foodRegenRate, 0, area.maxFood);
  });
}

function spendFood(faction: Faction, needed: number): number {
  let remaining = needed;
  const spendBananas = Math.min(faction.food.bananas, remaining);
  faction.food.bananas -= spendBananas;
  remaining -= spendBananas;

  const rareAsFood = Math.min(faction.food.rareFruits, Math.ceil(remaining / 2));
  faction.food.rareFruits -= rareAsFood;
  remaining -= rareAsFood * 2;

  const rootsAsFood = Math.min(faction.food.roots, Math.ceil(remaining / 0.75));
  faction.food.roots -= rootsAsFood;
  remaining -= rootsAsFood * 0.75;

  return Math.max(0, remaining);
}

function recoverFromRest(monkey: Monkey): void {
  if (monkey.role === "Descansando") {
    monkey.energy = clamp(monkey.energy + 24, 0, monkey.maxEnergy);
    monkey.morale = clamp(monkey.morale + 5, 0, 100);
    monkey.hunger = clamp(monkey.hunger - 6, 0, 100);
  } else {
    monkey.energy = clamp(monkey.energy + 4, 0, monkey.maxEnergy);
  }
}

export function applyHungerAndRecovery(state: GameState, report: DailyReport): void {
  state.factions.forEach((faction) => {
    if (!faction.alive) {
      return;
    }

    const alive = livingFactionMonkeys(state, faction.id);
    if (alive.length === 0) {
      faction.alive = false;
      return;
    }

    const needed = alive.reduce((sum, monkey) => sum + monkey.foodConsumption, 0);
    const shortage = spendFood(faction, needed);
    const shortageRatio = needed > 0 ? clamp(shortage / needed, 0, 1) : 0;

    alive.forEach((monkey) => {
      const hadHp = monkey.hp;
      if (shortageRatio > 0) {
        monkey.hunger = clamp(monkey.hunger + 24 * shortageRatio + 8, 0, 100);
        monkey.energy = clamp(monkey.energy - (20 * shortageRatio + 6), 0, monkey.maxEnergy);
        monkey.morale = clamp(monkey.morale - (12 * shortageRatio + 4), 0, 100);
        if (monkey.energy <= 0 || monkey.hunger >= 92) {
          monkey.hp = clamp(monkey.hp - (2 + Math.floor(shortageRatio * 4)), 0, monkey.maxHp);
        }
      } else {
        monkey.hunger = clamp(monkey.hunger - 18, 0, 100);
        monkey.morale = clamp(monkey.morale + 3, 0, 100);
      }

      recoverFromRest(monkey);
      updateMonkeyStatus(monkey);

      if (hadHp > 0 && monkey.hp <= 0) {
        faction.deaths += 1;
        if (faction.id === PLAYER_FACTION_ID) {
          report.casualtySummary.push(`${monkey.name} morreu depois de fome e exaustão.`);
        }
      }
    });

    const livingNow = livingFactionMonkeys(state, faction.id);
    faction.morale = clamp(
      average(livingNow.map((monkey) => monkey.morale)) || faction.morale,
      0,
      100,
    );

    if (faction.id === PLAYER_FACTION_ID) {
      if (shortageRatio > 0) {
        report.hungerSummary.push(
          `Faltou comida para a tribo: ${Math.ceil(shortage)} porção(ões) ficaram sem cobertura.`,
        );
      } else {
        report.hungerSummary.push(
          `A tribo consumiu ${needed.toFixed(1)} porção(ões) e ainda guarda ${Math.floor(
            foodTotal(faction),
          )} de valor alimentar.`,
        );
      }
    } else if (shortageRatio > 0.25) {
      report.rumors.push(`${faction.name} parece estar com fome e mais propenso a ações desesperadas.`);
    }

    if (livingNow.length === 0) {
      faction.alive = false;
      if (faction.id === PLAYER_FACTION_ID) {
        report.casualtySummary.push("A facção do jogador não tem mais macacos vivos.");
      } else {
        report.rumors.push(`${faction.name} pode ter colapsado por fome, ferimentos e deserções.`);
      }
    }
  });

  factionMonkeys(state, state.playerFactionId)
    .filter((monkey) => monkey.status === "ferido" && monkey.role === "Curandeiro")
    .forEach((monkey) => {
      monkey.hp = clamp(monkey.hp + 1, 0, monkey.maxHp);
      updateMonkeyStatus(monkey);
    });
}

export function summarizeFactionRelations(state: GameState, report: DailyReport): void {
  const player = getFaction(state, state.playerFactionId);
  state.factions
    .filter((faction) => faction.id !== player.id && faction.alive)
    .forEach((faction) => {
      const relation = player.relations[faction.id] ?? 0;
      let mood = "neutra";
      if (relation <= -60) {
        mood = "ódio aberto";
      } else if (relation <= -25) {
        mood = "hostil";
      } else if (relation >= 45) {
        mood = "aliada";
      } else if (relation >= 15) {
        mood = "cordial";
      }
      report.relationsSummary.push(`${faction.name}: ${relation} (${mood}).`);
    });
}
