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
import { scoreCandidateConfig } from "@/lib/autoResearch/scoreCandidateConfig";
import { selectBestCandidate } from "@/lib/autoResearch/selectBestCandidate";
import type {
  AutoResearchCandidateResult,
  AutoResearchCycle,
  AutoResearchAdaptiveOutcome,
  AutoResearchAdaptivePass,
  AutoResearchFailedGate,
  AutoResearchRunOptions,
  AutoResearchState
} from "@/lib/autoResearch/autoResearchTypes";
import {
  loadBacktestConfig,
  diagnoseTradeGeneration,
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
  summarizeValidationMetrics,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { labStorage } from "@/lib/storage";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { runValidationSuite } from "@/lib/validation";

export const AUTO_RESEARCH_STORAGE_KEY = "gotrader_ai_lab_auto_research_state";
export const AUTO_RESEARCH_UPDATED_EVENT = "gotrader-ai-lab-auto-research-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): AutoResearchState => ({
  cycles: [],
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
        neutralChanges: safeTopN(comparison.neutralChanges, 3)
      }
    : {
        improved: false,
        stabilityImproved: false,
        recommendation: "keep_testing" as const,
        summary: "Comparison summary unavailable in compact stored history.",
        positiveChanges: [],
        negativeChanges: [],
        neutralChanges: []
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
      auditTrail: safeArray(parsed.auditTrail),
      lastStoredBytes: parsed.lastStoredBytes,
      storageWarning: parsed.storageWarning,
      storageEmergencyMode: parsed.storageEmergencyMode
    };
  } catch {
    return publish(initialState());
  }
}

