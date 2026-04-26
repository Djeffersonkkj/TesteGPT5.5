import { useEffect, useMemo, useState } from "react";
import { buildCombatUnits, COMBAT_ACTIONS, type CombatActionRequest } from "../game/combat";
import type { CombatActionId, CombatEffect, CombatUnit, GameState } from "../game/types";

interface Props {
  state: GameState;
  onAction: (request: CombatActionRequest) => void;
  onContinueRound: () => void;
  onConfirmSummary: () => void;
}

function CombatUnitToken({
  unit,
  effectText,
  effectKind,
  isSelected,
  isTargetable,
  onClick,
}: {
  unit: CombatUnit;
  effectText?: string;
  effectKind?: string;
  isSelected: boolean;
  isTargetable: boolean;
  onClick: () => void;
}) {
  const hpPercent = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const isDown = unit.hp <= 0 || unit.status.includes("morto");

  return (
    <button
      className={[
        "combat-unit-token",
        unit.team,
        isSelected ? "selected" : "",
        isTargetable ? "targetable" : "",
        isDown ? "down" : "",
        effectKind === "hit" ? "took-hit" : "",
        effectKind === "defend" || effectKind === "heal" ? "pulse-good" : "",
        effectKind === "intimidate" ? "pulse-warning" : "",
      ].join(" ")}
      style={{ gridColumn: unit.position.x + 1, gridRow: unit.position.y + 1 }}
      type="button"
      onClick={onClick}
    >
      <span className="combat-hp">{Math.ceil(unit.hp)}/{unit.maxHp}</span>
      <span className="combat-token-art">
        <span className="combat-fallback">M</span>
        {unit.sprite && <img alt="" src={unit.sprite} onError={(event) => { event.currentTarget.style.display = "none"; }} />}
      </span>
      <span className="combat-unit-name">{unit.name}</span>
      {unit.status.length > 0 && (
        <span className="combat-statuses">
          {unit.status.slice(0, 3).map((status) => (
            <small key={status}>{status}</small>
          ))}
        </span>
      )}
      <span className="combat-hp-bar"><span style={{ width: `${hpPercent}%` }} /></span>
      {effectText && <span className={`combat-float-text ${effectKind ?? ""}`}>{effectText}</span>}
    </button>
  );
}

function CombatGrid({
  units,
  selectedUnitId,
  targetTeam,
  effects,
  onSelectUnit,
  onSelectTarget,
}: {
  units: CombatUnit[];
  selectedUnitId?: string;
  targetTeam: "player" | "enemy" | null;
  effects?: CombatEffect[];
  onSelectUnit: (unitId: string) => void;
  onSelectTarget: (unitId: string) => void;
}) {
  const effectByUnit = new Map((effects ?? []).map((effect) => [effect.unitId, effect]));
  const cells = Array.from({ length: 15 }, (_, index) => <span key={index} className="combat-grid-cell" />);

  return (
    <section className="combat-grid-wrap">
      <div className="combat-grid" aria-label="Campo de combate">
        {cells}
        {units.map((unit) => {
          const effect = effectByUnit.get(unit.id);
          const targetable = Boolean(targetTeam && unit.team === targetTeam && unit.hp > 0);
          return (
            <CombatUnitToken
              key={unit.id}
              unit={unit}
              effectKind={effect?.kind}
              effectText={effect?.text}
              isSelected={selectedUnitId === unit.id}
              isTargetable={targetable}
              onClick={() => (targetable ? onSelectTarget(unit.id) : onSelectUnit(unit.id))}
            />
          );
        })}
      </div>
    </section>
  );
}

