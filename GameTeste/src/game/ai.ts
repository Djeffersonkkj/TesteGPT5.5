import {
  ENEMY_NAMES,
  GOLD_FACTION_ID,
  isActiveRivalFactionId,
  isOfficialFactionId,
  STONE_FACTION_ID,
  TOOLS,
} from "./constants";
import { getDefaultSkillsForSpecies, getInitialStatsForSpecies } from "./skills";
import type {
  Area,
  AreaId,
  DailyReport,
  Faction,
  GameState,
  GroupActionType,
  Monkey,
  PlannedAction,
  Role,
  Species,
  ToolName,
} from "./types";
import {
  average,
  changeRelation,
  clamp,
  combatPower,
  countTerritories,
  foodTotal,
  getArea,
  getFaction,
  livingFactionMonkeys,
  pushLog,
  roll,
  sample,
  uid,
  updateMonkeyStatus,
} from "./utils";

type AreaScore = {
  area: Area;
  distance: number;
  score: number;
  defenderPower: number;
};

type FactionContext = {
  faction: Faction;
  monkeys: Monkey[];
  mainAreaId: AreaId;
  dailyConsumption: number;
  foodDays: number;
  bananaDays: number;
  morale: number;
  ownPower: number;
  isStone: boolean;
  isGold: boolean;
};

function planId(actionType: GroupActionType, areaId: AreaId): string {
  return `ai-${actionType}-${areaId}-${Math.random().toString(36).slice(2, 7)}`;
}

function groupPlan(actionType: GroupActionType, areaId: AreaId): PlannedAction {
  return {
    kind: "group",
    groupActionId: planId(actionType, areaId),
    actionType,
    areaId,
  };
}

function rolePlan(role: Role): PlannedAction {
  return { kind: "role", role };
}

function getFactionMainAreaId(state: GameState, factionId: string): AreaId {
  const counts = new Map<AreaId, number>();
  livingFactionMonkeys(state, factionId).forEach((monkey) => {
    counts.set(monkey.locationId, (counts.get(monkey.locationId) ?? 0) + 1);
  });

  let bestAreaId = state.areas.find((area) => area.ownerFactionId === factionId)?.id ?? state.areas[0].id;
  let bestCount = 0;
  counts.forEach((count, areaId) => {
    if (count > bestCount) {
      bestCount = count;
      bestAreaId = areaId;
    }
  });
  return bestAreaId;
}

