import {
  defaultAutoResearchScoringCriteria,
  autoResearchSafetyNotes
} from "@/lib/autoResearch/configSearchSpace";
import { createSelfImprovementFromCandidate } from "@/lib/autoResearch/createSelfImprovementFromCandidate";
import {
  generateAdaptiveCandidateConfigs,
  generateCandidateConfigs,
  generateTradeRecoveryCandidateConfigs
} from "@/lib/autoResearch/generateCandidateConfigs";
import { generateTradeQualityCandidateConfigs } from "@/lib/autoResearch/tradeQualityOptimizer";
import { scoreCandidateConfig } from "@/lib/autoResearch/scoreCandidateConfig";
import { selectBestCandidate } from "@/lib/autoResearch/selectBestCandidate";
import type {
  AutoResearchCandidateResult,
  AutoResearchCycle,
  AutoResearchAdaptiveOutcome,
  AutoResearchAdaptivePass,
  AutoResearchExecutionCheckpoint,
  AutoResearchFailedGate,
  AutoResearchProgressSnapshot,
  AutoResearchRecoveryMetadata,
  AutoResearchRunOptions,
  AutoResearchState
} from "@/lib/autoResearch/autoResearchTypes";
import {
  loadBacktestConfig,
  diagnoseTradeGeneration,
  diagnoseTradeQuality,
  runBacktest
} from "@/lib/backtesting";
import {
  loadICTScoringWeights,
  saveICTScoringWeights
} from "@/lib/ict";
import {
  analyzeValidationResults
} from "@/lib/researchQuality";
import {
  evaluateReadinessGate
} from "@/lib/readiness";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import {
  compareProposalToBaseline,
  attachProposalMetricsSnapshot,
  hasMaterialImprovement,
  loadActiveResearchCalibration,
  materialMetricsChanged,
  resolveActiveBacktestConfig,
  summarizeValidationMetrics,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import type {
  CalibrationProposal,
  CalibrationProposalMetrics
} from "@/lib/selfImprovement";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { labStorage } from "@/lib/storage";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import type { Candle } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { runValidationSuite } from "@/lib/validation";
import type { WalkForwardFollowUpSearchPlan } from "@/lib/walkForward/walkForwardTypes";

export const AUTO_RESEARCH_STORAGE_KEY = "gotrader_ai_lab_auto_research_state";
export const AUTO_RESEARCH_UPDATED_EVENT = "gotrader-ai-lab-auto-research-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

class AutoResearchCanceledError extends Error {
  constructor() {
    super("Auto Research canceled by user.");
    this.name = "AutoResearchCanceledError";
  }
}

class AutoResearchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoResearchTimeoutError";
  }
}

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

const initialState = (): AutoResearchState => ({
  cycles: [],
  followUpSearchPlans: [],
  auditTrail: [],
  safetyNotice: "Auto Research is simulation-only and cannot execute trades or override readiness gates."
});

const bytesFor = (value: unknown) => new Blob([JSON.stringify(value)]).size;

const fallbackReadinessEstimate = (): ReadinessGateSnapshot => ({
  id: uid("auto_research_readiness_compact"),
  evaluatedAt: new Date().toISOString(),
  state: "Not Ready",
  passedRequirements: [],
  failedRequirements: [],
  warnings: ["Readiness estimate was unavailable in this stored compact summary."],
  recommendedNextStep: "Rerun Auto Research to regenerate readiness evidence.",
  brokerExecutionDisabled: true
});

const fallbackMetrics = (): AutoResearchCandidateResult["metrics"] => ({
  totalTrades: 0,
  winRate: 0,
  averageR: 0,
  maxDrawdown: 0,
  profitFactor: null,
  skippedSignals: 0,
  falsePositiveCount: 0,
  confidenceCalibration: 0,
  readinessScore: 0,
  readinessStatus: "red",
  stabilityScore: 0,
  conservativeScenarioStable: false
});

const fallbackScoreBreakdown = (): AutoResearchCandidateResult["scoreBreakdown"] => ({
  totalScore: 0,
  drawdownScore: 0,
  averageRScore: 0,
  winRateScore: 0,
  falsePositiveScore: 0,
  confidenceCalibrationScore: 0,
  sessionConsistencyScore: 0,
  tradeCountScore: 0,
  skippedSignalBalanceScore: 0,
  profitFactorScore: 0,
  robustnessScore: 0,
  stabilityImproved: false,
  sufficientSample: false,
  rationale: "Score summary unavailable in compact stored history."
});

const failedGateLabels: Record<AutoResearchFailedGate, string> = {
  max_drawdown_too_high: "max drawdown too high",
  false_positives_too_high: "false positives too high",
  average_r_too_low: "average R too low",
  win_rate_too_low: "win rate too low",
  trade_count_too_low: "trade count too low",
  confidence_calibration_weak: "confidence calibration weak",
  session_consistency_weak: "session consistency weak",
  conservative_scenario_unstable: "conservative scenario unstable",
  skipped_signal_imbalance: "skipped signal imbalance",
  overfitting_risk: "overfitting risk"
};

const ZERO_TRADE_CONFLUENCE_FLOOR = 0.4;
const ZERO_TRADE_CONFLUENCE_BUFFER = 0.03;

const roundThreshold = (value: number) => Number(value.toFixed(2));

const formatThresholdPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

const uniqueFailedGates = (gates: AutoResearchFailedGate[]) => [...new Set(gates)];

const compactReadinessEstimate = (readiness?: AutoResearchCandidateResult["readinessEstimate"]) => ({
  ...(readiness ?? fallbackReadinessEstimate()),
  passedRequirements: [],
  failedRequirements: safeTopN(readiness?.failedRequirements, 3),
  warnings: safeTopN(readiness?.warnings, 3)
});

const compactComparison = (comparison?: AutoResearchCandidateResult["comparisonResult"]) =>
  comparison
    ? {
        ...comparison,
        positiveChanges: safeTopN(comparison.positiveChanges, 3),
        negativeChanges: safeTopN(comparison.negativeChanges, 3),
        neutralChanges: safeTopN(comparison.neutralChanges, 3),
        improvedMetrics: safeTopN(comparison.improvedMetrics, 4),
        worsenedMetrics: safeTopN(comparison.worsenedMetrics, 4),
        criticalRegressions: safeTopN(comparison.criticalRegressions, 4),
        sanityWarnings: safeTopN(comparison.sanityWarnings, 3),
        promotionVerdict: comparison.promotionVerdict ?? "needs_follow_up",
        followUpSearchDirection: comparison.followUpSearchDirection
      }
    : {
        improved: false,
        stabilityImproved: false,
        recommendation: "keep_testing" as const,
        summary: "Comparison summary unavailable in compact stored history.",
        positiveChanges: [],
        negativeChanges: [],
        neutralChanges: [],
        improvedMetrics: [],
        worsenedMetrics: [],
        criticalRegressions: [],
        sanityWarnings: [],
        promotionVerdict: "needs_follow_up" as const,
        followUpSearchDirection: "Rerun Auto Research to regenerate full proposal diagnostics."
      };

const compactCandidate = (candidate: AutoResearchCandidateResult): AutoResearchCandidateResult => {
  const source = (candidate ?? {}) as AutoResearchCandidateResult;
  const metrics = source.metrics ?? fallbackMetrics();
  const scoreBreakdown = { ...fallbackScoreBreakdown(), ...(source.scoreBreakdown ?? {}) };
  return {
    candidateId: source.candidateId ?? uid("auto_candidate_compact"),
    label: source.label ?? "Recovered compact candidate",
    rationale: source.rationale ?? "This candidate was recovered from incomplete stored Auto Research data.",
    config: source.config ?? loadBacktestConfig(),
    ictScoringWeights: source.ictScoringWeights,
    changedParameters: safeArray(source.changedParameters),
    readinessEstimate: compactReadinessEstimate(source.readinessEstimate),
    metrics: {
      validationId: metrics.validationId,
      validationTimestamp: metrics.validationTimestamp,
      totalTrades: metrics.totalTrades ?? 0,
      winRate: metrics.winRate ?? 0,
      averageR: metrics.averageR ?? 0,
      maxDrawdown: metrics.maxDrawdown ?? 0,
      profitFactor: metrics.profitFactor ?? null,
      skippedSignals: metrics.skippedSignals ?? 0,
      falsePositiveCount: metrics.falsePositiveCount ?? 0,
      confidenceCalibration: metrics.confidenceCalibration ?? 0,
      readinessScore: metrics.readinessScore ?? 0,
      readinessStatus: metrics.readinessStatus ?? "red",
      stabilityScore: metrics.stabilityScore ?? 0,
      conservativeScenarioStable: Boolean(metrics.conservativeScenarioStable),
      strongestScenario: metrics.strongestScenario,
      weakestScenario: metrics.weakestScenario
    },
    scoreBreakdown,
    comparisonResult: compactComparison(source.comparisonResult),
    resultCategory: source.resultCategory ?? "rejected",
    promotionEligible: Boolean(source.promotionEligible),
    rejectionReasons: safeTopN(source.rejectionReasons, 3)
  };
};

const minimalCandidate = (candidate: AutoResearchCandidateResult): AutoResearchCandidateResult => {
  const compact = compactCandidate(candidate);
  return {
    ...compact,
    config: {
      ...compact.config,
      agentWeights: compact.config.agentWeights
    },
    scoreBreakdown: {
      ...compact.scoreBreakdown,
      rationale:
        typeof compact.scoreBreakdown?.rationale === "string"
          ? compact.scoreBreakdown.rationale.slice(0, 140)
          : "Score rationale unavailable in compact stored history."
    }
  };
};

