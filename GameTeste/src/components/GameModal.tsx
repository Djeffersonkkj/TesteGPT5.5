import type { ReactNode } from "react";

interface Props {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export default function GameModal({ title, eyebrow, children, onClose, wide = false }: Props) {
  return (
    <div className="modal-backdrop game-modal-backdrop" onClick={onClose}>
      <section
        aria-modal="true"
        className={`game-modal ${wide ? "wide" : ""}`}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-title-row">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            x
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}