function distanceBetweenAreas(state: GameState, from: AreaId, to: AreaId): number {
  if (from === to) {
    return 0;
  }

  const visited = new Set<AreaId>([from]);
  const queue: Array<{ areaId: AreaId; distance: number }> = [{ areaId: from, distance: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const area = getArea(state, current.areaId);
    for (const next of area.adjacentAreaIds) {
      if (visited.has(next)) {
        continue;
      }
      if (next === to) {
        return current.distance + 1;
      }
      visited.add(next);
      queue.push({ areaId: next, distance: current.distance + 1 });
    }
  }

  return 6;
}

function buildFactionContext(state: GameState, factionId: string): FactionContext | null {
  const faction = state.factions.find((item) => item.id === factionId && item.alive);
  if (!faction || faction.isPlayer || !isActiveRivalFactionId(faction.id)) {
    return null;
  }

  const monkeys = livingFactionMonkeys(state, faction.id);
  if (monkeys.length === 0) {
    return null;
  }

  const dailyConsumption = monkeys.reduce((sum, monkey) => sum + monkey.foodConsumption, 0);
  const safeConsumption = Math.max(1, dailyConsumption);
  const morale = average(monkeys.map((monkey) => monkey.morale)) || faction.morale;

  return {
    faction,
    monkeys,
    mainAreaId: getFactionMainAreaId(state, faction.id),
    dailyConsumption,
    foodDays: foodTotal(faction) / safeConsumption,
    bananaDays: faction.food.bananas / safeConsumption,
    morale,
    ownPower: combatPower(monkeys),
    isStone: faction.id === STONE_FACTION_ID || faction.aiPersonality === "stone",
    isGold: faction.id === GOLD_FACTION_ID || faction.aiPersonality === "gold",
  };
}

function defendersForArea(state: GameState, area: Area, factionId: string): Monkey[] {
  if (area.ownerFactionId && !isOfficialFactionId(area.ownerFactionId)) {
    return [];
  }

  const present = livingFactionMonkeys(state, area.ownerFactionId ?? "").filter(
    (monkey) => monkey.locationId === area.id,
  );
  if (present.length > 0) {
    return present;
  }

  if (!area.ownerFactionId || area.ownerFactionId === factionId) {
    return [];
  }

  return livingFactionMonkeys(state, area.ownerFactionId).slice(0, 3);
}

function scoreAreaForFaction(state: GameState, ctx: FactionContext, area: Area): AreaScore {
  const distance = distanceBetweenAreas(state, ctx.mainAreaId, area.id);
  const defenders = defendersForArea(state, area, ctx.faction.id);
  const defenderPower = defenders.length > 0 ? combatPower(defenders) : 0;
  const ownedBySelf = area.ownerFactionId === ctx.faction.id;
  const enemyOwned = area.ownerFactionId !== null && isOfficialFactionId(area.ownerFactionId) && !ownedBySelf;
  const neutral = area.ownerFactionId === null || !isOfficialFactionId(area.ownerFactionId);

  const bananaProductionValue = area.currentBananaProduction * (ctx.isStone ? 1.45 : 1.2) + area.currentFood * 0.6;
  const strategicValue =
    area.combatModifier * 2.5 +
    area.adjacentAreaIds.length +
    (area.isStartingBase ? 5 : 0) +
    (neutral ? ctx.faction.aiPersonality === "gold" ? 8 : 4 : 0);
  const enemyWeaknessValue = enemyOwned
    ? clamp((ctx.ownPower - defenderPower) / 3, -12, 18)
    : neutral
      ? 7
      : 0;
  const dangerValue = area.dangerLevel * (ctx.isGold ? 2.2 : 1.45) + defenderPower * (enemyOwned ? 0.28 : 0.08);
  const distancePenalty = distance * 8 + (distance > 1 ? 5 : 0);
  const ownershipPenalty = ownedBySelf ? -6 : 0;

  return {
    area,
    distance,
    score: bananaProductionValue + strategicValue + enemyWeaknessValue - dangerValue - distancePenalty + ownershipPenalty,
    defenderPower,
  };
}

function rankedAreas(state: GameState, ctx: FactionContext, predicate: (area: Area) => boolean): AreaScore[] {
  return state.areas
    .filter(predicate)
    .map((area) => scoreAreaForFaction(state, ctx, area))
    .sort((a, b) => b.score - a.score);
}

function richestOwnedOrAdjacentArea(state: GameState, ctx: FactionContext): Area {
  const current = getArea(state, ctx.mainAreaId);
  const allowed = new Set<AreaId>([current.id, ...current.adjacentAreaIds]);
  return (
    [...state.areas]
      .filter((area) => area.ownerFactionId === ctx.faction.id || allowed.has(area.id))
      .sort((a, b) => b.currentBananaProduction + b.currentFood - (a.currentBananaProduction + a.currentFood))[0] ??
    current
  );
}

function bestFoodTarget(state: GameState, ctx: FactionContext): AreaScore | null {
  return (
    rankedAreas(
      state,
      ctx,
      (area) => area.ownerFactionId !== ctx.faction.id && distanceBetweenAreas(state, ctx.mainAreaId, area.id) <= 2,
    )[0] ?? null
  );
}

function bestNeutralFoodArea(state: GameState, ctx: FactionContext): AreaScore | null {
  return rankedAreas(
    state,
    ctx,
    (area) => area.ownerFactionId === null && distanceBetweenAreas(state, ctx.mainAreaId, area.id) <= 2,
  )[0] ?? null;
}

function bestOwnedImportantArea(state: GameState, ctx: FactionContext): Area | null {
  return (
    [...state.areas]
      .filter((area) => area.ownerFactionId === ctx.faction.id)
      .sort((a, b) => b.currentBananaProduction + b.combatModifier * 4 - (a.currentBananaProduction + a.combatModifier * 4))[0] ??
    null
  );
}

function weakestEnemyNearFood(state: GameState, ctx: FactionContext): AreaScore | null {
  return (
    rankedAreas(state, ctx, (area) => {
      if (!area.ownerFactionId || area.ownerFactionId === ctx.faction.id || !isOfficialFactionId(area.ownerFactionId)) {
        return false;
      }
      return area.currentBananaProduction >= 18 && distanceBetweenAreas(state, ctx.mainAreaId, area.id) <= 2;
    }).find((score) => ctx.ownPower > score.defenderPower * 0.8) ?? null
  );
}

function hasStealthOperators(ctx: FactionContext): boolean {
  const stealthSpecialists = ctx.monkeys.filter(
    (monkey) => monkey.species === "Gibão" || monkey.species === "Macaco-prego" || monkey.stealth >= 7,
  );
  const averageStealth = average(ctx.monkeys.map((monkey) => monkey.stealth));
  return stealthSpecialists.length > 0 || averageStealth >= 5.5 || ctx.faction.stealthBias >= 6;
}

function shouldUseStealthRaid(
  ctx: FactionContext,
  target: AreaScore | null,
  desperate: boolean,
): boolean {
  if (!target?.area.ownerFactionId || target.area.ownerFactionId === ctx.faction.id) {
    return false;
  }
  if (!isOfficialFactionId(target.area.ownerFactionId)) {
    return false;
  }

  const outmatched = target.defenderPower > ctx.ownPower * 0.75;
  return hasStealthOperators(ctx) || desperate || outmatched;
}

export function decideFactionDailyPlans(gameState: GameState, factionId: string): PlannedAction[] {
  const ctx = buildFactionContext(gameState, factionId);
  if (!ctx) {
    return [];
  }

  const plans: PlannedAction[] = [];
  const foodTarget = bestFoodTarget(gameState, ctx);
  const neutralFoodArea = bestNeutralFoodArea(gameState, ctx);
  const ownedFoodArea = richestOwnedOrAdjacentArea(gameState, ctx);
  const guardedArea = bestOwnedImportantArea(gameState, ctx);
  const moraleLow = ctx.morale < 35 || ctx.faction.morale < 35;
  const criticalFood = ctx.foodDays < 1 || ctx.bananaDays < 1;
  const lowFood = ctx.foodDays < 3 || ctx.bananaDays < 2;
  const enemyWeakArea = weakestEnemyNearFood(gameState, ctx);
  const desperate = criticalFood || moraleLow || ctx.monkeys.length <= 4;

  if (moraleLow) {
    plans.push(rolePlan("Descansando"));
    if (guardedArea) {
      plans.push(groupPlan("patrol", guardedArea.id));
    }
    if (!criticalFood || ctx.isGold) {
      return plans.slice(0, 2);
    }
  }

  if (ctx.isStone) {
    if (criticalFood && foodTarget) {
      const actionType =
        shouldUseStealthRaid(ctx, foodTarget, true) && foodTarget.defenderPower > ctx.ownPower * 0.75 ? "steal" : "attack";
      plans.push(groupPlan(actionType, foodTarget.area.id));
      if (guardedArea && ctx.monkeys.length >= 7) {
        plans.push(groupPlan("patrol", guardedArea.id));
      }
      return plans.slice(0, 2);
    }

    if (lowFood) {
      if (foodTarget && foodTarget.score > 8) {
        const actionType =
          foodTarget.area.ownerFactionId && shouldUseStealthRaid(ctx, foodTarget, desperate)
            ? "steal"
            : foodTarget.area.ownerFactionId
              ? "attack"
              : "collect";
        plans.push(groupPlan(actionType, foodTarget.area.id));
      } else {
        plans.push(groupPlan("collect", ownedFoodArea.id));
      }
      if (neutralFoodArea && roll(0.45)) {
        plans.push(groupPlan("attack", neutralFoodArea.area.id));
      }
      return plans.slice(0, 2);
    }

    if (enemyWeakArea && roll(0.55)) {
      plans.push(groupPlan("attack", enemyWeakArea.area.id));
    } else if (guardedArea && roll(0.45)) {
      plans.push(groupPlan("patrol", guardedArea.id));
    } else {
      plans.push(groupPlan("collect", ownedFoodArea.id));
    }
    return plans.slice(0, 2);
  }

  if (ctx.isGold) {
    if (criticalFood) {
      plans.push(groupPlan("collect", ownedFoodArea.id));
      if (shouldUseStealthRaid(ctx, foodTarget, true)) {
        plans.push(groupPlan("steal", foodTarget!.area.id));
      } else if (roll(0.55)) {
        plans.push(groupPlan("negotiate", ownedFoodArea.id));
      } else if (neutralFoodArea) {
        plans.push(groupPlan("explore", neutralFoodArea.area.id));
      }
      return plans.slice(0, 2);
    }

    if (lowFood) {
      plans.push(groupPlan("collect", ownedFoodArea.id));
      if (shouldUseStealthRaid(ctx, foodTarget, desperate) && roll(0.55)) {
        plans.push(groupPlan("steal", foodTarget!.area.id));
      } else if (neutralFoodArea) {
        plans.push(groupPlan("explore", neutralFoodArea.area.id));
      } else if (roll(0.45)) {
        plans.push(groupPlan("recruit", ownedFoodArea.id));
      }
      return plans.slice(0, 2);
    }

    if (enemyWeakArea && enemyWeakArea.score > 28 && roll(0.35)) {
      plans.push(groupPlan("attack", enemyWeakArea.area.id));
    } else if (roll(0.45)) {
      plans.push(groupPlan("negotiate", ownedFoodArea.id));
    } else if (roll(0.55)) {
      plans.push(groupPlan("craft", ownedFoodArea.id));
    } else {
      const exploreTarget = neutralFoodArea?.area ?? bestFoodTarget(gameState, ctx)?.area ?? ownedFoodArea;
      plans.push(groupPlan("explore", exploreTarget.id));
    }

    if (countTerritories(gameState, ctx.faction.id) < 3 && neutralFoodArea && roll(0.4)) {
      plans.push(groupPlan("explore", neutralFoodArea.area.id));
    }
    return plans.slice(0, 2);
  }

  return [groupPlan("collect", ownedFoodArea.id)];
}

function reportLevelForAction(state: GameState, area: Area): "confirmado" | "rumor" | "suspeita" {
  const nearby = new Set<AreaId>([area.id, ...area.adjacentAreaIds]);
  const observers = livingFactionMonkeys(state, state.playerFactionId);
  const hasPresentObserver = observers.some((monkey) => monkey.locationId === area.id);
  const hasGuardOrScout = observers.some((monkey) => {
    const role = monkey.role ?? monkey.persistentRole;
    return nearby.has(monkey.locationId) && (role === "Guarda" || role === "Explorador");
  });

  if (hasPresentObserver || hasGuardOrScout) {
    return "confirmado";
  }
  if (area.knownByPlayer || roll(0.45)) {
    return "rumor";
  }
  return "suspeita";
}

function addFactionReport(
  state: GameState,
  report: DailyReport,
  area: Area,
  confirmed: string,
  rumor: string,
  suspicion: string,
): void {
  const level = reportLevelForAction(state, area);
  if (level === "confirmado") {
    report.confirmed.push(confirmed);
  } else if (level === "rumor") {
    report.rumors.push(rumor);
  } else {
    report.suspicions.push(suspicion);
  }
}

function spendEnergy(monkeys: Monkey[], amount: number): void {
  monkeys.forEach((monkey) => {
    monkey.energy = clamp(monkey.energy - amount, 0, monkey.maxEnergy);
    monkey.hunger = clamp(monkey.hunger + amount / 5, 0, 100);
    updateMonkeyStatus(monkey);
  });
}

function actionRole(actionType: GroupActionType): Role {
  if (actionType === "attack") {
    return "Guerreiro";
  }
  if (actionType === "patrol") {
    return "Guarda";
  }
  if (actionType === "negotiate" || actionType === "recruit") {
    return "Diplomata";
  }
  if (actionType === "craft") {
    return "Artesão";
  }
  if (actionType === "explore" || actionType === "steal") {
    return "Explorador";
  }
  return "Coletor";
}

function speciesPriorityForAction(faction: Faction, actionType: GroupActionType, monkey: Monkey): number {
  if (actionType === "attack") {
    if (faction.id === STONE_FACTION_ID) {
      return monkey.species === "Gorila" ? 30 : monkey.species === "Mandril" ? 26 : monkey.attack * 2 + monkey.defense;
    }
    return monkey.species === "Chimpanzé" ? 18 : monkey.attack * 2 + monkey.defense;
  }
  if (actionType === "negotiate" || actionType === "recruit") {
    return (monkey.species === "Chimpanzé" ? 20 : 0) + monkey.charisma * 3 + monkey.morale / 10;
  }
  if (actionType === "craft" || actionType === "collect") {
    return (monkey.species === "Macaco-prego" ? 20 : 0) + monkey.intelligence * 3 + monkey.energy / 15;
  }
  if (actionType === "explore" || actionType === "steal") {
    return (
      (monkey.species === "Gibão" ? 22 : 0) +
      (monkey.species === "Macaco-prego" ? 18 : 0) +
      (monkey.stealth >= 7 ? 10 : 0) +
      monkey.stealth * 3 +
      monkey.intelligence
    );
  }
  if (actionType === "patrol") {
    return monkey.defense * 3 + monkey.attack + (monkey.species === "Gorila" || monkey.species === "Mandril" ? 8 : 0);
  }
  return monkey.energy;
}

function chooseMonkeysForAction(
  state: GameState,
  faction: Faction,
  actionType: GroupActionType,
  reservedIds: Set<string>,
): Monkey[] {
  const desired =
    actionType === "attack"
      ? faction.id === STONE_FACTION_ID
        ? 5
        : 4
      : actionType === "patrol"
        ? 2
        : actionType === "negotiate" || actionType === "craft"
          ? 2
          : 3;

  return livingFactionMonkeys(state, faction.id)
    .filter((monkey) => !reservedIds.has(monkey.id) && monkey.energy > 8 && monkey.status !== "inconsciente")
    .sort(
      (a, b) =>
        speciesPriorityForAction(faction, actionType, b) -
        speciesPriorityForAction(faction, actionType, a),
    )
    .slice(0, desired);
}

function assignActionToMembers(members: Monkey[], action: PlannedAction): void {
  members.forEach((monkey) => {
    monkey.plannedAction = action;
    monkey.role = action.kind === "group" ? actionRole(action.actionType) : action.role;
  });
}

function collectForFaction(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const skill = members.reduce((sum, monkey) => sum + monkey.intelligence + monkey.energy / 20, 0);
  const amount = Math.max(1, Math.min(area.currentFood, Math.floor(skill / 2.5 + Math.random() * 3)));
  area.currentFood -= amount;
  faction.food.bananas += amount;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 8 + Math.floor(area.dangerLevel / 2));

  addFactionReport(
    state,
    report,
    area,
    `${faction.name} coletou ${amount} banana(s) em ${area.name}.`,
    `${faction.name} foi visto buscando comida perto de ${area.name}.`,
    `Cachos cortados sugerem colheita rival em ${area.name}.`,
  );
}

