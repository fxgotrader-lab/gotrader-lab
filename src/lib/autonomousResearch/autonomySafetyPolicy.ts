import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { CalibrationProposalChanges } from "@/lib/selfImprovement";
import { safeArray, safeTopN, uid } from "@/lib/utils";

import type {
  AutonomyBlockerCategory,
  AutonomySafetyDiagnosis,
  AutonomySafetyPolicy,
  AutonomySafetyState,
  AutonomyScenarioFamily,
  MaturityTrendAvailability,
  MinorCalibrationChangeCheck,
  ScenarioSelectionReasoning
} from "@/lib/autonomousResearch/autonomySafetyTypes";

export const AUTONOMY_SAFETY_STORAGE_KEY = "gotrader_ai_lab_autonomy_safety_state";
export const AUTONOMY_SAFETY_UPDATED_EVENT = "gotrader-ai-lab-autonomy-safety-updated";

export const defaultAutonomySafetyPolicy: AutonomySafetyPolicy = {
  autoApplyEnabled: false,
  maxMaturityDropPerAutoApply: 5,
  allowMinorInsufficientEvidenceException: false,
  minorChangeLimits: {
    confluenceThresholdDelta: 0.03,
    confidenceThresholdDelta: 0.03,
    targetRMultipleDelta: 0.25,
    agentWeightDelta: 0.05,
    allowSessionOrDirectionLockout: false,
    allowStopModelChange: false
  },
  minimumEvidenceQualityScore: 60,
  minimumSampleSize: 30,
  minimumCalibrationSurvivalCount: 2,
  trendBasicCycleMinimum: 3,
  trendReliableCycleMinimum: 5
};

const initialState = (): AutonomySafetyState => ({
  diagnoses: [],
  scenarioSelectionHistory: [],
  safetyNotice: "Autonomous research is research-only. It cannot execute trades, approve trades, or override readiness gates."
});

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const unique = <T extends string>(items: T[]) => [...new Set(items)];

const formatBlocker = (blocker: string) => blocker.replace(/_/g, " ");

export function getMaturityTrendAvailability(
  cyclesObserved = 0,
  policy: AutonomySafetyPolicy = defaultAutonomySafetyPolicy
): MaturityTrendAvailability {
  const basicTrendAvailable = cyclesObserved >= policy.trendBasicCycleMinimum;
  const reliableTrendAvailable = cyclesObserved >= policy.trendReliableCycleMinimum;
  return {
    cyclesObserved,
    basicTrendMinimum: policy.trendBasicCycleMinimum,
    reliableTrendMinimum: policy.trendReliableCycleMinimum,
    basicTrendAvailable,
    reliableTrendAvailable,
    message: !basicTrendAvailable
      ? "Building history - trend unavailable until at least 3 cycles."
      : reliableTrendAvailable
        ? "Reliable maturity trend available from at least 5 cycles."
        : "Basic maturity trend available; reliable trend needs at least 5 cycles."
  };
}

export function wouldMaturityDropBlock({
  beforeGrade,
  beforeScore,
  afterGrade,
  afterScore,
  survivalCount,
  policy = defaultAutonomySafetyPolicy
}: {
  beforeScore?: number;
  afterScore?: number;
  beforeGrade?: string;
  afterGrade?: string;
  survivalCount?: number;
  policy?: AutonomySafetyPolicy;
}) {
  const maturityDrop =
    typeof beforeScore === "number" && typeof afterScore === "number" ? beforeScore - afterScore : undefined;
  const gradeOrder = ["untested", "early_research", "research_ready", "robust_research", "paper_demo_candidate_review"];
  const gradeDowngrade =
    beforeGrade && afterGrade ? gradeOrder.indexOf(afterGrade) < gradeOrder.indexOf(beforeGrade) : false;
  const survivalReset =
    typeof survivalCount === "number" && survivalCount < policy.minimumCalibrationSurvivalCount;
  return {
    blocked:
      (typeof maturityDrop === "number" && maturityDrop > policy.maxMaturityDropPerAutoApply) ||
      gradeDowngrade ||
      survivalReset,
    maturityDrop,
    reasons: [
      typeof maturityDrop === "number" && maturityDrop > policy.maxMaturityDropPerAutoApply
        ? `Maturity score would drop ${maturityDrop.toFixed(1)} points; max allowed auto-apply drop is ${policy.maxMaturityDropPerAutoApply}.`
        : undefined,
      gradeDowngrade ? "Maturity grade would downgrade." : undefined,
      survivalReset
        ? `Active calibration survival count is below the minimum ${policy.minimumCalibrationSurvivalCount}.`
        : undefined
    ].filter((reason): reason is string => Boolean(reason))
  };
}

