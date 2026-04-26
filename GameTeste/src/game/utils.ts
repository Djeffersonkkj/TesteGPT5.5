import { PLAYER_FACTION_ID } from "./constants";
import type { Area, Faction, GameState, Monkey, MonkeyStatus } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

export function sample<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function roll(chance: number): boolean {
  return Math.random() < chance;
}

export function livingMonkeys(monkeys: Monkey[]): Monkey[] {
  return monkeys.filter((monkey) => monkey.status !== "morto" && monkey.hp > 0);
}

export function factionMonkeys(state: GameState, factionId: string): Monkey[] {
  return state.monkeys.filter((monkey) => monkey.factionId === factionId);
}

export function livingFactionMonkeys(state: GameState, factionId: string): Monkey[] {
  return livingMonkeys(factionMonkeys(state, factionId));
}

export function playerMonkeys(state: GameState): Monkey[] {
  return livingFactionMonkeys(state, state.playerFactionId);
}

export function getFaction(state: GameState, factionId: string): Faction {
  const faction = state.factions.find((item) => item.id === factionId);
  if (!faction) {
    throw new Error(`Facção não encontrada: ${factionId}`);
  }
  return faction;
}

export function getArea(state: GameState, areaId: string): Area {
  const area = state.areas.find((item) => item.id === areaId);
  if (!area) {
    throw new Error(`Área não encontrada: ${areaId}`);
  }
  return area;
}

export function getMonkey(state: GameState, monkeyId: string): Monkey {
  const monkey = state.monkeys.find((item) => item.id === monkeyId);
  if (!monkey) {
    throw new Error(`Macaco não encontrado: ${monkeyId}`);
  }
  return monkey;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pushLog(state: GameState, line: string): void {
  state.logs = [line, ...state.logs].slice(0, 28);
}

export function relationBetween(state: GameState, a: string, b: string): number {
  return getFaction(state, a).relations[b] ?? 0;
}

export function changeRelation(
  state: GameState,
  a: string,
  b: string,
  delta: number,
): void {
  const factionA = getFaction(state, a);
  const factionB = getFaction(state, b);
  factionA.relations[b] = clamp((factionA.relations[b] ?? 0) + delta, -100, 100);
  factionB.relations[a] = clamp((factionB.relations[a] ?? 0) + delta, -100, 100);
  const relation = state.factionRelations?.find((item) => {
    const ids = [item.factionAId, item.factionBId].sort().join("__");
    return ids === [a, b].sort().join("__");
  });
  if (!relation) {
    return;
  }
  relation.score = clamp(relation.score + delta, -100, 100);
  if (relation.status === "TRUCE" || relation.status === "TEMPORARY_ALLIANCE") {
    return;
  }
  if (relation.score <= -70) {
    relation.status = "WAR";
  } else if (relation.score <= -35) {
    relation.status = "HOSTILE";
  } else if (relation.score <= -10) {
    relation.status = "TENSE";
  } else if (relation.score <= 20) {
    relation.status = "NEUTRAL";
  } else {
    relation.status = "FRIENDLY";
  }
}

export function updateMonkeyStatus(monkey: Monkey): MonkeyStatus {
  if (monkey.hp <= 0) {
    monkey.hp = 0;
    monkey.status = "morto";
    return monkey.status;
  }
  if (monkey.hp <= 1) {
    monkey.status = "inconsciente";
    return monkey.status;
  }
  if (monkey.energy <= 8) {
    monkey.status = "exausto";
    return monkey.status;
  }
  if (monkey.hunger >= 75) {
    monkey.status = "faminto";
    return monkey.status;
  }
  if (monkey.hp < monkey.maxHp * 0.45) {
    monkey.status = "ferido";
    return monkey.status;
  }
  monkey.status = "normal";
  return monkey.status;
}

export function syncAreaMonkeyVisibility(state: GameState): void {
  state.areas.forEach((area) => {
    area.visibleMonkeyIds = [];
    area.hiddenMonkeyIds = [];
  });

  livingMonkeys(state.monkeys).forEach((monkey) => {
    const area = state.areas.find((item) => item.id === monkey.locationId);
    if (!area) {
      return;
    }

    const isPlayer = monkey.factionId === PLAYER_FACTION_ID;
    const ownerMatches = area.ownerFactionId === monkey.factionId;
    const visibleEnemy =
      area.knownByPlayer && (!ownerMatches || area.dangerLevel < 6 || monkey.stealth < 5);

    if (isPlayer || visibleEnemy) {
      area.visibleMonkeyIds.push(monkey.id);
    } else {
      area.hiddenMonkeyIds.push(monkey.id);
    }
  });
}

export function countTerritories(state: GameState, factionId: string): number {
  return state.areas.filter((area) => area.ownerFactionId === factionId).length;
}

export function foodTotal(faction: Faction): number {
  return (
    faction.food.bananas +
    faction.food.rareFruits * 2 +
    faction.food.roots * 0.75 +
    faction.food.cleanWater * 0.25
  );
}

export function combatPower(monkeys: Monkey[]): number {
  return monkeys.reduce((sum, monkey) => {
    if (monkey.status === "morto") {
      return sum;
    }
    const healthFactor = monkey.hp / monkey.maxHp;
    return (
      sum +
      monkey.attack * 1.4 +
      monkey.defense +
      monkey.energy / 18 +
      monkey.morale / 22 +
      healthFactor * 4
    );
  }, 0);
}
