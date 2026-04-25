import type { GameState } from "./types";

const SAVE_KEY = "ilha-dos-macacos-save-v1";

export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as GameState;
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
