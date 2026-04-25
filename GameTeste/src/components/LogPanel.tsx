interface Props {
  logs: string[];
}

export default function LogPanel({ logs }: Props) {
  return (
    <section className="panel log-panel">
      <p className="eyebrow">logs recentes</p>
      <div className="log-list">
        {logs.map((log, index) => (
          <span key={`${log}-${index}`}>{log}</span>
        ))}
      </div>
    </section>
  );
}