const compactAdaptivePass = (pass: AutoResearchAdaptivePass): AutoResearchAdaptivePass => ({
  ...pass,
  failedGatesTargeted: safeTopN(pass.failedGatesTargeted, 5),
  generatedCandidates: safeTopN(pass.generatedCandidates, 8),
  bestCandidatePerPass: pass.bestCandidatePerPass ? compactCandidate(pass.bestCandidatePerPass) : undefined,
  targetedChanges: safeTopN(pass.targetedChanges, 8)
});

export function compactAutoResearchCycle(cycle: AutoResearchCycle): AutoResearchCycle {
  const missingFields = [
    !Array.isArray(cycle.candidateConfigs) ? "candidateConfigs" : undefined,
    !Array.isArray(cycle.candidateResults) ? "candidateResults" : undefined,
    !Array.isArray(cycle.closestCandidates) ? "closestCandidates" : undefined,
    !Array.isArray(cycle.rejectedCandidates) ? "rejectedCandidates" : undefined,
    !Array.isArray(cycle.candidateScores) ? "candidateScores" : undefined
  ].filter(Boolean);
  if (missingFields.length) {
    console.warn("[AutoResearch] Incomplete cycle data recovered with safe defaults.", {
      cycleId: cycle.cycleId,
      missingFields
    });
  }
  const compactCandidates = safeArray(cycle.candidateResults).map(compactCandidate);
  const candidateById = new Map(compactCandidates.map((candidate) => [candidate.candidateId, candidate]));
  return {
    ...cycle,
    candidateConfigs: safeTopN(cycle.candidateConfigs, 25),
    candidateResults: compactCandidates,
    bestCandidate: cycle.bestCandidate ? candidateById.get(cycle.bestCandidate.candidateId) ?? compactCandidate(cycle.bestCandidate) : undefined,
    closestCandidates: safeTopN(cycle.closestCandidates, 3)
      .map((candidate) => candidateById.get(candidate.candidateId) ?? compactCandidate(candidate)),
    rejectedCandidates: safeTopN(cycle.rejectedCandidates, 25)
      .map((candidate) => candidateById.get(candidate.candidateId) ?? compactCandidate(candidate)),
    candidateScores: safeArray(cycle.candidateScores).map((score) => ({
      ...score,
      rejectionReasons: safeTopN(score.rejectionReasons, 3)
    })),
    adaptivePasses: safeArray(cycle.adaptivePasses).map(compactAdaptivePass),
    failedGates: safeTopN(cycle.failedGates, 6),
    tradeGenerationDiagnostics: safeTopN(cycle.tradeGenerationDiagnostics, 6),
    tradeQualityDiagnostics: safeTopN(cycle.tradeQualityDiagnostics, 6),
    tradeQualityCandidateConfigs: safeTopN(cycle.tradeQualityCandidateConfigs, 12),
    tradeQualityBestCandidate: cycle.tradeQualityBestCandidate ? compactCandidate(cycle.tradeQualityBestCandidate) : undefined,
    tradeQualitySummary: cycle.tradeQualitySummary
      ? {
          ...cycle.tradeQualitySummary,
          testedStopModels: safeTopN(cycle.tradeQualitySummary.testedStopModels, 5),
          testedTargetModels: safeTopN(cycle.tradeQualitySummary.testedTargetModels, 5),
          sessionDirectionFindings: safeTopN(cycle.tradeQualitySummary.sessionDirectionFindings, 6)
        }
      : undefined,
    recoveryCandidates: safeTopN(cycle.recoveryCandidates, 7),
    recoveryResult: cycle.recoveryResult ? compactCandidate(cycle.recoveryResult) : undefined,
    recoveryFailureReasons: safeTopN(cycle.recoveryFailureReasons, 6)
  };
}

const emergencyAutoResearchCycle = (cycle: AutoResearchCycle): AutoResearchCycle => {
  const compact = compactAutoResearchCycle(cycle);
  const essentialIds = new Set([
    compact.bestCandidate?.candidateId,
    ...safeArray(compact.closestCandidates).map((candidate) => candidate.candidateId)
  ].filter(Boolean));
  const emergencyCandidates = safeArray(compact.candidateResults)
    .filter((candidate) => essentialIds.has(candidate.candidateId))
    .map(minimalCandidate);

  return {
    ...compact,
    candidateResults: emergencyCandidates,
    candidateConfigs: safeTopN(compact.candidateConfigs, 3),
    closestCandidates: safeArray(compact.closestCandidates).map(minimalCandidate),
    rejectedCandidates: safeTopN(compact.rejectedCandidates, 3).map(minimalCandidate),
    candidateScores: safeTopN(compact.candidateScores, 25)
  };
};

export function pruneAutoResearchHistory(state: AutoResearchState): AutoResearchState {
  return {
    ...state,
    cycles: safeTopN(state.cycles, 5).map(compactAutoResearchCycle),
    followUpSearchPlans: safeTopN(state.followUpSearchPlans, 10),
    latestFollowUpSearchPlanId: state.latestFollowUpSearchPlanId,
    activeCheckpoint: state.activeCheckpoint,
    recoveryCheckpoint: state.recoveryCheckpoint,
    checkpointHistory: safeTopN(state.checkpointHistory, 20),
    cancelRequestedCycleId: state.cancelRequestedCycleId,
    auditTrail: safeTopN(state.auditTrail, 30)
      .map((entry) => ({
        ...entry,
        candidateScores: safeTopN(entry.candidateScores, 25).map((score) => ({
          ...score,
          rejectionReasons: safeTopN(score.rejectionReasons, 3)
        }))
      })),
    safetyNotice: "Auto Research is simulation-only and cannot execute trades or override readiness gates."
  };
}

const emergencyStateFor = (state: AutoResearchState, warning: string): AutoResearchState => {
  const cycles = safeArray(state.cycles);
  const latestCycle = cycles.find((cycle) => cycle.cycleId === state.latestCycleId) ?? cycles[0];
  return {
    ...initialState(),
    latestCycleId: latestCycle?.cycleId,
    cycles: latestCycle ? [emergencyAutoResearchCycle(latestCycle)] : [],
    auditTrail: safeTopN(state.auditTrail, 5).map((entry) => ({
      ...entry,
      candidateScores: safeTopN(entry.candidateScores, 10)
    })),
    storageWarning: warning,
    storageEmergencyMode: true
  };
};

const audit = (
  cycleId: string,
  action: AutoResearchState["auditTrail"][number]["action"],
  notes: string,
  details?: Partial<AutoResearchState["auditTrail"][number]>
) => ({
  id: uid("auto_research_audit"),
  timestamp: new Date().toISOString(),
  cycleId,
  action,
  notes,
  ...details
});

const publish = (state: AutoResearchState) => {
  if (isBrowser()) {
    const compactState = pruneAutoResearchHistory(state);
    const write = (candidate: AutoResearchState) => {
      const bytes = bytesFor(candidate);
      const nextState = {
        ...candidate,
        lastStoredBytes: bytes
      };
      window.localStorage.setItem(AUTO_RESEARCH_STORAGE_KEY, JSON.stringify(nextState));
      window.dispatchEvent(new CustomEvent(AUTO_RESEARCH_UPDATED_EVENT, { detail: nextState }));
      return nextState;
    };

    try {
      return write(compactState);
    } catch (error) {
      const warning = "Auto Research history was pruned because browser storage quota was reached.";
      console.warn("[AutoResearch] Storage quota reached. Pruning compact history.", {
        cycles: compactState.cycles.length,
        candidateSummaries: compactState.cycles.reduce((sum, cycle) => sum + safeArray(cycle.candidateResults).length, 0),
        approximateBytes: bytesFor(compactState)
      });
      try {
        return write({
          ...pruneAutoResearchHistory({
            ...compactState,
            cycles: safeTopN(compactState.cycles, 1),
            auditTrail: safeTopN(compactState.auditTrail, 10),
            storageWarning: warning
          }),
          storageWarning: warning
        });
      } catch {
        const emergencyState = emergencyStateFor(compactState, `${warning} Stored minimal latest-cycle summary only.`);
        try {
          return write(emergencyState);
        } catch {
          window.localStorage.removeItem(AUTO_RESEARCH_STORAGE_KEY);
          window.dispatchEvent(new CustomEvent(AUTO_RESEARCH_UPDATED_EVENT, { detail: emergencyState }));
          return {
            ...emergencyState,
            storageWarning: "Auto Research history could not be saved. Clear browser storage or Auto Research history.",
            storageEmergencyMode: true
          };
        }
      }
    }
  }
  return state;
};

export function loadAutoResearchState(): AutoResearchState {
  if (!isBrowser()) {
    return initialState();
  }
  const raw = window.localStorage.getItem(AUTO_RESEARCH_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AutoResearchState>;
    return {
      ...initialState(),
      ...parsed,
      cycles: safeArray(parsed.cycles),
      followUpSearchPlans: safeArray(parsed.followUpSearchPlans),
      latestFollowUpSearchPlanId: parsed.latestFollowUpSearchPlanId,
      auditTrail: safeArray(parsed.auditTrail),
      activeCheckpoint: parsed.activeCheckpoint,
      recoveryCheckpoint: parsed.recoveryCheckpoint,
      checkpointHistory: safeArray(parsed.checkpointHistory),
      cancelRequestedCycleId: parsed.cancelRequestedCycleId,
      lastStoredBytes: parsed.lastStoredBytes,
      storageWarning: parsed.storageWarning,
      storageEmergencyMode: parsed.storageEmergencyMode
    };
  } catch {
    return publish(initialState());
  }
}

