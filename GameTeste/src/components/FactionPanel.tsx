import { isActiveRivalFactionId } from "../game/constants";
import type { GameState } from "../game/types";
import { countTerritories, foodTotal, livingFactionMonkeys } from "../game/utils";
import { getFactionRelation, requestMilitaryHelp } from "../game/world";

interface Props {
  state: GameState;
  onChange?: (state: GameState) => void;
}

const statusLabel: Record<string, string> = {
  WAR: "Guerra",
  HOSTILE: "Hostil",
  TENSE: "Tensa",
  NEUTRAL: "Neutra",
  FRIENDLY: "Amigavel",
  TRUCE: "Tregua",
  TEMPORARY_ALLIANCE: "Alianca",
};

export default function FactionPanel({ state, onChange }: Props) {
  const player = state.factions.find((faction) => faction.id === state.playerFactionId)!;
  const alive = livingFactionMonkeys(state, player.id);
  const rivals = state.factions.filter((faction) => isActiveRivalFactionId(faction.id));
  const openThefts = state.theftEvents.filter((event) => event.victimFactionId === player.id && !event.resolved);
  const discoveredPlans = state.secretPlans.filter((plan) => plan.discovered && !plan.cancelled);

  return (
    <section className="panel">
      <p className="eyebrow">faccao</p>
      <h2>{player.name}</h2>
      <div className="stat-grid">
        <span>Populacao</span>
        <strong>{alive.length}</strong>
        <span>Comida</span>
        <strong>{Math.floor(foodTotal(player))}</strong>
        <span>Bananas</span>
        <strong>{player.food.bananas}</strong>
        <span>Ervas</span>
        <strong>{player.food.herbs}</strong>
        <span>Moral</span>
        <strong>{Math.floor(player.morale)}</strong>
        <span>Territorios</span>
        <strong>{countTerritories(state, player.id)}</strong>
      </div>

      <div className="stat-grid compact-stat-grid">
        <span>Honra</span>
        <strong>{state.playerReputation.honor}</strong>
        <span>Forca</span>
        <strong>{state.playerReputation.strength}</strong>
        <span>Confiavel</span>
        <strong>{state.playerReputation.reliability}</strong>
        <span>Astucia</span>
        <strong>{state.playerReputation.cunning}</strong>
      </div>

      <div className="relations-list relation-card-list">
        {rivals.map((faction) => {
          const relation = getFactionRelation(state, player.id, faction.id);
          const pact = state.temporaryPacts.find(
            (item) => item.factions.includes(player.id) && item.factions.includes(faction.id) && item.endDay >= state.day,
          );
          const enemy = rivals.find((item) => item.id !== faction.id);
          return (
            <div key={faction.id} className="relation-card">
              <div className="relation-row">
                <span style={{ background: faction.color }} />
                <b>{faction.name}</b>
                <strong>{relation.score}</strong>
              </div>
              <small>
                {statusLabel[relation.status] ?? relation.status} - confianca {relation.trust} - respeito {relation.respect}
                {pact ? ` - ${Math.max(1, pact.endDay - state.day + 1)} dia(s)` : ""}
              </small>
              {enemy && onChange && (
                <button
                  className="ghost-button full-button"
                  onClick={() =>
                    onChange(
                      requestMilitaryHelp({
                        gameState: state,
                        targetAllyFactionId: faction.id,
                        enemyFactionId: enemy.id,
                        areaId: state.selectedAreaId,
                      }),
                    )
                  }
                >
                  Pedir ajuda contra {enemy.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <section className="area-mini-section">
        <strong>Investigacoes abertas</strong>
        {openThefts.length === 0 && discoveredPlans.length === 0 ? (
          <span className="muted">Nenhum roubo ou plano confirmado pendente.</span>
        ) : (
          <>
            {openThefts.slice(0, 3).map((event) => (
              <span key={event.id}>
                Roubo em {state.areas.find((area) => area.id === event.areaId)?.shortName}: {event.detectionLevel}
              </span>
            ))}
            {discoveredPlans.slice(0, 2).map((plan) => (
              <span key={plan.id}>Plano descoberto: {plan.reason}</span>
            ))}
          </>
        )}
      </section>

      {state.factionRequests.length > 0 && (
        <section className="area-mini-section">
          <strong>Pedidos pendentes</strong>
          {state.factionRequests.slice(0, 3).map((request) => (
            <span key={request.id}>{request.description}</span>
          ))}
        </section>
      )}
    </section>
  );
}