function CombatActionPanel({
  selectedUnit,
  selectedAction,
  currentChoiceLabel,
  targetHint,
  canAct,
  isActionDisabled,
  onChooseAction,
}: {
  selectedUnit?: CombatUnit;
  selectedAction: CombatActionId | null;
  currentChoiceLabel: string;
  targetHint: string;
  canAct: boolean;
  isActionDisabled: (action: CombatActionId) => boolean;
  onChooseAction: (action: CombatActionId) => void;
}) {
  return (
    <aside className="combat-action-panel">
      <div className="combat-selection-card">
        <span className="eyebrow">unidade ativa</span>
        <strong>{selectedUnit?.name ?? "Selecione um macaco"}</strong>
        {selectedUnit && (
          <small>
            ATQ {selectedUnit.attack} - DEF {selectedUnit.defense} - EN {Math.floor(selectedUnit.energy)}
          </small>
        )}
      </div>

      <div className="combat-selection-card">
        <span className="eyebrow">escolha atual</span>
        <strong>{currentChoiceLabel}</strong>
      </div>

      {targetHint && <p className="combat-target-hint">{targetHint}</p>}

      <div className="combat-action-list">
        {COMBAT_ACTIONS.map((action) => (
          <button
            key={action.id}
            className={selectedAction === action.id ? "selected" : ""}
            disabled={!canAct || isActionDisabled(action.id)}
            type="button"
            onClick={() => onChooseAction(action.id)}
          >
            <strong>{action.label}</strong>
            <span>{action.text}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function GroupState({ title, units }: { title: string; units: CombatUnit[] }) {
  const avgHp =
    units.length > 0
      ? Math.round(units.reduce((sum, unit) => sum + unit.hp / Math.max(1, unit.maxHp), 0) / units.length * 100)
      : 0;
  const tired = units.filter((unit) => unit.energy < 25).length;

  return (
    <span>
      {title}: {units.length} aptos - HP {avgHp}%{tired > 0 ? ` - ${tired} cansado(s)` : ""}
    </span>
  );
}

function CombatLog({ lines }: { lines: string[] }) {
  return (
    <section className="combat-log tactical">
      {lines.slice(-8).map((line, index) => (
        <span key={`${line}-${index}`}>{line}</span>
      ))}
    </section>
  );
}

function CombatSummary({
  state,
  onConfirm,
}: {
  state: GameState;
  onConfirm: () => void;
}) {
  const result = state.pendingCombat?.result;
  if (!result) {
    return null;
  }

  return (
    <div className="combat-summary-panel">
      <p className="eyebrow">resultado do combate</p>
      <h2>{result.title}</h2>
      <div className="combat-summary-lines">
        {result.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <button className="primary-button full-button" type="button" onClick={onConfirm}>
        Confirmar resultado
      </button>
    </div>
  );
}

export default function CombatModal({ state, onAction, onContinueRound, onConfirmSummary }: Props) {
  const combat = state.pendingCombat!;
  const units = useMemo(() => buildCombatUnits(state), [state]);
  const playerUnits = units.filter((unit) => unit.team === "player" && unit.hp > 0);
  const enemyUnits = units.filter((unit) => unit.team === "enemy" && unit.hp > 0);
  const nextUnit = playerUnits.find((unit) => !unit.hasActed) ?? playerUnits[0];
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>(nextUnit?.id);
  const [selectedAction, setSelectedAction] = useState<CombatActionId | null>(null);

  useEffect(() => {
    if (combat.phase === "playerTurn") {
      const current = units.find((unit) => unit.id === selectedUnitId);
      if (!current || current.team !== "player" || current.hasActed || current.hp <= 0) {
        setSelectedUnitId(nextUnit?.id);
        setSelectedAction(null);
      }
    }
  }, [combat.phase, nextUnit?.id, selectedUnitId, units]);

  const area = state.areas.find((item) => item.id === combat.areaId)!;
  const enemyFactionId = combat.playerSide === "attacker" ? combat.defenderFactionId : combat.attackerFactionId;
  const enemyFaction = state.factions.find((item) => item.id === enemyFactionId)!;
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  const actionDefinition = COMBAT_ACTIONS.find((action) => action.id === selectedAction);
  const currentChoiceDefinition = COMBAT_ACTIONS.find((action) => action.id === combat.currentPlayerChoice);
  const targetTeam = actionDefinition?.needsTarget === "enemy" ? "enemy" : actionDefinition?.needsTarget === "ally" ? "player" : null;
  const canAct = combat.phase === "playerTurn" && Boolean(selectedUnit && selectedUnit.team === "player" && !selectedUnit.hasActed && selectedUnit.hp > 0);
  const targetHint =
    selectedAction === "attack"
      ? "Escolha um inimigo no campo."
      : selectedAction === "ambush"
        ? "Escolha um inimigo para emboscar."
      : selectedAction === "protect"
        ? "Escolha um aliado para proteger."
        : "";
  const isActionDisabled = (action: CombatActionId) => {
    if (action !== "ambush" || !selectedUnit) {
      return false;
    }
    return combat.round > 2 && selectedUnit.stealth < 7 && area.stealthModifier <= 0;
  };

  const chooseAction = (action: CombatActionId) => {
    if (!selectedUnitId) {
      return;
    }
    const definition = COMBAT_ACTIONS.find((item) => item.id === action);
    if (definition?.needsTarget) {
      setSelectedAction(action);
      return;
    }
    setSelectedAction(null);
    onAction({ action, actorId: selectedUnitId });
  };

  const selectTarget = (targetId: string) => {
    if (!selectedAction || !selectedUnitId) {
      return;
    }
    onAction({ action: selectedAction, actorId: selectedUnitId, targetId });
    setSelectedAction(null);
  };

  return (
    <div className="modal-backdrop">
      <section className="combat-modal tactical">
        <header className="combat-tactical-header">
          <div>
            <p className="eyebrow">combate tatico</p>
            <h1>{area.name}</h1>
            <p className="combat-subtitle">
              Rodada {combat.round}/{combat.maxRounds} contra {enemyFaction.name} - {combat.phase === "summary" ? "resumo" : combat.phase === "roundSummary" ? "fim da rodada" : combat.phase === "enemyTurn" ? "turno inimigo" : "seu turno"}
            </p>
          </div>
          <div className="combat-score-strip">
            <GroupState title="Aliados" units={playerUnits} />
            <GroupState title="Rivais" units={enemyUnits} />
            <span>Moral inimiga: {combat.enemyMorale ?? 60}</span>
          </div>
        </header>

        {combat.phase === "summary" ? (
          <CombatSummary state={state} onConfirm={onConfirmSummary} />
        ) : combat.phase === "roundSummary" ? (
          <div className="combat-summary-panel">
            <p className="eyebrow">resultado da rodada</p>
            <h2>Rodada {combat.round} encerrada</h2>
            <div className="combat-summary-lines">
              <span>{combat.lastRoundSummary ?? "Os grupos se reposicionaram sem decisao final."}</span>
              <span>Proxima rodada: {Math.min(combat.round + 1, combat.maxRounds)}/{combat.maxRounds}</span>
            </div>
            <button className="primary-button full-button" type="button" onClick={onContinueRound}>
              Continuar para a proxima rodada
            </button>
          </div>
        ) : (
          <div className="combat-tactical-layout">
            <CombatGrid
              effects={combat.lastEffects}
              selectedUnitId={selectedUnitId}
              targetTeam={targetTeam}
              units={units}
              onSelectTarget={selectTarget}
              onSelectUnit={(unitId) => {
                const unit = units.find((item) => item.id === unitId);
                if (unit?.team === "player" && unit.hp > 0) {
                  setSelectedUnitId(unitId);
                  setSelectedAction(null);
                }
              }}
            />
            <CombatActionPanel
              canAct={canAct}
              currentChoiceLabel={selectedAction ? actionDefinition?.label ?? "Escolhendo alvo" : currentChoiceDefinition?.label ?? "Aguardando ordem"}
              isActionDisabled={isActionDisabled}
              selectedAction={selectedAction}
              selectedUnit={selectedUnit}
              targetHint={targetHint}
              onChooseAction={chooseAction}
            />
          </div>
        )}

        <CombatLog lines={combat.log} />
      </section>
    </div>
  );
}
