import { TERRAIN_LABELS } from "../game/constants";
import { canActInArea, getPlayerMainAreaId } from "../game/map";
import type { Area, GameState } from "../game/types";

interface Props {
  area: Area;
  state: GameState;
}

export default function AreaPanel({ area, state }: Props) {
  const owner = state.factions.find((faction) => faction.id === area.ownerFactionId);
  const originAreaId = getPlayerMainAreaId(state);
  const originArea = state.areas.find((item) => item.id === originAreaId);
  const isCurrentArea = area.id === originAreaId;
  const isReachable = canActInArea(originAreaId, area.id);
  const visible = area.visibleMonkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter(Boolean);

  return (
    <section className="panel">
      <p className="eyebrow">área selecionada</p>
      <h2>{area.name}</h2>
      <div className="stat-grid">
        <span>Terreno</span>
        <strong>{TERRAIN_LABELS[area.terrain]}</strong>
        <span>Comida</span>
        <strong>
          {area.currentFood}/{area.maxFood}
        </strong>
        <span>Dono</span>
        <strong>{owner?.name ?? "Neutro"}</strong>
        <span>Alcance</span>
        <strong>{isCurrentArea ? "Área atual" : isReachable ? "Adjacente" : "Distante"}</strong>
        <span>Partida</span>
        <strong>{originArea?.shortName ?? "?"}</strong>
        <span>Perigo</span>
        <strong>{area.dangerLevel}</strong>
        <span>Furtividade</span>
        <strong>{area.stealthModifier >= 0 ? "+" : ""}{area.stealthModifier}</strong>
        <span>Combate</span>
        <strong>{area.combatModifier >= 0 ? "+" : ""}{area.combatModifier}</strong>
      </div>
      <p className="feature-text">{area.specialFeature}</p>
      <div className="visible-list">
        <strong>Visíveis</strong>
        {visible.length === 0 ? (
          <span>Nenhum macaco confirmado.</span>
        ) : (
          visible.map((monkey) => (
            <span key={monkey!.id} className={monkey!.factionId === state.playerFactionId ? "tag own" : "tag enemy"}>
              {monkey!.name}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
