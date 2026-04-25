import type { ReactNode } from "react";

interface Props {
  topBar: ReactNode;
  leftBar: ReactNode;
  map: ReactNode;
  infoPanel: ReactNode;
  notifications: ReactNode;
  modal?: ReactNode;
  overlay?: ReactNode;
}

export default function GameLayout({
  topBar,
  leftBar,
  map,
  infoPanel,
  notifications,
  modal,
  overlay,
}: Props) {
  return (
    <main className="game-shell">
      <div className="strategy-frame">
        <header className="strategy-topbar">{topBar}</header>
        <aside className="strategy-leftbar">{leftBar}</aside>
        <section className="strategy-map-area">{map}</section>
        <aside className="strategy-info-panel">{infoPanel}</aside>
        <section className="strategy-alerts">{notifications}</section>
      </div>
      {modal}
      {overlay}
    </main>
  );
}
