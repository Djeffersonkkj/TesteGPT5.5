import { createMapAreas, normalizeAreaId } from "./map";
import type { Area, AreaId, GameState } from "./types";
import { syncAreaMonkeyVisibility } from "./utils";

const SAVE_KEY = "ilha-dos-macacos-save-v1";
const STONE_FACTION_ID = "stone";

type SavedArea = Partial<Area> & { id?: string };

function hasOwn<T extends object>(target: T | undefined, key: keyof T): boolean {
  return Boolean(target && Object.prototype.hasOwnProperty.call(target, key));
}

function normalizeSavedAreaRef(
  areaId: string | undefined,
  legacyMap: boolean,
  belongsToPlayer = false,
): AreaId {
  const normalized = normalizeAreaId(areaId);
  if (legacyMap && belongsToPlayer && normalized === "aldeia-cipo") {
    return "vale";
  }
  return normalized;
}

function normalizeSavedGame(state: GameState): GameState {
  const savedAreas = Array.isArray(state.areas) ? (state.areas as SavedArea[]) : [];
  const legacyMap = savedAreas.some((area) => !Array.isArray(area.adjacentAreaIds));
  const savedById = new Map<AreaId, SavedArea>(
    savedAreas.map((area) => [normalizeAreaId(area.id), area]),
  );

  state.areas = createMapAreas().map((area) => {
    const saved = savedById.get(area.id);
    const ownerFactionId = (() => {
      if ((area.id === "aldeia-cipo" || area.id === "trovao") && saved?.ownerFactionId === STONE_FACTION_ID) {
        return area.ownerFactionId;
      }
      if (area.id === "montanha" && saved?.ownerFactionId == null) {
        return area.ownerFactionId;
      }
      if (legacyMap && area.isStartingBase) {
        return area.ownerFactionId;
      }
      if (hasOwn(saved, "ownerFactionId")) {
        return saved?.ownerFactionId ?? null;
      }
      return area.ownerFactionId;
    })();
    const currentFood =
      typeof saved?.currentFood === "number"
        ? Math.max(0, Math.min(saved.currentFood, area.maxFood))
        : area.currentFood;

    return {
      ...area,
      currentFood,
      ownerFactionId,
      knownByPlayer: typeof saved?.knownByPlayer === "boolean" ? saved.knownByPlayer : area.knownByPlayer,
      visibleMonkeyIds: [],
      hiddenMonkeyIds: [],
    };
  });

  state.selectedAreaId = normalizeSavedAreaRef(String(state.selectedAreaId), legacyMap, true);
  state.monkeys = (state.monkeys ?? []).map((monkey) => {
    const savedLocationId = normalizeSavedAreaRef(
      String(monkey.locationId),
      legacyMap,
      monkey.factionId === state.playerFactionId,
    );
    const locationId =
      monkey.factionId === STONE_FACTION_ID &&
      (savedLocationId === "aldeia-cipo" || savedLocationId === "trovao")
        ? "montanha"
        : savedLocationId;
    const plannedAction =
      monkey.plannedAction?.kind === "group"
        ? {
            ...monkey.plannedAction,
            areaId: normalizeSavedAreaRef(
              String(monkey.plannedAction.areaId),
              legacyMap,
              monkey.factionId === state.playerFactionId,
            ),
          }
        : monkey.plannedAction;

    return {
      ...monkey,
      locationId,
      plannedAction,
    };
  });
  state.groupPlans = (state.groupPlans ?? []).map((plan) => ({
    ...plan,
    areaId: normalizeSavedAreaRef(String(plan.areaId), legacyMap, true),
  }));
  if (state.pendingCombat) {
    state.pendingCombat = {
      ...state.pendingCombat,
      areaId: normalizeAreaId(state.pendingCombat.areaId),
    };
  }

  syncAreaMonkeyVisibility(state);
  return state;
}

export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeSavedGame(JSON.parse(raw) as GameState);
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

export function hasSavedGame(): boolean {
  return Boolean(localStorage.getItem(SAVE_KEY));
}

export function clearSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}
