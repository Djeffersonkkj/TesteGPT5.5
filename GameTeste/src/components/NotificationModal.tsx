import { monkeyPortrait } from "../game/assets";
import { getTribeNotifications } from "../game/notifications";
import type { GameState, Monkey } from "../game/types";

interface Props {
  state: GameState;
}

function MonkeyList({ title, monkeys }: { title: string; monkeys: Monkey[] }) {
  return (
    <section className="notification-block">
      <h3>{title}</h3>
      {monkeys.length === 0 ? (
        <p className="muted">Nenhum.</p>
      ) : (
        <div className="alert-monkey-list">
          {monkeys.map((monkey, index) => (
            <span key={monkey.id} className="alert-monkey">
              <img alt="" src={monkeyPortrait(index)} />
              <b>{monkey.name}</b>
              <small>
                {monkey.status} / fome {Math.round(monkey.hunger)} / energia {Math.round(monkey.energy)}
              </small>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default function NotificationModal({ state }: Props) {
  const details = getTribeNotifications(state);

  return (
    <div className="notification-grid">
      <MonkeyList title="Com fome" monkeys={details.hungry} />
      <MonkeyList title="Cansados" monkeys={details.tired} />
      <MonkeyList title="Feridos" monkeys={details.injured} />
      <MonkeyList title="Descontentes" monkeys={details.unhappy} />
      <MonkeyList title="Sem funcao definida" monkeys={details.withoutRole} />
      <MonkeyList title="Precisam de decisao" monkeys={details.pendingDecision} />
    </div>
  );
}
