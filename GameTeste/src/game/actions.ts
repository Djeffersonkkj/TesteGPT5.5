import { ACTION_ROLE_HINT } from "./constants";
import { canActInArea, getPlayerMainAreaId, normalizeAreaId } from "./map";
import type { AreaId, GameState, GroupActionType, Role } from "./types";
import { cloneState, getMonkey, livingFactionMonkeys, pushLog, uid } from "./utils";

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
  count = 4,
): string[] {
  const originAreaId = getPlayerMainAreaId(state);
  const candidates = livingFactionMonkeys(state, state.playerFactionId).filter(
    (monkey) =>
      normalizeAreaId(monkey.locationId) === originAreaId &&
      monkey.energy > 12 &&
      monkey.status !== "inconsciente" &&
      monkey.status !== "morto" &&
      monkey.plannedAction?.kind !== "group",
  );

  const score = (monkey: (typeof candidates)[number]): number => {
    const stable = monkey.energy / 18 + monkey.morale / 24;
    if (actionType === "collect") {
      return monkey.intelligence * 1.4 + monkey.energy / 14 + monkey.stealth * 0.4;
    }
    if (actionType === "explore") {
      return monkey.stealth * 1.8 + monkey.intelligence + stable;
    }
    if (actionType === "attack") {
      return monkey.attack * 1.6 + monkey.defense * 1.2 + monkey.hp + stable;
    }
    if (actionType === "negotiate" || actionType === "recruit") {
      return monkey.charisma * 1.8 + monkey.morale / 12 + monkey.intelligence * 0.5;
    }
    if (actionType === "steal") {
      return monkey.stealth * 2 + monkey.intelligence + monkey.energy / 18;
    }
    if (actionType === "patrol") {
      return monkey.defense + monkey.intelligence + monkey.stealth * 0.6 + stable;
    }
    return monkey.intelligence * 2 + monkey.energy / 18;
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
  const originAreaId = getPlayerMainAreaId(next);
  const targetAreaId = normalizeAreaId(areaId);

  if (!canActInArea(originAreaId, targetAreaId)) {
    pushLog(next, "Os macacos só podem se mover para uma área adjacente.");
    return next;
  }

  const ids = [...new Set(monkeyIds)].filter((id) => {
    const monkey = next.monkeys.find((item) => item.id === id);
    return monkey && canReceiveOrder(monkey.status) && normalizeAreaId(monkey.locationId) === originAreaId;
  });

  if (ids.length === 0) {
    pushLog(next, "Nenhuma ação em grupo foi criada: escolha macacos disponíveis na área de partida.");
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
      areaId,
    };
  });

  pushLog(next, `Ação em grupo planejada com ${ids.length} macaco(s).`);
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
