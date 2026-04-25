import { useEffect, useMemo, useState } from "react";
import { GROUP_ACTION_LABELS } from "../game/constants";
import { addGroupPlan, removeGroupPlan, suggestMonkeysForAction } from "../game/actions";
import type { GameState, GroupActionType } from "../game/types";
import { livingFactionMonkeys } from "../game/utils";

interface Props {
  state: GameState;
  onChange: (state: GameState) => void;
}

const actions = Object.keys(GROUP_ACTION_LABELS) as GroupActionType[];

export default function GroupActionPanel({ state, onChange }: Props) {
  const [actionType, setActionType] = useState<GroupActionType>("collect");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const area = state.areas.find((item) => item.id === state.selectedAreaId)!;

  useEffect(() => {
    setSelectedIds([]);
  }, [state.selectedAreaId, actionType]);

  const available = useMemo(
    () =>
      livingFactionMonkeys(state, state.playerFactionId).filter(
        (monkey) => monkey.status !== "inconsciente" && monkey.plannedAction?.kind !== "group",
      ),
    [state],
  );

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const suggest = () => {
    setSelectedIds(suggestMonkeysForAction(state, actionType, actionType === "attack" ? 5 : 4));
  };

  const confirm = () => {
    onChange(addGroupPlan(state, actionType, area.id, selectedIds));
    setSelectedIds([]);
  };

  return (
    <section className="panel group-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">ações em grupo</p>
          <h2>{area.name}</h2>
        </div>
        <span className="mini-help">{state.groupPlans.length} planejada(s)</span>
      </div>

      <div className="toolbar">
        <label>
          Ação
          <select value={actionType} onChange={(event) => setActionType(event.target.value as GroupActionType)}>
            {actions.map((action) => (
              <option key={action} value={action}>
                {GROUP_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <button className="ghost-button" onClick={suggest}>
          Sugerir melhores
        </button>
      </div>

      <div className="compact-picker">
        {available.map((monkey) => (
          <label key={monkey.id} className={selectedIds.includes(monkey.id) ? "picked" : ""}>
            <input
              checked={selectedIds.includes(monkey.id)}
              type="checkbox"
              onChange={() => toggle(monkey.id)}
            />
            <span>{monkey.name}</span>
            <small>
              ATQ {monkey.attack} · FUR {monkey.stealth} · CAR {monkey.charisma}
            </small>
          </label>
        ))}
      </div>

      <button className="primary-button full-button" disabled={selectedIds.length === 0} onClick={confirm}>
        Confirmar grupo ({selectedIds.length})
      </button>

      {state.groupPlans.length > 0 && (
        <div className="planned-list">
          {state.groupPlans.map((plan) => {
            const planArea = state.areas.find((item) => item.id === plan.areaId);
            return (
              <div key={plan.id} className="planned-row">
                <span>
                  <b>{GROUP_ACTION_LABELS[plan.actionType]}</b> · {planArea?.shortName} · {plan.monkeyIds.length} macaco(s)
                </span>
                <button className="icon-button" onClick={() => onChange(removeGroupPlan(state, plan.id))}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
