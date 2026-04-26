import { TERRAIN_LABELS, isOfficialFactionId } from "../game/constants";
import { canMoveToArea, normalizeAreaId } from "../game/map";
import type { Area, GameState } from "../game/types";
import { livingFactionMonkeys } from "../game/utils";

interface Props {
  area: Area;
  state: GameState;
}

export default function AreaPanel({ area, state }: Props) {
  const owner = isOfficialFactionId(area.ownerFactionId)
    ? state.factions.find((faction) => faction.id === area.ownerFactionId)
    : undefined;
  const playerMonkeysHere = livingFactionMonkeys(state, state.playerFactionId).filter(
    (monkey) => normalizeAreaId(monkey.locationId) === area.id,
  );
  const nearbyPlayerMonkeys = livingFactionMonkeys(state, state.playerFactionId).filter((monkey) => {
    const currentAreaId = normalizeAreaId(monkey.locationId);
    return currentAreaId !== area.id && canMoveToArea(currentAreaId, area.id);
  });
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
        <span>Bananas/dia</span>
        <strong>
          {area.currentBananaProduction}/{area.baseBananaProduction}
        </strong>
        <span>Dono</span>
        <strong>{owner?.name ?? "Neutro"}</strong>
        <span>Alcance</span>
        <strong>{nearbyPlayerMonkeys.length > 0 ? `${nearbyPlayerMonkeys.length} proximo(s)` : "Sem adjacentes"}</strong>
        <span>Na area</span>
        <strong>{playerMonkeysHere.length}</strong>
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
