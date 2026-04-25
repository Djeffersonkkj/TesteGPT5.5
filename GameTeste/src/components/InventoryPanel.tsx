import type { GameState } from "../game/types";

interface Props {
  state: GameState;
}

export default function InventoryPanel({ state }: Props) {
  const faction = state.factions.find((item) => item.id === state.playerFactionId)!;
  const entries = Object.entries(faction.inventory).filter(([, count]) => (count ?? 0) > 0);

  return (
    <section className="panel">
      <p className="eyebrow">inventário</p>
      <h2>Ferramentas</h2>
      {entries.length === 0 ? (
        <p className="muted">Nenhuma ferramenta criada ainda.</p>
      ) : (
        <div className="inventory-list">
          {entries.map(([tool, count]) => (
            <span key={tool} className="tag own">
              {tool} × {count}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
