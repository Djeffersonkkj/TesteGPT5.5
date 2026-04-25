import { getNotificationSummary, getTribeNotifications } from "../game/notifications";
import type { GameState } from "../game/types";

interface Props {
  state: GameState;
  onOpen: () => void;
}

export default function NotificationSummary({ state, onOpen }: Props) {
  const summary = getNotificationSummary(getTribeNotifications(state));
  const visible = summary.slice(0, 3);

  return (
    <button className="notification-summary" onClick={onOpen}>
      <strong>Alertas</strong>
      {visible.length === 0 ? (
        <span>Nenhum alerta critico</span>
      ) : (
        visible.map((item) => <span key={item}>{item}</span>)
      )}
      {summary.length > visible.length && <em>+{summary.length - visible.length}</em>}
    </button>
  );
}