export function checkMinorCalibrationChange(
  changes: CalibrationProposalChanges = {},
  currentConfig?: {
    minimumConfluenceThreshold?: number;
    minimumConfidenceThreshold?: number;
    targetRMultiple?: number;
    agentWeights?: Record<string, number>;
    sessionFilter?: string;
    allowLong?: boolean;
    allowShort?: boolean;
    stopModel?: string;
  },
  policy: AutonomySafetyPolicy = defaultAutonomySafetyPolicy
): MinorCalibrationChangeCheck {
  const reasons: string[] = [];
  const confluenceDelta =
    typeof changes.confluenceThreshold === "number" && typeof currentConfig?.minimumConfluenceThreshold === "number"
      ? Math.abs(changes.confluenceThreshold - currentConfig.minimumConfluenceThreshold)
      : 0;
  const confidenceDelta =
    typeof changes.confidenceThreshold === "number" && typeof currentConfig?.minimumConfidenceThreshold === "number"
      ? Math.abs(changes.confidenceThreshold - currentConfig.minimumConfidenceThreshold)
      : 0;
  const targetDelta =
    typeof changes.targetRMultiple === "number" && typeof currentConfig?.targetRMultiple === "number"
      ? Math.abs(changes.targetRMultiple - currentConfig.targetRMultiple)
      : 0;

  if (confluenceDelta > policy.minorChangeLimits.confluenceThresholdDelta) {
    reasons.push(`Confluence delta ${confluenceDelta.toFixed(2)} exceeds minor limit ${policy.minorChangeLimits.confluenceThresholdDelta}.`);
  }
  if (confidenceDelta > policy.minorChangeLimits.confidenceThresholdDelta) {
    reasons.push(`Confidence delta ${confidenceDelta.toFixed(2)} exceeds minor limit ${policy.minorChangeLimits.confidenceThresholdDelta}.`);
  }
  if (targetDelta > policy.minorChangeLimits.targetRMultipleDelta) {
    reasons.push(`Target R delta ${targetDelta.toFixed(2)} exceeds minor limit ${policy.minorChangeLimits.targetRMultipleDelta}.`);
  }
  const directionalChanges = changes as CalibrationProposalChanges & { allowLong?: boolean; allowShort?: boolean };
  if (changes.sessionFilter || directionalChanges.allowLong !== undefined || directionalChanges.allowShort !== undefined) {
    reasons.push("Session or direction lockout changes are not minor auto-apply changes.");
  }
  if (changes.stopModel) {
    reasons.push("Stop model changes are not minor auto-apply changes.");
  }
  if (changes.agentWeights && currentConfig?.agentWeights) {
    Object.entries(changes.agentWeights).forEach(([agentId, nextValue]) => {
      const currentValue = currentConfig.agentWeights?.[agentId];
      if (
        typeof nextValue === "number" &&
        typeof currentValue === "number" &&
        Math.abs(nextValue - currentValue) > policy.minorChangeLimits.agentWeightDelta
      ) {
        reasons.push(`${agentId} weight delta exceeds minor limit ${policy.minorChangeLimits.agentWeightDelta}.`);
      }
    });
  }

  return {
    isMinor: reasons.length === 0,
    reasons,
    changes
  };
}