function attackArea(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const previousOwner = area.ownerFactionId;
  const defenderFactionId =
    previousOwner && previousOwner !== faction.id && isOfficialFactionId(previousOwner)
      ? previousOwner
      : state.monkeys.find(
          (monkey) =>
            monkey.locationId === area.id &&
            monkey.factionId !== faction.id &&
            isOfficialFactionId(monkey.factionId) &&
            monkey.status !== "morto",
        )?.factionId ?? null;
  const defenders = defenderFactionId
    ? livingFactionMonkeys(state, defenderFactionId).filter((monkey) => monkey.locationId === area.id)
    : [];
  const fallbackDefenders = defenderFactionId && defenders.length === 0
    ? livingFactionMonkeys(state, defenderFactionId).slice(0, 3)
    : defenders;
  const attackPower = combatPower(members) + (faction.id === STONE_FACTION_ID ? 8 : 0);
  const defensePower = fallbackDefenders.length > 0
    ? combatPower(fallbackDefenders)
    : area.dangerLevel * 2 + Math.max(0, area.combatModifier * 2);
  const success = attackPower + Math.random() * 12 > defensePower + Math.random() * 10;

  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  fallbackDefenders.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 13 + area.dangerLevel);

  if (success) {
    area.ownerFactionId = faction.id;
    area.controlledByFactionId = faction.id;
    if (defenderFactionId) {
      changeRelation(state, faction.id, defenderFactionId, -10);
      fallbackDefenders.slice(0, 2).forEach((monkey) => {
        monkey.morale = clamp(monkey.morale - 8, 0, 100);
        if (roll(0.2)) {
          monkey.hp = clamp(monkey.hp - 2, 0, monkey.maxHp);
        }
        updateMonkeyStatus(monkey);
      });
    }

    addFactionReport(
      state,
      report,
      area,
      `${faction.name} tomou posições em ${area.name}.`,
      `${faction.name} parece estar se movendo em direção às fontes de comida.`,
      `Há sinais de disputa por bananas no ${area.name}.`,
    );
    pushLog(state, `Há sinais de disputa por bananas no ${area.name}.`);
    return;
  }

  members.slice(0, 2).forEach((monkey) => {
    monkey.morale = clamp(monkey.morale - 6, 0, 100);
    if (roll(0.3)) {
      monkey.hp = clamp(monkey.hp - 2, 0, monkey.maxHp);
    }
    updateMonkeyStatus(monkey);
  });
  addFactionReport(
    state,
    report,
    area,
    `${faction.name} tentou avançar sobre ${area.name}, mas não consolidou domínio.`,
    `${faction.name} rondou ${area.name} com intenção hostil.`,
    `Marcas de confronto apareceram em ${area.name}.`,
  );
}

