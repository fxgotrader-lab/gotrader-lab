import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import type { AutoResearchCandidateFamily } from "@/lib/autoResearch/autoResearchTypes";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type {
  GrinchCalibrationCandidateFamily,
  GrinchProfileCalibrationReport,
  GrinchProfileCalibrationRow
} from "@/lib/strategyLibrary/grinchProfileDiagnostics";
import type { GrinchExpansionReplayDiagnostics } from "@/lib/strategyLibrary/grinchExpansionReplayDiagnostics";
import type {
  CalibrationProposal,
  CalibrationProposalIntentDetails,
  CalibrationProposalMetrics,
  CalibrationProposalReplayReview,
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
  sourceFingerprint?: string;
  regimeLabel?: string;
  regimeDataQuality?: string;
}

export type GrinchCalibrationExecutableStatus = "executable" | "planned_not_implemented" | "diagnostic_only";

export interface GrinchCalibrationCandidateFamilyExecutionInfo {
  calibrationFamily: GrinchCalibrationCandidateFamily;
  status: GrinchCalibrationExecutableStatus;
  executableAutoResearchFamilies: AutoResearchCandidateFamily[];
  closestAutoResearchFamilies: AutoResearchCandidateFamily[];
  reason: string;
  nextImplementationStep: string;
}

const familyTitle: Record<GrinchCalibrationCandidateFamily, string> = {
  model_1_timing_recheck: "Model 1 Timing Recheck",
  reversal_expansion_confirmation: "Reversal Expansion Confirmation",
  consolidation_range_tightness: "Consolidation Range Tightness",
  liquidity_raid_detection: "Liquidity Raid Detection",
  timing_window_sensitivity: "Timing Window Sensitivity",
  pd_array_alignment_review: "PD Array Alignment Review"
};

export const executableAutoResearchCandidateFamilies: AutoResearchCandidateFamily[] = [
  "grinch_model_model1_only",
  "grinch_model_reversal_only",
  "reversal_expansion_confirmation",
  "grinch_model_consolidation_only",
  "grinch_reversal_profile_only",
  "grinch_consolidation_profile_only",
  "grinch_timing_valid_only",
  "grinch_ny_930_1000_only",
  "grinch_1000_1015_confirmation_only",
  "grinch_exclude_expired_timing",
  "grinch_no_trade_when_no_valid_profile",
  "grinch_require_opening_price_alignment",
  "grinch_require_pd_array_hierarchy_alignment",
  "grinch_require_time_price_alignment",
  "grinch_block_expired_timing",
  "grinch_require_valid_profile",
  "grinch_require_timing_acceptable",
  "grinch_require_profile_plus_entry_confirmation",
  "grinch_smt_unavailable_penalty",
  "grinch_penalize_missing_smt",
  "grinch_allow_smt_unavailable_but_discount_confidence"
];

export const grinchCalibrationCandidateFamilyRegistry: Record<
  GrinchCalibrationCandidateFamily,
  GrinchCalibrationCandidateFamilyExecutionInfo
> = {
  model_1_timing_recheck: {
    calibrationFamily: "model_1_timing_recheck",
    status: "planned_not_implemented",
    executableAutoResearchFamilies: [],
    closestAutoResearchFamilies: [
      "grinch_model_model1_only",
      "grinch_timing_valid_only",
      "grinch_require_timing_acceptable"
    ],
    reason:
      "Model 1 timing recheck is a calibration-report family; Auto Research does not yet have an exact executable candidate for it.",
    nextImplementationStep:
      "Implement a concrete Auto Research candidate that varies Model 1 timing sensitivity without changing production thresholds."
  },
  reversal_expansion_confirmation: {
    calibrationFamily: "reversal_expansion_confirmation",
    status: "executable",
    executableAutoResearchFamilies: ["reversal_expansion_confirmation"],
    closestAutoResearchFamilies: ["grinch_reversal_profile_only", "grinch_model_reversal_only"],
    reason:
      "Reversal expansion confirmation now maps to a research-only Auto Research candidate family that tests London/12AM interaction, expansion away, timing, and entry confirmation evidence.",
    nextImplementationStep:
      "Run the reversal expansion confirmation candidate through AI Research, walk-forward, evidence, maturity, and regime consistency checks before any concrete proposal can be considered."
  },
  consolidation_range_tightness: {
    calibrationFamily: "consolidation_range_tightness",
    status: "planned_not_implemented",
    executableAutoResearchFamilies: [],
    closestAutoResearchFamilies: ["grinch_consolidation_profile_only", "grinch_model_consolidation_only"],
    reason:
      "Consolidation range tightness is reported by diagnostics, but no exact Auto Research candidate changes only that criterion yet.",
    nextImplementationStep:
      "Add a controlled consolidation-range candidate that tests range tightness sensitivity without loosening production gates."
  },
  liquidity_raid_detection: {
    calibrationFamily: "liquidity_raid_detection",
    status: "diagnostic_only",
    executableAutoResearchFamilies: [],
    closestAutoResearchFamilies: ["grinch_consolidation_profile_only"],
    reason:
      "Liquidity raid detection is evidence diagnostics only; Auto Research has no safe executable candidate for this detector yet.",
    nextImplementationStep:
      "Implement a diagnostic-to-candidate adapter for liquidity raid evidence before running calibration tests."
  },
  timing_window_sensitivity: {
    calibrationFamily: "timing_window_sensitivity",
    status: "executable",
    executableAutoResearchFamilies: [
      "grinch_timing_valid_only",
      "grinch_require_timing_acceptable",
      "grinch_exclude_expired_timing",
      "grinch_block_expired_timing",
      "grinch_ny_930_1000_only",
      "grinch_1000_1015_confirmation_only"
    ],
    closestAutoResearchFamilies: [],
    reason:
      "Timing-window sensitivity can already be tested by existing bounded Auto Research timing candidates.",
    nextImplementationStep:
      "Run the existing timing candidate families through AI Research, walk-forward, evidence, maturity, and regime checks."
  },
  pd_array_alignment_review: {
    calibrationFamily: "pd_array_alignment_review",
    status: "executable",
    executableAutoResearchFamilies: ["grinch_require_pd_array_hierarchy_alignment"],
    closestAutoResearchFamilies: [],
    reason:
      "PD array alignment review maps to the existing Auto Research candidate requiring PD hierarchy alignment.",
    nextImplementationStep:
      "Run the existing PD hierarchy candidate through the full validation sequence before considering any proposal patch."
  }
};