export function saveAutoResearchCycle(cycle: AutoResearchCycle): AutoResearchState {
  const state = loadAutoResearchState();
  return publish({
    ...state,
    latestCycleId: cycle.cycleId,
    cycles: safeTopN([compactAutoResearchCycle(cycle), ...safeArray(state.cycles).filter((item) => item.cycleId !== cycle.cycleId)], 5),
    auditTrail: safeTopN([
      audit(
        cycle.cycleId,
        cycle.status === "proposal_created" ? "proposal_created" : cycle.status === "failed" ? "cycle_failed" : "cycle_completed",
        cycle.createdProposalId
          ? `Created proposal ${cycle.createdProposalId}.`
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
  baselineMetrics: ReturnType<typeof summarizeValidationMetrics>
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
    const backtestResult = runBacktest(mockCandles, candidate.config);
    const validationReport = runValidationSuite(mockCandles, candidate.config);
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

const shouldCreateProposal = (candidate?: AutoResearchCandidateResult) =>
  Boolean(
    candidate &&
      candidate.promotionEligible &&
      candidate.scoreBreakdown.stabilityImproved &&
      candidate.scoreBreakdown.sufficientSample &&
      candidate.comparisonResult.stabilityImproved &&
      candidate.scoreBreakdown.totalScore >= 45
  );

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

  if (metrics.maxDrawdown > Math.max(6, baselineMetrics.maxDrawdown + 1.5) || score.drawdownScore < 55) {
    gates.push("max_drawdown_too_high");
  }
  if (metrics.falsePositiveCount > Math.max(6, baselineMetrics.falsePositiveCount + 3) || score.falsePositiveScore < 65) {
    gates.push("false_positives_too_high");
  }
  if (metrics.averageR < baselineMetrics.averageR - 0.1 || score.averageRScore < 45) {
    gates.push("average_r_too_low");
  }
  if (metrics.winRate < 0.36 || score.winRateScore < 45) {
    gates.push("win_rate_too_low");
  }
  if (!score.sufficientSample || metrics.totalTrades < 3 || rejectionText.includes("enough simulated trades")) {
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
  if (skippedSignalImbalanceFor(candidate) > 0.72 || score.skippedSignalBalanceScore < 45) {
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

export function runAutoResearchCycle(options: AutoResearchRunOptions): AutoResearchCycle {
  const cycleId = uid("auto_cycle");
  try {
    const baselineConfig = loadBacktestConfig();
    const baselineBacktest = runBacktest(mockCandles, baselineConfig);
    const tradesBeforeRecovery = baselineBacktest.summary.totalTrades;
    const tradeGenerationDiagnostics = tradesBeforeRecovery === 0
      ? diagnoseTradeGeneration({
          candles: mockCandles,
          config: baselineConfig,
          result: baselineBacktest
        })
      : [];
    const baselineValidation = runValidationSuite(mockCandles, baselineConfig);
    const baselineMetrics = summarizeValidationMetrics(baselineValidation);
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
    let tradesAfterRecovery = 0;
    let recoveryFailureReasons: string[] = [];

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

      const passResults: AutoResearchCandidateResult[] = [];
      for (const candidate of passCandidateConfigs) {
        const candidateResult = evaluateCandidate(candidate, baselineMetrics);
        evaluatedCandidateResults.push(candidateResult);
        passResults.push(candidateResult);
        const { bestCandidate: bestCandidateSoFar } = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
        options.onCandidateEvaluated?.({
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
        });
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
      recoveryCandidates = generateTradeRecoveryCandidateConfigs(baselineConfig);
      const recoveryResults: AutoResearchCandidateResult[] = [];
      for (const candidate of recoveryCandidates) {
        const candidateResult = evaluateCandidate(candidate, baselineMetrics);
        evaluatedCandidateResults.push(candidateResult);
        recoveryResults.push(candidateResult);
        const { bestCandidate: bestCandidateSoFar } = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
        options.onCandidateEvaluated?.({
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
        });
      }
      allCandidateConfigs.push(...recoveryCandidates);
      const recoverySelection = selectBestCandidate(recoveryResults, baselineMetrics);
      const allSelection = selectBestCandidate(evaluatedCandidateResults, baselineMetrics);
      recoveryResult = recoverySelection.bestCandidate ?? recoverySelection.closestCandidates[0];
      tradesAfterRecovery = Math.max(0, ...recoveryResults.map((candidate) => candidate.metrics.totalTrades));
      recoveryFailureReasons = recoveryFailureReasonsFor(tradeGenerationDiagnostics, recoveryResults);
      bestCandidate = allSelection.bestCandidate;
      candidateResults = allSelection.candidateResults;
      closestCandidates = allSelection.closestCandidates;
      rejectedCandidates = allSelection.rejectedCandidates;
    }
    let createdProposalId: string | undefined;
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

    if (!recoveryStillZero && bestCandidate && options.createProposal !== false && shouldCreateProposal(bestCandidate)) {
      const advisorySource = (labStorage.load().advisoryResponses?.length ?? 0) > 0 ? "openclaw" : "internal";
      const proposal = createSelfImprovementFromCandidate({
        baselineConfig,
        baselineMetrics,
        candidate: bestCandidate,
        source: advisorySource,
        proposalIntent:
          bestCandidate.resultCategory === "paper_demo_candidate"
            ? "paper_demo_candidate_review"
            : "research_calibration_candidate"
      });
      upsertCalibrationProposal(
        proposal,
        "created",
        "Created by Auto Research supervisor. Proposal still requires simulation review and manual approval."
      );
      createdProposalId = proposal.proposalId;
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
      recoveryAttempted,
      recoveryCandidates,
      recoveryResult,
      tradesBeforeRecovery,
      tradesAfterRecovery,
      recoveryFailureReasons
    };

    saveAutoResearchCycle(cycle);
    return cycle;
  } catch (error) {
    const cycle: AutoResearchCycle = {
      cycleId,
      timestamp: new Date().toISOString(),
      searchMode: options.searchMode,
      baselineConfig: loadBacktestConfig(),
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
      status: "failed",
      error: error instanceof Error ? error.message : "Auto Research cycle failed."
    };
    saveAutoResearchCycle(cycle);
    return cycle;
  }
}
