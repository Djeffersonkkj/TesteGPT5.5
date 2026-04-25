import { PLAYER_FACTION_ID } from "./constants";
import type { DailyReport, Faction, FactionFoodResult, GameState, MapArea, Monkey } from "./types";
import {
  average,
  clamp,
  factionMonkeys,
  foodTotal,
  getFaction,
  livingFactionMonkeys,
  pushLog,
  updateMonkeyStatus,
} from "./utils";

export function regenerateAreaFood(state: GameState): void {
  state.areas.forEach((area) => {
    area.currentFood = clamp(area.currentFood + area.foodRegenRate, 0, area.maxFood);
  });
}

export function bananaScarcityMultiplier(day: number): number {
  if (day <= 10) {
    return 1;
  }
  if (day <= 25) {
    return 0.85;
  }
  if (day <= 45) {
    return 0.7;
  }
  if (day <= 70) {
    return 0.55;
  }
  return 0.4;
}

export function currentBananaProductionForDay(area: MapArea, day: number): number {
  const scarcityMultiplier = bananaScarcityMultiplier(day);
  const areaRate = area.scarcityRate > 0 ? area.scarcityRate : 1;
  return Math.max(
    area.minimumBananaProduction,
    Math.floor(area.baseBananaProduction * scarcityMultiplier * areaRate),
  );
}

function canCollectDailyBananas(monkey: Monkey): boolean {
  return (
    monkey.hp > 1 &&
    monkey.energy > 8 &&
    monkey.status !== "morto" &&
    monkey.status !== "inconsciente" &&
    monkey.status !== "exausto"
  );
}

export function calculateAreaBananaDistribution(area: MapArea, monkeys: Monkey[]): FactionFoodResult[] {
  const eligible = monkeys.filter(
    (monkey) => monkey.locationId === area.id && canCollectDailyBananas(monkey),
  );
  const totalMonkeys = eligible.length;

  if (totalMonkeys === 0 || area.currentBananaProduction <= 0) {
    return [];
  }

  const counts = new Map<string, number>();
  eligible.forEach((monkey) => {
    counts.set(monkey.factionId, (counts.get(monkey.factionId) ?? 0) + 1);
  });

  const production = Math.max(0, Math.floor(area.currentBananaProduction));
  const shares = [...counts.entries()]
    .map(([factionId, monkeyCount]) => {
      const rawShare = (production * monkeyCount) / totalMonkeys;
      return {
        factionId,
        monkeyCount,
        bananasGained: Math.floor(rawShare),
        remainder: rawShare - Math.floor(rawShare),
      };
    })
    .sort((a, b) => a.factionId.localeCompare(b.factionId));

  let distributed = shares.reduce((sum, share) => sum + share.bananasGained, 0);
  [...shares]
    .sort((a, b) => b.remainder - a.remainder || a.factionId.localeCompare(b.factionId))
    .forEach((share) => {
      if (distributed >= production) {
        return;
      }
      share.bananasGained += 1;
      distributed += 1;
    });

  return shares.map((share) => ({
    factionId: share.factionId,
    areaId: area.id,
    bananasGained: share.bananasGained,
    monkeyCount: share.monkeyCount,
    percentage: (share.monkeyCount / totalMonkeys) * 100,
  }));
}

function reportDailyBananaProduction(
  state: GameState,
  report: DailyReport,
  area: MapArea,
  results: FactionFoodResult[],
): void {
  const playerResult = results.find((result) => result.factionId === state.playerFactionId);
  const enemyResults = results.filter((result) => result.factionId !== state.playerFactionId);

  if (playerResult) {
    report.confirmed.push(
      `${area.name} produziu ${area.currentBananaProduction} banana(s); sua tribo recebeu ${playerResult.bananasGained} (${playerResult.percentage.toFixed(0)}%).`,
    );

    enemyResults.forEach((result) => {
      const faction = state.factions.find((item) => item.id === result.factionId);
      report.confirmed.push(
        `${faction?.name ?? "Uma faccao rival"} tambem colheu ${result.bananasGained} banana(s) em ${area.name}.`,
      );
    });
    return;
  }

  if (enemyResults.length === 0 || !area.knownByPlayer) {
    return;
  }

  const hasKnownRivalPresence = area.visibleMonkeyIds.some((monkeyId) => {
    const monkey = state.monkeys.find((item) => item.id === monkeyId);
    return monkey && monkey.factionId !== state.playerFactionId;
  });

  if (hasKnownRivalPresence) {
    report.rumors.push(
      `Vigias viram rivais colhendo em ${area.name}, mas nao confirmaram quantas bananas foram levadas.`,
    );
  } else {
    report.suspicions.push(
      `Sinais de colheita apareceram em ${area.name}, sem numero confiavel de bananas.`,
    );
  }
}

export function resolveDailyBananaProduction(
  gameState: GameState,
  report: DailyReport = gameState.workingReport ?? gameState.report,
): GameState {
  let playerBananas = 0;
  let islandProduction = 0;

  gameState.areas.forEach((area) => {
    area.currentBananaProduction = currentBananaProductionForDay(area, gameState.day);
    islandProduction += area.currentBananaProduction;

    const results = calculateAreaBananaDistribution(area, gameState.monkeys);
    results.forEach((result) => {
      const faction = gameState.factions.find((item) => item.id === result.factionId);
      if (!faction || !faction.alive) {
        return;
      }
      faction.food.bananas += result.bananasGained;
      if (faction.id === gameState.playerFactionId) {
        playerBananas += result.bananasGained;
      }
    });

    reportDailyBananaProduction(gameState, report, area, results);
  });

  if (playerBananas > 0) {
    report.hungerSummary.push(
      `A producao diaria de bananas adicionou ${playerBananas} banana(s) ao estoque da tribo.`,
    );
  }

  pushLog(
    gameState,
    `A ilha produziu ${islandProduction} banana(s) no dia ${gameState.day}; a tribo recebeu ${playerBananas}.`,
  );

  return gameState;
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
