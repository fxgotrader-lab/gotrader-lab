import type {
  CalibrationComparisonResult,
  CalibrationProposal,
  CalibrationProposalMetrics,
  CalibrationProposalMetricsSnapshot
} from "@/lib/selfImprovement/selfImprovementTypes";

export interface ProposalMetricsSnapshotContext {
  sourceCycleId?: string;
  sourceCandidateId?: string;
  beforeMetricsSource?: string;
  afterMetricsSource?: string;
  beforeSourceCycleId?: string;
  afterSourceCandidateId?: string;
  generatedAt?: string;
  dataSource?: string;
  candleWindow?: string;
  searchMode?: string;
  activeCalibrationIdUsed?: string;
}

const metricKeys: Array<keyof CalibrationProposalMetrics> = [
  "totalTrades",
  "winRate",
  "averageR",
  "maxDrawdown",
  "profitFactor",
  "skippedSignals",
  "falsePositiveCount",
  "confidenceCalibration",
  "readinessScore",
  "readinessStatus",
  "stabilityScore",
  "conservativeScenarioStable"
];

const cloneMetrics = (metrics: CalibrationProposalMetrics): CalibrationProposalMetrics => ({ ...metrics });

const cloneComparison = (comparison?: CalibrationComparisonResult): CalibrationComparisonResult | undefined =>
  comparison
    ? {
        ...comparison,
        positiveChanges: [...comparison.positiveChanges],
        negativeChanges: [...comparison.negativeChanges],
        neutralChanges: [...comparison.neutralChanges],
        improvedMetrics: [...comparison.improvedMetrics],
        worsenedMetrics: [...comparison.worsenedMetrics],
        criticalRegressions: [...comparison.criticalRegressions],
        sanityWarnings: [...comparison.sanityWarnings]
      }
    : undefined;

const valuesEqual = (left: unknown, right: unknown) => {
  if (typeof left === "number" && typeof right === "number") {
    if (Number.isNaN(left) && Number.isNaN(right)) {
      return true;
    }
    return Math.abs(left - right) < 0.000001;
  }
  return left === right;
};

const valueImproved = (before: number | null, after: number | null, direction: "higher" | "lower") => {
  if (typeof before !== "number" || typeof after !== "number" || !Number.isFinite(before) || !Number.isFinite(after)) {
    return false;
  }
  return direction === "higher" ? after > before + 0.000001 : after < before - 0.000001;
};

export const materialMetricsChanged = (
  before?: CalibrationProposalMetrics,
  after?: CalibrationProposalMetrics
) => {
  if (!before || !after) {
    return false;
  }
  return metricKeys.some((key) => !valuesEqual(before[key], after[key]));
};

export const noMaterialMetricsChanged = (
  before?: CalibrationProposalMetrics,
  after?: CalibrationProposalMetrics
) => Boolean(before && after && !materialMetricsChanged(before, after));

export const materialImprovementKeys = (
  before?: CalibrationProposalMetrics,
  after?: CalibrationProposalMetrics
) => {
  if (!before || !after) {
    return [];
  }
  return [
    valueImproved(before.winRate, after.winRate, "higher") ? "winRate" : undefined,
    valueImproved(before.averageR, after.averageR, "higher") ? "averageR" : undefined,
    valueImproved(before.maxDrawdown, after.maxDrawdown, "lower") ? "maxDrawdownR" : undefined,
    after.falsePositiveCount < before.falsePositiveCount ? "falsePositiveCount" : undefined,
    valueImproved(before.confidenceCalibration, after.confidenceCalibration, "higher") ? "confidenceCalibration" : undefined,
    after.readinessScore > before.readinessScore ? "readinessScore" : undefined,
    after.stabilityScore > before.stabilityScore ? "stabilityScore" : undefined,
    valueImproved(before.profitFactor, after.profitFactor, "higher") ? "profitFactor" : undefined
  ].filter((key): key is string => Boolean(key));
};

export const hasMaterialImprovement = (
  before?: CalibrationProposalMetrics,
  after?: CalibrationProposalMetrics
) => materialImprovementKeys(before, after).some((key) => key !== "profitFactor");

export const isProfitFactorOnlyImprovement = (
  before?: CalibrationProposalMetrics,
  after?: CalibrationProposalMetrics
) => {
  const keys = materialImprovementKeys(before, after);
  return keys.length === 1 && keys[0] === "profitFactor";
};

