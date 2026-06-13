import type { StrategyDefinition, StrategyEvidenceSummary, StrategyIntakeRecord } from "./strategyLibraryTypes";

const pct = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a");

export function summarizeStrategyEvidence(summary?: StrategyEvidenceSummary): string {
  if (!summary) return "No compact evidence summary supplied.";
  return [
    `${summary.sampleCount ?? 0} samples`,
    `${summary.uniqueTradingDates ?? 0} dates`,
    `${summary.activeRollingWindows ?? 0} active windows`,
    `target-first ${pct(summary.targetFirstRate)}`,
    `invalidation-first ${pct(summary.invalidationFirstRate)}`
  ].join("; ");
}

export function strategyEvidenceStatus(definition: StrategyDefinition, intake?: StrategyIntakeRecord) {
  if (definition.id === "market_map_only_diagnostic_v1") return "diagnostic_only";
  if (!intake?.evidenceSummary) return "evidence_not_started";
  if ((intake.evidenceSummary.sampleCount ?? 0) < 20) return "sample_building";
  if ((intake.evidenceSummary.uniqueTradingDates ?? 0) < 3) return "needs_independent_dates";
  if (/overfit_risk|unstable/i.test(intake.evidenceSummary.robustnessClassification ?? "")) return "blocked_by_robustness";
  return "evidence_ready_for_review";
}

export const assertStrategyEvidenceIsCompact = (summary?: StrategyEvidenceSummary) => {
  const serialized = JSON.stringify(summary ?? {});
  return {
    ok: !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:|"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:/i.test(serialized),
    serializedBytes: serialized.length
  };
};