function stealFood(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const targetFactionId =
    area.ownerFactionId && area.ownerFactionId !== faction.id && isOfficialFactionId(area.ownerFactionId)
      ? area.ownerFactionId
      : state.playerFactionId;
  const target = getFaction(state, targetFactionId);
  const stealth = members.reduce((sum, monkey) => sum + monkey.stealth + monkey.energy / 20, 0) + faction.stealthBias;
  const guards = livingFactionMonkeys(state, target.id).filter((monkey) => monkey.locationId === area.id);
  const defense = guards.reduce((sum, monkey) => sum + monkey.defense + monkey.intelligence, 0) + area.dangerLevel * 2;
  const stolen = Math.min(target.food.bananas, 2 + Math.floor(Math.random() * 5));

  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 12);

  if (stolen > 0 && stealth + Math.random() * 16 > defense + Math.random() * 10) {
    target.food.bananas -= stolen;
    faction.food.bananas += stolen;
    changeRelation(state, faction.id, target.id, -8);
    addFactionReport(
      state,
      report,
      area,
      `${faction.name} roubou ${stolen} banana(s) perto de ${area.name}.`,
      `${faction.name} foi visto rondando estoques de comida em ${area.name}.`,
      `${stolen} banana(s) sumiram e há rastros rivais perto de ${area.name}.`,
    );
    pushLog(state, `${faction.name} parece estar se movendo em direção às fontes de comida.`);
    return;
  }

  members.forEach((monkey) => {
    monkey.morale = clamp(monkey.morale - 3, 0, 100);
  });
  addFactionReport(
    state,
    report,
    area,
    `${faction.name} tentou roubar comida em ${area.name}, mas foi percebido.`,
    `Vigias ouviram correria perto dos estoques de ${area.name}.`,
    `Rastros confusos sugerem tentativa de roubo em ${area.name}.`,
  );
}