const noOpComparison = (comparison: CalibrationComparisonResult | undefined): CalibrationComparisonResult => ({
  improved: false,
  stabilityImproved: false,
  recommendation: "reject",
  summary: "This proposal does not materially change the baseline.",
  positiveChanges: [],
  negativeChanges: [],
  neutralChanges: [
    "No material before/after metric change was detected."
  ],
  improvedMetrics: [],
  worsenedMetrics: [],
  criticalRegressions: [
    "This proposal does not materially change the baseline."
  ],
  sanityWarnings: [
    "No-op proposal snapshot: before and after metrics are identical within tolerance."
  ],
  promotionVerdict: "no_material_change",
  followUpSearchDirection:
    comparison?.promotionVerdict === "no_material_change"
      ? comparison.followUpSearchDirection
      : "Run a different candidate search focused on win rate, average R, drawdown, session filter, or stop model."
});

export const noMaterialPositiveImprovementComparison = (
  comparison: CalibrationComparisonResult | undefined
): CalibrationComparisonResult => ({
  ...(comparison ?? {
    positiveChanges: [],
    negativeChanges: [],
    neutralChanges: [],
    improvedMetrics: [],
    worsenedMetrics: [],
    criticalRegressions: [],
    sanityWarnings: []
  }),
  improved: false,
  stabilityImproved: false,
  recommendation: "reject",
  summary: "This proposal does not improve the baseline.",
  criticalRegressions: [
    ...new Set([
      ...(comparison?.criticalRegressions ?? []),
      "This proposal does not improve the baseline."
    ])
  ],
  promotionVerdict: "reject",
  followUpSearchDirection: "Run a different candidate search focused on win rate, average R, drawdown, session filter, or stop model."
});

export function createProposalMetricsSnapshot(
  proposal: CalibrationProposal,
  context: ProposalMetricsSnapshotContext = {}
): CalibrationProposalMetricsSnapshot {
  const comparisonResult = noMaterialMetricsChanged(proposal.beforeMetrics, proposal.afterMetrics)
    ? noOpComparison(proposal.comparisonResult)
    : cloneComparison(proposal.comparisonResult);
  return {
    proposalId: proposal.proposalId,
    sourceCycleId: context.sourceCycleId ?? proposal.metricsSnapshot?.sourceCycleId,
    sourceCandidateId: context.sourceCandidateId ?? proposal.sourceCandidateId ?? proposal.metricsSnapshot?.sourceCandidateId,
    beforeMetricsSource:
      context.beforeMetricsSource ?? proposal.metricsSnapshot?.beforeMetricsSource ?? "baseline metrics before candidate change",
    afterMetricsSource:
      context.afterMetricsSource ?? proposal.metricsSnapshot?.afterMetricsSource ?? (proposal.afterMetrics ? "tested candidate metrics" : "not tested"),
    beforeSourceCycleId: context.beforeSourceCycleId ?? proposal.metricsSnapshot?.beforeSourceCycleId ?? context.sourceCycleId,
    afterSourceCandidateId:
      context.afterSourceCandidateId ??
      proposal.metricsSnapshot?.afterSourceCandidateId ??
      context.sourceCandidateId ??
      proposal.sourceCandidateId,
    beforeMetrics: cloneMetrics(proposal.beforeMetrics),
    afterMetrics: proposal.afterMetrics ? cloneMetrics(proposal.afterMetrics) : undefined,
    comparisonResult,
    generatedAt: context.generatedAt ?? proposal.metricsSnapshot?.generatedAt ?? proposal.timestamp ?? new Date().toISOString(),
    dataSource: context.dataSource ?? proposal.metricsSnapshot?.dataSource,
    candleWindow: context.candleWindow ?? proposal.metricsSnapshot?.candleWindow,
    searchMode: context.searchMode ?? proposal.metricsSnapshot?.searchMode,
    activeCalibrationIdUsed: context.activeCalibrationIdUsed ?? proposal.metricsSnapshot?.activeCalibrationIdUsed
  };
}

export function attachProposalMetricsSnapshot(
  proposal: CalibrationProposal,
  context: ProposalMetricsSnapshotContext = {}
): CalibrationProposal {
  const metricsSnapshot = createProposalMetricsSnapshot(proposal, context);
  return {
    ...proposal,
    comparisonResult: metricsSnapshot.comparisonResult ?? proposal.comparisonResult,
    metricsSnapshot
  };
}

