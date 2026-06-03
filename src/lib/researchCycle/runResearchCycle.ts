import { compactAutoResearchCycle, runAutoResearchCycle } from "@/lib/autoResearch";
import type { AutoResearchCandidateResult, AutoResearchCycle } from "@/lib/autoResearch";
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
  diagnoseTradeQuality,
  runBacktest,
  sanitizeBacktestConfig,
  topTradeGenerationDiagnostic
} from "@/lib/backtesting";
import type { BacktestResult, ResolvedBacktestConfig } from "@/lib/backtesting";
import { recordResearchCycleCommunication } from "@/lib/communications/communicationSpec";
import { buildEvidenceLedger } from "@/lib/evidence";
import type { EvidenceLedgerInput } from "@/lib/evidence";
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
  buildMarketContext,
  getImportedDataPreset,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  resolveActiveResearchCandleSource,
  resolveImportedCandleActivationState,
  type PreparedCandleSource
} from "@/lib/marketData";
import { hydrateActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview";
import { hydrateActiveMt5ReadOnlyCandleFeed } from "@/lib/integrations/mt5";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { buildCanonicalPerformanceMetricsFromRun, canonicalMetricsForRun } from "@/lib/performance/canonicalMetrics";
import { calculateResearchMaturity } from "@/lib/maturity";
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
import { latestWalkForwardRun, loadWalkForwardState } from "@/lib/walkForward";

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

const readinessBlockerLabel = (requirement: { id?: string; label: string; passed?: boolean }) => {
  if (requirement.passed) {
    return undefined;
  }
  switch (requirement.id) {
    case "validation-exists":
      return "Validation suite missing.";
    case "research-quality-exists":
      return "Research quality review missing.";
    case "simulated-trade-sample":
      return "Insufficient simulated trades.";
    case "quality-candidate":
      return "Research Quality must reach Paper-Demo Candidate.";
    case "llm-advisory-review":
      return "LLM advisory missing.";
    case "runbook-complete":
      return "Simulation runbook incomplete.";
    case "drawdown-threshold":
      return "Drawdown too high.";
    case "confidence-calibration":
      return "Confidence calibration too low.";
    case "false-positive-control":
      return "False positives too high.";
    case "session-consistency":
      return "Session consistency weak.";
    case "conservative-stability":
      return "Conservative scenario unstable.";
    default:
      return requirement.label;
  }
};

const uniqueText = (items: Array<string | undefined>) =>
  items.filter((item): item is string => Boolean(item?.trim())).filter((item, index, array) => array.indexOf(item) === index);

const evidenceDataModeFor = (
  sourceMode: ResearchCycleRun["dataSourceMode"],
  fallbackMode: PreparedCandleSource["mode"]
): EvidenceLedgerInput["dataMode"] => {
  if (sourceMode === "tradingview_mcp_chart" || sourceMode === "mt5_read_only") {
    return "future_provider";
  }
  return fallbackMode === "imported" ? "imported" : "mock";
};

const sourceMetadataFor = ({
  activeResearchCandleSource,
  mt5ReadOnlyFeed,
  tradingViewChartFeed
}: {
  activeResearchCandleSource: ReturnType<typeof resolveActiveResearchCandleSource>;
  mt5ReadOnlyFeed?: Awaited<ReturnType<typeof hydrateActiveMt5ReadOnlyCandleFeed>>;
  tradingViewChartFeed?: Awaited<ReturnType<typeof hydrateActiveTradingViewMcpChartFeed>>;
}): ResearchCycleRun["sourceMetadata"] => {
  const mt5Active = activeResearchCandleSource.sourceMode === "mt5_read_only";
  const tradingViewActive = activeResearchCandleSource.sourceMode === "tradingview_mcp_chart";
  const eligibility = mt5Active
    ? mt5ReadOnlyFeed?.researchEligibility
    : tradingViewActive
      ? tradingViewChartFeed?.researchEligibility
      : undefined;

  return {
    activeSourceMode: activeResearchCandleSource.sourceMode,
    activeSourceLabel: activeResearchCandleSource.sourceLabel,
    activeSourceFingerprint: activeResearchCandleSource.identity.dataFingerprint,
    candleCount: activeResearchCandleSource.identity.candleCount,
    firstTimestamp: activeResearchCandleSource.identity.firstTimestamp,
    lastTimestamp: activeResearchCandleSource.identity.lastTimestamp,
    firstClose: activeResearchCandleSource.identity.firstClose,
    lastClose: activeResearchCandleSource.identity.lastClose,
    researchEligibility: eligibility?.state,
    eligibilityReasons: safeArray(eligibility?.reasons),
    sourceWarnings: uniqueText([
      ...(mt5Active ? safeArray(mt5ReadOnlyFeed?.warnings) : []),
      ...(tradingViewActive ? safeArray(tradingViewChartFeed?.warnings) : []),
      activeResearchCandleSource.sourceMode === "mt5_read_only"
        ? "MT5 read-only candles are CFD/proxy market data, not CME futures broker truth."
        : undefined,
      activeResearchCandleSource.sourceMode === "tradingview_mcp_chart"
        ? "TradingView MCP candles are chart data, not broker truth."
        : undefined
    ]),
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
};

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
  wins: result.summary.wins,
  losses: result.summary.losses,
  unresolved: result.summary.unresolved,
  winRate: result.summary.winRate,
  realizedR: result.summary.realizedR,
  averageR: result.summary.averageR,
  maxDrawdown: result.summary.maxDrawdown,
  profitFactor: result.summary.profitFactor,
  skippedSignals: result.summary.skippedSignals,
  grinchSummary: result.summary.grinchSummary,
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

const unavailableLLMRun = ({
  contextPacketId,
  reason,
  warnings
}: {
  contextPacketId: string;
  reason: string;
  warnings: string[];
}): LLMAdvisoryRun => ({
  runId: uid("llm_run_unavailable"),
  timestamp: now(),
  researchMode: "llm_required",
  providerMode: "local_command",
  providerConfigured: false,
  status: "unavailable",
  realProvider: false,
  advisoryPassed: false,
  contextPacketId,
  responses: [],
  validationResults: {},
  unsafeResponseRejections: 0,
  readinessImpact: [
    warnings[0] ?? "LLM advisory bridge offline. Deterministic research continued; advisory unavailable.",
    `Reason: ${reason}.`
  ].join(" "),
  safetyNotice: "LLM agents are advisory only. They cannot execute trades or override readiness gates."
});

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
  if (run.status === "canceled") {
    return "Discard the stopped checkpoint or rerun the research cycle in Safe mode.";
  }
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
  if (run.status === "canceled") {
    return `Research cycle canceled after ${run.candidateProgress?.currentCandidate ?? 0}/${run.candidateProgress?.totalCandidates ?? 0} candidate checkpoints. Broker execution remained disabled.`;
  }
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
  onUpdate,
  signal
}: ResearchCycleRunOptions): Promise<ResearchCycleRun> {
  let steps = initialSteps();
  let workingState: LabState = labStorage.load() ?? state;
  const cycleId = uid("research_cycle");
  const throwIfCanceled = () => {
    if (signal?.aborted) {
      throw new Error("Research cycle canceled by user.");
    }
  };
  const activeResearchConfig = resolveActiveBacktestConfig(backtestConfig ? sanitizeBacktestConfig(backtestConfig) : undefined);
  const baseActiveConfig = activeResearchConfig.config;
  const requestedCandleWindowSettings = candleWindowSettings ?? loadCandleWindowSettings();
  const importActivation = await resolveImportedCandleActivationState().catch(() => undefined);
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
  const importedPreset = activeCandleSource.mode === "imported" ? getImportedDataPreset(activeCandleSource.appliedSettings) : "mock";
  const tradingViewChartFeed = await hydrateActiveTradingViewMcpChartFeed().catch(() => undefined);
  const mt5ReadOnlyFeed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => undefined);
  const activeResearchCandleSource = resolveActiveResearchCandleSource(activeCandleSource, tradingViewChartFeed, mt5ReadOnlyFeed);
  const activeResearchUsesExternalReadOnly =
    activeResearchCandleSource.sourceMode === "tradingview_mcp_chart" || activeResearchCandleSource.sourceMode === "mt5_read_only";
  const importedExpectedButMissing =
    !activeResearchUsesExternalReadOnly &&
    activeCandleSource.mode !== "imported" &&
    ((importActivation?.importedDatasetCount ?? 0) > 0 || importActivation?.status === "active_import_missing_stale");
  const importedGuardedMode = activeCandleSource.mode === "imported" && !activeResearchUsesExternalReadOnly && !advancedFullResearchMode;
  const effectiveSearchMode = searchMode;
  const effectiveMaxCandidateCount = importedGuardedMode
    ? Math.min(maxCandidateCount, DASHBOARD_IMPORTED_CANDIDATE_LIMIT)
    : maxCandidateCount;
  const effectiveMaxAdaptivePasses = importedGuardedMode && importedPreset === "safe" ? 1 : undefined;
  const heavyAuditSkipped = skipHeavyAudit ?? importedGuardedMode;
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
  const researchCandles = activeResearchCandleSource.candles.length ? activeResearchCandleSource.candles : mockCandles;
  const dataSourceLabel = activeResearchCandleSource.sourceLabel;
  const evidenceDataMode = evidenceDataModeFor(activeResearchCandleSource.sourceMode, activeCandleSource.mode);
  const latestResearchCandle = researchCandles[researchCandles.length - 1];
  const activeConfig = activeResearchUsesExternalReadOnly && latestResearchCandle
    ? sanitizeBacktestConfig({
        ...baseActiveConfig,
        symbol: latestResearchCandle.symbol,
        timeframe: latestResearchCandle.timeframe
      })
    : activeCandleSource.metadata
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
    dataSourceMode: activeResearchCandleSource.sourceMode,
    dataSourceLabel,
    rawCandleCount: activeResearchUsesExternalReadOnly ? activeResearchCandleSource.identity.candleCount : activeCandleSource.rawCandleCount,
    researchWindowCandles: activeResearchCandleSource.identity.candleCount,
    processedCandleCount: activeResearchCandleSource.identity.candleCount,
    researchTimeframe: activeConfig.timeframe,
    performanceMode: activeCandleSource.performanceMode,
    researchPreset,
    advancedFullResearchMode,
    effectiveSearchMode,
    effectiveMaxCandidateCount,
    heavyAuditSkipped,
    candleWindowSettings: activeCandleSource.appliedSettings,
    candleWindowWarnings: [
      ...activeCandleSource.warnings,
      ...(activeResearchUsesExternalReadOnly
        ? [
            `Research source is ${activeResearchCandleSource.sourceMode.replace(/_/g, " ")} read-only candles. First ${activeResearchCandleSource.identity.firstTimestamp ?? "n/a"} / ${activeResearchCandleSource.identity.firstClose ?? "n/a"}; last ${activeResearchCandleSource.identity.lastTimestamp ?? "n/a"} / ${activeResearchCandleSource.identity.lastClose ?? "n/a"}. Not broker truth and no execution authority.`
          ]
        : []),
      ...hardLimitWarnings,
      ...(activeCandleSource.mode === "mock"
        ? [`Current data source is Mock. Not valid for imported MNQ comparison. ${importActivation?.message ?? ""}`.trim()]
        : [])
    ],
    sourceMetadata: sourceMetadataFor({ activeResearchCandleSource, mt5ReadOnlyFeed, tradingViewChartFeed }),
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

  if (importedExpectedButMissing) {
    failStep(
      "thesis_generation",
      `Imported data is expected but not active. ${importActivation?.message ?? "Reactivate the imported dataset on Market Data before running imported-data research."}`
    );
    skipStep("backtest", "Backtest skipped because imported data is not active.");
    skipStep("llm_advisory", "LLM advisory skipped because imported data is not active.");
    skipStep("auto_research", "Auto Research skipped because imported data is not active.");
    skipStep("validation", "Validation skipped because imported data is not active.");
    skipStep("research_quality", "Research quality skipped because imported data is not active.");
    skipStep("self_improvement", "Self-improvement skipped because imported data is not active.");
    skipStep("simulation_verification", "Simulation runbook update skipped because imported data is not active.");
    skipStep("readiness_gate", "Readiness skipped because imported data is not active.");
    skipStep("communications_audit", "Communications audit skipped because imported data is not active.");
    run.status = "failed";
    run.completedAt = now();
    run.nextRecommendedAction = "Reactivate an imported dataset on Market Data, or re-import MNQ historical data, then rerun the research cycle.";
    run.resultSummary = resultSummaryFor(run);
    saveResearchCycleRun(snapshot());
    return snapshot();
  }

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
    throwIfCanceled();
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
      const regimeClassification = generatedThesis.thesis.regimeClassification;
      if (regimeClassification) {
        run.regimeSummary = {
          label: regimeClassification.stableLabel,
          instantaneousLabel: regimeClassification.instantaneousLabel,
          stableLabel: regimeClassification.stableLabel,
          confidence: regimeClassification.confidence,
          dataQuality: regimeClassification.dataQuality,
          transitionPending: regimeClassification.transitionPending,
          candleCount: regimeClassification.candleCount,
          requiredCandleCount: 100,
          missingInputs: regimeClassification.missingInputs,
          supportingFactors: safeTopN(regimeClassification.supportingFactors, 6),
          warnings: safeTopN(regimeClassification.warnings, 6),
          sourceFingerprint: regimeClassification.sourceFingerprint
        };
      }
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
    throwIfCanceled();
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
        run.tradeQualityDiagnostics = diagnoseTradeQuality({ result: backtestResult });
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
    throwIfCanceled();
    const startingRunbook = loadSimulationRunbookState();
    const llmMarketContext = buildMarketContext({
      symbol: activeConfig.symbol,
      timeframe: activeConfig.timeframe,
      mode: evidenceDataMode,
      candles: researchCandles
    });
    const llmEvidenceQualitySummary = buildEvidenceLedger({
      dataMode: evidenceDataMode,
      sourceLabel: dataSourceLabel,
      rawCandleCount: run.rawCandleCount ?? researchCandles.length,
      processedCandleCount: run.processedCandleCount ?? researchCandles.length,
      researchWindow: run.researchWindowCandles ?? researchCandles.length,
      latestCycleId: run.cycleId,
      latestCycleTimestamp: run.startedAt,
      debateSessionId: run.agentDebateConsensus?.sessionId,
      readinessState: run.readinessSnapshot?.state
    });
    const llmPacket = buildLLMResearchContextPacket({
      state: workingState,
      validation: undefined,
      quality: undefined,
      readiness: undefined,
      runbook: startingRunbook,
      providerMode: "local_command",
      marketContext: llmMarketContext,
      evidenceQualitySummary: llmEvidenceQualitySummary
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
        if (bridgeResult.advisoryStatus === "unavailable") {
          run.llmBridgeAvailable = false;
          run.llmAdvisoryUnavailable = true;
          run.llmAdvisoryUnavailableReason = bridgeResult.reason;
          run.llmRun = unavailableLLMRun({
            contextPacketId: llmPacket.packetId,
            reason: bridgeResult.reason,
            warnings: bridgeResult.warnings
          });
          warnStep("llm_advisory", {
            summary: "LLM advisory bridge offline. Deterministic research continued; advisory unavailable.",
            warning: bridgeResult.warnings.join(" ")
          });
        } else {
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
        }
      } catch (error) {
        run.llmBridgeAvailable = false;
        run.llmAdvisoryUnavailable = true;
        run.llmAdvisoryUnavailableReason = "request_failed";
        run.llmRun = unavailableLLMRun({
          contextPacketId: llmPacket.packetId,
          reason: "request_failed",
          warnings: [
            "LLM advisory bridge offline. Deterministic research continued; advisory unavailable.",
            error instanceof Error ? error.message : "Local LLM bridge request failed."
          ]
        });
        warnStep("llm_advisory", {
          summary: "LLM advisory bridge offline. Deterministic research continued; advisory unavailable.",
          warning: error instanceof Error ? error.message : "Local LLM bridge request failed."
        });
      }
    }

    startStep("auto_research");
    await yieldToBrowser();
    throwIfCanceled();
    let autoResearchCycle: AutoResearchCycle | undefined;
    try {
      autoResearchCycle = await runAutoResearchCycle({
        searchMode: effectiveSearchMode,
        maxCandidateCount: effectiveMaxCandidateCount,
        maxAdaptivePasses: effectiveMaxAdaptivePasses,
        createProposal: true,
        candles: researchCandles,
        baselineConfig: activeConfig,
        dataSource: dataSourceLabel,
        candleWindow: `${activeCandleSource.researchWindowCandles} raw window / ${activeCandleSource.processedCandleCount} processed ${activeCandleSource.appliedSettings.targetTimeframe} candles`,
        activeCalibrationIdUsed: activeResearchConfig.activeCalibrationId,
        signal,
        timeoutMs: activeCandleSource.mode === "imported" && !advancedFullResearchMode ? 25_000 : 45_000,
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
        },
        onCheckpoint: (checkpoint) => {
          run.autoResearchCheckpoint = checkpoint;
          run.candidateProgress = {
            currentCandidate: checkpoint.currentCandidate,
            totalCandidates: checkpoint.totalCandidates,
            passNumber: checkpoint.currentPass,
            totalPasses: checkpoint.totalPasses,
            passLabel: checkpoint.phase,
            candidateId: checkpoint.bestCandidateId ?? checkpoint.cycleId,
            candidateLabel: checkpoint.currentCandidateName ?? checkpoint.phase,
            candidateScore: checkpoint.bestCandidateScore ?? 0,
            bestCandidateId: checkpoint.bestCandidateId,
            bestCandidateLabel: checkpoint.bestCandidateLabel,
            bestCandidateScore: checkpoint.bestCandidateScore,
            bestCandidateCategory: checkpoint.bestCandidateCategory
          };
          notify();
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
    throwIfCanceled();
    let validationReport: ValidationSuiteReport | undefined;
    try {
      validationReport = runValidationSuite(researchCandles, activeConfig);
      saveLatestValidationReport(validationReport);
      run.validationReport = validationReport;
      run.validationSummary = summarizeValidation(validationReport);
      if (backtestResult.summary.totalTrades > 0) {
        run.tradeQualityDiagnostics = diagnoseTradeQuality({ result: backtestResult, validation: validationReport });
      }
      passStep("validation", {
        summary: `Validation completed: ${validationReport.calibration.readinessStatus} readiness, score ${validationReport.calibration.readinessScore}.`,
        detail: `Strongest: ${validationReport.calibration.strongestScenario}; weakest: ${validationReport.calibration.weakestScenario}.`
      });
    } catch (error) {
      failStep("validation", error instanceof Error ? error.message : "Validation suite failed.");
    }

    startStep("research_quality");
    await yieldToBrowser();
    throwIfCanceled();
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
    throwIfCanceled();
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
    throwIfCanceled();
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
    throwIfCanceled();
    const readinessSnapshot = evaluateReadinessGate({
      validation: validationReport,
      quality: researchQualityReview,
      runbook: runbookAfter
    });
    run.readinessSnapshot = readinessSnapshot;
    run.blockers = uniqueText([
      ...safeArray(readinessSnapshot.failedRequirements).map(readinessBlockerLabel),
      ...(!run.llmRun?.advisoryPassed ? ["LLM advisory missing."] : [])
    ]);
    passStep("readiness_gate", {
      summary: `Readiness remains ${readinessSnapshot.state}.`,
      detail: `${safeArray(readinessSnapshot.failedRequirements).length} failed requirement${safeArray(readinessSnapshot.failedRequirements).length === 1 ? "" : "s"}; no override applied.`
    });

    run.canonicalMetrics = buildCanonicalPerformanceMetricsFromRun(run, validationReport);
    const cycleEvidenceSummary = buildEvidenceLedger({
      dataMode: evidenceDataMode,
      sourceLabel: dataSourceLabel,
      rawCandleCount: run.rawCandleCount ?? researchCandles.length,
      processedCandleCount: run.processedCandleCount ?? researchCandles.length,
      researchWindow: run.researchWindowCandles ?? researchCandles.length,
      latestCycleId: run.cycleId,
      latestCycleTimestamp: run.completedAt ?? run.startedAt,
      latestLLMRunId: run.llmRun?.runId,
      llmAdvisoryPassed: run.llmRun?.advisoryPassed,
      debateSessionId: run.agentDebateConsensus?.sessionId,
      validationId: run.validationSummary?.validationId,
      researchQualityId: run.researchQualitySummary?.reviewId,
      readinessState: readinessSnapshot.state,
      proposalId: run.createdProposalId,
      smtState: run.backtestSummary?.grinchSummary?.latestScore?.smtState
    });
    run.evidenceSummary = {
      evidenceScore: cycleEvidenceSummary.overallScore,
      realEvidenceCoverage: cycleEvidenceSummary.realEvidenceCoverage,
      weakestEvidenceCategories: safeTopN(cycleEvidenceSummary.weakestEvidenceCategories, 5),
      readinessEvidenceWarnings: safeTopN(cycleEvidenceSummary.readinessEvidenceWarnings, 5),
      nextDataImprovement: cycleEvidenceSummary.nextDataImprovement
    };
    const existingCycleState = loadResearchCycleState();
    const maturityCycles = [
      run,
      ...safeArray(existingCycleState.runs).filter((item) => item.cycleId !== run.cycleId)
    ].map((cycle) => {
      const metrics = canonicalMetricsForRun(cycle);
      return {
        cycleId: cycle.cycleId,
        timestamp: cycle.completedAt ?? cycle.startedAt,
        status: cycle.status,
        activeCalibrationId: metrics?.activeCalibrationId ?? cycle.activeCalibrationId,
        dataSourceMode: cycle.dataSourceMode,
        researchPreset: cycle.researchPreset,
        candleWindow: metrics?.candleWindow ?? `${cycle.researchWindowCandles ?? 0} raw / ${cycle.processedCandleCount ?? 0} processed`,
        rawCandleCount: metrics?.rawCandleCount ?? cycle.rawCandleCount,
        processedCandleCount: metrics?.processedCandleCount ?? cycle.processedCandleCount,
        totalTrades: metrics?.totalTrades ?? cycle.backtestSummary?.totalTrades,
        winRate: metrics?.winRate ?? cycle.backtestSummary?.winRate,
        averageR: metrics?.averageR ?? cycle.backtestSummary?.averageR,
        maxDrawdownR: metrics?.maxDrawdownR ?? cycle.backtestSummary?.maxDrawdown,
        falsePositiveCount: metrics?.falsePositiveCount,
        readinessScore: metrics?.readinessScore ?? cycle.researchQualitySummary?.readinessScore ?? cycle.validationSummary?.readinessScore,
        readinessState: cycle.readinessSnapshot?.state,
        llmAdvisoryPassed: cycle.llmRun?.advisoryPassed
      };
    });
    const maturitySummary = calculateResearchMaturity({
      activeCalibrationId: activeResearchConfig.activeCalibrationId,
      activeCalibrationApprovedAt: activeResearchConfig.activeResearchCalibration?.approvedAt,
      cycles: maturityCycles,
      evidenceQualityScore: cycleEvidenceSummary.overallScore,
      proposals: loadSelfImprovementState().proposals,
      latestReadinessState: readinessSnapshot.state,
      latestWalkForwardRun: latestWalkForwardRun(loadWalkForwardState())
    });
    run.maturitySummary = {
      maturityScore: maturitySummary.score,
      maturityGrade: maturitySummary.grade,
      missingRequirements: safeTopN(maturitySummary.missingRequirements, 5),
      maturityWarnings: safeTopN(maturitySummary.maturityWarnings, 5),
      nextMaturityRequirement: maturitySummary.nextMaturityRequirement
    };

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
    run.canonicalMetrics = buildCanonicalPerformanceMetricsFromRun(run, validationReport);
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);

    startStep("communications_audit");
    await yieldToBrowser();
    throwIfCanceled();
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
    run.canonicalMetrics = buildCanonicalPerformanceMetricsFromRun(run, validationReport);
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    saveResearchCycleRun(snapshot());
    notify();
    return snapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research cycle failed.";
    const runningStep = steps.find((step) => step.status === "running")?.stepId ?? "communications_audit";
    if (signal?.aborted || /canceled/i.test(message)) {
      setStep(runningStep, {
        status: "skipped",
        summary: "Research cycle was canceled before completion.",
        warning: message
      });
      run.status = "canceled";
    } else {
      failStep(runningStep, message);
      run.status = "failed";
    }
    run.completedAt = now();
    run.canonicalMetrics = buildCanonicalPerformanceMetricsFromRun(run, run.validationReport);
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    try {
      recordResearchCycleCommunication({
        cycleId: run.cycleId,
        status: run.status,
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