export function publishAutoResearchCheckpoint(checkpoint: AutoResearchExecutionCheckpoint): AutoResearchState {
  const state = loadAutoResearchState();
  return publish({
    ...state,
    activeCheckpoint: checkpoint.status === "running" ? checkpoint : undefined,
    recoveryCheckpoint: checkpoint.status === "running" ? state.recoveryCheckpoint : checkpoint,
    checkpointHistory: safeTopN([checkpoint, ...safeArray(state.checkpointHistory)], 20),
    auditTrail: safeTopN([
      audit(checkpoint.cycleId, checkpoint.status === "canceled" ? "cycle_canceled" : "checkpoint", checkpoint.message ?? checkpoint.phase, {
        candidatesTested: checkpoint.currentCandidate,
        selectedCandidateId: checkpoint.bestCandidateId
      }),
      ...safeArray(state.auditTrail)
    ], 80)
  });
}

export function requestAutoResearchCancel(cycleId?: string): AutoResearchState {
  const state = loadAutoResearchState();
  const targetCycleId = cycleId ?? state.activeCheckpoint?.cycleId;
  return publish({
    ...state,
    cancelRequestedCycleId: targetCycleId,
    activeCheckpoint: state.activeCheckpoint
      ? {
          ...state.activeCheckpoint,
          message: "Cancel requested. The current candidate will finish, then the cycle will stop."
        }
      : state.activeCheckpoint
  });
}

export function discardAutoResearchRecoveryState(): AutoResearchState {
  const state = loadAutoResearchState();
  return publish({
    ...state,
    activeCheckpoint: undefined,
    recoveryCheckpoint: undefined,
    cancelRequestedCycleId: undefined,
    checkpointHistory: safeTopN(state.checkpointHistory, 20)
  });
}

export function saveAutoResearchCycle(cycle: AutoResearchCycle): AutoResearchState {
  const state = loadAutoResearchState();
  const stoppedCheckpoint =
    cycle.status === "failed" || cycle.status === "canceled"
      ? {
          ...(state.activeCheckpoint ?? {
            checkpointId: uid("auto_checkpoint"),
            cycleId: cycle.cycleId,
            startedAt: cycle.timestamp,
            updatedAt: new Date().toISOString(),
            elapsedMs: 0,
            phase: cycle.status,
            currentCandidate: cycle.candidatesTested,
            totalCandidates: cycle.candidateConfigs.length,
            status: cycle.status === "canceled" ? "canceled" : "failed"
          }),
          updatedAt: new Date().toISOString(),
          status: cycle.status === "canceled" ? "canceled" as const : "failed" as const,
          message: cycle.error ?? (cycle.status === "canceled" ? "Auto Research was canceled before completion." : "Auto Research failed before completion.")
        }
      : undefined;
  return publish({
    ...state,
    latestCycleId: cycle.cycleId,
    activeCheckpoint: undefined,
    recoveryCheckpoint: stoppedCheckpoint ?? (cycle.status === "completed" || cycle.status === "proposal_created" ? undefined : state.recoveryCheckpoint),
    cancelRequestedCycleId: undefined,
    checkpointHistory: stoppedCheckpoint ? safeTopN([stoppedCheckpoint, ...safeArray(state.checkpointHistory)], 20) : state.checkpointHistory,
    cycles: safeTopN([compactAutoResearchCycle(cycle), ...safeArray(state.cycles).filter((item) => item.cycleId !== cycle.cycleId)], 5),
    auditTrail: safeTopN([
      audit(
        cycle.cycleId,
        cycle.status === "proposal_created"
          ? "proposal_created"
          : cycle.status === "failed"
            ? "cycle_failed"
            : cycle.status === "canceled"
              ? "cycle_canceled"
              : "cycle_completed",
        cycle.createdProposalId
          ? `Created proposal ${cycle.createdProposalId}.`
          : cycle.status === "canceled"
            ? "Canceled Auto Research before completion. Partial progress checkpoint was retained."
          : cycle.error ??
            `Completed ${safeArray(cycle.candidateResults).length} candidate evaluations. Final category: ${cycle.finalResultCategory}.`,
        {
          searchMode: cycle.searchMode,
          candidatesTested: cycle.candidatesTested,
          candidateScores: cycle.candidateScores,
          selectedCandidateId: cycle.selectedCandidateId,
          finalResultCategory: cycle.finalResultCategory
        }
      ),
      ...safeArray(state.auditTrail)
    ], 80)
  });
}

export function saveAutoResearchFollowUpSearchPlan(plan: WalkForwardFollowUpSearchPlan): AutoResearchState {
  const state = loadAutoResearchState();
  return publish({
    ...state,
    latestFollowUpSearchPlanId: plan.planId,
    followUpSearchPlans: safeTopN(
      [plan, ...safeArray(state.followUpSearchPlans).filter((item) => item.planId !== plan.planId)],
      10
    ),
    auditTrail: safeTopN(
      [
        audit(plan.sourceRunId, "followup_plan_created", `Created walk-forward follow-up plan ${plan.planId}.`, {
          searchMode: plan.recommendedSearchMode
        }),
        ...safeArray(state.auditTrail)
      ],
      80
    )
  });
}

export function clearAutoResearchHistory(): AutoResearchState {
  return publish(initialState());
}

export function estimateAutoResearchStateSize(state = loadAutoResearchState()) {
  return bytesFor(state);
}

export function latestAutoResearchCycle(state = loadAutoResearchState()) {
  const cycles = safeArray(state.cycles);
  return cycles.find((cycle) => cycle.cycleId === state.latestCycleId) ?? cycles[0];
}

const evaluateCandidate = (
  candidate: ReturnType<typeof generateCandidateConfigs>[number],
  baselineMetrics: ReturnType<typeof summarizeValidationMetrics>,
  candles: Candle[]
): AutoResearchCandidateResult => {
  const originalWeights = loadICTScoringWeights();
  const hasICTWeightPatch = Boolean(candidate.ictScoringWeights);

  if (hasICTWeightPatch) {
    saveICTScoringWeights({
      ...originalWeights,
      ...candidate.ictScoringWeights
    });
  }

  try {
    const backtestResult = runBacktest(candles, candidate.config);
    const validationReport = runValidationSuite(candles, candidate.config);
    const researchQualityReview = analyzeValidationResults(validationReport);
    const readinessEstimate = evaluateReadinessGate({
      validation: validationReport,
      quality: researchQualityReview,
      runbook: loadSimulationRunbookState()
    });
    const metrics = summarizeValidationMetrics(validationReport);
    const comparisonResult = compareProposalToBaseline(baselineMetrics, metrics);
    const scoreBreakdown = scoreCandidateConfig({
      baselineMetrics,
      metrics,
      validation: validationReport,
      quality: researchQualityReview,
      scoringCriteria: defaultAutoResearchScoringCriteria
    });

    return {
      candidateId: candidate.candidateId,
      label: candidate.label,
      rationale: candidate.rationale,
      config: candidate.config,
      ictScoringWeights: candidate.ictScoringWeights,
      changedParameters: candidate.changedParameters,
      backtestResult,
      validationReport,
      researchQualityReview,
      readinessEstimate,
      metrics,
      scoreBreakdown,
      comparisonResult,
      resultCategory: "rejected",
      promotionEligible: false,
      rejectionReasons: []
    };
  } finally {
    if (hasICTWeightPatch) {
      saveICTScoringWeights(originalWeights);
    }
  }
};

const shouldCreateProposal = (candidate: AutoResearchCandidateResult | undefined, baselineMetrics: CalibrationProposalMetrics) => {
  const promotionVerdict = candidate?.comparisonResult?.promotionVerdict ?? "needs_follow_up";
  return Boolean(
    candidate &&
      materialMetricsChanged(baselineMetrics, candidate.metrics) &&
      hasMaterialImprovement(baselineMetrics, candidate.metrics) &&
      candidate.promotionEligible &&
      candidate.scoreBreakdown.stabilityImproved &&
      candidate.scoreBreakdown.sufficientSample &&
      candidate.comparisonResult?.improved &&
      candidate.comparisonResult?.stabilityImproved &&
      !safeArray(candidate.comparisonResult?.criticalRegressions).length &&
      promotionVerdict !== "needs_follow_up" &&
      promotionVerdict !== "reject" &&
      promotionVerdict !== "no_material_change" &&
      candidate.scoreBreakdown.totalScore >= 45
  );
};

const skippedSignalImbalanceFor = (candidate?: AutoResearchCandidateResult) => {
  const metrics = candidate?.metrics;
  if (!metrics) {
    return 1;
  }
  return metrics.skippedSignals / Math.max(1, metrics.totalTrades + metrics.skippedSignals);
};

