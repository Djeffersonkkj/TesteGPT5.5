import { useMemo, useState } from "react";
import AreaInfoPanel from "./components/AreaInfoPanel";
import CombatModal from "./components/CombatModal";
import DailyReportScreen from "./components/DailyReportScreen";
import FactionPanel from "./components/FactionPanel";
import GameLayout from "./components/GameLayout";
import GameModal from "./components/GameModal";
import GameOverScreen from "./components/GameOverScreen";
import GroupActionPanel from "./components/GroupActionPanel";
import HexMap from "./components/HexMap";
import InventoryPanel from "./components/InventoryPanel";
import LeftActionBar, { type ModalId } from "./components/LeftActionBar";
import LogPanel from "./components/LogPanel";
import MonkeyRoster from "./components/MonkeyRoster";
import MoveToAreaPanel from "./components/MoveToAreaPanel";
import NotificationModal from "./components/NotificationModal";
import NotificationSummary from "./components/NotificationSummary";
import PendingDecisionModal from "./components/PendingDecisionModal";
import StartScreen from "./components/StartScreen";
import TribeStatusBar from "./components/TribeStatusBar";
import { clearMonkeyOrder, selectArea, setPersistentRole } from "./game/actions";
import { acknowledgeReport, applyDecisionOption, chooseCombatAction, confirmCombatSummary, continueCombatRound, describeUnassignedMonkeys, endDay } from "./game/gameEngine";
import { createInitialState } from "./game/initialState";
import { clearSavedGame, hasSavedGame, loadGame, saveGame } from "./game/save";
import type { GameState, Role, Species } from "./game/types";

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [activeModal, setActiveModal] = useState<ModalId | null>(null);
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

  const selectedArea = state.areas.find((area) => area.id === state.selectedAreaId) ?? null;

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

  const renderReport = () => (
    <div className="report-grid modal-report-grid">
      <section className="report-block">
        <h2>Confirmado</h2>
        <ul>{state.report.confirmed.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="report-block">
        <h2>Rumores</h2>
        <ul>{state.report.rumors.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="report-block">
        <h2>Suspeitas</h2>
        <ul>{state.report.suspicions.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="report-block">
        <h2>Fome</h2>
        <ul>{state.report.hungerSummary.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="report-block">
        <h2>Mortes e feridos</h2>
        <ul>{state.report.casualtySummary.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="report-block">
        <h2>Relacoes</h2>
        <ul>{state.report.relationsSummary.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
    </div>
  );

  const renderModalContent = () => {
    if (!activeModal) {
      return null;
    }

    const modalProps = {
      tribe: { title: "Tribo", eyebrow: "macacos e funcoes", wide: true },
      actions: { title: selectedArea?.name ?? "Acoes", eyebrow: "planejamento", wide: true },
      report: { title: state.report.title, eyebrow: `relatorio do dia ${state.report.day}`, wide: true },
      notifications: { title: "Notificacoes", eyebrow: "alertas da tribo", wide: true },
      diplomacy: { title: "Diplomacia", eyebrow: "relacoes entre faccoes", wide: false },
      inventory: { title: "Inventario", eyebrow: "ferramentas e recursos", wide: false },
    }[activeModal];

    return (
      <GameModal
        eyebrow={modalProps.eyebrow}
        title={modalProps.title}
        wide={modalProps.wide}
        onClose={() => setActiveModal(null)}
      >
        {activeModal === "tribe" && (
          <MonkeyRoster
            state={state}
            onChange={persist}
            onClearOrder={handleClearOrder}
            onSetPersistentRole={handlePersistentRole}
          />
        )}
        {activeModal === "actions" && (
          <div className="modal-panel-grid">
            <MoveToAreaPanel state={state} onChange={persist} />
            <GroupActionPanel state={state} onChange={persist} />
          </div>
        )}
        {activeModal === "report" && renderReport()}
        {activeModal === "notifications" && <NotificationModal state={state} />}
        {activeModal === "diplomacy" && <FactionPanel state={state} />}
        {activeModal === "inventory" && <InventoryPanel state={state} />}
      </GameModal>
    );
  };

  return (
    <GameLayout
      topBar={
        <TribeStatusBar
          saveNotice={saveNotice}
          state={state}
          onRestart={handleRestart}
          onSave={handleSave}
        />
      }
      leftBar={<LeftActionBar onEndDay={handleEndDay} onOpen={setActiveModal} />}
      map={
        <>
          <HexMap
            selectedAreaId={state.selectedAreaId}
            state={state}
            onSelect={(areaId) => persist(selectArea(state, areaId))}
          />
          <LogPanel logs={state.logs} />
        </>
      }
      infoPanel={<AreaInfoPanel area={selectedArea} state={state} onPlanAction={() => setActiveModal("actions")} />}
      modal={renderModalContent()}
      notifications={<NotificationSummary state={state} onOpen={() => setActiveModal("notifications")} />}
      overlay={
        state.phase === "decisions" && state.pendingDecisions[0] ? (
          <PendingDecisionModal
            decision={state.pendingDecisions[0]}
            remaining={state.pendingDecisions.length}
            state={state}
            onConfirm={(optionId) => persist(applyDecisionOption(state, state.pendingDecisions[0].id, optionId))}
          />
        ) : state.phase === "combat" && state.pendingCombat ? (
          <CombatModal
            state={state}
            onAction={(request) => persist(chooseCombatAction(state, request))}
            onContinueRound={() => persist(continueCombatRound(state))}
            onConfirmSummary={() => persist(confirmCombatSummary(state))}
          />
        ) : null
      }
    />
  );
}
