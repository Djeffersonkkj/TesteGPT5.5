import type { DailyReport } from "./types";

export function createReport(day: number, title = `Relatório do Dia ${day}`): DailyReport {
  return {
    day,
    title,
    confirmed: [],
    rumors: [],
    suspicions: [],
    tribeReactions: [],
    diplomacy: [],
    areaEvents: [],
    gainsAndLosses: [],
    hungerSummary: [],
    casualtySummary: [],
    relationsSummary: [],
  };
}

export function generateDailyReport(day: number, title?: string): DailyReport {
  return createReport(day, title);
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
  report.tribeReactions ??= [];
  report.diplomacy ??= [];
  report.areaEvents ??= [];
  report.gainsAndLosses ??= [];
  if (report.tribeReactions.length === 0) {
    report.tribeReactions.push("A tribo absorveu os acontecimentos sem uma divisao clara.");
  }
  if (report.diplomacy.length === 0) {
    report.diplomacy.push("Nenhuma proposta diplomatica importante mudou de maos.");
  }
  if (report.areaEvents.length === 0) {
    report.areaEvents.push("Nenhuma area teve virada territorial confirmada.");
  }
  if (report.gainsAndLosses.length === 0) {
    report.gainsAndLosses.push("Sem perdas ou ganhos extraordinarios alem da rotina.");
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