const diagnoseFailedGates = (
  candidate: AutoResearchCandidateResult | undefined,
  baselineMetrics: ReturnType<typeof summarizeValidationMetrics>
): AutoResearchFailedGate[] => {
  if (!candidate) {
    return ["trade_count_too_low", "conservative_scenario_unstable"];
  }
  const metrics = candidate.metrics ?? fallbackMetrics();
  const score = { ...fallbackScoreBreakdown(), ...(candidate.scoreBreakdown ?? {}) };
  const gates: AutoResearchFailedGate[] = [];
  const rejectionText = safeArray(candidate.rejectionReasons).join(" ").toLowerCase();
  const criticalText = safeArray(candidate.comparisonResult?.criticalRegressions).join(" ").toLowerCase();

  if (metrics.maxDrawdown > Math.max(6, baselineMetrics.maxDrawdown + 1.5) || score.drawdownScore < 55) {
    gates.push("max_drawdown_too_high");
  }
  if (metrics.falsePositiveCount > Math.max(6, baselineMetrics.falsePositiveCount + 3) || score.falsePositiveScore < 65) {
    gates.push("false_positives_too_high");
  }
  if (metrics.averageR < baselineMetrics.averageR - 0.1 || score.averageRScore < 45 || criticalText.includes("average r")) {
    gates.push("average_r_too_low");
  }
  if (metrics.winRate < 0.36 || score.winRateScore < 45 || criticalText.includes("win rate")) {
    gates.push("win_rate_too_low");
  }
  if (
    !score.sufficientSample ||
    metrics.totalTrades < 3 ||
    rejectionText.includes("enough simulated trades") ||
    criticalText.includes("trade") ||
    criticalText.includes("sample")
  ) {
    gates.push("trade_count_too_low");
  }
  if (metrics.confidenceCalibration < 0.55 || score.confidenceCalibrationScore < 55) {
    gates.push("confidence_calibration_weak");
  }
  if (score.sessionConsistencyScore < 50) {
    gates.push("session_consistency_weak");
  }
  if (!metrics.conservativeScenarioStable || rejectionText.includes("conservative scenario")) {
    gates.push("conservative_scenario_unstable");
  }
  if (skippedSignalImbalanceFor(candidate) > 0.72 || score.skippedSignalBalanceScore < 45 || criticalText.includes("skipped")) {
    gates.push("skipped_signal_imbalance");
  }
  if (
    candidate.resultCategory === "unsafe_overfit" ||
    (score.totalScore >= 70 && (metrics.totalTrades < 4 || skippedSignalImbalanceFor(candidate) > 0.82))
  ) {
    gates.push("overfitting_risk");
  }

  return uniqueFailedGates(gates.length ? gates : ["conservative_scenario_unstable"]);
};

const adaptiveOutcomeFor = (
  candidate: AutoResearchCandidateResult | undefined,
  failedGates: AutoResearchFailedGate[],
  maxPassesExhausted = false
): AutoResearchAdaptiveOutcome => {
  if (maxPassesExhausted && candidate?.resultCategory !== "paper_demo_candidate" && candidate?.resultCategory !== "research_ready_candidate") {
    return "max_passes_exhausted";
  }
  if (!candidate) {
    return "no_safe_candidate_found";
  }
  if (candidate.resultCategory === "paper_demo_candidate") {
    return "paper_demo_candidate";
  }
  if (candidate.resultCategory === "research_ready_candidate" || candidate.resultCategory === "research_ready") {
    return "research_ready_candidate";
  }
  if (candidate.resultCategory === "unsafe_overfit" || failedGates.includes("overfitting_risk")) {
    return "unsafe_overfit";
  }
  if (candidate.resultCategory === "improved_but_not_ready" || candidate.scoreBreakdown.stabilityImproved) {
    return "improved_but_not_ready";
  }
  return "no_safe_candidate_found";
};

const shouldStopAdaptiveSearch = (candidate?: AutoResearchCandidateResult) =>
  Boolean(candidate && ["paper_demo_candidate", "research_ready_candidate", "research_ready"].includes(candidate.resultCategory));

const targetedChangesFor = (candidates: AutoResearchAdaptivePass["generatedCandidates"]) =>
  safeTopN([...new Set(safeArray(candidates).flatMap((candidate) => safeArray(candidate.changedParameters)))], 8);

const reasonForAdaptivePass = (passNumber: number, failedGates: AutoResearchFailedGate[]) =>
  passNumber === 1
    ? "Initial bounded configuration search."
    : `Targeted follow-up for ${failedGates.map((gate) => failedGateLabels[gate]).join(", ")}.`;

const recoveryFailureReasonsFor = (
  diagnostics: ReturnType<typeof diagnoseTradeGeneration>,
  recoveryResults: AutoResearchCandidateResult[]
) => {
  const maxTrades = Math.max(0, ...safeArray(recoveryResults).map((candidate) => candidate.metrics.totalTrades));
  const reasons = safeArray(diagnostics)
    .filter((item) => item.severity === "blocking")
    .map((item) => `${item.reasonCode.replace(/_/g, " ")}: ${item.suggestedFix}`);
  if (maxTrades === 0) {
    reasons.unshift("Recovery candidates still produced zero simulated trades.");
  }
  return safeTopN(reasons, 6);
};

const tradeQualitySummaryFor = ({
  diagnostics,
  candidates,
  bestCandidate
}: {
  diagnostics: ReturnType<typeof diagnoseTradeQuality>;
  candidates: ReturnType<typeof generateTradeQualityCandidateConfigs>;
  bestCandidate?: AutoResearchCandidateResult;
}): AutoResearchCycle["tradeQualitySummary"] => {
  const topIssue =
    safeArray(diagnostics).find((item) => item.severity === "blocking") ??
    safeArray(diagnostics).find((item) => item.severity === "warning") ??
    safeArray(diagnostics)[0];
  const changed = safeArray(candidates).flatMap((candidate) => safeArray(candidate.changedParameters));
  return {
    topIssue: topIssue?.reasonCode,
    recommendedNextTest: topIssue?.suggestedFix ?? bestCandidate?.label ?? "Run a targeted stop/target/session quality pass.",
    testedStopModels: safeTopN(
      safeArray(candidates)
        .filter((candidate) => safeArray(candidate.changedParameters).includes("stopModel"))
        .map((candidate) => candidate.label),
      5
    ),
    testedTargetModels: safeTopN(
      safeArray(candidates)
        .filter((candidate) => safeArray(candidate.changedParameters).includes("targetRMultiple"))
        .map((candidate) => candidate.label),
      5
    ),
    sessionDirectionFindings: safeTopN(
      [
        ...safeArray(candidates)
          .filter((candidate) => safeArray(candidate.changedParameters).includes("sessionFilter"))
          .map((candidate) => candidate.label),
        ...safeArray(candidates)
          .filter((candidate) => safeArray(candidate.changedParameters).includes("allowLong") || safeArray(candidate.changedParameters).includes("allowShort"))
          .map((candidate) => candidate.label),
        bestCandidate ? `Best quality candidate: ${bestCandidate.label}` : undefined,
        changed.length ? `Changed parameters tested: ${[...new Set(changed)].join(", ")}` : undefined
      ].filter((item): item is string => Boolean(item)),
      6
    )
  };
};

const falsePositivesControlled = (candidate?: AutoResearchCandidateResult) =>
  Boolean(candidate && candidate.metrics.falsePositiveCount <= 2 && candidate.scoreBreakdown.falsePositiveScore >= 70);

const sessionConsistencyPassed = (candidate?: AutoResearchCandidateResult) =>
  Boolean(
    candidate &&
      (candidate.scoreBreakdown.sessionConsistencyScore >= 50 ||
        safeArray(candidate.researchQualityReview?.sessionComparison).some(
          (session) => session.readiness !== "red" && session.totalTrades > 0 && session.averageR >= -0.1
        ))
  );

const conservativeScenarioStabilityPassed = (candidate?: AutoResearchCandidateResult) =>
  Boolean(
    candidate &&
      (candidate.metrics.conservativeScenarioStable ||
        safeArray(candidate.validationReport?.scenarios).some(
          (scenario) => scenario.id === "conservative-confluence" && scenario.readiness === "green"
        ))
  );

const isConfluenceBlockedZeroTradeRun = (diagnostics: ReturnType<typeof diagnoseTradeGeneration>) =>
  safeArray(diagnostics)[0]?.reasonCode === "confluence_threshold_too_high" ||
  safeArray(diagnostics).some((item) => item.reasonCode === "confluence_threshold_too_high");

const isZeroTradeRecoveryProposalEligible = ({
  diagnostics,
  recoveryResult,
  tradesBeforeRecovery,
  tradesAfterRecovery
}: {
  diagnostics: ReturnType<typeof diagnoseTradeGeneration>;
  recoveryResult?: AutoResearchCandidateResult;
  tradesBeforeRecovery: number;
  tradesAfterRecovery: number;
}) =>
  tradesBeforeRecovery === 0 &&
  tradesAfterRecovery > 0 &&
  isConfluenceBlockedZeroTradeRun(diagnostics);

const confluenceDiagnosticFor = (diagnostics: ReturnType<typeof diagnoseTradeGeneration>) =>
  safeArray(diagnostics).find((item) => item.reasonCode === "confluence_threshold_too_high");

const observedConfluenceFor = (diagnostics: ReturnType<typeof diagnoseTradeGeneration>) => {
  const observed = confluenceDiagnosticFor(diagnostics)?.observedConfluenceScore;
  return typeof observed === "number" && Number.isFinite(observed) && observed > 0
    ? roundThreshold(observed)
    : undefined;
};

const selectTradeProducingRecoveryResult = (
  baselineConfig: ReturnType<typeof loadBacktestConfig>,
  recoveryResults: AutoResearchCandidateResult[]
) => {
  const producing = safeArray(recoveryResults).filter((candidate) => candidate.metrics.totalTrades > 0);
  if (!producing.length) {
    return undefined;
  }
  const thresholdUnlocks = producing.filter(
    (candidate) =>
      candidate.config.minimumConfluenceThreshold < baselineConfig.minimumConfluenceThreshold &&
      safeArray(candidate.changedParameters).includes("confluenceThreshold")
  );
  const pool = thresholdUnlocks.length ? thresholdUnlocks : producing;
  return [...pool].sort(
    (a, b) =>
      b.metrics.totalTrades - a.metrics.totalTrades ||
      b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore ||
      a.config.minimumConfluenceThreshold - b.config.minimumConfluenceThreshold
  )[0];
};

