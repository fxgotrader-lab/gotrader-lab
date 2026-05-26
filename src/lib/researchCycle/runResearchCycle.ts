import { compactAutoResearchCycle, runAutoResearchCycle } from "@/lib/autoResearch";
import type { AutoResearchCandidateResult } from "@/lib/autoResearch";
import {
  auditAgentDebateSession,
  auditAutoResearchDecision,
  auditCioSynthesis,
  auditReadinessGate,
  auditSelfImprovementDecision,
  buildAgentAuditTraces,
  saveAgentAuditTraces
} from "@/lib/agentAudit";
import {
  runAgentDebateSession,
  saveAgentDebateSession,
  type AgentDebateSession
} from "@/lib/agentDebate";
import {
  diagnoseTradeGeneration,
  runBacktest,
  sanitizeBacktestConfig,
  topTradeGenerationDiagnostic
} from "@/lib/backtesting";
import type { BacktestResult, ResolvedBacktestConfig } from "@/lib/backtesting";
import { recordResearchCycleCommunication } from "@/lib/communications/communicationSpec";
import {
  buildLLMResearchContextPacket,
  importLLMAgentResponse,
  recordLLMResponseImport,
  recordLLMUnsafeResponseRejection,
  runLocalBridgeAdvisory,
  validateLLMContextPacket
} from "@/lib/llm";
import type { LLMAdvisoryRun } from "@/lib/llm";
import {
  DASHBOARD_IMPORTED_CANDIDATE_LIMIT,
  DASHBOARD_IMPORTED_RAW_WINDOW_LIMIT,
  DASHBOARD_IMPORTED_SAFE_PROCESSED_LIMIT,
  DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE,
  dashboardImportedSafeCandleWindowSettings,
  loadPreparedCandleSource,
  type PreparedCandleSource
} from "@/lib/marketData";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { evaluateReadinessGate } from "@/lib/readiness";
import { analyzeValidationResults, saveLatestResearchQualityReview } from "@/lib/researchQuality";
import type {
  ResearchCycleBacktestSummary,
  ResearchCycleCandidateSummary,
  ResearchCycleQualitySummary,
  ResearchCycleAgentDebateSummary,
  ResearchCycleRun,
  ResearchCycleRunOptions,
  ResearchCycleState,
  ResearchCycleStatus,
  ResearchCycleStepId,
  ResearchCycleStepResult,
  ResearchCycleThesisSummary,
  ResearchCycleValidationSummary
} from "@/lib/researchCycle/researchCycleTypes";
import { generateThesis } from "@/lib/simulation";
import {
  loadSimulationRunbookState,
  saveSimulationRunbookState
} from "@/lib/simulationRunbook";
import type { SimulationRunbookSignal } from "@/lib/simulationRunbook";
import {
  type CalibrationProposal,
  loadSelfImprovementState,
  resolveActiveBacktestConfig,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import { labStorage } from "@/lib/storage";
import type { LabState, ThesisInput, TradeThesis } from "@/lib/types";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { runValidationSuite, saveLatestValidationReport } from "@/lib/validation";
import type { ValidationSuiteReport } from "@/lib/validation";

export const RESEARCH_CYCLE_STORAGE_KEY = "gotrader_ai_lab_research_cycle_state";
export const RESEARCH_CYCLE_UPDATED_EVENT = "gotrader-ai-lab-research-cycle-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const stepDefinitions: Array<Pick<ResearchCycleStepResult, "stepId" | "label" | "summary">> = [
  {
    stepId: "thesis_generation",
    label: "Research thesis",
    summary: "Waiting to generate ICT context and CIO thesis."
  },
  {
    stepId: "backtest",
    label: "Backtest",
    summary: "Waiting to run mock candle backtest."
  },
  {
    stepId: "llm_advisory",
    label: "LLM advisory review",
    summary: "Waiting to check the local LLM bridge."
  },
  {
    stepId: "auto_research",
    label: "Auto research cycle",
    summary: "Waiting to search bounded research configurations."
  },
  {
    stepId: "validation",
    label: "Validation suite",
    summary: "Waiting to run scenario validation."
  },
  {
    stepId: "research_quality",
    label: "Research quality review",
    summary: "Waiting to analyze validation quality."
  },
  {
    stepId: "self_improvement",
    label: "Self-improvement proposal",
    summary: "Waiting to check whether a stability proposal was created."
  },
  {
    stepId: "simulation_verification",
    label: "Simulation runbook",
    summary: "Waiting to record research pipeline completion."
  },
  {
    stepId: "readiness_gate",
    label: "Readiness gate update",
    summary: "Waiting to recompute readiness without overrides."
  },
  {
    stepId: "communications_audit",
    label: "Communications audit",
    summary: "Waiting to log the research cycle."
  }
];

const initialState = (): ResearchCycleState => ({
  runs: [],
  safetyNotice: "Research cycle only. Broker execution remains disabled."
});