export function selectScenarioFamilyFromBlockers(
  blockers: AutonomyBlockerCategory[],
  options: {
    consecutiveCount?: number;
    evidenceUsed?: string[];
    timestamp?: string;
  } = {}
): ScenarioSelectionReasoning {
  const blockerSet = new Set(blockers);
  let selectedScenarioFamily: AutonomyScenarioFamily = "trade_quality";
  let reasoningSummary = "Selected trade quality because no narrower blocker family dominated the latest evidence.";

  if (
    blockerSet.has("regime_mismatch") ||
    blockerSet.has("regime_shift_detected") ||
    blockerSet.has("regime_evidence_insufficient") ||
    blockerSet.has("regime_transition_pending") ||
    blockerSet.has("regime_specific_sample_too_small")
  ) {
    selectedScenarioFamily = "regime_specific_testing";
    reasoningSummary = "Selected regime-specific testing because window performance suggests calibration assumptions may not fit the current volatility or session regime.";
  } else if (blockerSet.has("insufficient_walk_forward_evidence")) {
    selectedScenarioFamily = "walk_forward_evidence";
    reasoningSummary = "Selected walk-forward evidence because the system needs more out-of-sample windows before judging strategy quality.";
  } else if (blockerSet.has("session_consistency_weak")) {
    selectedScenarioFamily = "session_focus";
    reasoningSummary = "Selected session focus because session consistency is weak in the latest evidence.";
  } else if (blockerSet.has("average_r_too_low") || blockerSet.has("conservative_scenario_unstable")) {
    selectedScenarioFamily = "stop_model_focus";
    reasoningSummary = "Selected stop-model focus because average R or conservative stability failed.";
  } else if (blockerSet.has("win_rate_too_low")) {
    selectedScenarioFamily = "long_short_focus";
    reasoningSummary = "Selected long/short focus because win rate is weak and direction behavior needs isolation.";
  } else if (blockerSet.has("confidence_calibration_weak")) {
    selectedScenarioFamily = "confidence_calibration";
    reasoningSummary = "Selected confidence calibration because confidence does not match observed validation quality.";
  } else if (
    blockerSet.has("max_drawdown_too_high") ||
    blockerSet.has("false_positives_too_high") ||
    blockerSet.has("overfitting_risk")
  ) {
    selectedScenarioFamily = "conservative_only";
    reasoningSummary = "Selected conservative-only testing because risk, false positives, or overfit risk dominate the blocker set.";
  }

  const allFamilies: AutonomyScenarioFamily[] = [
    "trade_quality",
    "session_focus",
    "stop_model_focus",
    "long_short_focus",
    "conservative_only",
    "walk_forward_evidence",
    "confidence_calibration",
    "regime_specific_testing"
  ];

  return {
    reasoningId: uid("scenario_reasoning"),
    timestamp: options.timestamp ?? new Date().toISOString(),
    selectedScenarioFamily,
    blockers: unique(blockers),
    consecutiveCount: options.consecutiveCount ?? 1,
    evidenceUsed: safeTopN(options.evidenceUsed, 8),
    rejectedScenarioFamilies: allFamilies
      .filter((family) => family !== selectedScenarioFamily)
      .map((scenarioFamily) => ({
        scenarioFamily,
        reason: `${scenarioFamily.replace(/_/g, " ")} was lower priority than ${selectedScenarioFamily.replace(/_/g, " ")} for the current blocker mix.`
      })),
    reasoningSummary
  };
}