const recoveryMetadataFor = ({
  baselineConfig,
  diagnostics,
  recoveryResult,
  tradesAfterRecovery
}: {
  baselineConfig: ReturnType<typeof loadBacktestConfig>;
  diagnostics: ReturnType<typeof diagnoseTradeGeneration>;
  recoveryResult?: AutoResearchCandidateResult;
  tradesAfterRecovery: number;
}): AutoResearchRecoveryMetadata | undefined => {
  if (!recoveryResult || tradesAfterRecovery <= 0) {
    return undefined;
  }

  const activeThreshold = baselineConfig.minimumConfluenceThreshold;
  const observedICTConfluence = observedConfluenceFor(diagnostics);
  const recoveryThreshold = recoveryResult.config.minimumConfluenceThreshold;
  const hasUsableRecoveryThreshold =
    typeof recoveryThreshold === "number" &&
    Number.isFinite(recoveryThreshold) &&
    recoveryThreshold < activeThreshold &&
    (observedICTConfluence === undefined || recoveryThreshold <= observedICTConfluence);

  const proposedFromObserved =
    observedICTConfluence !== undefined
      ? Math.max(ZERO_TRADE_CONFLUENCE_FLOOR, observedICTConfluence - ZERO_TRADE_CONFLUENCE_BUFFER)
      : Math.max(ZERO_TRADE_CONFLUENCE_FLOOR, activeThreshold - 0.08);
  const rawProposedThreshold = hasUsableRecoveryThreshold ? recoveryThreshold : proposedFromObserved;
  const proposedConfluenceThreshold = roundThreshold(
    Math.min(
      rawProposedThreshold,
      Math.max(0.01, activeThreshold - 0.01)
    )
  );
  const thresholdSource = hasUsableRecoveryThreshold ? "recovery_candidate" : "observed_confluence_buffer";
  const calculation = hasUsableRecoveryThreshold
    ? `Used trade-producing recovery candidate ${recoveryResult.candidateId} threshold ${formatThresholdPercent(recoveryThreshold)}.`
    : observedICTConfluence !== undefined
      ? `Computed max(${formatThresholdPercent(ZERO_TRADE_CONFLUENCE_FLOOR)}, observed ${formatThresholdPercent(observedICTConfluence)} - ${formatThresholdPercent(ZERO_TRADE_CONFLUENCE_BUFFER)}) and capped below active ${formatThresholdPercent(activeThreshold)}.`
      : `Observed confluence unavailable; used bounded fallback below active ${formatThresholdPercent(activeThreshold)} with floor ${formatThresholdPercent(ZERO_TRADE_CONFLUENCE_FLOOR)}.`;

  return {
    recoveryCandidateId: recoveryResult.candidateId,
    recoveryCandidateLabel: recoveryResult.label,
    recoveryConfluenceThreshold: recoveryThreshold,
    recoveryConfidenceThreshold: recoveryResult.config.minimumConfidenceThreshold,
    recoverySessionFilter: recoveryResult.config.sessionFilter,
    recoveryStopModel: recoveryResult.config.stopModel,
    tradesProduced: recoveryResult.metrics.totalTrades,
    observedICTConfluence,
    activeConfluenceThreshold: activeThreshold,
    proposedConfluenceThreshold,
    thresholdSource,
    calculation
  };
};

const createZeroTradeRecoveryProposal = ({
  baselineConfig,
  baselineMetrics,
  recoveryResult,
  recoveryMetadata,
  tradesBeforeRecovery,
  tradesAfterRecovery
}: {
  baselineConfig: ReturnType<typeof loadBacktestConfig>;
  baselineMetrics: CalibrationProposalMetrics;
  recoveryResult: AutoResearchCandidateResult;
  recoveryMetadata: AutoResearchRecoveryMetadata;
  tradesBeforeRecovery: number;
  tradesAfterRecovery: number;
}): CalibrationProposal => {
  const confluenceThreshold = recoveryMetadata.proposedConfluenceThreshold;
  const proposedConfig = {
    ...baselineConfig,
    minimumConfluenceThreshold: confluenceThreshold
  };
  const qualityGatesPassed = [
    falsePositivesControlled(recoveryResult) ? "false positives controlled" : undefined,
    sessionConsistencyPassed(recoveryResult) ? "session consistency passed" : undefined,
    conservativeScenarioStabilityPassed(recoveryResult) ? "conservative scenario stability passed" : undefined
  ].filter((item): item is string => Boolean(item));

  return {
    proposalId: uid("calibration_proposal"),
    timestamp: new Date().toISOString(),
    source: "internal",
    status: "proposed",
    proposalIntent: "research_calibration_candidate",
    mode: "simulation",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    reason:
      `Active threshold ${formatThresholdPercent(recoveryMetadata.activeConfluenceThreshold)} exceeded ` +
      `${recoveryMetadata.observedICTConfluence !== undefined ? `observed ICT confluence ${formatThresholdPercent(recoveryMetadata.observedICTConfluence)}` : "the observed ICT confluence evidence"}, ` +
      `blocking all trades. Recovery produced ${tradesAfterRecovery} trades using threshold ` +
      `${formatThresholdPercent(recoveryMetadata.recoveryConfluenceThreshold ?? confluenceThreshold)}.`,
    targetProblem: "trade_generation_blocked",
    proposedChanges: {
      confluenceThreshold
    },
    expectedImprovement:
      "Generate enough simulated trades for outcome scoring while preserving false-positive, session consistency, and conservative stability gates.",
    safetyNotes: [
      "Simulation only.",
      "Broker execution disabled.",
      "Readiness not overridden.",
      "Approval required before active calibration changes."
    ],
    beforeMetrics: baselineMetrics,
    afterMetrics: recoveryResult.metrics,
    comparisonResult: compareProposalToBaseline(baselineMetrics, recoveryResult.metrics),
    baselineConfig,
    proposedConfig,
    approvalRequired: true,
    tradesBeforeRecovery,
    tradesAfterRecovery,
    observedICTConfluence: recoveryMetadata.observedICTConfluence,
    activeConfluenceThreshold: recoveryMetadata.activeConfluenceThreshold,
    proposedConfluenceThreshold: recoveryMetadata.proposedConfluenceThreshold,
    recoveryCandidateId: recoveryMetadata.recoveryCandidateId,
    recoveryConfluenceThreshold: recoveryMetadata.recoveryConfluenceThreshold,
    recoveryConfidenceThreshold: recoveryMetadata.recoveryConfidenceThreshold,
    recoverySessionFilter: recoveryMetadata.recoverySessionFilter,
    recoveryStopModel: recoveryMetadata.recoveryStopModel,
    recoveryTradesProduced: recoveryMetadata.tradesProduced,
    thresholdCalculation: recoveryMetadata.calculation,
    qualityGatesPassed,
    sourceCandidateId: recoveryResult.candidateId,
    sourceCandidateLabel: recoveryResult.label,
    improvementSummary: [
      `Trades before recovery: ${tradesBeforeRecovery}; trades after recovery: ${tradesAfterRecovery}.`,
      `Confluence threshold: active ${formatThresholdPercent(recoveryMetadata.activeConfluenceThreshold)}, observed ${recoveryMetadata.observedICTConfluence !== undefined ? formatThresholdPercent(recoveryMetadata.observedICTConfluence) : "n/a"}, proposed ${formatThresholdPercent(confluenceThreshold)}.`,
      `Recovery evidence: ${recoveryMetadata.recoveryCandidateLabel ?? "candidate"} produced ${recoveryMetadata.tradesProduced} trades at ${formatThresholdPercent(recoveryMetadata.recoveryConfluenceThreshold ?? confluenceThreshold)}.`,
      `Stability score: ${baselineMetrics.stabilityScore} -> ${recoveryResult.metrics.stabilityScore}.`,
      `Readiness: ${baselineMetrics.readinessStatus} -> ${recoveryResult.metrics.readinessStatus}.`
    ],
    notReadyReasons: safeTopN(recoveryResult.rejectionReasons, 4),
    nextValidationRequirement: "Approve the research calibration, rerun the AI Research Cycle, then rerun validation and readiness.",
    baselineStabilityScore: baselineMetrics.stabilityScore,
    candidateStabilityScore: recoveryResult.metrics.stabilityScore
  };
};

const patchesMatch = (left: CalibrationProposal["proposedChanges"], right: CalibrationProposal["proposedChanges"]) =>
  left.confluenceThreshold === right.confluenceThreshold &&
  left.confidenceThreshold === right.confidenceThreshold &&
  left.sessionFilter === right.sessionFilter &&
  left.stopModel === right.stopModel &&
  left.targetRMultiple === right.targetRMultiple;

const duplicateActiveCalibrationMessage = (
  proposal: CalibrationProposal,
  activeCalibration = loadActiveResearchCalibration()
) => {
  if (!activeCalibration) {
    return undefined;
  }
  if (patchesMatch(proposal.proposedChanges, activeCalibration.appliedConfigPatch)) {
    return "Approved confluence calibration is already active; trade generation remains blocked, so a different adjustment is needed.";
  }
  const proposedThreshold = proposal.proposedChanges.confluenceThreshold;
  const activeThreshold = activeCalibration.appliedConfigPatch.confluenceThreshold;
  if (
    proposal.targetProblem === "trade_generation_blocked" &&
    typeof proposedThreshold === "number" &&
    typeof activeThreshold === "number" &&
    proposedThreshold >= activeThreshold
  ) {
    return "Approved confluence calibration is already active; trade generation remains blocked, so a different adjustment is needed.";
  }
  return undefined;
};

const candidateImprovedForResearch = (
  candidate: AutoResearchCandidateResult | undefined,
  baselineMetrics: CalibrationProposalMetrics
) => {
  const promotionVerdict = candidate?.comparisonResult?.promotionVerdict ?? "needs_follow_up";
  return Boolean(
    candidate &&
      materialMetricsChanged(baselineMetrics, candidate.metrics) &&
      hasMaterialImprovement(baselineMetrics, candidate.metrics) &&
      candidate.resultCategory !== "unsafe_overfit" &&
      candidate.metrics.totalTrades > 0 &&
      !safeArray(candidate.comparisonResult?.criticalRegressions).length &&
      promotionVerdict !== "needs_follow_up" &&
      promotionVerdict !== "reject" &&
      promotionVerdict !== "no_material_change" &&
      (candidate.resultCategory === "improved_but_not_ready" ||
        candidate.resultCategory === "research_ready_candidate" ||
        candidate.resultCategory === "research_ready" ||
        candidate.scoreBreakdown.stabilityImproved ||
        candidate.comparisonResult?.stabilityImproved ||
        candidate.metrics.totalTrades > baselineMetrics.totalTrades ||
        candidate.metrics.stabilityScore > baselineMetrics.stabilityScore ||
        candidate.metrics.averageR > baselineMetrics.averageR + 0.05)
  );
};

