import { ASSETS } from "../game/assets";

type ModalId = "tribe" | "actions" | "report" | "notifications" | "diplomacy" | "inventory";

interface Props {
  onOpen: (modal: ModalId) => void;
  onEndDay: () => void;
}

const buttons: Array<{ id: ModalId; label: string; short: string; icon: string }> = [
  { id: "tribe", label: "Tribo", short: "TR", icon: ASSETS.icons.population },
  { id: "actions", label: "Acoes", short: "AC", icon: ASSETS.icons.attack },
  { id: "report", label: "Relatorio", short: "RL", icon: ASSETS.icons.knowledge },
  { id: "notifications", label: "Notificacoes", short: "NT", icon: ASSETS.icons.vision },
  { id: "diplomacy", label: "Diplomacia", short: "DP", icon: ASSETS.icons.diplomacy },
  { id: "inventory", label: "Inventario", short: "IV", icon: ASSETS.icons.defense },
];

export default function LeftActionBar({ onOpen, onEndDay }: Props) {
  return (
    <nav className="left-action-bar" aria-label="Acoes principais">
      {buttons.map((button) => (
        <button key={button.id} className="left-action-button" title={button.label} onClick={() => onOpen(button.id)}>
          <img alt="" src={button.icon} />
          <span>{button.short}</span>
        </button>
      ))}
      <button className="left-action-button end-day" title="Encerrar dia" onClick={onEndDay}>
        <img alt="" src={ASSETS.icons.day} />
        <span>Fim</span>
      </button>
    </nav>
  );
}

export type { ModalId };