export function diagnoseAutonomySafety(
  snapshot?: ResearchRuntimeSnapshot,
  latestAutoResearch?: { failedGates?: string[]; scenarioSelectionReasoning?: ScenarioSelectionReasoning },
  policy = defaultAutonomySafetyPolicy
): AutonomySafetyDiagnosis {
  const maturity = snapshot?.maturity.maturitySummary;
  const stability = snapshot?.walkForward.stability;
  const diagnostics = snapshot?.walkForward.failureDiagnostics ?? stability?.diagnostics;
  const blockerCategories: AutonomyBlockerCategory[] = safeArray(latestAutoResearch?.failedGates)
    .filter((item): item is AutonomyBlockerCategory => Boolean(item));
  const evidenceUsed = [
    snapshot?.latestResearchCycle.latestCycleId ? `latest cycle ${snapshot.latestResearchCycle.latestCycleId}` : undefined,
    snapshot?.walkForward.latestRunId ? `walk-forward ${snapshot.walkForward.latestRunId}` : undefined,
    snapshot?.proposal.latestProposalId ? `proposal ${snapshot.proposal.latestProposalId}` : undefined,
    `evidence quality ${snapshot?.evidence.evidenceQualityScore ?? 0}/100`,
    `maturity ${snapshot?.maturity.maturityScore ?? 0}/100`,
    snapshot?.regime ? `regime ${snapshot.regime.label} ${Math.round(snapshot.regime.confidence * 100)}%` : undefined
  ].filter((item): item is string => Boolean(item));

  const walkForwardEvidenceSufficient = Boolean(
    snapshot?.walkForward.latestRun &&
      stability &&
      stability.verdict !== "insufficient_evidence" &&
      stability.windowCount >= 3 &&
      (stability.evidenceSummary?.enoughEvidence ?? true)
  );
  if (!walkForwardEvidenceSufficient) {
    blockerCategories.push("insufficient_walk_forward_evidence");
  }
  if ((snapshot?.evidence.evidenceQualityScore ?? 0) < policy.minimumEvidenceQualityScore) {
    blockerCategories.push("evidence_quality_weak");
  }
  if ((maturity?.cyclesTested ?? 0) < policy.trendBasicCycleMinimum) {
    blockerCategories.push("weak_maturity_history");
  }

  const partialOosFailure = Boolean(
    stability &&
      stability.verdict !== "insufficient_evidence" &&
      stability.outOfSampleWindowsPassed > 0 &&
      stability.outOfSampleWindowsPassed < stability.windowCount
  );
  const performanceDeterioratedTogether = Boolean(
    diagnostics &&
      diagnostics.worstOosWinRate <= 0.2 &&
      diagnostics.worstOosAverageR < -0.1 &&
      diagnostics.worstOosDrawdown >= 1.5
  );
  if (
    partialOosFailure &&
    (performanceDeterioratedTogether ||
      diagnostics?.likelyFailureCause === "session_fragility" ||
      diagnostics?.likelyFailureCause === "overfit_risk")
  ) {
    blockerCategories.push("regime_mismatch");
  }
  if (partialOosFailure && (stability?.overfitRisk === "medium" || stability?.overfitRisk === "high")) {
    blockerCategories.push("regime_shift_detected");
  }
  if (
    (blockerCategories.includes("regime_mismatch") || blockerCategories.includes("regime_shift_detected")) &&
    (snapshot?.evidence.evidenceQualityScore ?? 0) < 70
  ) {
    blockerCategories.push("regime_evidence_insufficient");
  }
  if (snapshot?.regime.transitionPending) {
    blockerCategories.push("regime_transition_pending");
  }
  if (snapshot?.regime.dataQuality !== "sufficient") {
    blockerCategories.push("regime_evidence_insufficient");
  }
  if ((snapshot?.walkForward.latestRun?.stability?.regimeSegments ?? []).some((segment) => segment.windowCount < 2)) {
    blockerCategories.push("regime_specific_sample_too_small");
  }

  const maturityDropCheck = wouldMaturityDropBlock({
    beforeScore: maturity?.score,
    afterScore: maturity?.score,
    beforeGrade: maturity?.grade,
    afterGrade: maturity?.grade,
    survivalCount: maturity?.activeCalibrationSurvivalCount,
    policy
  });
  if (maturityDropCheck.blocked) {
    blockerCategories.push("maturity_degradation");
  }

  const uniqueBlockers = unique(blockerCategories);
  const regimeMismatchPaused =
    uniqueBlockers.includes("regime_mismatch") ||
    uniqueBlockers.includes("regime_shift_detected") ||
    uniqueBlockers.includes("regime_evidence_insufficient") ||
    uniqueBlockers.includes("regime_transition_pending") ||
    uniqueBlockers.includes("regime_specific_sample_too_small");
  const trendStatus = getMaturityTrendAvailability(maturity?.cyclesTested ?? 0, policy);
  const scenarioSelection =
    latestAutoResearch?.scenarioSelectionReasoning ??
    selectScenarioFamilyFromBlockers(uniqueBlockers, {
      evidenceUsed,
      consecutiveCount: 1
    });
  const blockReasons = [
    "Autonomous auto-apply is disabled by default; user approval is required.",
    !walkForwardEvidenceSufficient
      ? "Walk-forward evidence is insufficient or missing; default policy blocks auto-apply."
      : undefined,
    regimeMismatchPaused
      ? "Regime mismatch, transition, sample-size, or evidence gap detected; pause autonomous loop and run regime-specific testing."
      : undefined,
    !trendStatus.basicTrendAvailable ? trendStatus.message : undefined,
    (snapshot?.evidence.evidenceQualityScore ?? 0) < policy.minimumEvidenceQualityScore
      ? `Evidence quality ${(snapshot?.evidence.evidenceQualityScore ?? 0).toFixed(0)}/100 is below ${policy.minimumEvidenceQualityScore}/100.`
      : undefined,
    ...maturityDropCheck.reasons
  ].filter((reason): reason is string => Boolean(reason));

  return {
    diagnosisId: uid("autonomy_safety"),
    generatedAt: new Date().toISOString(),
    policy,
    blockerCategories: uniqueBlockers,
    autoApplyAllowed: false,
    autoApplyBlocked: true,
    blockReasons,
    regimeMismatchPaused,
    walkForwardEvidenceSufficient,
    walkForwardEvidenceStatus: stability?.verdict ?? "not_run",
    maturityDropBlocked: maturityDropCheck.blocked,
    maturityDrop: maturityDropCheck.maturityDrop,
    maturityScore: maturity?.score ?? 0,
    maturityGrade: maturity?.grade ?? "untested",
    evidenceQualityScore: snapshot?.evidence.evidenceQualityScore ?? 0,
    trendStatus,
    scenarioSelection,
    safetyNotice: "Autonomous research is research-only. It cannot execute trades, approve trades, or override readiness gates."
  };
}