const improvementSummaryFor = (
  candidate: AutoResearchCandidateResult,
  baselineMetrics: CalibrationProposalMetrics
) => {
  const summary = [
    candidate.metrics.totalTrades !== baselineMetrics.totalTrades
      ? `Trades: ${baselineMetrics.totalTrades} -> ${candidate.metrics.totalTrades}.`
      : undefined,
    candidate.metrics.stabilityScore !== baselineMetrics.stabilityScore
      ? `Stability score: ${baselineMetrics.stabilityScore} -> ${candidate.metrics.stabilityScore}.`
      : undefined,
    candidate.metrics.maxDrawdown !== baselineMetrics.maxDrawdown
      ? `Max drawdown: ${baselineMetrics.maxDrawdown}R -> ${candidate.metrics.maxDrawdown}R.`
      : undefined,
    candidate.metrics.averageR !== baselineMetrics.averageR
      ? `Average R: ${baselineMetrics.averageR}R -> ${candidate.metrics.averageR}R.`
      : undefined,
    candidate.metrics.falsePositiveCount !== baselineMetrics.falsePositiveCount
      ? `False positives: ${baselineMetrics.falsePositiveCount} -> ${candidate.metrics.falsePositiveCount}.`
      : undefined,
    candidate.metrics.readinessStatus !== baselineMetrics.readinessStatus
      ? `Readiness: ${baselineMetrics.readinessStatus} -> ${candidate.metrics.readinessStatus}.`
      : undefined
  ].filter((item): item is string => Boolean(item));

  return summary.length ? summary : ["Candidate improved the stability-first score but still requires validation."];
};

const proposalPassEntryFor = (
  candidate: AutoResearchCandidateResult | undefined,
  adaptivePasses: AutoResearchAdaptivePass[]
) =>
  safeArray(adaptivePasses).find((pass) => pass.bestCandidatePerPass?.candidateId === candidate?.candidateId);

const findResearchCalibrationCandidate = ({
  bestCandidate,
  closestCandidates,
  adaptivePasses,
  baselineMetrics
}: {
  bestCandidate?: AutoResearchCandidateResult;
  closestCandidates: AutoResearchCandidateResult[];
  adaptivePasses: AutoResearchAdaptivePass[];
  baselineMetrics: CalibrationProposalMetrics;
}) => {
  const candidates = [
    bestCandidate,
    ...safeArray(adaptivePasses).map((pass) => pass.bestCandidatePerPass),
    ...safeArray(closestCandidates)
  ];
  const unique = new Map<string, AutoResearchCandidateResult>();
  candidates.forEach((candidate) => {
    if (candidate && candidateImprovedForResearch(candidate, baselineMetrics)) {
      unique.set(candidate.candidateId, candidate);
    }
  });

  return [...unique.values()].sort((a, b) => {
    const categoryScore = (candidate: AutoResearchCandidateResult) =>
      candidate.resultCategory === "research_ready_candidate" || candidate.resultCategory === "research_ready"
        ? 3
        : candidate.resultCategory === "improved_but_not_ready"
          ? 2
          : 1;
    return categoryScore(b) - categoryScore(a) || b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore;
  })[0];
};

const createResearchCalibrationCandidateProposal = ({
  baselineConfig,
  baselineMetrics,
  candidate,
  adaptivePasses
}: {
  baselineConfig: ReturnType<typeof loadBacktestConfig>;
  baselineMetrics: CalibrationProposalMetrics;
  candidate: AutoResearchCandidateResult;
  adaptivePasses: AutoResearchAdaptivePass[];
}): CalibrationProposal => {
  const passEntry = proposalPassEntryFor(candidate, adaptivePasses);
  const notReadyReasons = safeTopN(candidate.rejectionReasons, 4);
  const proposal = createSelfImprovementFromCandidate({
    baselineConfig,
    baselineMetrics,
    candidate,
    source: "internal",
    proposalIntent: "research_calibration_candidate"
  });

  return {
    ...proposal,
    reason:
      `Auto Research found an improved-but-not-ready research calibration candidate${passEntry ? ` in pass ${passEntry.passNumber}` : ""}: ` +
      `${candidate.label}. It can improve the research baseline, but it does not grant Paper-Demo Candidate status.`,
    expectedImprovement:
      "Improve the active research baseline for the next simulation cycle. After approval, rerun validation, research quality, and readiness before considering any paper-demo review.",
    safetyNotes: [
      "This does not grant Paper-Demo Candidate.",
      "This does not enable demo/live trading.",
      "This does not override readiness.",
      "This is only a proposed baseline research calibration.",
      "User approval is required before active settings change."
    ],
    sourceCandidateId: candidate.candidateId,
    sourceCandidateLabel: candidate.label,
    sourceAdaptivePassNumber: passEntry?.passNumber,
    improvementSummary: improvementSummaryFor(candidate, baselineMetrics),
    notReadyReasons,
    nextValidationRequirement: "Approve research calibration, rerun the AI Research Cycle, rerun validation, then check readiness again.",
    baselineStabilityScore: baselineMetrics.stabilityScore,
    candidateStabilityScore: candidate.metrics.stabilityScore
  };
};