function negotiateForFaction(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const targetId = faction.id === GOLD_FACTION_ID
    ? state.playerFactionId
    : state.factions.find((item) => isActiveRivalFactionId(item.id) && item.id !== faction.id && item.alive)?.id ?? state.playerFactionId;
  const target = getFaction(state, targetId);
  const charisma = members.reduce((sum, monkey) => sum + monkey.charisma + monkey.morale / 20, 0) + faction.diplomacyBias;
  const delta = faction.id === STONE_FACTION_ID ? (charisma > 20 ? 2 : -2) : (charisma > 20 ? 6 : 3);

  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 7);
  changeRelation(state, faction.id, target.id, delta);

  if (faction.id === GOLD_FACTION_ID && faction.food.bananas > 14 && getFaction(state, state.playerFactionId).food.bananas < 8 && roll(0.4)) {
    const gift = Math.min(3, faction.food.bananas);
    faction.food.bananas -= gift;
    getFaction(state, state.playerFactionId).food.bananas += gift;
  }

  addFactionReport(
    state,
    report,
    area,
    `${faction.name} negociou perto de ${area.name}.`,
    `${faction.name} foi visto negociando perto do ${area.name}.`,
    `Mensageiros passaram por ${area.name}, mas a intenção não ficou clara.`,
  );
  if (faction.id === GOLD_FACTION_ID) {
    pushLog(state, `${faction.name} foi visto negociando perto do ${area.name}.`);
  }
}

