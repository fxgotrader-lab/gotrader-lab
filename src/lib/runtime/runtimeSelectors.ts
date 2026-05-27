import type { ResearchRuntimeSnapshot } from "@/lib/runtime/researchRuntimeTypes";
import type { MetricSourceType } from "@/lib/runtime/researchRuntimeTypes";

export const selectRuntimeSourceLabel = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.marketData.sourceLabel ?? "Runtime snapshot not loaded";

export const selectRuntimeMetricSourceLabel = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot?.performance.canonicalPerformanceMetrics?.metricSourceLabel ?? "No completed research cycle";

const provenanceFor = (snapshot?: ResearchRuntimeSnapshot, source: MetricSourceType = "latest_cycle") => {
  if (!snapshot) {
    return undefined;
  }
  if (source === "proposal_snapshot") {
    return snapshot.metricProvenance.proposalSnapshot;
  }
  if (source === "active_baseline") {
    return snapshot.metricProvenance.activeBaseline;
  }
  return snapshot.metricProvenance.latestCycle ?? snapshot.metricProvenance.activeBaseline;
};

export const selectRuntimeFingerprintLabel = (snapshot?: ResearchRuntimeSnapshot, source: MetricSourceType = "latest_cycle") =>
  provenanceFor(snapshot, source)?.fingerprint.compactLabel ?? "Fingerprint pending";

export const selectRuntimeProvenanceRows = (snapshot?: ResearchRuntimeSnapshot, source: MetricSourceType = "latest_cycle") =>
  provenanceFor(snapshot, source)?.rows ?? [];

export const selectRuntimeProvenanceWarnings = (snapshot?: ResearchRuntimeSnapshot, source: MetricSourceType = "latest_cycle") => [
  ...(snapshot?.metricProvenance.mismatchWarnings ?? []),
  ...(provenanceFor(snapshot, source)?.mismatchWarnings ?? [])
];

export const selectRuntimeDataBadge = (snapshot?: ResearchRuntimeSnapshot) => {
  if (!snapshot) {
    return "Snapshot loading";
  }
  return snapshot.marketData.isImportedDataActive ? "Imported data active" : "Mock data active";
};

export const selectRuntimeEvidenceLabel = (snapshot?: ResearchRuntimeSnapshot) =>
  snapshot
    ? `Evidence ${snapshot.evidence.evidenceQualityScore}/100 / real coverage ${snapshot.evidence.evidenceLedgerSummary.realEvidenceCoverage}%`
    : "Evidence snapshot loading";

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
  ...(snapshot?.diagnostics.mismatchWarnings ?? []),
  ...(snapshot?.metricProvenance.mismatchWarnings ?? []),
  ...(snapshot?.evidence.readinessEvidenceWarnings ?? [])
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
