import { useMemo, useState } from "react";
import AreaPanel from "./components/AreaPanel";
import CombatModal from "./components/CombatModal";
import DailyReportScreen from "./components/DailyReportScreen";
import FactionPanel from "./components/FactionPanel";
import GameOverScreen from "./components/GameOverScreen";
import GroupActionPanel from "./components/GroupActionPanel";
import HexMap from "./components/HexMap";
import InventoryPanel from "./components/InventoryPanel";
import LogPanel from "./components/LogPanel";
import MonkeyRoster from "./components/MonkeyRoster";
import MoveToAreaPanel from "./components/MoveToAreaPanel";
import StartScreen from "./components/StartScreen";
import { clearMonkeyOrder, selectArea, setPersistentRole } from "./game/actions";
import { acknowledgeReport, chooseCombatTactic, describeUnassignedMonkeys, endDay } from "./game/gameEngine";
import { createInitialState } from "./game/initialState";
import { clearSavedGame, hasSavedGame, loadGame, saveGame } from "./game/save";
import type { GameState, Role, Species } from "./game/types";

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const canContinue = useMemo(() => hasSavedGame(), [state]);

  const startGame = (leaderName: string, leaderSpecies: Species, factionName: string) => {
    const newState = createInitialState({ leaderName, leaderSpecies, factionName });
    setState(newState);
    saveGame(newState);
  };

  const continueGame = () => {
    const saved = loadGame();
    if (saved) {
      setState(saved);
    }
  };

  const persist = (next: GameState) => {
    setState(next);
    saveGame(next);
  };

  if (!state) {
    return (
      <StartScreen
        canContinue={canContinue}
        onContinue={continueGame}
        onStart={startGame}
      />
    );
  }

  if (state.phase === "report") {
    return (
      <DailyReportScreen
        currentDay={state.day}
        report={state.report}
        onContinue={() => persist(acknowledgeReport(state))}
      />
    );
  }

  if (state.phase === "gameOver" && state.gameOver) {
    return (
      <GameOverScreen
        info={state.gameOver}
        onRestart={() => {
          clearSavedGame();
          setState(null);
        }}
      />
    );
  }

  const selectedArea = state.areas.find((area) => area.id === state.selectedAreaId) ?? state.areas[0];

  const handleEndDay = () => {
    const unassigned = describeUnassignedMonkeys(state);
    if (unassigned.length > 0) {
      const ok = window.confirm(
        `${unassigned.length} macaco(s) estão sem ordem: ${unassigned.slice(0, 6).join(", ")}. Encerrar o dia mesmo assim?`,
      );
      if (!ok) {
        return;
      }
    }
    persist(endDay(state));
  };

  const handleSave = () => {
    saveGame(state);
    setSaveNotice("Jogo salvo.");
    window.setTimeout(() => setSaveNotice(""), 1800);
  };

  const handleRestart = () => {
    const ok = window.confirm("Reiniciar a campanha e apagar o jogo salvo?");
    if (ok) {
      clearSavedGame();
      setState(null);
    }
  };

  const handlePersistentRole = (monkeyId: string, role: Role | null) => {
    persist(setPersistentRole(state, monkeyId, role));
  };

  const handleClearOrder = (monkeyId: string) => {
    persist(clearMonkeyOrder(state, monkeyId));
  };

  return (
    <main className="game-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ilha dos Macacos</p>
          <h1>Dia {state.day}</h1>
        </div>
        <div className="topbar-actions">
          {saveNotice && <span className="save-notice">{saveNotice}</span>}
          <button className="ghost-button" onClick={handleSave}>
            Salvar
          </button>
          <button className="ghost-button danger" onClick={handleRestart}>
            Reiniciar
          </button>
          <button className="primary-button" onClick={handleEndDay}>
            Encerrar Dia
          </button>
        </div>
      </header>

      <section className="main-layout">
        <div className="map-column">
          <HexMap
            selectedAreaId={state.selectedAreaId}
            state={state}
            onSelect={(areaId) => persist(selectArea(state, areaId))}
          />
          <LogPanel logs={state.logs} />
        </div>

        <aside className="side-column">
          <AreaPanel area={selectedArea} state={state} />
          <FactionPanel state={state} />
          <InventoryPanel state={state} />
        </aside>

        <section className="control-column">
          <MoveToAreaPanel state={state} onChange={persist} />
          <GroupActionPanel state={state} onChange={persist} />
          <MonkeyRoster
            state={state}
            onChange={persist}
            onClearOrder={handleClearOrder}
            onSetPersistentRole={handlePersistentRole}
          />
        </section>
      </section>

      {state.phase === "combat" && state.pendingCombat && (
        <CombatModal
          state={state}
          onChoose={(tactic) => persist(chooseCombatTactic(state, tactic))}
        />
      )}
    </main>
  );
}