export function loadAutonomySafetyState(): AutonomySafetyState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(AUTONOMY_SAFETY_STORAGE_KEY);
  if (!raw) {
    return initialState();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AutonomySafetyState>;
    return {
      ...initialState(),
      ...parsed,
      diagnoses: safeArray(parsed.diagnoses),
      scenarioSelectionHistory: safeArray(parsed.scenarioSelectionHistory)
    };
  } catch {
    return initialState();
  }
}

const publishAutonomySafetyState = (state: AutonomySafetyState) => {
  if (!isBrowser()) {
    return state;
  }
  const compactState: AutonomySafetyState = {
    ...state,
    diagnoses: safeTopN(state.diagnoses, 20),
    scenarioSelectionHistory: safeTopN(state.scenarioSelectionHistory, 50)
  };
  window.localStorage.setItem(AUTONOMY_SAFETY_STORAGE_KEY, JSON.stringify(compactState));
  window.dispatchEvent(new CustomEvent(AUTONOMY_SAFETY_UPDATED_EVENT, { detail: compactState }));
  return compactState;
};

export function saveAutonomySafetyDiagnosis(diagnosis: AutonomySafetyDiagnosis): AutonomySafetyState {
  const state = loadAutonomySafetyState();
  return publishAutonomySafetyState({
    ...state,
    latestDiagnosisId: diagnosis.diagnosisId,
    diagnoses: safeTopN([diagnosis, ...state.diagnoses], 20),
    scenarioSelectionHistory: safeTopN([diagnosis.scenarioSelection, ...state.scenarioSelectionHistory], 50)
  });
}

export function saveScenarioSelectionReasoning(reasoning: ScenarioSelectionReasoning): AutonomySafetyState {
  const state = loadAutonomySafetyState();
  return publishAutonomySafetyState({
    ...state,
    scenarioSelectionHistory: safeTopN([reasoning, ...state.scenarioSelectionHistory], 50)
  });
}

export function formatAutonomyBlocker(blocker: AutonomyBlockerCategory) {
  return formatBlocker(blocker);
}
