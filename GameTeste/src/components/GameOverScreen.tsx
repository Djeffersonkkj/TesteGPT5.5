import type { GameOverInfo } from "../game/types";

interface Props {
  info: GameOverInfo;
  onRestart: () => void;
}

export default function GameOverScreen({ info, onRestart }: Props) {
  return (
    <main className="game-over-screen">
      <section className={`game-over-card ${info.won ? "won" : "lost"}`}>
        <p className="eyebrow">{info.won ? "vitória" : "fim da campanha"}</p>
        <h1>{info.title}</h1>
        <p>{info.narrative}</p>
        <strong className="score">Pontuação: {info.score}</strong>
        <div className="final-lines">
          {info.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <button className="primary-button" onClick={onRestart}>
          Nova campanha
        </button>
      </section>
    </main>
  );
}
