import type { ResearchRuntimeSnapshot } from "@/lib/runtime/researchRuntimeTypes";

export const selectRuntimeSourceLabel = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.marketData.sourceLabel ?? "Runtime snapshot not loaded";

export const selectRuntimeMetricSourceLabel = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.performance.canonicalPerformanceMetrics?.metricSourceLabel ?? "No completed research cycle";

export const selectRuntimeDataBadge = (snapshot?: ResearchRuntimeSnapshot) => {
  if (!snapshot) {
    return "Snapshot loading";
  }
  return snapshot.marketData.isImportedDataActive ? "Imported data active" : "Mock data active";
};

export const selectRuntimeConfigSummary = (snapshot?: ResearchRuntimeSnapshot) => {
  if (!snapshot) {
    return "Runtime config loading";
  }
  const config = snapshot.activeConfig.resolvedBacktestConfig;
  return [
    `${config.symbol} ${config.timeframe}`,
    `ICT >= ${(snapshot.activeConfig.resolvedConfluenceThreshold * 100).toFixed(0)}%`,
    `confidence >= ${(config.minimumConfidenceThreshold * 100).toFixed(0)}%`,
    config.sessionFilter,
    config.stopModel
  ].join(" / ");
};

export const selectRuntimeReadinessBlockers = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.readiness.actualBlockers ?? [];

export const selectRuntimePassedRequirements = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.readiness.passedRequirements ?? [];

export const selectRuntimeWarnings = (snapshot?: ResearchRuntimeSnapshot) => [
  ...(snapshot?.readiness.warnings ?? []),
  ...(snapshot?.diagnostics.staleStateWarnings ?? []),
  ...(snapshot?.diagnostics.mismatchWarnings ?? [])
];

export const selectRuntimeSnapshotHealth = (snapshot?: ResearchRuntimeSnapshot) => {
  if (!snapshot) {
    return "loading";
  }
  if (snapshot.diagnostics.mismatchWarnings.length || snapshot.diagnostics.staleStateWarnings.length) {
    return "warnings";
  }
  return "ok";
};

export const selectRuntimeNextAction = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.readiness.nextAction ?? "Run AI Research Cycle to generate runtime evidence.";
