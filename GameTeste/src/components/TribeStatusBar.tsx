import { ASSETS } from "../game/assets";
import type { GameState } from "../game/types";
import { foodTotal, playerMonkeys } from "../game/utils";

interface Props {
  state: GameState;
  saveNotice: string;
  onSave: () => void;
  onRestart: () => void;
}

function StatusChip({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <span className="status-chip" title={label}>
      <img alt="" src={icon} />
      <span>{value}</span>
    </span>
  );
}

function phaseLabel(phase: GameState["phase"]): string {
  if (phase === "report") {
    return "Relatorio";
  }
  if (phase === "planning") {
    return "Planejamento";
  }
  if (phase === "resolution" || phase === "combat") {
    return "Resolucao";
  }
  if (phase === "decisions") {
    return "Decisoes";
  }
  return "Fim";
}

export default function TribeStatusBar({ state, saveNotice, onSave, onRestart }: Props) {
  const player = state.factions.find((faction) => faction.id === state.playerFactionId)!;
  const alive = playerMonkeys(state);

  return (
    <>
      <div className="brand-lockup">
        <p className="eyebrow">Ilha dos Macacos</p>
        <h1>{player.name}</h1>
      </div>
      <div className="status-strip">
        <StatusChip icon={ASSETS.icons.day} label="Dia" value={`Dia ${state.day}`} />
        <StatusChip icon={ASSETS.icons.food} label="Comida" value={Math.floor(foodTotal(player))} />
        <StatusChip icon={ASSETS.icons.population} label="Populacao" value={alive.length} />
        <StatusChip icon={ASSETS.icons.morale} label="Moral" value={Math.floor(player.morale)} />
        <span className={`phase-chip phase-${state.phase}`} title="Etapa atual">
          {phaseLabel(state.phase)}
        </span>
      </div>
      <div className="topbar-actions compact">
        {saveNotice && <span className="save-notice">{saveNotice}</span>}
        <button className="ghost-button" onClick={onSave}>
          Salvar
        </button>
        <button className="ghost-button danger" onClick={onRestart}>
          Reiniciar
        </button>
      </div>
    </>
  );
}