export const resolveGrinchCalibrationFamilyExecutionInfo = (
  family: GrinchCalibrationCandidateFamily
): GrinchCalibrationCandidateFamilyExecutionInfo => grinchCalibrationCandidateFamilyRegistry[family];

const statusLabelFor = (status: GrinchCalibrationExecutableStatus) =>
  status === "executable"
    ? "executable by Auto Research"
    : status === "planned_not_implemented"
      ? "planned, not implemented"
      : "diagnostic only";

const hardExpansionReplayRules = new Set([
  "missing_12am_open",
  "missing_london_window",
  "london_interacted_with_12am",
  "unclear_london_relation",
  "too_few_expansion_candles",
  "insufficient_expansion_distance",
  "clean_side_violation",
  "chop_around_12am"
]);

const buildExpansionReplayReview = (
  diagnostics?: GrinchExpansionReplayDiagnostics
): CalibrationProposalReplayReview | undefined => {
  if (!diagnostics) {
    return undefined;
  }

  const failedRule = diagnostics.expansionTest.failedRule;
  const nearMissScore = diagnostics.nearMissScore;
  const hardExpansionFailure = hardExpansionReplayRules.has(failedRule);
  const status =
    nearMissScore === 0 && hardExpansionFailure
      ? "rejected_for_current_window"
      : hardExpansionFailure
        ? "evidence_not_supportive"
        : failedRule === "passed_diagnostic_check"
          ? "supportive"
          : "evidence_not_supportive";
  const recommendation =
    status === "rejected_for_current_window"
      ? "Reject this calibration family for the current window; wait for a cleaner setup with supportive London/12AM expansion evidence."
      : status === "evidence_not_supportive"
        ? "Keep the family executable, but do not recommend it for this current window until replay evidence improves."
        : "Replay evidence is supportive enough for controlled research testing; normal validation gates still apply.";

  return {
    reviewed: true,
    status,
    failedRule,
    failureReason: diagnostics.expansionTest.failureReason,
    nearMissScore,
    recommendation,
    timingDate: diagnostics.timingDate,
    timingZone: diagnostics.timingZone
  };
};

const compactFingerprintPart = (value: unknown) =>
  String(value ?? "")
    .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
    .slice(0, 48);

