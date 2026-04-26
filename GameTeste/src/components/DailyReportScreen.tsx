import type { DailyReport } from "../game/types";

interface Props {
  report: DailyReport;
  currentDay: number;
  onContinue: () => void;
}

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="report-block">
      <h2>{title}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function DailyReportScreen({ report, currentDay, onContinue }: Props) {
  return (
    <main className="report-screen">
      <section className="report-card">
        <p className="eyebrow">relatório diário</p>
        <h1>{report.title}</h1>
        <p className="report-subtitle">
          {report.day === 0 ? "Antes do primeiro dia" : `Depois do dia ${report.day}`} · próximo dia:{" "}
          {currentDay}
        </p>

        <div className="report-grid">
          <ReportBlock title="Confirmado" items={report.confirmed} />
          <ReportBlock title="Rumores" items={report.rumors} />
          <ReportBlock title="Suspeitas" items={report.suspicions} />
          <ReportBlock title="Reacoes da Tribo" items={report.tribeReactions ?? []} />
          <ReportBlock title="Diplomacia" items={report.diplomacy ?? []} />
          <ReportBlock title="Eventos de Area" items={report.areaEvents ?? []} />
          <ReportBlock title="Perdas e Ganhos" items={report.gainsAndLosses ?? []} />
          <ReportBlock title="Fome" items={report.hungerSummary} />
          <ReportBlock title="Mortes e feridos" items={report.casualtySummary} />
          <ReportBlock title="Relacoes" items={report.relationsSummary} />
        </div>

        <button className="primary-button report-button" onClick={onContinue}>
          Li o relatório, começar o dia
        </button>
      </section>
    </main>
  );
}
