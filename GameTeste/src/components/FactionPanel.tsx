import { foodTotal, countTerritories, livingFactionMonkeys } from "../game/utils";
import type { GameState } from "../game/types";

interface Props {
  state: GameState;
}

export default function FactionPanel({ state }: Props) {
  const player = state.factions.find((faction) => faction.id === state.playerFactionId)!;
  const alive = livingFactionMonkeys(state, player.id);

  return (
    <section className="panel">
      <p className="eyebrow">facção</p>
      <h2>{player.name}</h2>
      <div className="stat-grid">
        <span>População</span>
        <strong>{alive.length}</strong>
        <span>Comida</span>
        <strong>{Math.floor(foodTotal(player))}</strong>
        <span>Bananas</span>
        <strong>{player.food.bananas}</strong>
        <span>Ervas</span>
        <strong>{player.food.herbs}</strong>
        <span>Moral</span>
        <strong>{Math.floor(player.morale)}</strong>
        <span>Territórios</span>
        <strong>{countTerritories(state, player.id)}</strong>
      </div>
      <div className="relations-list">
        {state.factions
          .filter((faction) => faction.id !== player.id)
          .map((faction) => (
            <div key={faction.id} className="relation-row">
              <span style={{ background: faction.color }} />
              <b>{faction.name}</b>
              <strong>{player.relations[faction.id] ?? 0}</strong>
            </div>
          ))}
      </div>
    </section>
  );
}
