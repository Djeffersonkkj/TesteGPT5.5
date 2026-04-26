import { ACTION_ROLE_HINT } from "./constants";
import { canMoveToArea, normalizeAreaId } from "./map";
import { getMonkeyEffectiveStats } from "./skills";
import type { AreaId, GameState, GroupActionType, Role } from "./types";
import { cloneState, getArea, getMonkey, livingFactionMonkeys, pushLog, syncAreaMonkeyVisibility, uid } from "./utils";

function canReceiveOrder(status: string): boolean {
  return status !== "morto" && status !== "inconsciente";
}

export function selectArea(state: GameState, areaId: AreaId): GameState {
  const next = cloneState(state);
  next.selectedAreaId = areaId;
  return next;
}

export function assignMonkeyRole(state: GameState, monkeyId: string, role: Role): GameState {
  const next = cloneState(state);
  const monkey = getMonkey(next, monkeyId);
  if (!canReceiveOrder(monkey.status)) {
    pushLog(next, `${monkey.name} não consegue receber ordens agora.`);
    return next;
  }
  monkey.role = role;
  monkey.plannedAction = { kind: "role", role };
  pushLog(next, `${monkey.name} recebeu a função ${role}.`);
  return next;
}

export function assignRoleToMany(state: GameState, monkeyIds: string[], role: Role): GameState {
  const next = cloneState(state);
  monkeyIds.forEach((id) => {
    const monkey = next.monkeys.find((item) => item.id === id);
    if (!monkey || !canReceiveOrder(monkey.status)) {
      return;
    }
    monkey.role = role;
    monkey.plannedAction = { kind: "role", role };
  });
  pushLog(next, `${monkeyIds.length} macaco(s) receberam a função ${role}.`);
  return next;
}

export function setPersistentRole(
  state: GameState,
  monkeyId: string,
  role: Role | null,
): GameState {
  const next = cloneState(state);
  const monkey = getMonkey(next, monkeyId);
  monkey.persistentRole = role;
  if (role && canReceiveOrder(monkey.status)) {
    monkey.role = role;
    monkey.plannedAction = { kind: "role", role };
  }
  pushLog(
    next,
    role
      ? `${monkey.name} manterá ${role} como função permanente.`
      : `${monkey.name} não tem mais função permanente.`,
  );
  return next;
}

export function clearMonkeyOrder(state: GameState, monkeyId: string): GameState {
  const next = cloneState(state);
  const monkey = getMonkey(next, monkeyId);
  monkey.role = null;
  monkey.plannedAction = null;
  pushLog(next, `${monkey.name} ficou sem ordem para hoje.`);
  return next;
}

export function suggestMonkeysForAction(
  state: GameState,
  actionType: GroupActionType,
  areaId: AreaId,
  count = 4,
): string[] {
  const targetAreaId = normalizeAreaId(areaId);
  const candidates = livingFactionMonkeys(state, state.playerFactionId).filter(
    (monkey) =>
      normalizeAreaId(monkey.locationId) === targetAreaId &&
      monkey.energy > 12 &&
      monkey.status !== "inconsciente" &&
      monkey.status !== "morto" &&
      monkey.plannedAction?.kind !== "group",
  );

  const score = (monkey: (typeof candidates)[number]): number => {
    const stable = monkey.energy / 18 + monkey.morale / 24;
    const stats = getMonkeyEffectiveStats(monkey, { action: actionType });
    if (actionType === "collect") {
      return stats.intelligence * 1.4 + monkey.energy / 14 + stats.stealth * 0.4;
    }
    if (actionType === "explore") {
      return stats.stealth * 1.8 + stats.intelligence + stable;
    }
    if (actionType === "attack") {
      return stats.attack * 1.6 + stats.defense * 1.2 + monkey.hp + stable;
    }
    if (actionType === "negotiate" || actionType === "recruit") {
      return stats.charisma * 1.8 + monkey.morale / 12 + stats.intelligence * 0.5;
    }
    if (actionType === "steal") {
      return stats.stealth * 2 + stats.intelligence + monkey.energy / 18;
    }
    if (actionType === "investigate") {
      return stats.intelligence * 1.8 + stats.stealth + monkey.energy / 20;
    }
    if (actionType === "patrol") {
      return stats.defense + stats.intelligence + stats.stealth * 0.6 + stable;
    }
    return stats.intelligence * 2 + monkey.energy / 18;
  };

  return candidates
    .sort((a, b) => score(b) - score(a))
    .slice(0, count)
    .map((monkey) => monkey.id);
}