function recruitForFaction(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const charisma = members.reduce((sum, monkey) => sum + monkey.charisma + monkey.morale / 20, 0) + faction.diplomacyBias;
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 8);

  if (charisma + foodTotal(faction) / 4 + Math.random() * 12 > 25) {
    const species: Species = faction.id === GOLD_FACTION_ID
      ? sample(["Chimpanzé", "Macaco-prego", "Gibão"])
      : sample(["Gorila", "Mandril", "Chimpanzé"]);
    const stats = getInitialStatsForSpecies(species);
    state.monkeys.push({
      id: uid("monkey"),
      name: sample(ENEMY_NAMES),
      species,
      skills: getDefaultSkillsForSpecies(species),
      factionId: faction.id,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      energy: 58 + Math.floor(Math.random() * 22),
      maxEnergy: 100,
      attack: stats.attack,
      defense: stats.defense,
      stealth: stats.stealth,
      intelligence: stats.intelligence,
      charisma: stats.charisma,
      loyalty: 48 + Math.floor(Math.random() * 22),
      morale: 48 + Math.floor(Math.random() * 22),
      hunger: 25,
      foodConsumption: stats.foodConsumption,
      locationId: area.id,
      status: "normal",
      role: null,
      persistentRole: null,
      plannedAction: null,
      inventory: [],
      isLeader: false,
    });
    addFactionReport(
      state,
      report,
      area,
      `${faction.name} recrutou um novo macaco em ${area.name}.`,
      `Peregrinos parecem ter se juntado ao ${faction.name} perto de ${area.name}.`,
      `Pegadas novas apareceram no acampamento do ${faction.name}.`,
    );
    return;
  }

  addFactionReport(
    state,
    report,
    area,
    `${faction.name} tentou recrutar em ${area.name}, sem adesão clara.`,
    `${faction.name} conversou com peregrinos perto de ${area.name}.`,
    `Houve movimentação incomum de peregrinos em ${area.name}.`,
  );
}

