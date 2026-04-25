import { TERRAIN_CLASS, TERRAIN_ICONS } from "../game/constants";
import type { GameState } from "../game/types";

interface Props {
  state: GameState;
  selectedAreaId: string;
  onSelect: (areaId: string) => void;
}

export default function HexMap({ state, selectedAreaId, onSelect }: Props) {
  return (
    <section className="panel map-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">mapa fixo</p>
          <h2>Ilha Hexagonal</h2>
        </div>
        <span className="mini-help">clique numa área</span>
      </div>
      <div className="hex-map" aria-label="Mapa da ilha">
        {state.areas.map((area) => {
          const owner = state.factions.find((faction) => faction.id === area.ownerFactionId);
          const visibleMonkeys = area.visibleMonkeyIds
            .map((id) => state.monkeys.find((monkey) => monkey.id === id))
            .filter(Boolean);
          const playerCount = visibleMonkeys.filter((monkey) => monkey?.factionId === state.playerFactionId).length;
          const enemyCount = visibleMonkeys.filter((monkey) => monkey?.factionId !== state.playerFactionId).length;
          const left = area.x * 112 + (area.y % 2) * 56;
          const top = area.y * 88;

          return (
            <button
              className={`hex-tile ${TERRAIN_CLASS[area.terrain]} ${selectedAreaId === area.id ? "selected" : ""}`}
              key={area.id}
              onClick={() => onSelect(area.id)}
              style={{
                left,
                top,
                ["--owner-color" as string]: owner?.color ?? "#b6b0a4",
              }}
            >
              <span className="hex-icon">{TERRAIN_ICONS[area.terrain]}</span>
              <strong>{area.shortName}</strong>
              <span className="hex-food">🍌 {area.knownByPlayer ? area.currentFood : "?"}</span>
              <span className="hex-owner">{owner?.name ?? "Neutro"}</span>
              <span className="hex-counts">
                <b>{playerCount}</b> seus · <b>{enemyCount}</b> rivais
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
