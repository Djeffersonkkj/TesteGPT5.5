import { getCombatOptions, type CombatOption } from "../game/combat";
import type { GameState } from "../game/types";

interface Props {
  state: GameState;
  onChoose: (tactic: CombatOption["id"]) => void;
}

export default function CombatModal({ state, onChoose }: Props) {
  const combat = state.pendingCombat!;
  const options = getCombatOptions(state);
  const area = state.areas.find((item) => item.id === combat.areaId)!;
  const enemy = state.factions.find((item) => item.id === combat.defenderFactionId)!;
  const playerGroup = combat.playerMonkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter(Boolean);
  const enemyGroup = combat.enemyMonkeyIds
    .map((id) => state.monkeys.find((monkey) => monkey.id === id))
    .filter(Boolean);

  return (
    <div className="modal-backdrop">
      <section className="combat-modal">
        <p className="eyebrow">combate com escolhas</p>
        <h1>{area.name}</h1>
        <p className="combat-subtitle">
          Rodada {combat.round}/{combat.maxRounds} contra {enemy.name}
        </p>

        <div className="combat-columns">
          <div>
            <h2>Seu grupo</h2>
            {playerGroup.map((monkey) => (
              <span key={monkey!.id} className="combatant own">
                {monkey!.name} · HP {Math.ceil(monkey!.hp)} · {monkey!.status}
              </span>
            ))}
          </div>
          <div>
            <h2>Rivais</h2>
            {enemyGroup.map((monkey) => (
              <span key={monkey!.id} className="combatant enemy">
                {monkey!.name} · HP {Math.ceil(monkey!.hp)} · {monkey!.status}
              </span>
            ))}
          </div>
        </div>

        <div className="combat-log">
          {combat.log.slice(-5).map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>

        <div className="combat-options">
          {options.map((option) => (
            <button key={option.id} onClick={() => onChoose(option.id)}>
              <strong>{option.label}</strong>
              <span>{option.text}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
