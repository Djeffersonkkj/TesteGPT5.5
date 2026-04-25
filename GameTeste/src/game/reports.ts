import type { DailyReport } from "./types";

export function createReport(day: number, title = `Relatório do Dia ${day}`): DailyReport {
  return {
    day,
    title,
    confirmed: [],
    rumors: [],
    suspicions: [],
    hungerSummary: [],
    casualtySummary: [],
    relationsSummary: [],
  };
}

export function ensureReportHasContent(report: DailyReport): DailyReport {
  if (report.confirmed.length === 0) {
    report.confirmed.push("Nenhum fato importante foi confirmado pelos vigias.");
  }
  if (report.rumors.length === 0) {
    report.rumors.push("Os peregrinos não trouxeram notícias confiáveis hoje.");
  }
  if (report.suspicions.length === 0) {
    report.suspicions.push("Nenhuma suspeita forte apareceu durante a noite.");
  }
  if (report.hungerSummary.length === 0) {
    report.hungerSummary.push("O estoque foi dividido sem incidentes graves.");
  }
  if (report.casualtySummary.length === 0) {
    report.casualtySummary.push("Ninguém morreu no período registrado.");
  }
  if (report.relationsSummary.length === 0) {
    report.relationsSummary.push("As relações entre as facções permaneceram instáveis, mas sem virada clara.");
  }
  return report;
}
