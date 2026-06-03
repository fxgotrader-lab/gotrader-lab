import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type {
  GrinchCalibrationCandidateFamily,
  GrinchProfileCalibrationReport,
  GrinchProfileCalibrationRow
} from "@/lib/strategyLibrary/grinchProfileDiagnostics";
import type {
  CalibrationProposal,
  CalibrationProposalIntentDetails,
  CalibrationProposalMetrics,
  CalibrationProposalValidationRequirement
} from "@/lib/selfImprovement/selfImprovementTypes";
import { uid } from "@/lib/utils";

export interface GrinchCalibrationSourceContext {
  provider?: string;
  dataSourceLabel?: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  candleCount?: number;
  regimeLabel?: string;
  regimeDataQuality?: string;
}

const familyTitle: Record<GrinchCalibrationCandidateFamily, string> = {
  model_1_timing_recheck: "Model 1 Timing Recheck",
  reversal_expansion_confirmation: "Reversal Expansion Confirmation",
  consolidation_range_tightness: "Consolidation Range Tightness",
  liquidity_raid_detection: "Liquidity Raid Detection",
  timing_window_sensitivity: "Timing Window Sensitivity",
  pd_array_alignment_review: "PD Array Alignment Review"
};

export const grinchCalibrationRequiredValidationSteps: CalibrationProposalValidationRequirement[] = [
  {
    requirementId: "ai_research_cycle",
    label: "AI Research Cycle",
    status: "required",
    detail: "Run a fresh deterministic AI Research Cycle after turning this intent into a concrete research candidate."
  },
  {
    requirementId: "walk_forward",
    label: "Walk-forward",
    status: "required",
    detail: "Walk-forward validation must pass or provide enough evidence before any calibration can be approved."
  },
  {
    requirementId: "evidence_quality",
    label: "Evidence quality check",
    status: "required",
    detail: "Evidence quality must confirm the candidate is not built from weak or missing Grinch evidence."
  },
  {
    requirementId: "maturity_check",
    label: "Maturity check",
    status: "required",
    detail: "Research maturity must remain sufficient after targeted candidate testing."
  },
  {
    requirementId: "regime_consistency",
    label: "Regime consistency",
    status: "required",
    detail: "Results must hold inside the matching regime segment before this can become a calibration patch."
  }
];

export const selectBestGrinchCalibrationRow = (
  report: GrinchProfileCalibrationReport
): GrinchProfileCalibrationRow | undefined =>
  report.rows
    .slice()
    .sort((left, right) => right.nearMissScore - left.nearMissScore || right.candidateCount - left.candidateCount)[0];

export function buildGrinchCalibrationProposalIntentDetails({
  report,
  sourceContext
}: {
  report: GrinchProfileCalibrationReport;
  sourceContext?: GrinchCalibrationSourceContext;
}): CalibrationProposalIntentDetails {
  const bestRow = selectBestGrinchCalibrationRow(report);
  const candidateFamily = bestRow?.recommendedCalibrationFamily ?? report.recommendedFirstFamily;
  const title = familyTitle[candidateFamily] ?? candidateFamily.replace(/_/g, " ");
  const nearMissText = typeof bestRow?.nearMissScore === "number" ? `${bestRow.nearMissScore}/100` : "unknown";
  const profileText = bestRow?.label ?? candidateFamily.replace(/_/g, " ");

  return {
    title,
    targetSubsystem: "Grinch profile selector",
    candidateFamily,
    reason: `${profileText} has the strongest near-miss score (${nearMissText}); use ${candidateFamily.replace(/_/g, " ")} as the first controlled research family.`,
    draftOnly: true,
    autoApplyAllowed: false,
    nearMissScore: bestRow?.nearMissScore,
    sourceProfile: bestRow?.label,
    firstFailedGate: bestRow?.firstFailedGate,
    sourceReportTitle: report.title,
    sourceReportFinding: report.primaryFinding,
    sourceContext,
    requiredValidationSteps: grinchCalibrationRequiredValidationSteps
  };
}

export function calibrationMetricsFromCanonicalPerformance(
  metrics: CanonicalPerformanceMetrics
): CalibrationProposalMetrics {
  return {
    validationId: metrics.sourceCycleId,
    validationTimestamp: metrics.generatedAt,
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
    averageR: metrics.averageR,
    maxDrawdown: metrics.maxDrawdownR,
    profitFactor: metrics.profitFactor,
    skippedSignals: metrics.skippedSignals,
    falsePositiveCount: metrics.falsePositiveCount,
    confidenceCalibration: metrics.confidenceCalibration,
    readinessScore: metrics.readinessScore,
    readinessStatus: metrics.readinessScore >= 62 ? "green" : metrics.readinessScore >= 45 ? "yellow" : "red",
    stabilityScore: metrics.stabilityScore,
    conservativeScenarioStable: false,
    strongestScenario: metrics.metricSourceLabel,
    weakestScenario: "Grinch profile selector near-miss"
  };
}

export function createGrinchCalibrationDraftProposal({
  baselineConfig,
  beforeMetrics,
  report,
  sourceContext
}: {
  baselineConfig: ResolvedBacktestConfig;
  beforeMetrics: CalibrationProposalMetrics;
  report: GrinchProfileCalibrationReport;
  sourceContext?: GrinchCalibrationSourceContext;
}): CalibrationProposal {
  const intentDetails = buildGrinchCalibrationProposalIntentDetails({ report, sourceContext });

  return {
    proposalId: uid("grinch_calibration_intent"),
    timestamp: new Date().toISOString(),
    source: "internal",
    status: "proposed",
    proposalIntent: "grinch_profile_calibration_intent",
    mode: "simulation",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    reason: intentDetails.reason,
    targetProblem: "trade_generation_blocked",
    proposedChanges: {},
    expectedImprovement:
      "Create a controlled research candidate from the strongest Grinch near-miss family. This draft does not change thresholds, timing windows, profile gates, or trading logic.",
    safetyNotes: [
      "Draft proposal only.",
      "No thresholds, timing windows, profile gates, or trading logic are changed by this intent.",
      "Auto-apply is blocked; manual research validation is required before any concrete calibration patch can exist.",
      "AI Research Cycle, walk-forward, evidence quality, maturity, and regime consistency checks are required.",
      "No broker, execution, live mode, demo mode, API key, or readiness permission can be changed."
    ],
    beforeMetrics,
    baselineConfig,
    proposedConfig: baselineConfig,
    approvalRequired: true,
    proposalIntentDetails: intentDetails,
    improvementSummary: [
      `Draft target: ${intentDetails.title}.`,
      `Candidate family: ${intentDetails.candidateFamily.replace(/_/g, " ")}.`,
      "No production rule or threshold change has been proposed."
    ],
    notReadyReasons: [
      "Draft proposal only; no concrete calibration patch exists.",
      "Requires AI Research Cycle, walk-forward, evidence quality, maturity, and regime consistency checks."
    ],
    nextValidationRequirement:
      "Turn this into a controlled research candidate first, then run AI Research Cycle, walk-forward, evidence quality, maturity, and regime consistency checks.",
    autoApplyStatus: "blocked",
    autoApplyBlockedReasons: [
      "Draft Grinch calibration intent is not a concrete config patch.",
      "Auto-apply is disabled for Grinch profile calibration intents.",
      "Required validation checks have not been completed."
    ]
  };
}