const reportFingerprintFor = (report: GrinchProfileCalibrationReport) => {
  const rows = report.rows.map((row) => [
    row.profile,
    row.nearMissScore,
    row.firstFailedGate,
    row.candidateCount,
    row.recommendedCalibrationFamily
  ].join(":"));
  return [
    "grinch_report",
    compactFingerprintPart(report.recommendedFirstFamily),
    compactFingerprintPart(report.primaryFinding),
    compactFingerprintPart(rows.join("|"))
  ].join("|");
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
  expansionReplayDiagnostics,
  report,
  sourceContext
}: {
  expansionReplayDiagnostics?: GrinchExpansionReplayDiagnostics;
  report: GrinchProfileCalibrationReport;
  sourceContext?: GrinchCalibrationSourceContext;
}): CalibrationProposalIntentDetails {
  const bestRow = selectBestGrinchCalibrationRow(report);
  const candidateFamily = bestRow?.recommendedCalibrationFamily ?? report.recommendedFirstFamily;
  const executionInfo = resolveGrinchCalibrationFamilyExecutionInfo(candidateFamily);
  const title = familyTitle[candidateFamily] ?? candidateFamily.replace(/_/g, " ");
  const nearMissText = typeof bestRow?.nearMissScore === "number" ? `${bestRow.nearMissScore}/100` : "unknown";
  const profileText = bestRow?.label ?? candidateFamily.replace(/_/g, " ");
  const reportFingerprint = reportFingerprintFor(report);
  const sourceFingerprint = sourceContext?.sourceFingerprint;
  const replayReview = buildExpansionReplayReview(expansionReplayDiagnostics);
  const replayRejectedCurrentWindow =
    candidateFamily === "reversal_expansion_confirmation" &&
    replayReview?.status === "rejected_for_current_window";
  const reason = replayRejectedCurrentWindow
    ? `${profileText} remains the strongest current near-miss (${nearMissText}), but replay evidence rejects ${candidateFamily.replace(/_/g, " ")} for this window: ${replayReview.failedRule?.replace(/_/g, " ") ?? "hard expansion rule"} with replay near-miss ${replayReview.nearMissScore ?? "n/a"}/100. Keep the family executable and wait for a cleaner setup.`
    : `${profileText} has the strongest current near-miss score (${nearMissText}); use ${candidateFamily.replace(/_/g, " ")} as the first controlled research family.`;
  const nextImplementationStep = replayRejectedCurrentWindow
    ? "Do not recommend this family for the current window. Keep reversal expansion confirmation executable for future Auto Research runs and wait for clean London/12AM expansion replay evidence."
    : executionInfo.nextImplementationStep;

  return {
    title,
    targetSubsystem: "Grinch profile selector",
    candidateFamily,
    generatedAt: new Date().toISOString(),
    reportFingerprint,
    sourceFingerprint,
    reason,
    draftOnly: true,
    autoApplyAllowed: false,
    nearMissScore: bestRow?.nearMissScore,
    sourceProfile: bestRow?.label,
    firstFailedGate: bestRow?.firstFailedGate,
    executableStatus: executionInfo.status,
    executableStatusLabel: statusLabelFor(executionInfo.status),
    executableAutoResearchFamilies: executionInfo.executableAutoResearchFamilies,
    closestAutoResearchFamilies: executionInfo.closestAutoResearchFamilies,
    executableStatusReason: executionInfo.reason,
    nextImplementationStep,
    replayReview,
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
  expansionReplayDiagnostics,
  report,
  sourceContext
}: {
  baselineConfig: ResolvedBacktestConfig;
  beforeMetrics: CalibrationProposalMetrics;
  expansionReplayDiagnostics?: GrinchExpansionReplayDiagnostics;
  report: GrinchProfileCalibrationReport;
  sourceContext?: GrinchCalibrationSourceContext;
}): CalibrationProposal {
  const intentDetails = buildGrinchCalibrationProposalIntentDetails({ expansionReplayDiagnostics, report, sourceContext });
  const replayRejectedCurrentWindow = intentDetails.replayReview?.status === "rejected_for_current_window";

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
      replayRejectedCurrentWindow
        ? "Expansion replay evidence is not supportive for the current window. Keep the candidate family executable for future evidence, but do not use this draft as the current recommended calibration path."
        : intentDetails.executableStatus === "executable"
        ? "Run the mapped executable Auto Research candidate family through controlled validation. This draft does not change thresholds, timing windows, profile gates, or trading logic."
        : "Create an executable Auto Research candidate from the strongest current Grinch near-miss family. This draft does not change thresholds, timing windows, profile gates, or trading logic.",
    safetyNotes: [
      "Draft proposal only.",
      intentDetails.executableStatus === "executable"
        ? `Executable mapping available: ${intentDetails.executableAutoResearchFamilies.join(", ")}.`
        : "Draft only: candidate family is not executable by Auto Research yet.",
      ...(intentDetails.replayReview?.reviewed
        ? [
            `Expansion replay reviewed: ${intentDetails.replayReview.failedRule?.replace(/_/g, " ") ?? "no failed rule"} with near-miss ${intentDetails.replayReview.nearMissScore ?? "n/a"}/100.`
          ]
        : []),
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
      `Executable status: ${intentDetails.executableStatusLabel}.`,
      ...(replayRejectedCurrentWindow ? ["Replay evidence rejects this family for the current window."] : []),
      "No production rule or threshold change has been proposed."
    ],
    notReadyReasons: [
      "Draft proposal only; no concrete calibration patch exists.",
      ...(replayRejectedCurrentWindow ? ["Expansion replay evidence is not supportive for the current window."] : []),
      intentDetails.executableStatus === "executable"
        ? "Executable candidate mapping still requires AI Research, walk-forward, evidence, maturity, and regime checks."
        : "Candidate family is not executable by Auto Research yet.",
      "Requires AI Research Cycle, walk-forward, evidence quality, maturity, and regime consistency checks."
    ],
    nextValidationRequirement:
      "Turn this into a controlled research candidate first, then run AI Research Cycle, walk-forward, evidence quality, maturity, and regime consistency checks.",
    autoApplyStatus: "blocked",
    autoApplyBlockedReasons: [
      "Draft Grinch calibration intent is not a concrete config patch.",
      "Auto-apply is disabled for Grinch profile calibration intents.",
      intentDetails.executableStatus === "executable"
        ? "Executable candidate mapping has not completed required validation checks."
        : "Recommended calibration family is not executable by Auto Research yet.",
      ...(replayRejectedCurrentWindow ? ["Replay evidence rejected this family for the current window."] : []),
      "Required validation checks have not been completed."
    ]
  };
}