function craftForFaction(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  const skill = members.reduce((sum, monkey) => sum + monkey.intelligence + monkey.energy / 25, 0);
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 8);

  if (skill + Math.random() * 10 > 16) {
    const tool: ToolName = sample(TOOLS);
    faction.inventory[tool] = (faction.inventory[tool] ?? 0) + 1;
    sample(members).inventory.push(tool);
    addFactionReport(
      state,
      report,
      area,
      `${faction.name} criou ${tool} em ${area.name}.`,
      `O ${faction.name} trabalhou em ferramentas perto de ${area.name}.`,
      `Foram achados restos de cipó e pedra lascada em ${area.name}.`,
    );
  }
}

function exploreOrExpand(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  members.forEach((monkey) => {
    monkey.locationId = area.id;
  });
  spendEnergy(members, 9 + Math.floor(area.dangerLevel / 2));

  if (area.ownerFactionId === null && (faction.id === GOLD_FACTION_ID || roll(0.45))) {
    area.ownerFactionId = faction.id;
    area.controlledByFactionId = faction.id;
    addFactionReport(
      state,
      report,
      area,
      `${faction.name} ocupou ${area.name} sem batalha aberta.`,
      `${faction.name} parece estar expandindo para ${area.name}.`,
      `Novas marcas de controle apareceram em ${area.name}.`,
    );
    return;
  }

  addFactionReport(
    state,
    report,
    area,
    `${faction.name} explorou ${area.name}.`,
    `Batedores do ${faction.name} foram vistos perto de ${area.name}.`,
    `Rastros leves sugerem exploração rival em ${area.name}.`,
  );
}