export function proposalSnapshotMismatchReasons(proposal?: CalibrationProposal): string[] {
  if (!proposal) {
    return [];
  }

  const reasons: string[] = [];
  const snapshot = proposal.metricsSnapshot;
  const candidateBackedProposal = Boolean(proposal.sourceCandidateId || proposal.recoveryCandidateId);

  if (!snapshot) {
    if (candidateBackedProposal) {
      reasons.push("Canonical proposal metrics snapshot is missing.");
    }
    return reasons;
  }

  if (snapshot.proposalId !== proposal.proposalId) {
    reasons.push("Canonical proposal metrics snapshot belongs to a different proposal ID.");
  }
  if (proposal.sourceCandidateId && snapshot.sourceCandidateId && snapshot.sourceCandidateId !== proposal.sourceCandidateId) {
    reasons.push("Canonical proposal metrics snapshot points to a different source candidate.");
  }

  metricKeys.forEach((key) => {
    if (!valuesEqual(snapshot.beforeMetrics[key], proposal.beforeMetrics[key])) {
      reasons.push(`Canonical beforeMetrics.${String(key)} does not match the proposal.`);
    }
    if (snapshot.afterMetrics && proposal.afterMetrics && !valuesEqual(snapshot.afterMetrics[key], proposal.afterMetrics[key])) {
      reasons.push(`Canonical afterMetrics.${String(key)} does not match the proposal.`);
    }
  });

  if (snapshot.comparisonResult && proposal.comparisonResult) {
    if (snapshot.comparisonResult.promotionVerdict !== proposal.comparisonResult.promotionVerdict) {
      reasons.push("Canonical comparison verdict does not match the proposal.");
    }
    if (snapshot.comparisonResult.recommendation !== proposal.comparisonResult.recommendation) {
      reasons.push("Canonical comparison recommendation does not match the proposal.");
    }
  }

  const candidateReportedImprovement = Boolean(
    proposal.comparisonResult?.improved ||
      proposal.comparisonResult?.stabilityImproved ||
      snapshot.comparisonResult?.improved ||
      snapshot.comparisonResult?.stabilityImproved ||
      (typeof proposal.candidateStabilityScore === "number" &&
        typeof proposal.baselineStabilityScore === "number" &&
        proposal.candidateStabilityScore > proposal.baselineStabilityScore)
  );

  if (
    candidateReportedImprovement &&
      !materialMetricsChanged(snapshot.beforeMetrics, snapshot.afterMetrics)
  ) {
    reasons.push("Metric mismatch detected: candidate summary and proposal snapshot disagree.");
  }

  if (snapshot.afterMetrics && noMaterialMetricsChanged(snapshot.beforeMetrics, snapshot.afterMetrics)) {
    reasons.push("This proposal does not materially change the baseline.");
  }

  return [...new Set(reasons)];
}

export function hasMaterialProposalMetricChange(proposal?: CalibrationProposal): boolean {
  if (!proposal) {
    return false;
  }
  const snapshot = proposal.metricsSnapshot;
  const before = snapshot?.beforeMetrics ?? proposal.beforeMetrics;
  const after = snapshot?.afterMetrics ?? proposal.afterMetrics;
  const tradeGenerationImproved =
    typeof proposal.tradesBeforeRecovery === "number" &&
    typeof proposal.tradesAfterRecovery === "number" &&
    proposal.tradesAfterRecovery > proposal.tradesBeforeRecovery;
  return Boolean(
    tradeGenerationImproved ||
      materialMetricsChanged(before, after)
  );
}

export function isNoOpProposalSnapshot(proposal?: CalibrationProposal): boolean {
  if (!proposal) {
    return false;
  }
  const snapshot = proposal.metricsSnapshot;
  const before = snapshot?.beforeMetrics ?? proposal.beforeMetrics;
  const after = snapshot?.afterMetrics ?? proposal.afterMetrics;
  return noMaterialMetricsChanged(before, after);
}

export function effectiveProposalComparison(proposal?: CalibrationProposal): CalibrationComparisonResult | undefined {
  if (!proposal) {
    return undefined;
  }
  const snapshot = proposal.metricsSnapshot;
  const before = snapshot?.beforeMetrics ?? proposal.beforeMetrics;
  const after = snapshot?.afterMetrics ?? proposal.afterMetrics;
  const comparison = snapshot?.comparisonResult ?? proposal.comparisonResult;
  if (noMaterialMetricsChanged(before, after)) {
    return noOpComparison(comparison);
  }
  if (after && !hasMaterialImprovement(before, after)) {
    return noMaterialPositiveImprovementComparison(comparison);
  }
  return comparison;
}

export const isNoOpComparison = (comparison?: CalibrationComparisonResult) =>
  comparison?.promotionVerdict === "no_material_change";