export async function runAutoResearchCycle(options: AutoResearchRunOptions): Promise<AutoResearchCycle> {
  const cycleId = uid("auto_cycle");
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const checkpointId = uid("auto_checkpoint");
  const isCanceled = () =>
    Boolean(options.signal?.aborted) ||
    (isBrowser() && loadAutoResearchState().cancelRequestedCycleId === cycleId);
  const throwIfStopped = () => {
    if (isCanceled()) {
      throw new AutoResearchCanceledError();
    }
    if (Date.now() - startedAtMs > timeoutMs) {
      throw new AutoResearchTimeoutError(`Auto Research stopped after exceeding ${Math.round(timeoutMs / 1000)}s browser-safe limit.`);
    }
  };
  const checkpoint = (partial: Partial<AutoResearchExecutionCheckpoint>) => {
    const nextCheckpoint: AutoResearchExecutionCheckpoint = {
      checkpointId,
      cycleId,
      startedAt,
      updatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAtMs,
      phase: partial.phase ?? "running",
      status: partial.status ?? "running",
      currentCandidate: partial.currentCandidate ?? 0,
      totalCandidates: partial.totalCandidates ?? options.maxCandidateCount,
      currentPass: partial.currentPass,
      totalPasses: partial.totalPasses,
      currentCandidateName: partial.currentCandidateName,
      bestCandidateId: partial.bestCandidateId,
      bestCandidateLabel: partial.bestCandidateLabel,
      bestCandidateScore: partial.bestCandidateScore,
      bestCandidateCategory: partial.bestCandidateCategory,
      message: partial.message
    };
    publishAutoResearchCheckpoint(nextCheckpoint);
    options.onCheckpoint?.(nextCheckpoint);
    return nextCheckpoint;
  };
  checkpoint({
    phase: "initializing",
    status: "running",
    currentCandidate: 0,
    totalCandidates: options.maxCandidateCount,
    message: "Preparing Auto Research candidate search."
  });
  try {
    const activeCandles = options.candles?.length ? options.candles : mockCandles;
    const activeResearchConfig = resolveActiveBacktestConfig();
    const baselineConfig = options.baselineConfig ? resolveActiveBacktestConfig(options.baselineConfig).config : activeResearchConfig.config;
    const proposalSnapshotContext = (sourceCandidateId?: string) => ({
      sourceCycleId: cycleId,
      sourceCandidateId,
      beforeMetricsSource: "baseline metrics before candidate change",
      afterMetricsSource: sourceCandidateId ? "tested candidate metrics" : "not tested",
      beforeSourceCycleId: cycleId,
      afterSourceCandidateId: sourceCandidateId,
      dataSource: options.dataSource ?? "mock",
      candleWindow: options.candleWindow ?? `${activeCandles.length} candles`,
      searchMode: options.searchMode,
      activeCalibrationIdUsed: options.activeCalibrationIdUsed ?? activeResearchConfig.activeCalibrationId
    });
    checkpoint({
      phase: "baseline_backtest",
      status: "running",
      currentCandidate: 0,
      totalCandidates: options.maxCandidateCount,
      message: "Running baseline backtest and validation before candidate search."
    });
    throwIfStopped();
    const baselineBacktest = runBacktest(activeCandles, baselineConfig);
    const tradesBeforeRecovery = baselineBacktest.summary.totalTrades;
    const tradeGenerationDiagnostics = tradesBeforeRecovery === 0
      ? diagnoseTradeGeneration({
          candles: activeCandles,
          config: baselineConfig,
          result: baselineBacktest
        })
      : [];
    const baselineValidation = runValidationSuite(activeCandles, baselineConfig);
    const baselineMetrics = summarizeValidationMetrics(baselineValidation);
    const tradeQualityDiagnostics = tradesBeforeRecovery > 0
      ? diagnoseTradeQuality({
          result: baselineBacktest,
          validation: baselineValidation
        })
      : [];
    await yieldToBrowser();
    throwIfStopped();
    const maxAdaptivePasses = Math.max(0, Math.min(2, options.maxAdaptivePasses ?? 2));
    const totalPasses = 1 + maxAdaptivePasses;
    const evaluatedCandidateResults: AutoResearchCandidateResult[] = [];
    const allCandidateConfigs: ReturnType<typeof generateCandidateConfigs> = [];
    const adaptivePasses: AutoResearchAdaptivePass[] = [];
    let priorBestCandidate: AutoResearchCandidateResult | undefined;
    let failedGatesForNextPass: AutoResearchFailedGate[] = [];
    let bestCandidate: AutoResearchCandidateResult | undefined;
    let candidateResults: AutoResearchCandidateResult[] = [];
    let closestCandidates: AutoResearchCandidateResult[] = [];
    let rejectedCandidates: AutoResearchCandidateResult[] = [];
    let recoveryAttempted = false;
    let recoveryCandidates: ReturnType<typeof generateTradeRecoveryCandidateConfigs> = [];
    let recoveryResult: AutoResearchCandidateResult | undefined;
    let recoveryMetadata: AutoResearchRecoveryMetadata | undefined;
    let tradesAfterRecovery = 0;
    let recoveryFailureReasons: string[] = [];
    let tradeQualityCandidateConfigs: ReturnType<typeof generateTradeQualityCandidateConfigs> = [];
    let tradeQualityBestCandidate: AutoResearchCandidateResult | undefined;
    let tradeQualitySummary: AutoResearchCycle["tradeQualitySummary"] | undefined;

    for (let passIndex = 0; passIndex < totalPasses; passIndex += 1) {
      const passNumber = passIndex + 1;
      const passFailedGates = passNumber === 1 ? [] : failedGatesForNextPass;
      const passCandidateConfigs =
        passNumber === 1
          ? generateCandidateConfigs(baselineConfig, options.searchMode, options.maxCandidateCount)
          : generateAdaptiveCandidateConfigs({
              baseline: baselineConfig,
              failedGates: passFailedGates,
              passNumber: passNumber - 1,
              maxCandidateCount: Math.min(options.maxCandidateCount, 10)
            });

      allCandidateConfigs.push(...passCandidateConfigs);
      checkpoint({
        phase: passNumber === 1 ? "initial_candidate_pass" : `targeted_pass_${passNumber - 1}`,
        status: "running",
        currentCandidate: evaluatedCandidateResults.length,
        totalCandidates: allCandidateConfigs.length,
        currentPass: passNumber,
        totalPasses,
        message: passNumber === 1 ? "Running initial bounded candidate pass." : "Running targeted adaptive candidate pass."
      });
      await yieldToBrowser();
      throwIfStopped();

      const passResults: AutoResearchCandidateResult[] = [];
      for (const candidate of passCandidateConfigs) {
        const candidateResult = evaluateCandidate(candidate, baselineMetrics, activeCandles);
        evaluatedCandidateResults.push(candidateResult);
        passResults.push(candidateResult);
        const { bestCandidate: bestCandidateSoFar } = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
        const progress: AutoResearchProgressSnapshot = {
          currentCandidate: evaluatedCandidateResults.length,
          totalCandidates: allCandidateConfigs.length,
          passNumber,
          totalPasses,
          passLabel: passNumber === 1 ? "initial pass" : `targeted pass ${passNumber - 1}`,
          failedGatesTargeted: passFailedGates,
          candidateId: candidateResult.candidateId,
          candidateLabel: candidateResult.label,
          candidateScore: candidateResult.scoreBreakdown.totalScore,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory
        };
        options.onCandidateEvaluated?.(progress);
        checkpoint({
          phase: progress.passLabel,
          status: "running",
          currentCandidate: progress.currentCandidate,
          totalCandidates: progress.totalCandidates,
          currentPass: passNumber,
          totalPasses,
          currentCandidateName: candidateResult.label,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory,
          message: `Evaluated ${candidateResult.label}.`
        });
        await yieldToBrowser();
        throwIfStopped();
      }

      const passSelection = selectBestCandidate(passResults, baselineMetrics);
      const allSelection = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
      bestCandidate = allSelection.bestCandidate;
      candidateResults = allSelection.candidateResults;
      closestCandidates = allSelection.closestCandidates;
      rejectedCandidates = allSelection.rejectedCandidates;
      const passBest = passSelection.bestCandidate ?? passSelection.closestCandidates[0];
      const diagnosedGates = diagnoseFailedGates(passBest, baselineMetrics);
      const improvementOverPriorPass = Boolean(
        passBest &&
          (!priorBestCandidate ||
            passBest.scoreBreakdown.totalScore > priorBestCandidate.scoreBreakdown.totalScore ||
            passBest.comparisonResult.stabilityImproved !== priorBestCandidate.comparisonResult.stabilityImproved)
      );
      const finalOutcome = adaptiveOutcomeFor(passBest, diagnosedGates, passNumber === totalPasses);
      adaptivePasses.push({
        passNumber,
        reasonForPass: reasonForAdaptivePass(passNumber, passFailedGates),
        failedGatesTargeted: passFailedGates,
        generatedCandidates: passCandidateConfigs,
        bestCandidatePerPass: passBest,
        improvementOverPriorPass,
        finalOutcome,
        targetedChanges: targetedChangesFor(passCandidateConfigs)
      });

      failedGatesForNextPass = diagnosedGates;
      priorBestCandidate = passBest ?? priorBestCandidate;

      if (shouldStopAdaptiveSearch(bestCandidate)) {
        break;
      }
    }

    if (tradesBeforeRecovery === 0) {
      recoveryAttempted = true;
      recoveryCandidates = generateTradeRecoveryCandidateConfigs(baselineConfig, 8, {
        suggestedConfluenceThreshold: confluenceDiagnosticFor(tradeGenerationDiagnostics)?.suggestedConfluenceThreshold
      });
      checkpoint({
        phase: "trade_generation_recovery",
        status: "running",
        currentCandidate: evaluatedCandidateResults.length,
        totalCandidates: allCandidateConfigs.length + recoveryCandidates.length,
        currentPass: totalPasses,
        totalPasses,
        message: "Running bounded zero-trade recovery candidates."
      });
      const recoveryResults: AutoResearchCandidateResult[] = [];
      for (const candidate of recoveryCandidates) {
        const candidateResult = evaluateCandidate(candidate, baselineMetrics, activeCandles);
        evaluatedCandidateResults.push(candidateResult);
        recoveryResults.push(candidateResult);
        const { bestCandidate: bestCandidateSoFar } = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
        const progress: AutoResearchProgressSnapshot = {
          currentCandidate: evaluatedCandidateResults.length,
          totalCandidates: allCandidateConfigs.length + recoveryCandidates.length,
          passNumber: totalPasses,
          totalPasses,
          passLabel: "trade generation recovery",
          failedGatesTargeted: ["trade_count_too_low"],
          candidateId: candidateResult.candidateId,
          candidateLabel: candidateResult.label,
          candidateScore: candidateResult.scoreBreakdown.totalScore,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory
        };
        options.onCandidateEvaluated?.(progress);
        checkpoint({
          phase: "trade_generation_recovery",
          status: "running",
          currentCandidate: progress.currentCandidate,
          totalCandidates: progress.totalCandidates,
          currentPass: totalPasses,
          totalPasses,
          currentCandidateName: candidateResult.label,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory,
          message: `Recovery candidate evaluated: ${candidateResult.label}.`
        });
        await yieldToBrowser();
        throwIfStopped();
      }
      allCandidateConfigs.push(...recoveryCandidates);
      const recoverySelection = selectBestCandidate(recoveryResults, baselineMetrics);
      const allSelection = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
      tradesAfterRecovery = Math.max(0, ...recoveryResults.map((candidate) => candidate.metrics.totalTrades));
      recoveryResult =
        selectTradeProducingRecoveryResult(baselineConfig, recoveryResults) ??
        recoverySelection.bestCandidate ??
        recoverySelection.closestCandidates[0];
      recoveryMetadata = recoveryMetadataFor({
        baselineConfig,
        diagnostics: tradeGenerationDiagnostics,
        recoveryResult,
        tradesAfterRecovery
      });
      recoveryFailureReasons = recoveryFailureReasonsFor(tradeGenerationDiagnostics, recoveryResults);
      bestCandidate = allSelection.bestCandidate;
      candidateResults = allSelection.candidateResults;
      closestCandidates = allSelection.closestCandidates;
      rejectedCandidates = allSelection.rejectedCandidates;
    }

    if (
      tradesBeforeRecovery > 0 &&
      safeArray(tradeQualityDiagnostics).some((item) => item.severity === "blocking" || item.severity === "warning")
    ) {
      tradeQualityCandidateConfigs = generateTradeQualityCandidateConfigs(
        baselineConfig,
        tradeQualityDiagnostics,
        Math.min(Math.max(6, options.maxCandidateCount), 12)
      );
      checkpoint({
        phase: "trade_quality_optimization",
        status: "running",
        currentCandidate: evaluatedCandidateResults.length,
        totalCandidates: allCandidateConfigs.length + tradeQualityCandidateConfigs.length,
        currentPass: totalPasses,
        totalPasses,
        message: "Running trade-quality optimization candidates."
      });
      const qualityResults: AutoResearchCandidateResult[] = [];
      for (const candidate of tradeQualityCandidateConfigs) {
        const candidateResult = evaluateCandidate(candidate, baselineMetrics, activeCandles);
        evaluatedCandidateResults.push(candidateResult);
        qualityResults.push(candidateResult);
        const { bestCandidate: bestCandidateSoFar } = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
        const progress: AutoResearchProgressSnapshot = {
          currentCandidate: evaluatedCandidateResults.length,
          totalCandidates: allCandidateConfigs.length + tradeQualityCandidateConfigs.length,
          passNumber: totalPasses,
          totalPasses,
          passLabel: "trade quality optimization",
          failedGatesTargeted: diagnoseFailedGates(bestCandidateSoFar ?? candidateResult, baselineMetrics),
          candidateId: candidateResult.candidateId,
          candidateLabel: candidateResult.label,
          candidateScore: candidateResult.scoreBreakdown.totalScore,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory
        };
        options.onCandidateEvaluated?.(progress);
        checkpoint({
          phase: "trade_quality_optimization",
          status: "running",
          currentCandidate: progress.currentCandidate,
          totalCandidates: progress.totalCandidates,
          currentPass: totalPasses,
          totalPasses,
          currentCandidateName: candidateResult.label,
          bestCandidateId: bestCandidateSoFar?.candidateId,
          bestCandidateLabel: bestCandidateSoFar?.label,
          bestCandidateScore: bestCandidateSoFar?.scoreBreakdown.totalScore,
          bestCandidateCategory: bestCandidateSoFar?.resultCategory,
          message: `Trade-quality candidate evaluated: ${candidateResult.label}.`
        });
        await yieldToBrowser();
        throwIfStopped();
      }
      allCandidateConfigs.push(...tradeQualityCandidateConfigs);
      const qualitySelection = selectBestCandidate(qualityResults, baselineMetrics);
      const allSelection = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
      tradeQualityBestCandidate = qualitySelection.bestCandidate ?? qualitySelection.closestCandidates[0];
      tradeQualitySummary = tradeQualitySummaryFor({
        diagnostics: tradeQualityDiagnostics,
        candidates: tradeQualityCandidateConfigs,
        bestCandidate: tradeQualityBestCandidate
      });
      bestCandidate = allSelection.bestCandidate;
      candidateResults = allSelection.candidateResults;
      closestCandidates = allSelection.closestCandidates;
      rejectedCandidates = allSelection.rejectedCandidates;
    }

    let createdProposalId: string | undefined;
    let createdProposal: CalibrationProposal | undefined;
    const selectedCandidateId = bestCandidate?.candidateId;
    const candidateScores = candidateResults.map((candidate) => ({
      candidateId: candidate.candidateId,
      label: candidate.label,
      totalScore: candidate.scoreBreakdown.totalScore,
      resultCategory: candidate.resultCategory,
      rejectionReasons: candidate.rejectionReasons
    }));
    const failedGates = diagnoseFailedGates(bestCandidate ?? closestCandidates[0], baselineMetrics);
    const finalOutcome = adaptiveOutcomeFor(
      bestCandidate ?? closestCandidates[0],
      failedGates,
      adaptivePasses.length >= totalPasses && !shouldStopAdaptiveSearch(bestCandidate)
    );
    const recoveryStillZero = recoveryAttempted && tradesAfterRecovery === 0;
    const finalResultCategory = recoveryStillZero ? "no_safe_candidate_found" : bestCandidate?.resultCategory ?? finalOutcome;
    const noSafePaperDemoCandidateFound = !candidateResults.some(
      (candidate) => candidate.resultCategory === "paper_demo_candidate"
    ) || recoveryStillZero;

    if (
      recoveryResult &&
      recoveryMetadata &&
      options.createProposal !== false &&
      isZeroTradeRecoveryProposalEligible({
        diagnostics: tradeGenerationDiagnostics,
        recoveryResult,
        tradesBeforeRecovery,
        tradesAfterRecovery
      })
    ) {
      const proposal = attachProposalMetricsSnapshot(createZeroTradeRecoveryProposal({
        baselineConfig,
        baselineMetrics,
        recoveryResult,
        recoveryMetadata,
        tradesBeforeRecovery,
        tradesAfterRecovery
      }), proposalSnapshotContext(recoveryResult.candidateId));
      const duplicateMessage = duplicateActiveCalibrationMessage(proposal, activeResearchConfig.activeResearchCalibration);
      if (duplicateMessage) {
        recoveryFailureReasons = safeTopN([
          duplicateMessage,
          `Active threshold ${formatThresholdPercent(recoveryMetadata.activeConfluenceThreshold)}; observed confluence ${recoveryMetadata.observedICTConfluence !== undefined ? formatThresholdPercent(recoveryMetadata.observedICTConfluence) : "n/a"}; proposed threshold ${formatThresholdPercent(recoveryMetadata.proposedConfluenceThreshold)}.`,
          ...safeArray(recoveryFailureReasons)
        ], 6);
      } else {
        upsertCalibrationProposal(
          proposal,
          "created",
          "Created from successful zero-trade recovery. Proposal remains approval-required and simulation-only."
        );
        createdProposalId = proposal.proposalId;
        createdProposal = proposal;
      }
    }

    if (
      !createdProposalId &&
      !recoveryStillZero &&
      bestCandidate &&
      options.createProposal !== false &&
      shouldCreateProposal(bestCandidate, baselineMetrics)
    ) {
      const advisorySource = (labStorage.load().advisoryResponses?.length ?? 0) > 0 ? "openclaw" : "internal";
      const proposal = attachProposalMetricsSnapshot(createSelfImprovementFromCandidate({
        baselineConfig,
        baselineMetrics,
        candidate: bestCandidate,
        source: advisorySource,
        proposalIntent:
          bestCandidate.resultCategory === "paper_demo_candidate"
            ? "paper_demo_candidate_review"
            : "research_calibration_candidate"
      }), proposalSnapshotContext(bestCandidate.candidateId));
      upsertCalibrationProposal(
        proposal,
        "created",
        "Created by Auto Research supervisor. Proposal still requires simulation review and manual approval."
      );
      createdProposalId = proposal.proposalId;
      createdProposal = proposal;
    }

    if (!createdProposalId && !recoveryStillZero && options.createProposal !== false) {
      const researchCalibrationCandidate = findResearchCalibrationCandidate({
        bestCandidate,
        closestCandidates,
        adaptivePasses,
        baselineMetrics
      });
      if (researchCalibrationCandidate && researchCalibrationCandidate.resultCategory !== "paper_demo_candidate") {
        const proposal = attachProposalMetricsSnapshot(createResearchCalibrationCandidateProposal({
          baselineConfig,
          baselineMetrics,
          candidate: researchCalibrationCandidate,
          adaptivePasses
        }), proposalSnapshotContext(researchCalibrationCandidate.candidateId));
        const duplicateMessage = duplicateActiveCalibrationMessage(proposal, activeResearchConfig.activeResearchCalibration);
        if (duplicateMessage) {
          recoveryFailureReasons = safeTopN([duplicateMessage, ...safeArray(recoveryFailureReasons)], 6);
        } else {
          upsertCalibrationProposal(
            proposal,
            "created",
            "Created from improved-but-not-ready Auto Research candidate. Proposal remains research-only and approval-required."
          );
          createdProposalId = proposal.proposalId;
          createdProposal = proposal;
        }
      }
    }

    const cycle: AutoResearchCycle = {
      cycleId,
      timestamp: new Date().toISOString(),
      baselineConfig,
      candidateConfigs: allCandidateConfigs,
      candidateResults,
      bestCandidate,
      rejectedCandidates,
      scoringCriteria: defaultAutoResearchScoringCriteria,
      safetyNotes: autoResearchSafetyNotes,
      createdProposalId,
      createdProposal,
      status: createdProposalId ? "proposal_created" : "completed",
      searchMode: options.searchMode,
      closestCandidates,
      candidatesTested: candidateResults.length,
      candidateScores,
      selectedCandidateId,
      finalResultCategory,
      noSafePaperDemoCandidateFound,
      adaptivePasses,
      failedGates,
      finalOutcome: recoveryStillZero ? "no_safe_candidate_found" : finalOutcome,
      tradeGenerationDiagnostics,
      tradeQualityDiagnostics,
      tradeQualityCandidateConfigs,
      tradeQualityBestCandidate,
      tradeQualitySummary,
      recoveryAttempted,
      recoveryCandidates,
      recoveryResult,
      recoveryMetadata,
      tradesBeforeRecovery,
      tradesAfterRecovery,
      recoveryFailureReasons
    };

    checkpoint({
      phase: "completed",
      status: "completed",
      currentCandidate: candidateResults.length,
      totalCandidates: allCandidateConfigs.length,
      bestCandidateId: bestCandidate?.candidateId,
      bestCandidateLabel: bestCandidate?.label,
      bestCandidateScore: bestCandidate?.scoreBreakdown.totalScore,
      bestCandidateCategory: bestCandidate?.resultCategory,
      message: createdProposalId
        ? `Auto Research completed and created proposal ${createdProposalId}.`
        : "Auto Research completed without creating a proposal."
    });
    saveAutoResearchCycle(cycle);
    return cycle;
  } catch (error) {
    const wasCanceled = error instanceof AutoResearchCanceledError;
    const cycle: AutoResearchCycle = {
      cycleId,
      timestamp: new Date().toISOString(),
      searchMode: options.searchMode,
      baselineConfig: resolveActiveBacktestConfig().config,
      candidateConfigs: [],
      candidateResults: [],
      closestCandidates: [],
      rejectedCandidates: [],
      candidatesTested: 0,
      candidateScores: [],
      finalResultCategory: "no_safe_paper_demo_candidate_found",
      noSafePaperDemoCandidateFound: true,
      scoringCriteria: defaultAutoResearchScoringCriteria,
      safetyNotes: autoResearchSafetyNotes,
      status: wasCanceled ? "canceled" : "failed",
      error: error instanceof Error ? error.message : "Auto Research cycle failed."
    };
    checkpoint({
      phase: wasCanceled ? "canceled" : "failed",
      status: wasCanceled ? "canceled" : "failed",
      currentCandidate: 0,
      totalCandidates: options.maxCandidateCount,
      message: cycle.error
    });
    saveAutoResearchCycle(cycle);
    return cycle;
  }
}