function patrolForFaction(
  state: GameState,
  faction: Faction,
  area: Area,
  members: Monkey[],
  report: DailyReport,
): void {
  members.forEach((monkey) => {
    monkey.locationId = area.id;
    monkey.morale = clamp(monkey.morale + 2, 0, 100);
  });
  spendEnergy(members, 5);
  addFactionReport(
    state,
    report,
    area,
    `${faction.name} deixou guardas em ${area.name}.`,
    `${faction.name} reforçou a guarda perto de ${area.name}.`,
    `Patrulhas rivais parecem mais frequentes em ${area.name}.`,
  );
}

function restFaction(faction: Faction, members: Monkey[], report: DailyReport): void {
  members.slice(0, Math.max(2, Math.ceil(members.length / 3))).forEach((monkey) => {
    monkey.role = "Descansando";
    monkey.plannedAction = { kind: "role", role: "Descansando" };
    monkey.energy = clamp(monkey.energy + 14, 0, monkey.maxEnergy);
    monkey.morale = clamp(monkey.morale + 3, 0, 100);
    updateMonkeyStatus(monkey);
  });
  report.rumors.push(`${faction.name} parece ter reduzido o ritmo para recuperar moral.`);
}

function executeFactionAction(
  state: GameState,
  faction: Faction,
  action: PlannedAction,
  report: DailyReport,
  reservedIds: Set<string>,
): void {
  if (action.kind === "role") {
    restFaction(faction, livingFactionMonkeys(state, faction.id).filter((monkey) => !reservedIds.has(monkey.id)), report);
    return;
  }

  const area = getArea(state, action.areaId);
  const members = chooseMonkeysForAction(state, faction, action.actionType, reservedIds);
  if (members.length === 0) {
    return;
  }

  members.forEach((monkey) => reservedIds.add(monkey.id));
  assignActionToMembers(members, action);

  if (action.actionType === "collect") {
    collectForFaction(state, faction, area, members, report);
  } else if (action.actionType === "attack") {
    attackArea(state, faction, area, members, report);
  } else if (action.actionType === "steal") {
    stealFood(state, faction, area, members, report);
  } else if (action.actionType === "negotiate") {
    negotiateForFaction(state, faction, area, members, report);
  } else if (action.actionType === "recruit") {
    recruitForFaction(state, faction, area, members, report);
  } else if (action.actionType === "craft") {
    craftForFaction(state, faction, area, members, report);
  } else if (action.actionType === "explore") {
    exploreOrExpand(state, faction, area, members, report);
  } else if (action.actionType === "patrol") {
    patrolForFaction(state, faction, area, members, report);
  }
}

export function resolveEnemyAI(state: GameState, report: DailyReport): void {
  state.factions
    .filter((faction) => isActiveRivalFactionId(faction.id) && faction.alive)
    .forEach((faction) => {
      const plans = decideFactionDailyPlans(state, faction.id);
      const reservedIds = new Set<string>();
      plans.forEach((plan) => {
        executeFactionAction(state, faction, plan, report, reservedIds);
      });
    });
}
