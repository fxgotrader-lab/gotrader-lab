import { PAPER_DEMO_AUTHORITY, PAPER_DEMO_SAFETY_NOTICE, type PaperDemoOperationsState, type PaperDemoReport } from "./paperDemoTypes";
import { latestPaperDemoDailyChecklist } from "./paperDemoStore";

export function buildPaperDemoReport(state: PaperDemoOperationsState): PaperDemoReport {
  const checklist = latestPaperDemoDailyChecklist(state);
  const completed = checklist.items.filter((item) => item.completed).length;
  const candidates = state.candidates.filter((candidate) => candidate.status !== "draft").map((candidate) => ({
    candidateId: candidate.id,
    addedAt: candidate.createdAt,
    setupName: candidate.setupName,
    requestedSymbol: candidate.requestedSymbol,
    brokerSymbol: candidate.brokerSymbol,
    timeframe: candidate.timeframe,
    recognitionType: String(candidate.recognitionType),
    validationStatus: `${candidate.replayStatus} / ${candidate.walkForwardStatus}`,
    evidenceStatus: String(candidate.evidenceStatus),
    maturityStatus: String(candidate.maturityStatus),
    blockers: candidate.blockers.slice(0, 8),
    nextAction: candidate.nextAction,
    operatorNotes: candidate.operatorNotes.slice(0, 5),
    status: candidate.status,
    authority: PAPER_DEMO_AUTHORITY
  }));

  return {
    generatedAt: new Date().toISOString(),
    candidateCount: state.candidates.length,
    watchlistCount: state.candidates.filter((candidate) => candidate.status === "watchlist").length,
    monitoringCount: state.candidates.filter((candidate) => candidate.status === "monitoring").length,
    blockedCount: state.candidates.filter((candidate) => candidate.status === "blocked").length,
    retiredCount: state.candidates.filter((candidate) => candidate.status === "retired").length,
    checklistStatus: {
      date: checklist.date,
      completed,
      total: checklist.items.length
    },
    candidates,
    journalEntries: state.journalEntries.slice(0, 20).map((entry) => ({
      ...entry,
      researchOnly: true,
      authority: PAPER_DEMO_AUTHORITY
    })),
    blockers: [...new Set(state.candidates.flatMap((candidate) => candidate.blockers))].slice(0, 12),
    evidenceMaturitySummary: state.candidates
      .slice(0, 12)
      .map((candidate) => `${candidate.setupName}: evidence ${candidate.evidenceStatus}; maturity ${candidate.maturityStatus}`),
    authority: PAPER_DEMO_AUTHORITY,
    safetyNotice: PAPER_DEMO_SAFETY_NOTICE
  };
}

export function formatPaperDemoReport(report: PaperDemoReport): string {
  return [
    "Paper-Demo Operations Report",
    `Generated: ${report.generatedAt}`,
    `Candidates: ${report.candidateCount} total / ${report.watchlistCount} watchlist / ${report.monitoringCount} monitoring / ${report.blockedCount} blocked`,
    `Daily checklist: ${report.checklistStatus.completed}/${report.checklistStatus.total} complete for ${report.checklistStatus.date}`,
    `Authority: ${report.authority.executionAuthority}/${report.authority.brokerAuthority}/${report.authority.readinessOverrideAuthority}`,
    report.safetyNotice,
    "",
    "Blockers:",
    ...(report.blockers.length ? report.blockers.map((blocker) => `- ${blocker}`) : ["- none recorded"]),
    "",
    "Candidates:",
    ...(report.candidates.length
      ? report.candidates.map(
          (candidate) =>
            `- ${candidate.setupName} (${candidate.requestedSymbol}/${candidate.timeframe}) ${candidate.status}; next: ${candidate.nextAction}`
        )
      : ["- none saved"]),
    "",
    "Journal:",
    ...(report.journalEntries.length
      ? report.journalEntries.map((entry) => `- ${entry.createdAt} ${entry.symbol}: ${entry.observation}`)
      : ["- none saved"])
  ].join("\n");
}
