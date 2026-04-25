import { useEffect, useMemo, useState } from "react";
import { moveMonkeysToArea } from "../game/actions";
import { canMoveToArea, normalizeAreaId } from "../game/map";
import type { GameState } from "../game/types";
import { livingFactionMonkeys } from "../game/utils";

interface Props {
  state: GameState;
  onChange: (state: GameState) => void;
}

export default function MoveToAreaPanel({ state, onChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const area = state.areas.find((item) => item.id === state.selectedAreaId)!;

  useEffect(() => {
    setSelectedIds([]);
  }, [state.selectedAreaId]);

  const candidates = useMemo(
    () =>
      livingFactionMonkeys(state, state.playerFactionId).filter((monkey) => {
        const currentAreaId = normalizeAreaId(monkey.locationId);
        return (
          currentAreaId !== area.id &&
          canMoveToArea(currentAreaId, area.id) &&
          monkey.status !== "inconsciente" &&
          monkey.plannedAction?.kind !== "group"
        );
      }),
    [state, area.id],
  );

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const confirm = () => {
    onChange(moveMonkeysToArea(state, area.id, selectedIds));
    setSelectedIds([]);
  };

  return (
    <section className="panel move-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">mover para</p>
          <h2>{area.name}</h2>
        </div>
        <span className="mini-help">{candidates.length} proximo(s)</span>
      </div>

      <p className={candidates.length > 0 ? "reach-note" : "reach-note blocked"}>
        {candidates.length > 0
          ? "Apenas macacos em cenarios adjacentes aparecem aqui."
          : "Nenhum macaco adjacente para mover."}
      </p>

      {candidates.length > 0 && (
        <div className="compact-picker">
          {candidates.map((monkey) => {
            const currentArea = state.areas.find((item) => item.id === normalizeAreaId(monkey.locationId));
            return (
              <label key={monkey.id} className={selectedIds.includes(monkey.id) ? "picked" : ""}>
                <input
                  checked={selectedIds.includes(monkey.id)}
                  type="checkbox"
                  onChange={() => toggle(monkey.id)}
                />
                <span>{monkey.name}</span>
                <small>De {currentArea?.shortName ?? "?"}</small>
              </label>
            );
          })}
        </div>
      )}

      <button
        className="primary-button full-button"
        disabled={selectedIds.length === 0}
        onClick={confirm}
      >
        Mover selecionados ({selectedIds.length})
      </button>
    </section>
  );
}