export function addGroupPlan(
  state: GameState,
  actionType: GroupActionType,
  areaId: AreaId,
  monkeyIds: string[],
): GameState {
  const next = cloneState(state);
  const targetAreaId = normalizeAreaId(areaId);
  const targetArea = getArea(next, targetAreaId);

  const ids = [...new Set(monkeyIds)].filter((id) => {
    const monkey = next.monkeys.find((item) => item.id === id);
    return (
      monkey &&
      monkey.factionId === next.playerFactionId &&
      canReceiveOrder(monkey.status) &&
      normalizeAreaId(monkey.locationId) === targetAreaId &&
      monkey.plannedAction?.kind !== "group"
    );
  });

  if (ids.length === 0) {
    pushLog(next, `Nenhuma acao em grupo foi criada: escolha macacos em ${targetArea.shortName}.`);
    return next;
  }

  const plan = {
    id: uid("group"),
    actionType,
    areaId: targetAreaId,
    monkeyIds: ids,
  };
  next.groupPlans.push(plan);

  ids.forEach((id) => {
    const monkey = getMonkey(next, id);
    const role = ACTION_ROLE_HINT[actionType];
    monkey.role = role;
    monkey.plannedAction = {
      kind: "group",
      groupActionId: plan.id,
      actionType,
      areaId: targetAreaId,
    };
  });

  pushLog(next, `Ação em grupo planejada com ${ids.length} macaco(s).`);
  return next;
}

export function moveMonkeysToArea(
  state: GameState,
  areaId: AreaId,
  monkeyIds: string[],
): GameState {
  const next = cloneState(state);
  const targetAreaId = normalizeAreaId(areaId);
  const targetArea = getArea(next, targetAreaId);
  const movedNames: string[] = [];

  [...new Set(monkeyIds)].forEach((id) => {
    const monkey = next.monkeys.find((item) => item.id === id);
    if (
      !monkey ||
      monkey.factionId !== next.playerFactionId ||
      !canReceiveOrder(monkey.status) ||
      monkey.plannedAction?.kind === "group"
    ) {
      return;
    }

    const currentAreaId = normalizeAreaId(monkey.locationId);
    if (currentAreaId === targetAreaId || !canMoveToArea(currentAreaId, targetAreaId)) {
      return;
    }

    monkey.locationId = targetAreaId;
    movedNames.push(monkey.name);
  });

  if (movedNames.length === 0) {
    pushLog(next, `Nenhum macaco proximo pode se mover para ${targetArea.shortName}.`);
    return next;
  }

  next.selectedAreaId = targetAreaId;
  syncAreaMonkeyVisibility(next);
  pushLog(next, `${movedNames.join(", ")} moveram-se para ${targetArea.shortName}.`);
  return next;
}

export function removeGroupPlan(state: GameState, planId: string): GameState {
  const next = cloneState(state);
  next.groupPlans = next.groupPlans.filter((plan) => plan.id !== planId);
  next.monkeys.forEach((monkey) => {
    if (monkey.plannedAction?.kind === "group" && monkey.plannedAction.groupActionId === planId) {
      monkey.plannedAction = monkey.persistentRole
        ? { kind: "role", role: monkey.persistentRole }
        : null;
      monkey.role = monkey.persistentRole;
    }
  });
  pushLog(next, "Ação em grupo cancelada.");
  return next;
}
