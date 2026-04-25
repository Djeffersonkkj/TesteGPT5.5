import {
  canMoveToArea,
  isVisualArea,
  normalizeAreaId,
} from "../game/map";
import type { AreaId, GameState } from "../game/types";
import { livingFactionMonkeys } from "../game/utils";

interface Props {
  state: GameState;
  selectedAreaId: AreaId;
  onSelect: (areaId: AreaId) => void;
}

const MAP_W = 920;
const MAP_H = 520;
const TILE_W = 170;
const TILE_H = 150;
const X_GAP = 112;
const Y_GAP = 104;

function getTilePosition(row: number, col: number) {
  return {
    left: ((col * X_GAP + 46) / MAP_W) * 100,
    top: (((row - 1) * Y_GAP + 18) / MAP_H) * 100,
  };
}

function baseClass(ownerFactionId: string | null, playerFactionId: string): string {
  if (ownerFactionId === playerFactionId) {
    return "base-player";
  }
  if (ownerFactionId === "stone") {
    return "base-enemy-red";
  }
  if (ownerFactionId === "gold") {
    return "base-enemy-yellow";
  }
  return "";
}

export default function HexMap({ state, selectedAreaId, onSelect }: Props) {
  const visualAreas = state.areas.filter(isVisualArea);
  const playerMonkeys = livingFactionMonkeys(state, state.playerFactionId);
  const selectedArea = state.areas.find((area) => area.id === selectedAreaId);

  return (
    <section className="panel map-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">mapa fixo</p>
          <h2>Ilha Hexagonal</h2>
        </div>
        <span className="mini-help">selecionado: {selectedArea?.shortName ?? "?"}</span>
      </div>
      <div className="hex-map" aria-label="Mapa da ilha">
        {visualAreas.map((area) => {
          const owner = state.factions.find((faction) => faction.id === area.ownerFactionId);
          const hasPlayerHere = playerMonkeys.some((monkey) => normalizeAreaId(monkey.locationId) === area.id);
          const reachable = playerMonkeys.some((monkey) => {
            const currentAreaId = normalizeAreaId(monkey.locationId);
            return currentAreaId === area.id || canMoveToArea(currentAreaId, area.id);
          });
          const position = getTilePosition(area.visualPosition!.row, area.visualPosition!.col);

          return (
            <button
              aria-label={`${area.name}, ${owner?.name ?? "Neutro"}`}
              className={[
                "hex-tile",
                selectedAreaId === area.id ? "selected" : "",
                reachable ? "reachable" : "",
                hasPlayerHere ? "current-origin" : "",
                area.isStartingBase ? "starting-base" : "",
                baseClass(area.ownerFactionId, state.playerFactionId),
              ]
                .filter(Boolean)
                .join(" ")}
              key={area.id}
              onClick={() => onSelect(area.id)}
              style={{
                left: `${position.left}%`,
                top: `${position.top}%`,
                width: `${(TILE_W / MAP_W) * 100}%`,
                height: `${(TILE_H / MAP_H) * 100}%`,
                ["--owner-color" as string]: owner?.color ?? "#b6b0a4",
              }}
            >
              <img alt="" src={area.image} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
