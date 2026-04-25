import { useEffect, useState } from "react";
import { describeDecisionOptionEffects } from "../game/gameEngine";
import type { GameState, PendingDecision } from "../game/types";

interface Props {
  state: GameState;
  decision: PendingDecision;
  remaining: number;
  onConfirm: (optionId: string) => void;
}

const certaintyLabel: Record<PendingDecision["knownLevel"], string> = {
  confirmado: "Confirmado",
  rumor: "Rumor",
  suspeita: "Suspeita",
};

export default function PendingDecisionModal({ state, decision, remaining, onConfirm }: Props) {
  const [selectedOptionId, setSelectedOptionId] = useState(decision.options[0]?.id ?? "");
  const selectedOption = decision.options.find((option) => option.id === selectedOptionId);

  useEffect(() => {
    setSelectedOptionId(decision.options[0]?.id ?? "");
  }, [decision.id, decision.options]);

  return (
    <div className="modal-backdrop decision-backdrop">
      <section className="combat-modal decision-modal">
        <p className="eyebrow">decisao pendente</p>
        <h1>{decision.title}</h1>
        <div className="decision-meta-row">
          <span className={`certainty-pill ${decision.knownLevel}`}>
            {certaintyLabel[decision.knownLevel]}
          </span>
          <span>
            {remaining} decisao{remaining === 1 ? "" : "es"} antes do relatorio
          </span>
        </div>
        <p className="decision-description">{decision.description}</p>

        <div className="decision-options">
          {decision.options.map((option) => {
            const effects = describeDecisionOptionEffects(option, state);
            const selected = option.id === selectedOptionId;
            return (
              <button
                key={option.id}
                className={selected ? "selected" : ""}
                onClick={() => setSelectedOptionId(option.id)}
              >
                <strong>{option.label}</strong>
                {option.description && <span>{option.description}</span>}
                {effects.length > 0 && (
                  <small>Estimado: {effects.join("; ")}</small>
                )}
              </button>
            );
          })}
        </div>

        <div className="decision-footer">
          <span>{selectedOption?.description ?? "Escolha uma resposta para continuar."}</span>
          <button
            className="primary-button"
            disabled={!selectedOption}
            onClick={() => selectedOption && onConfirm(selectedOption.id)}
          >
            Confirmar escolha
          </button>
        </div>
      </section>
    </div>
  );
}