const publish = (state: ResearchCycleState) => {
  if (isBrowser()) {
    try {
      window.localStorage.setItem(RESEARCH_CYCLE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      const compactState = {
        ...state,
        runs: safeTopN(safeArray(state.runs), 1)
      };
      try {
        window.localStorage.setItem(RESEARCH_CYCLE_STORAGE_KEY, JSON.stringify(compactState));
      } catch (retryError) {
        console.warn("Research cycle storage write skipped after pruning.", {
          error: retryError instanceof Error ? retryError.message : String(retryError)
        });
      }
    }
    window.dispatchEvent(new CustomEvent(RESEARCH_CYCLE_UPDATED_EVENT, { detail: state }));
  }
  return state;
};

const initialSteps = (): ResearchCycleStepResult[] =>
  stepDefinitions.map((step) => ({
    ...step,
    status: "pending"
  }));

const now = () => new Date().toISOString();

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

const statusCounts = (steps: ResearchCycleStepResult[]) => ({
  warnings: steps.filter((step) => step.status === "warning").length,
  failed: steps.filter((step) => step.status === "failed").length,
  passed: steps.filter((step) => step.status === "passed" || step.status === "completed").length,
  skipped: steps.filter((step) => step.status === "skipped").length
});

const signalFor = (thesis: TradeThesis): SimulationRunbookSignal =>
  thesis.finalBias === "bullish" ? "BUY" : thesis.finalBias === "bearish" ? "SELL" : "NEUTRAL";

const thesisInputFor = (config: ResolvedBacktestConfig, cycleId: string): ThesisInput => ({
  symbol: config.symbol,
  timeframe: config.timeframe,
  session:
    config.session ??
    (config.sessionFilter === "London"
      ? "London"
      : config.sessionFilter === "New York" || config.sessionFilter === "NY AM Kill Zone"
        ? "New York AM"
        : config.sessionFilter === "NY PM Kill Zone"
          ? "New York PM"
          : "Globex"),
  marketRegime: config.marketRegime,
  notes: `Generated by AI Research Cycle ${cycleId}. Simulation-only pipeline; broker execution disabled.`
});

const summarizeThesis = (thesis: TradeThesis, debateSessionId: string): ResearchCycleThesisSummary => ({
  thesisId: thesis.id,
  debateSessionId,
  generatedAt: thesis.createdAt,
  symbol: thesis.symbol,
  timeframe: thesis.timeframe,
  bias: thesis.finalBias,
  confidence: thesis.confidence,
  ictBias: thesis.ictContext.bias,
  confluenceScore: thesis.ictContext.confluenceScore,
  summary: thesis.thesisSummary,
  invalidation: thesis.invalidationLevel,
  target: thesis.targetLiquidity
});

const summarizeBacktest = (result: BacktestResult): ResearchCycleBacktestSummary => ({
  config: {
    symbol: result.config.symbol,
    timeframe: result.config.timeframe,
    sessionFilter: result.config.sessionFilter,
    minimumConfluenceThreshold: result.config.minimumConfluenceThreshold,
    minimumConfidenceThreshold: result.config.minimumConfidenceThreshold,
    targetRMultiple: result.config.targetRMultiple,
    stopModel: result.config.stopModel
  },
  totalTrades: result.summary.totalTrades,
  winRate: result.summary.winRate,
  averageR: result.summary.averageR,
  maxDrawdown: result.summary.maxDrawdown,
  skippedSignals: result.summary.skippedSignals,
  bestTradeR: result.summary.bestTrade?.rMultiple,
  worstTradeR: result.summary.worstTrade?.rMultiple
});

const summarizeValidation = (report: ValidationSuiteReport): ResearchCycleValidationSummary => ({
  validationId: report.id,
  generatedAt: report.generatedAt,
  readinessStatus: report.calibration.readinessStatus,
  readinessScore: report.calibration.readinessScore,
  strongestScenario: report.calibration.strongestScenario,
  weakestScenario: report.calibration.weakestScenario,
  recommendedConfluenceThreshold: report.calibration.recommendedConfluenceThreshold,
  recommendedConfidenceThreshold: report.calibration.recommendedConfidenceThreshold
});

const summarizeQuality = (review: ReturnType<typeof analyzeValidationResults>): ResearchCycleQualitySummary => ({
  reviewId: review.id,
  generatedAt: review.generatedAt,
  readinessGrade: review.readinessGrade,
  readinessScore: review.readinessScore,
  topWeaknesses: safeTopN(review.topWeaknesses, 3).map((item) => item.title),
  topStrengths: safeTopN(review.topStrengths, 3).map((item) => item.title),
  recommendedNextStep: review.recommendedNextStep
});

const summarizeCandidate = (candidate?: AutoResearchCandidateResult): ResearchCycleCandidateSummary | undefined =>
  candidate
    ? {
        candidateId: candidate.candidateId,
        label: candidate.label,
        score: candidate.scoreBreakdown?.totalScore ?? 0,
        resultCategory: candidate.resultCategory,
        readinessEstimate: candidate.readinessEstimate?.state ?? "Not Ready"
      }
    : undefined;

const summarizeAgentDebateConsensus = (session: AgentDebateSession): ResearchCycleAgentDebateSummary => ({
  sessionId: session.sessionId,
  consensusReached: session.moderatorOutput.consensusReached,
  position: session.moderatorOutput.position,
  probability: session.moderatorOutput.probability,
  strongestDisagreement: session.moderatorOutput.disagreements[0] ?? "No major disagreement recorded.",
  minorityView: session.moderatorOutput.minorityView
});

const compactLLMRun = (run?: LLMAdvisoryRun): LLMAdvisoryRun | undefined =>
  run
    ? {
        ...run,
        responses: [],
        validationResults: {}
      }
    : undefined;

const compactResearchCycleRun = (run: ResearchCycleRun): ResearchCycleRun => ({
  ...run,
  steps: safeArray(run.steps).map((step) => ({ ...step })),
  llmRun: compactLLMRun(run.llmRun),
  autoResearchCycle: run.autoResearchCycle ? compactAutoResearchCycle(run.autoResearchCycle) : undefined,
  validationReport: undefined,
  researchQualityReview: undefined,
  blockers: safeTopN(run.blockers, 8)
});

const nextActionFor = (run: ResearchCycleRun) => {
  if (run.status === "failed") {
    return "Open the failed step details, fix the blocker, then rerun the research cycle.";
  }
  if (!run.llmRun?.advisoryPassed) {
    return "Start the local LLM bridge and rerun GPT advisory review before expecting Paper-Demo Candidate readiness.";
  }
  if (run.backtestSummary?.totalTrades === 0) {
    return "Review zero-trade diagnostics and recovery results. Strategy cannot be evaluated until simulated trades exist.";
  }
  if (run.createdProposalId) {
    return "Review the new self-improvement proposal. Approval is still required before settings change.";
  }
  if (safeArray(run.blockers).length) {
    return "Review readiness blockers and rerun validation after the weakest requirement improves.";
  }
  return "Keep broker execution disabled and continue simulation monitoring.";
};

const resultSummaryFor = (run: ResearchCycleRun) => {
  const counts = statusCounts(safeArray(run.steps));
  if (run.status === "failed") {
    return `Research cycle failed at ${run.failedStepId ?? "unknown step"}. Broker execution remained disabled.`;
  }
  return [
    `${counts.passed} steps passed`,
    counts.warnings ? `${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}` : "no blocking warnings",
    counts.skipped ? `${counts.skipped} skipped` : undefined,
    run.backtestSummary ? `${run.backtestSummary.totalTrades} backtest trades` : undefined,
    run.backtestSummary?.totalTrades === 0 ? "No valid simulated trades were generated" : undefined,
    run.autoResearchCycle?.noSafePaperDemoCandidateFound ? "No safe Paper-Demo Candidate found" : undefined,
    run.bestCandidateSummary ? `best candidate: ${run.bestCandidateSummary.label}` : undefined,
    run.createdProposalId ? `proposal ${run.createdProposalId} created` : "no proposal created",
    `readiness: ${run.readinessSnapshot?.state ?? "not evaluated"}`
  ].filter(Boolean).join(" / ");
};

const finalStatusFor = (run: ResearchCycleRun): ResearchCycleStatus => {
  if (run.failedStepId === "backtest" || run.failedStepId === "thesis_generation") {
    return "failed";
  }
  const counts = statusCounts(safeArray(run.steps));
  return counts.warnings || counts.failed || counts.skipped || safeArray(run.blockers).length
    ? "completed_with_warnings"
    : "completed";
};

export function loadResearchCycleState(): ResearchCycleState {
  if (!isBrowser()) {
    return initialState();
  }

  const raw = window.localStorage.getItem(RESEARCH_CYCLE_STORAGE_KEY);
  if (!raw) {
    return publish(initialState());
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ResearchCycleState>;
    return {
      ...initialState(),
      ...parsed,
      runs: safeArray(parsed.runs)
    };
  } catch {
    return publish(initialState());
  }
}

export function saveResearchCycleRun(run: ResearchCycleRun): ResearchCycleState {
  const state = loadResearchCycleState();
  const compactRun = compactResearchCycleRun(run);
  return publish({
    ...state,
    latestRunId: compactRun.cycleId,
    runs: safeTopN([compactRun, ...safeArray(state.runs).filter((item) => item.cycleId !== compactRun.cycleId)], 5)
  });
}

export function latestResearchCycleRun(state = loadResearchCycleState()) {
  const runs = safeArray(state.runs);
  return runs.find((run) => run.cycleId === state.latestRunId) ?? runs[0];
}

export async function runResearchCycle({
  state,
  searchMode = "standard",
  maxCandidateCount = 10,
  backtestConfig,
  candleWindowSettings,
  advancedFullResearchMode = false,
  skipHeavyAudit,
  onUpdate
}: ResearchCycleRunOptions): Promise<ResearchCycleRun> {
  let steps = initialSteps();
  let workingState: LabState = labStorage.load() ?? state;
  const cycleId = uid("research_cycle");
  const activeResearchConfig = resolveActiveBacktestConfig(backtestConfig ? sanitizeBacktestConfig(backtestConfig) : undefined);
  const baseActiveConfig = activeResearchConfig.config;
  const requestedCandleWindowSettings = candleWindowSettings ?? dashboardImportedSafeCandleWindowSettings;
  const activeCandleSource: PreparedCandleSource = await loadPreparedCandleSource(requestedCandleWindowSettings).catch(() => ({
    mode: "mock" as const,
    label: "Mock candles",
    candles: mockCandles,
    rawCandleCount: mockCandles.length,
    researchWindowCandles: mockCandles.length,
    processedCandleCount: mockCandles.length,
    estimatedProcessedCandles: mockCandles.length,
    appliedSettings: {
      windowMode: "latest",
      windowSize: mockCandles.length,
      targetTimeframe: "5m" as const,
      sessionFilter: "all" as const,
      advancedMode: false
    },
    aggregationApplied: false,
    performanceMode: "safe" as const,
    warnings: []
  }));
  const importedSafeMode = activeCandleSource.mode === "imported" && !advancedFullResearchMode;
  const effectiveSearchMode = importedSafeMode ? "quick" : searchMode;
  const effectiveMaxCandidateCount = importedSafeMode
    ? Math.min(maxCandidateCount, 5)
    : maxCandidateCount;
  const effectiveMaxAdaptivePasses = importedSafeMode ? 1 : undefined;
  const heavyAuditSkipped = skipHeavyAudit ?? importedSafeMode;
  const researchPreset =
    activeCandleSource.mode !== "imported"
      ? "mock"
      : advancedFullResearchMode || activeCandleSource.performanceMode === "advanced"
        ? "advanced"
        : activeCandleSource.researchWindowCandles <= DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE
          ? "safe"
          : "standard";
  const hardLimitWarnings = activeCandleSource.mode === "imported" && !advancedFullResearchMode
    ? [
        activeCandleSource.processedCandleCount > DASHBOARD_IMPORTED_SAFE_PROCESSED_LIMIT
          ? `Processed candles ${activeCandleSource.processedCandleCount.toLocaleString()} exceed the dashboard safe limit of ${DASHBOARD_IMPORTED_SAFE_PROCESSED_LIMIT.toLocaleString()}.`
          : undefined,
        activeCandleSource.researchWindowCandles > DASHBOARD_IMPORTED_RAW_WINDOW_LIMIT
          ? `Raw imported window ${activeCandleSource.researchWindowCandles.toLocaleString()} exceeds the dashboard safe limit of ${DASHBOARD_IMPORTED_RAW_WINDOW_LIMIT.toLocaleString()}.`
          : undefined,
        maxCandidateCount > DASHBOARD_IMPORTED_CANDIDATE_LIMIT
          ? `Candidate count ${maxCandidateCount.toLocaleString()} exceeds the imported-data safe limit of ${DASHBOARD_IMPORTED_CANDIDATE_LIMIT.toLocaleString()}.`
          : undefined
      ].filter(Boolean) as string[]
    : [];
  const researchCandles = activeCandleSource.candles.length ? activeCandleSource.candles : mockCandles;
  const dataSourceLabel = activeCandleSource.mode === "imported" ? activeCandleSource.label : "Mock candles";
  const activeConfig = activeCandleSource.metadata
    ? sanitizeBacktestConfig({
        ...baseActiveConfig,
        symbol: activeCandleSource.metadata.symbol,
        timeframe: activeCandleSource.appliedSettings.targetTimeframe
      })
    : baseActiveConfig;
  const run: ResearchCycleRun = {
    cycleId,
    startedAt: now(),
    status: "running",
    steps,
    llmBridgeAvailable: false,
    activeCalibrationId: activeResearchConfig.activeCalibrationId,
    activeCalibrationApprovedAt: activeResearchConfig.activeResearchCalibration?.approvedAt,
    activeCalibrationApplied: activeResearchConfig.activeCalibrationApplied,
    activeCalibrationPatch: activeResearchConfig.appliedPatch,
    activeCalibrationMergeStatus: activeResearchConfig.mergeStatus,
    activeCalibrationMergeLabel: activeResearchConfig.mergeStatusLabel,
    activeCalibrationMergeError: activeResearchConfig.mergeError,
    activeCalibrationSourceTrace: activeResearchConfig.sourceTrace,
    defaultConfluenceThreshold: activeResearchConfig.defaultConfluenceThreshold,
    savedConfluenceThreshold: activeResearchConfig.savedConfluenceThreshold,
    finalBacktestConfluenceThreshold: activeResearchConfig.finalBacktestConfluenceThreshold,
    activeConfluenceThreshold: activeConfig.minimumConfluenceThreshold,
    dataSourceMode: activeCandleSource.mode,
    dataSourceLabel,
    rawCandleCount: activeCandleSource.rawCandleCount,
    researchWindowCandles: activeCandleSource.researchWindowCandles,
    processedCandleCount: activeCandleSource.processedCandleCount,
    researchTimeframe: activeConfig.timeframe,
    performanceMode: activeCandleSource.performanceMode,
    researchPreset,
    advancedFullResearchMode,
    effectiveSearchMode,
    effectiveMaxCandidateCount,
    heavyAuditSkipped,
    candleWindowSettings: activeCandleSource.appliedSettings,
    candleWindowWarnings: [...activeCandleSource.warnings, ...hardLimitWarnings],
    nextRecommendedAction: "Research cycle is running.",
    resultSummary: "Research cycle is running.",
    safetyNotice: "Research cycle only. Broker execution remains disabled."
  };

  const snapshot = () => ({ ...run, steps: steps.map((step) => ({ ...step })) });
  const notify = () => onUpdate?.(snapshot());
  const setStep = (stepId: ResearchCycleStepId, patch: Partial<ResearchCycleStepResult>) => {
    steps = steps.map((step) => (step.stepId === stepId ? { ...step, ...patch } : step));
    run.steps = steps;
    notify();
  };
  const startStep = (stepId: ResearchCycleStepId) => setStep(stepId, { status: "running", startedAt: now() });
  const passStep = (
    stepId: ResearchCycleStepId,
    patch: Partial<ResearchCycleStepResult> & Pick<ResearchCycleStepResult, "summary">
  ) => setStep(stepId, { status: "passed", completedAt: now(), ...patch });
  const warnStep = (
    stepId: ResearchCycleStepId,
    patch: Partial<ResearchCycleStepResult> & Pick<ResearchCycleStepResult, "summary" | "warning">
  ) => setStep(stepId, { status: "warning", completedAt: now(), ...patch });
  const failStep = (stepId: ResearchCycleStepId, message: string) => {
    setStep(stepId, {
      status: "failed",
      completedAt: now(),
      summary: "Step failed.",
      error: message
    });
    run.failedStepId = stepId;
    run.failedStepDetails = message;
  };
  const skipStep = (stepId: ResearchCycleStepId, summary: string, detail?: string) =>
    setStep(stepId, { status: "skipped", completedAt: now(), summary, detail });

  notify();

  if (hardLimitWarnings.length) {
    failStep(
      "thesis_generation",
      `Imported historical dataset exceeds dashboard safe limits. ${hardLimitWarnings.join(" ")} Enable Advanced full research mode intentionally, or use the Safe preset: latest 500 raw candles aggregated to 5m.`
    );
    skipStep("backtest", "Backtest skipped because imported-data limits were exceeded.");
    skipStep("llm_advisory", "LLM advisory skipped because imported-data limits were exceeded.");
    skipStep("auto_research", "Auto Research skipped because imported-data limits were exceeded.");
    skipStep("validation", "Validation skipped because imported-data limits were exceeded.");
    skipStep("research_quality", "Research quality skipped because imported-data limits were exceeded.");
    skipStep("self_improvement", "Self-improvement skipped because imported-data limits were exceeded.");
    skipStep("simulation_verification", "Simulation runbook update skipped because imported-data limits were exceeded.");
    skipStep("readiness_gate", "Readiness skipped because imported-data limits were exceeded.");
    skipStep("communications_audit", "Communications audit skipped because imported-data limits were exceeded.");
    run.status = "failed";
    run.completedAt = now();
    run.nextRecommendedAction =
      "Use the dashboard Safe preset or enable Advanced full research mode only when intentionally stress-testing large imported datasets.";
    run.resultSummary = resultSummaryFor(run);
    saveResearchCycleRun(snapshot());
    return snapshot();
  }

  try {
    startStep("thesis_generation");
    await yieldToBrowser();
    let generatedThesis: ReturnType<typeof generateThesis> | undefined;
    let structuredDebateSession: AgentDebateSession | undefined;
    let latestSelfImprovementProposal: CalibrationProposal | undefined;
    try {
      generatedThesis = generateThesis(thesisInputFor(activeConfig, cycleId), workingState, researchCandles);
      structuredDebateSession = runAgentDebateSession({
        thesis: generatedThesis.thesis,
        sourceDebate: generatedThesis.debateSession,
        mode: "deterministic_fallback",
        roundCount: 2,
        consensusThreshold: 3
      });
      saveAgentDebateSession(structuredDebateSession);
      workingState = {
        ...workingState,
        debateSessions: [generatedThesis.debateSession, ...safeArray(workingState.debateSessions)],
        tradeTheses: [generatedThesis.thesis, ...safeArray(workingState.tradeTheses)],
        recommendations: [...generatedThesis.recommendations, ...safeArray(workingState.recommendations)]
      };
      labStorage.save(workingState);
      run.thesisSummary = summarizeThesis(generatedThesis.thesis, generatedThesis.debateSession.id);
      run.agentDebateConsensus = summarizeAgentDebateConsensus(structuredDebateSession);
      passStep("thesis_generation", {
        summary: `${generatedThesis.thesis.symbol} ${generatedThesis.thesis.timeframe} thesis generated: ${generatedThesis.thesis.finalBias}.`,
        detail: `ICT ${generatedThesis.thesis.ictContext.bias}, confluence ${Math.round(generatedThesis.thesis.ictContext.confluenceScore * 100)}%, CIO confidence ${Math.round(generatedThesis.thesis.confidence * 100)}%. Debate consensus ${structuredDebateSession.moderatorOutput.consensusReached ? structuredDebateSession.moderatorOutput.position : "flat/no consensus"}. Active confluence threshold ${(activeConfig.minimumConfluenceThreshold * 100).toFixed(0)}%. Data source: ${dataSourceLabel}.`
      });
    } catch (error) {
      failStep("thesis_generation", error instanceof Error ? error.message : "Research thesis generation failed.");
    }

    if (!generatedThesis) {
      skipStep("backtest", "Backtest skipped because thesis generation failed.");
      skipStep("llm_advisory", "LLM advisory skipped because thesis generation failed.");
      skipStep("auto_research", "Auto Research skipped because thesis generation failed.");
      skipStep("validation", "Validation skipped because thesis generation failed.");
      skipStep("research_quality", "Research quality skipped because thesis generation failed.");
      skipStep("self_improvement", "Self-improvement skipped because thesis generation failed.");
      skipStep("simulation_verification", "Simulation runbook update skipped because thesis generation failed.");
      skipStep("readiness_gate", "Readiness skipped because thesis generation failed.");
      run.status = "failed";
      run.completedAt = now();
      run.nextRecommendedAction = nextActionFor(run);
      run.resultSummary = resultSummaryFor(run);
      saveResearchCycleRun(snapshot());
      return snapshot();
    }

    startStep("backtest");
    await yieldToBrowser();
    let backtestResult: BacktestResult | undefined;
    try {
      backtestResult = runBacktest(researchCandles, activeConfig);
      run.backtestSummary = summarizeBacktest(backtestResult);
      if (backtestResult.summary.totalTrades === 0) {
        run.backtestDiagnostics = diagnoseTradeGeneration({
          candles: researchCandles,
          config: backtestResult.config,
          result: backtestResult,
          thesis: generatedThesis.thesis
        });
        const topDiagnostic = topTradeGenerationDiagnostic(run.backtestDiagnostics);
        warnStep("backtest", {
          summary: "No trades generated. Strategy cannot be evaluated from this backtest yet.",
          warning:
            topDiagnostic?.explanation ??
            "No simulated trades were generated. Auto Research will try bounded trade-generation recovery.",
          detail: topDiagnostic
            ? `${topDiagnostic.reasonCode.replace(/_/g, " ")}: ${topDiagnostic.suggestedFix} Active threshold used ${(activeConfig.minimumConfluenceThreshold * 100).toFixed(0)}%; data source: ${dataSourceLabel}; config merge: ${activeResearchConfig.mergeStatusLabel}. ${activeResearchConfig.mergeError ?? ""}`.trim()
            : `Auto Research will try threshold, session, direction, stop-model, and resolution-window recovery candidates. Active threshold used ${(activeConfig.minimumConfluenceThreshold * 100).toFixed(0)}%; data source: ${dataSourceLabel}; config merge: ${activeResearchConfig.mergeStatusLabel}. ${activeResearchConfig.mergeError ?? ""}`.trim()
        });
      } else {
        passStep("backtest", {
          summary: `Backtest completed with ${backtestResult.summary.totalTrades} simulated trades.`,
          detail: `Win rate ${Math.round(backtestResult.summary.winRate * 100)}%, average R ${backtestResult.summary.averageR.toFixed(2)}, max drawdown ${backtestResult.summary.maxDrawdown.toFixed(2)}R. Active confluence threshold ${(activeConfig.minimumConfluenceThreshold * 100).toFixed(0)}%. Data source: ${dataSourceLabel}.`
        });
      }
    } catch (error) {
      const fallbackMessage =
        activeCandleSource.mode === "imported"
          ? "Historical dataset was too large for browser processing. Reduce research window or aggregate to 5m/15m."
          : "Backtest failed. Check active Backtest Lab config and mock candle data.";
      const details = error instanceof Error ? error.message : fallbackMessage;
      failStep(
        "backtest",
        activeCandleSource.mode === "imported"
          ? `${fallbackMessage} Details: ${details}`
          : `Backtest failed: ${details}`
      );
    }

    if (!backtestResult) {
      skipStep("llm_advisory", "LLM advisory skipped because backtest failed.");
      skipStep("auto_research", "Auto Research skipped because backtest failed; candidate scoring stopped.");
      skipStep("validation", "Validation skipped because backtest failed.");
      skipStep("research_quality", "Research quality skipped because validation did not run.");
      skipStep("self_improvement", "Self-improvement skipped because Auto Research did not run.");
      skipStep("simulation_verification", "Simulation runbook update skipped because pipeline failed before validation.");
      skipStep("readiness_gate", "Readiness skipped because backtest failed.");
      run.status = "failed";
      run.completedAt = now();
      run.nextRecommendedAction = nextActionFor(run);
      run.resultSummary = resultSummaryFor(run);
      saveResearchCycleRun(snapshot());
      return snapshot();
    }

    startStep("llm_advisory");
    await yieldToBrowser();
    const startingRunbook = loadSimulationRunbookState();
    const llmPacket = buildLLMResearchContextPacket({
      state: workingState,
      validation: undefined,
      quality: undefined,
      readiness: undefined,
      runbook: startingRunbook,
      providerMode: "local_command"
    });
    const contextValidation = validateLLMContextPacket(llmPacket);

    if (!contextValidation.valid) {
      warnStep("llm_advisory", {
        summary: "LLM advisory review was skipped because the context packet failed validation.",
        warning: contextValidation.errors.join(" ")
      });
    } else {
      try {
        const bridgeResult = await runLocalBridgeAdvisory(llmPacket);
        run.llmBridgeAvailable = true;
        const importResult = importLLMAgentResponse(JSON.stringify(safeArray(bridgeResult.responses)), llmPacket.packetId);
        if (!importResult.run || !importResult.valid) {
          recordLLMUnsafeResponseRejection(Math.max(1, importResult.unsafeResponseRejections));
          warnStep("llm_advisory", {
            summary: "Local LLM bridge responded, but advisory validation failed.",
            warning: importResult.errors.join(" ") || "Unsafe or incomplete advisory response."
          });
        } else {
          run.llmRun = importResult.run;
          recordLLMResponseImport(importResult.run, importResult.run.timestamp);
          passStep("llm_advisory", {
            summary: "Configured LLM advisory review passed and was imported.",
            detail: bridgeResult.responseFile ? `Response file: ${bridgeResult.responseFile}` : undefined
          });
        }
      } catch (error) {
        warnStep("llm_advisory", {
          summary: "Local LLM bridge is unavailable; continued with deterministic simulation steps.",
          warning: error instanceof Error ? error.message : "Local LLM bridge request failed."
        });
      }
    }

    startStep("auto_research");
    await yieldToBrowser();
    let autoResearchCycle: ReturnType<typeof runAutoResearchCycle> | undefined;
    try {
      autoResearchCycle = runAutoResearchCycle({
        searchMode: effectiveSearchMode,
        maxCandidateCount: effectiveMaxCandidateCount,
        maxAdaptivePasses: effectiveMaxAdaptivePasses,
        createProposal: true,
        candles: researchCandles,
        baselineConfig: activeConfig,
        onCandidateEvaluated: (progress) => {
          run.candidateProgress = progress;
          setStep("auto_research", {
            status: "running",
            summary: `Pass ${progress.passNumber ?? 1}/${progress.totalPasses ?? 1}: candidate ${progress.currentCandidate}/${progress.totalCandidates}: ${progress.candidateLabel}.`,
            detail: progress.bestCandidateLabel
              ? `Best so far: ${progress.bestCandidateLabel} (${progress.bestCandidateCategory}, score ${progress.bestCandidateScore}). Targeting: ${
                  safeArray(progress.failedGatesTargeted).length
                    ? safeArray(progress.failedGatesTargeted).map((gate) => gate.replace(/_/g, " ")).join(", ")
                    : "initial bounded search"
                }.`
              : "No stable best candidate selected yet."
          });
        }
      });
      run.autoResearchCycle = autoResearchCycle;
      run.createdProposalId = autoResearchCycle.createdProposalId;
      run.latestGeneratedProposal = autoResearchCycle.createdProposal;
      run.bestCandidateSummary = summarizeCandidate(autoResearchCycle.bestCandidate);
      if (autoResearchCycle.status === "failed") {
        failStep("auto_research", autoResearchCycle.error ?? "Auto Research cycle failed.");
      } else {
        passStep("auto_research", {
          summary: autoResearchCycle.bestCandidate
            ? `Best candidate: ${autoResearchCycle.bestCandidate.label}.`
            : "Auto Research completed without a viable best candidate.",
          detail: autoResearchCycle.noSafePaperDemoCandidateFound
            ? autoResearchCycle.recoveryAttempted
              ? `${safeArray(autoResearchCycle.adaptivePasses).length || 1} adaptive pass${safeArray(autoResearchCycle.adaptivePasses).length === 1 ? "" : "es"} plus recovery completed. Trades after recovery: ${autoResearchCycle.tradesAfterRecovery ?? 0}. Continue research.`
              : `${safeArray(autoResearchCycle.adaptivePasses).length || 1} adaptive pass${safeArray(autoResearchCycle.adaptivePasses).length === 1 ? "" : "es"} completed. No safe Paper-Demo Candidate found. Continue research.`
            : `${safeArray(autoResearchCycle.adaptivePasses).length || 1} adaptive pass${safeArray(autoResearchCycle.adaptivePasses).length === 1 ? "" : "es"} completed. Final category: ${autoResearchCycle.finalResultCategory}.`
        });
      }
    } catch (error) {
      const message =
        activeCandleSource.mode === "imported"
          ? "Auto Research exceeded browser-safe processing limits. Keep the Safe preset or reduce search depth."
          : "Auto Research failed.";
      warnStep("auto_research", {
        summary: "Auto Research failed safely; downstream validation will continue where possible.",
        warning: `${message} ${error instanceof Error ? error.message : ""}`.trim()
      });
    }

    startStep("validation");
    await yieldToBrowser();
    let validationReport: ValidationSuiteReport | undefined;
    try {
      validationReport = runValidationSuite(researchCandles, activeConfig);
      saveLatestValidationReport(validationReport);
      run.validationReport = validationReport;
      run.validationSummary = summarizeValidation(validationReport);
      passStep("validation", {
        summary: `Validation completed: ${validationReport.calibration.readinessStatus} readiness, score ${validationReport.calibration.readinessScore}.`,
        detail: `Strongest: ${validationReport.calibration.strongestScenario}; weakest: ${validationReport.calibration.weakestScenario}.`
      });
    } catch (error) {
      failStep("validation", error instanceof Error ? error.message : "Validation suite failed.");
    }

    startStep("research_quality");
    await yieldToBrowser();
    let researchQualityReview: ReturnType<typeof analyzeValidationResults> | undefined;
    if (!validationReport) {
      skipStep("research_quality", "Research quality skipped because validation did not produce a report.");
    } else {
      try {
        researchQualityReview = analyzeValidationResults(validationReport);
        saveLatestResearchQualityReview(researchQualityReview);
        run.researchQualityReview = researchQualityReview;
        run.researchQualitySummary = summarizeQuality(researchQualityReview);
        passStep("research_quality", {
          summary: `Research quality grade: ${researchQualityReview.readinessGrade}.`,
          detail: researchQualityReview.recommendedNextStep
        });
      } catch (error) {
        failStep("research_quality", error instanceof Error ? error.message : "Research quality review failed.");
      }
    }

    startStep("self_improvement");
    await yieldToBrowser();
    let improvementState = loadSelfImprovementState();
    if (
      run.createdProposalId &&
      run.latestGeneratedProposal &&
      !safeArray(improvementState.proposals).some((proposal) => proposal.proposalId === run.createdProposalId)
    ) {
      improvementState = upsertCalibrationProposal(
        run.latestGeneratedProposal,
        "created",
        "Recovered proposal from the latest AI Research Cycle summary."
      );
    }
    const latestProposal =
      (run.createdProposalId
        ? safeArray(improvementState.proposals).find((proposal) => proposal.proposalId === run.createdProposalId)
        : undefined) ??
      safeArray(improvementState.proposals).find((proposal) => proposal.proposalId === improvementState.latestProposalId) ??
      safeArray(improvementState.proposals)[0];
    latestSelfImprovementProposal = latestProposal;
    run.latestGeneratedProposal =
      run.latestGeneratedProposal ??
      (run.createdProposalId
        ? safeArray(improvementState.proposals).find((proposal) => proposal.proposalId === run.createdProposalId)
        : undefined);
    run.proposalStatus = run.createdProposalId
      ? "proposed"
      : latestProposal?.status;
    if (run.createdProposalId) {
      passStep("self_improvement", {
        summary: `Approval-required proposal created: ${run.createdProposalId}.`,
        detail: "Proposal remains simulation-only until the user reviews and approves it."
      });
    } else if (latestProposal?.status === "proposed" || latestProposal?.status === "testing") {
      warnStep("self_improvement", {
        summary: `Existing proposal still requires review: ${latestProposal.proposalId}.`,
        warning: "No new proposal was created because the best candidate did not clear the stability gate."
      });
    } else {
      passStep("self_improvement", {
        summary: "No self-improvement proposal was created.",
        detail: "Best candidate did not improve stability enough to justify a proposal."
      });
    }

    startStep("simulation_verification");
    await yieldToBrowser();
    const runbookBefore = loadSimulationRunbookState();
    const runbookAfter = {
      ...runbookBefore,
      latestResearchPipelineAt: now(),
      latestResearchCycleId: run.cycleId,
      latestResearchPipelineStatus: "completed" as const,
      symbol: generatedThesis.thesis.symbol,
      timeframe: generatedThesis.thesis.timeframe,
      signal: signalFor(generatedThesis.thesis),
      mode: "simulation",
      platform: runbookBefore.platform || "ai_lab_handoff",
      notes: [
        runbookBefore.notes,
        `AI Research Cycle ${run.cycleId} completed thesis/backtest/validation pipeline at ${new Date().toISOString()}. Scheduler verification checks were not changed by this automated pipeline.`
      ].filter(Boolean).join("\n"),
      checklist: {
        ...runbookBefore.checklist,
        aiLabThesisGenerated: true
      }
    };
    saveSimulationRunbookState(runbookAfter);
    passStep("simulation_verification", {
      summary: "Simulation runbook recorded research pipeline completion.",
      detail: "Scheduler verification, signal logged, positions 0, trades 0, and shutdown checks were preserved; they were not auto-marked."
    });

    startStep("readiness_gate");
    await yieldToBrowser();
    const readinessSnapshot = evaluateReadinessGate({
      validation: validationReport,
      quality: researchQualityReview,
      runbook: runbookAfter
    });
    run.readinessSnapshot = readinessSnapshot;
    run.blockers = [
      ...safeArray(readinessSnapshot.failedRequirements).map((requirement) => requirement.label),
      ...(!run.llmRun?.advisoryPassed ? ["LLM advisory review required before Paper-Demo Candidate."] : [])
    ];
    passStep("readiness_gate", {
      summary: `Readiness remains ${readinessSnapshot.state}.`,
      detail: `${safeArray(readinessSnapshot.failedRequirements).length} failed requirement${safeArray(readinessSnapshot.failedRequirements).length === 1 ? "" : "s"}; no override applied.`
    });

    let auditWarning: string | undefined;
    if (heavyAuditSkipped) {
      auditWarning = "Heavy agent audit traces were skipped in imported-data Safe mode. Enable Advanced full research mode only for intentional stress testing.";
    } else {
      try {
        saveAgentAuditTraces([
          ...buildAgentAuditTraces({
            thesis: generatedThesis.thesis,
            debateMessages: generatedThesis.debateSession.messages,
            llmRun: run.llmRun
          }),
          ...auditCioSynthesis(generatedThesis.thesis, generatedThesis.debateSession.messages),
          ...auditAgentDebateSession(structuredDebateSession),
          ...(autoResearchCycle ? auditAutoResearchDecision(autoResearchCycle) : []),
          ...auditSelfImprovementDecision(latestSelfImprovementProposal),
          ...auditReadinessGate(readinessSnapshot)
        ]);
      } catch (error) {
        auditWarning = `Agent audit trace storage failed safely. ${error instanceof Error ? error.message : ""}`.trim();
      }
    }

    run.status = finalStatusFor(run);
    run.completedAt = now();
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);

    startStep("communications_audit");
    await yieldToBrowser();
    try {
      recordResearchCycleCommunication({
        cycleId: run.cycleId,
        status: run.status,
        summary: resultSummaryFor({ ...run, steps }),
        validationId: validationReport?.id,
        proposalId: run.createdProposalId,
        readinessState: readinessSnapshot.state,
        actionRequired: Boolean(run.createdProposalId || safeArray(run.blockers).length || run.status === "completed_with_warnings")
      });
      if (auditWarning) {
        warnStep("communications_audit", {
          summary: "Research cycle logged with compact audit handling.",
          warning: auditWarning,
          detail: "Audit message has no execution authority."
        });
      } else {
        passStep("communications_audit", {
          summary: "Research cycle logged to the in-app communications audit trail.",
          detail: "Audit message has no execution authority."
        });
      }
    } catch (error) {
      warnStep("communications_audit", {
        summary: "Research cycle completed, but communications audit storage failed safely.",
        warning: error instanceof Error ? error.message : "Unable to save communication audit entry."
      });
    }

    run.status = finalStatusFor(run);
    run.completedAt = now();
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    saveResearchCycleRun(snapshot());
    notify();
    return snapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research cycle failed.";
    const runningStep = steps.find((step) => step.status === "running")?.stepId ?? "communications_audit";
    failStep(runningStep, message);
    run.status = "failed";
    run.completedAt = now();
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    try {
      recordResearchCycleCommunication({
        cycleId: run.cycleId,
        status: "failed",
        summary: message,
        readinessState: run.readinessSnapshot?.state,
        actionRequired: true
      });
    } catch {
      // Keep the failed research-cycle result available even if audit logging storage is full.
    }
    saveResearchCycleRun(snapshot());
    return snapshot();
  }
}
