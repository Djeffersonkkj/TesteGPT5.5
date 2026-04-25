import { ASSETS, factionFlag, monkeyPortrait } from "../game/assets";
import { GROUP_ACTION_LABELS, TERRAIN_LABELS } from "../game/constants";
import { canMoveToArea, normalizeAreaId } from "../game/map";
import type { Area, GameState, GroupActionType } from "../game/types";
import { average, countTerritories, foodTotal, livingFactionMonkeys, playerMonkeys } from "../game/utils";

interface Props {
  area: Area | null;
  state: GameState;
  onPlanAction: () => void;
}

const areaActions: GroupActionType[] = ["collect", "explore", "patrol", "attack", "negotiate", "steal", "recruit", "craft"];

function SummaryPanel({ state }: { state: GameState }) {
  const player = state.factions.find((faction) => faction.id === state.playerFactionId)!;
  const monkeys = playerMonkeys(state);
  const relations = state.factions.filter((faction) => faction.id !== player.id);

  return (
    <section className="panel area-info-card">
      <p className="eyebrow">resumo da tribo</p>
      <h2>{player.name}</h2>
      <div className="stat-grid">
        <span>Dia atual</span>
        <strong>{state.day}</strong>
        <span>Comida</span>
        <strong>{Math.floor(foodTotal(player))}</strong>
        <span>Populacao</span>
        <strong>{monkeys.length}</strong>
        <span>Moral media</span>
        <strong>{Math.floor(average(monkeys.map((monkey) => monkey.morale)))}</strong>
        <span>Territorios</span>
        <strong>{countTerritories(state, player.id)}</strong>
      </div>
      <div className="relations-list compact-relations">
        {relations.map((faction) => (
          <div key={faction.id} className="relation-row">
            <span style={{ background: faction.color }} />
            <b>{faction.name}</b>
            <strong>{player.relations[faction.id] ?? 0}</strong>
          </div>
        ))}
      </div>
      <p className="suggestion-line">
        Proximo passo sugerido: selecione uma area vizinha, mova macacos disponiveis e planeje coleta ou patrulha antes de encerrar o dia.
      </p>
    </section>
  );
}

export default function AreaInfoPanel({ area, state, onPlanAction }: Props) {
  if (!area) {
    return <SummaryPanel state={state} />;
  }

  const owner = state.factions.find((faction) => faction.id === area.ownerFactionId);
  const playerHere = livingFactionMonkeys(state, state.playerFactionId).filter(
    (monkey) => normalizeAreaId(monkey.locationId) === area.id,
  );
  const nearby = livingFactionMonkeys(state, state.playerFactionId).filter((monkey) => {
    const currentAreaId = normalizeAreaId(monkey.locationId);
    return currentAreaId !== area.id && canMoveToArea(currentAreaId, area.id);
  });
  const visible = area.visibleMonkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter(Boolean);
  const areaLogs = state.logs
    .filter((line) => line.includes(area.name) || line.includes(area.shortName))
    .slice(0, 4);

  return (
    <section className="panel area-info-card">
      <div className="area-info-heading">
        <div>
          <p className="eyebrow">territorio selecionado</p>
          <h2>{area.name}</h2>
        </div>
        {factionFlag(area.ownerFactionId) && <img alt="" className="faction-flag" src={factionFlag(area.ownerFactionId)} />}
      </div>

      <div className="area-focus-art">
        <img alt="" src={area.image} />
      </div>

      <div className="stat-grid">
        <span>Faccao</span>
        <strong>{owner?.name ?? "Neutro"}</strong>
        <span>Terreno</span>
        <strong>{TERRAIN_LABELS[area.terrain]}</strong>
        <span>Recursos</span>
        <strong>{area.knownByPlayer ? `${area.currentFood}/${area.maxFood}` : "Desconhecido"}</strong>
        <span>Bananas/dia</span>
        <strong>
          {area.knownByPlayer
            ? `${area.currentBananaProduction}/${area.baseBananaProduction}`
            : "Desconhecido"}
        </strong>
        <span>Perigo estimado</span>
        <strong>{area.dangerLevel}/10</strong>
        <span>Na area</span>
        <strong>{playerHere.length}</strong>
        <span>Adjacentes</span>
        <strong>{nearby.length}</strong>
      </div>

      <p className="feature-text">{area.specialFeature}</p>

      <div className="action-chip-list">
        {areaActions.map((action) => (
          <span key={action} className="action-chip">
            {GROUP_ACTION_LABELS[action]}
          </span>
        ))}
      </div>

      <button className="primary-button full-button" onClick={onPlanAction}>
        Planejar acao aqui
      </button>

      <section className="area-mini-section">
        <strong>Macacos conhecidos</strong>
        {visible.length === 0 ? (
          <span className="muted">Nenhum confirmado.</span>
        ) : (
          <div className="area-monkey-list">
            {visible.map((monkey, index) => (
              <span key={monkey!.id} className={monkey!.factionId === state.playerFactionId ? "tag own" : "tag enemy"}>
                <img alt="" src={monkeyPortrait(index)} />
                {monkey!.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="area-mini-section">
        <strong>Observacoes recentes</strong>
        {areaLogs.length === 0 ? (
          <span className="muted">Sem registros recentes deste territorio.</span>
        ) : (
          areaLogs.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)
        )}
      </section>
    </section>
  );
}
