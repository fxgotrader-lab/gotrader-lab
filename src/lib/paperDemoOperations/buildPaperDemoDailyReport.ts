import { PAPER_DEMO_AUTHORITY, type PaperDemoOperationsState } from "./paperDemoTypes";
import { buildPaperDemoReport } from "./paperDemoReport";
import { latestPaperDemoDailyChecklist } from "./paperDemoStore";
import type { AutoPaperDemoCycleResult, AutoPaperDemoDailyReport } from "./autoPaperDemoCycleTypes";

const compact = (value?: string) => (value?.trim() ? value : "unknown");

export function buildPaperDemoDailyReport({
  cycle,
  state
}: {
  cycle: AutoPaperDemoCycleResult;
  state: PaperDemoOperationsState;
}): AutoPaperDemoDailyReport {
  const checklist = latestPaperDemoDailyChecklist(state);
  const paperDemoReport = buildPaperDemoReport(state);
  const sourceStatus = cycle.sourceStatus ?? {
    sourceProvider: "unavailable",
    sourceStatus: "unavailable",
    requestedSymbol: "MNQ",
    primaryTimeframe: "5m",
    candleCount: 0,
    sourceFingerprint: "no fingerprint"
  };
  const validationChanges = [
    cycle.validationChainId ? `Validation chain ${cycle.validationChainId}` : "No validation chain entry created.",
    cycle.replaySummary ? `Replay ${cycle.replaySummary.verdict}: ${cycle.replaySummary.reason}` : "Replay not completed.",
    cycle.walkForwardSummary
      ? `Walk-forward ${cycle.walkForwardSummary.verdict}: ${cycle.walkForwardSummary.reason}`
      : "Walk-forward not completed."
  ];

  return {
    reportId: `auto_paper_demo_daily_${cycle.completedAt.replace(/[^0-9a-z]/gi, "")}`,
    date: cycle.completedAt.slice(0, 10),
    generatedAt: cycle.completedAt,
    sourceStatus,
    recognizedSetups: cycle.recognitionSummary ? [cycle.recognitionSummary] : [],
    validationChainChanges: validationChanges,
    replayStatus: cycle.replaySummary?.verdict ?? "not_run",
    walkForwardStatus: cycle.walkForwardSummary?.verdict ?? "not_run",
    evidenceMaturityStatus: cycle.evidenceMaturitySummary
      ? `evidence ${compact(String(cycle.evidenceMaturitySummary.evidenceQualityScore))}; maturity ${compact(
          String(cycle.evidenceMaturitySummary.maturityScore)
        )}`
      : "not_updated",
    watchlistChanges: cycle.watchlistCandidateId
      ? [`Created/updated Paper-Demo watchlist candidate ${cycle.watchlistCandidateId}.`]
      : ["No Paper-Demo watchlist candidate created."],
    checklistStatus: {
      date: checklist.date,
      completed: checklist.items.filter((item) => item.completed).length,
      total: checklist.items.length
    },
    journalSummary: paperDemoReport.journalEntries
      .slice(0, 5)
      .map((entry) => `${entry.symbol}: ${entry.observation}`),
    blockers: cycle.blockers.slice(0, 12),
    nextRecommendedResearchAction: cycle.nextAction,
    authority: PAPER_DEMO_AUTHORITY,
    disclaimer: "Research-only manual paper-demo operations. No broker execution."
  };
}
