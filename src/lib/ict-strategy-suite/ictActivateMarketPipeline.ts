import type { ResearchRuntimeSnapshot } from "../runtime";
import {
  buildCurrentOpportunityContext,
  detectCurrentOpportunities,
  saveCurrentOpportunityScan
} from "../currentOpportunity";
import { buildIctAdvisorPacketFromRuntime } from "./ictAdvisorEngine";
import type { IctAdvisorPacket } from "./ictAdvisorTypes";
import { evaluateCmdPaperTrackingEligibility } from "./ictCmdPaperTracking";
import { buildIctCurrentReadFromPacket } from "./ictCurrentRead";
import type { IctCurrentRead } from "./ictCurrentReadTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import { buildIctMarketAnalysisContextBundle } from "./ictMarketAnalysisContext";
import type { IctAnalysisTimeframe, IctMarketAnalysisContextBundle } from "./ictMarketAnalysisContextTypes";
import { queueIctResearchHypothesis } from "./ictSelfImprovement";
import type { IctResearchHypothesisQueueResult } from "./ictSelfImprovementTypes";
import { buildIctResearchSignalFromCurrentRead } from "./ictSignalContract";
import type { IctResearchSignal } from "./ictSignalContractTypes";
import type {
  IctActivateMarketCallbacks,
  IctActivateMarketLatestSummary,
  IctActivateMarketOperatorWorkflow,
  IctActivateMarketResult,
  IctActivateMarketStatus,
  IctActivateMarketStep,
  IctActivateMarketStepId
} from "./ictActivateMarketPipelineTypes";

export const ICT_ACTIVATE_MARKET_LATEST_SUMMARY_STORAGE_KEY = "gotrader.ict-activate-market.latest.v1";
export const ICT_ACTIVATE_MARKET_UPDATED_EVENT = "gotrader:ict-activate-market-updated";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const stepDefinitions: Array<{ id: IctActivateMarketStepId; label: string }> = [
  { id: "resolve_symbol", label: "Resolve symbol" },
  { id: "check_mt5_readonly", label: "Check MT5 read-only" },
  { id: "load_display_candles", label: "Load display candles" },
  { id: "load_analysis_m5", label: "Load M5 analysis" },
  { id: "load_analysis_m15", label: "Load M15 session model" },
  { id: "load_analysis_h1", label: "Load H1 dealing range" },
  { id: "load_analysis_h4", label: "Load H4 HTF bias" },
  { id: "load_analysis_daily", label: "Load daily bias" },
  { id: "load_analysis_weekly", label: "Load weekly context" },
  { id: "load_weekly_bias", label: "Load weekly bias" },
  { id: "build_multi_timeframe_context", label: "Build multi-timeframe context" },
  { id: "build_current_read", label: "Build current read" },
  { id: "detect_session_model", label: "Detect session model" },
  { id: "run_universal_recognition", label: "Run universal recognition" },
  { id: "detect_market_opportunity", label: "Detect market opportunity" },
  { id: "queue_research_hypothesis", label: "Queue research hypothesis" },
  { id: "run_phase_one", label: "Run ICT Phase 1" },
  { id: "run_phase_two", label: "Run ICT Phase 2" },
  { id: "run_smt", label: "Check SMT / relative strength" },
  { id: "run_news_session_risk", label: "Check news/session risk" },
  { id: "apply_approved_profile", label: "Apply approved profile" },
  { id: "build_signal_contract", label: "Build research signal contract" },
  { id: "build_operator_workflow", label: "Build operator workflow" },
  { id: "check_cmd_paper_eligibility", label: "Check CMD paper eligibility" },
  { id: "load_latest_monte_carlo_summary", label: "Load latest Monte Carlo summary" },
  { id: "save_latest_state", label: "Save latest research state" },
  { id: "complete", label: "Complete" }
];

export interface IctActivateMarketPipelineConfig {
  snapshot: ResearchRuntimeSnapshot;
  latestResearchState?: IctLatestResearchState;
  saveLatestSummary?: boolean;
}

export interface IctActivateMarketPipelineDependencies {
  buildMarketAnalysisContext?: (snapshot: ResearchRuntimeSnapshot) => Promise<IctMarketAnalysisContextBundle>;
  buildAdvisorPacketFromRuntime?: (snapshot: ResearchRuntimeSnapshot, options?: { marketAnalysisContextBundle?: IctMarketAnalysisContextBundle }) => Promise<IctAdvisorPacket>;
  buildCurrentRead?: (packet?: IctAdvisorPacket, latestState?: IctLatestResearchState) => IctCurrentRead;
  buildSignalContract?: (currentRead: IctCurrentRead, latestState?: IctLatestResearchState) => IctResearchSignal;
  evaluateCmdPaperEligibility?: (signal: IctResearchSignal) => { eligible: boolean; reasons: string[] };
  queueResearchHypothesis?: (hypothesis?: IctCurrentRead["selfImprovementHypothesis"]) => IctResearchHypothesisQueueResult;
  saveLatestSummary?: (summary: IctActivateMarketLatestSummary) => void;
}

export const createActivateMarketInitialSteps = (): IctActivateMarketStep[] =>
  stepDefinitions.map(({ id, label }) => ({
    id,
    label,
    status: "pending"
  }));

const now = () => new Date().toISOString();
const msBetween = (start?: string, end?: string) =>
  start && end ? Math.max(0, new Date(end).getTime() - new Date(start).getTime()) : undefined;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");
const asList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const updateStep = (
  steps: IctActivateMarketStep[],
  id: IctActivateMarketStepId,
  patch: Partial<IctActivateMarketStep>
) =>
  steps.map((step) => {
    if (step.id !== id) return step;
    const next = { ...step, ...patch };
    if (next.startedAt && next.completedAt) {
      next.durationMs = msBetween(next.startedAt, next.completedAt);
    }
    return next;
  });

export const markActivationStepRunning = (steps: IctActivateMarketStep[], id: IctActivateMarketStepId, message?: string) =>
  updateStep(steps, id, {
    status: "running",
    message,
    startedAt: now(),
    completedAt: undefined,
    durationMs: undefined,
    warning: undefined,
    error: undefined
  });

export const markActivationStepCompleted = (steps: IctActivateMarketStep[], id: IctActivateMarketStepId, message?: string, warning?: string) =>
  updateStep(steps, id, {
    status: "completed",
    message,
    completedAt: now(),
    warning,
    error: undefined
  });

export const markActivationStepSkipped = (steps: IctActivateMarketStep[], id: IctActivateMarketStepId, warning?: string) =>
  updateStep(steps, id, {
    status: "skipped",
    warning,
    completedAt: now(),
    error: undefined
  });

export const markActivationStepFailed = (steps: IctActivateMarketStep[], id: IctActivateMarketStepId, error?: string) =>
  updateStep(steps, id, {
    status: "failed",
    error,
    completedAt: now()
  });

const defaultSaveLatestSummary = (summary: IctActivateMarketLatestSummary) => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(ICT_ACTIVATE_MARKET_LATEST_SUMMARY_STORAGE_KEY, JSON.stringify(summary));
    window.dispatchEvent(new CustomEvent(ICT_ACTIVATE_MARKET_UPDATED_EVENT, { detail: { summary } }));
  } catch {
    // Activation summary persistence must never block the operator workflow.
  }
};

export const readLatestActivateMarketSummary = (): IctActivateMarketLatestSummary | undefined => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_ACTIVATE_MARKET_LATEST_SUMMARY_STORAGE_KEY) ?? "null");
    if (!parsed?.researchOnly) return undefined;
    return {
      activationTimestamp: String(parsed.activationTimestamp ?? now()),
      requestedSymbol: String(parsed.requestedSymbol ?? "MNQ"),
      brokerSymbol: String(parsed.brokerSymbol ?? "USTECH"),
      primaryTimeframe: String(parsed.primaryTimeframe ?? "5m"),
      displayTimeframe: typeof parsed.displayTimeframe === "string" ? parsed.displayTimeframe : undefined,
      analysisDepthStatus: typeof parsed.analysisDepthStatus === "string" ? parsed.analysisDepthStatus : undefined,
      analysisTimeframesUsed: asList(parsed.analysisTimeframesUsed) as IctAnalysisTimeframe[],
      missingTimeframes: asList(parsed.missingTimeframes) as IctAnalysisTimeframe[],
      modelName: typeof parsed.modelName === "string" ? parsed.modelName : undefined,
      modelLane: typeof parsed.modelLane === "string" ? parsed.modelLane : undefined,
      opportunityType: typeof parsed.opportunityType === "string" ? parsed.opportunityType : undefined,
      opportunityStage: typeof parsed.opportunityStage === "string" ? parsed.opportunityStage : undefined,
      opportunityQuality: typeof parsed.opportunityQuality === "string" ? parsed.opportunityQuality : undefined,
      opportunityLaneRecommendation: typeof parsed.opportunityLaneRecommendation === "string" ? parsed.opportunityLaneRecommendation : undefined,
      currentOpportunitySummary: parsed.currentOpportunitySummary && typeof parsed.currentOpportunitySummary === "object" ? parsed.currentOpportunitySummary : undefined,
      recognitionTier: typeof parsed.recognitionTier === "string" ? parsed.recognitionTier as IctActivateMarketLatestSummary["recognitionTier"] : undefined,
      scalpStatus: typeof parsed.scalpStatus === "string" ? parsed.scalpStatus as IctActivateMarketLatestSummary["scalpStatus"] : undefined,
      pdArrayFocus: typeof parsed.pdArrayFocus === "string" ? parsed.pdArrayFocus : undefined,
      selfImprovementHypothesisQueued: parsed.selfImprovementHypothesisQueued === true,
      selfImprovementHypothesisStatus: typeof parsed.selfImprovementHypothesisStatus === "string" ? parsed.selfImprovementHypothesisStatus : undefined,
      selfImprovementHypothesisReason: typeof parsed.selfImprovementHypothesisReason === "string" ? parsed.selfImprovementHypothesisReason : undefined,
      nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction : undefined,
      executionAllowed: false,
      researchOnly: true,
      authority,
      safety
    };
  } catch {
    return undefined;
  }
};

const notify = (
  callbacks: IctActivateMarketCallbacks | undefined,
  stepId: IctActivateMarketStepId,
  steps: IctActivateMarketStep[]
) => {
  const step = steps.find((item) => item.id === stepId);
  if (step) {
    callbacks?.onStepUpdate?.(step, steps);
  }
};

const sourceProvider = (snapshot: ResearchRuntimeSnapshot) => snapshot.marketData.activeResearchSource.provider;
const sourceAuthority = (snapshot: ResearchRuntimeSnapshot) => snapshot.marketData.activeResearchSource.authority;
const sourceFingerprint = (snapshot: ResearchRuntimeSnapshot) => snapshot.marketData.activeResearchSource.fingerprint;
const sourceCandleCount = (snapshot: ResearchRuntimeSnapshot) => snapshot.marketData.activeResearchSource.candleCount ?? 0;
const sourceTimeframe = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.marketData.activeResearchSource.timeframe ?? snapshot.marketData.timeframe ?? "5m";
const sourceRequestedSymbol = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.marketData.symbol ?? snapshot.marketData.activeResearchSource.symbol ?? "MNQ";
const sourceBrokerSymbol = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.mt5ReadOnly.brokerSymbol ??
  snapshot.marketData.activeResearchSource.provenance?.providerSymbol ??
  snapshot.marketData.contract ??
  sourceRequestedSymbol(snapshot);
const htfTimeframes = (snapshot: ResearchRuntimeSnapshot) =>
  (snapshot.mt5ReadOnly.higherTimeframeSources ?? [])
    .filter((source) => source.candleCount > 0)
    .map((source) => source.timeframe);

const unavailableReadinessSummary = (reason: string) => ({
  researchReadiness: "not_ready" as const,
  paperReadiness: "not_eligible" as const,
  executionReadiness: "disabled" as const,
  reasons: [reason, "Execution readiness is disabled by design."]
});

const latestMonteCarloFor = (latestState?: IctLatestResearchState): NonNullable<IctActivateMarketResult["latestMonteCarlo"]> => {
  const summary = latestState?.latestMonteCarlo;
  if (!summary) {
    return {
      status: "missing",
      reason: "No saved Monte Carlo - run replay then Monte Carlo.",
      recommendedMaxRiskReason: "Recommended max risk unavailable - no saved Monte Carlo."
    };
  }
  return {
    status: "saved",
    summary,
    reason: `Saved Monte Carlo ${summary.robustnessRating}; ${summary.usableOutcomes} usable outcomes.`,
    recommendedMaxRiskReason: typeof summary.recommendedMaxRiskPerTradePct === "number"
      ? "Recommended max risk comes from the latest saved Monte Carlo summary."
      : "Recommended max risk unavailable - saved Monte Carlo did not include a max-risk recommendation."
  };
};

const finalizeBlockedSteps = (steps: IctActivateMarketStep[], reason: string) =>
  steps.map((step) =>
    step.status === "pending"
      ? {
          ...step,
          status: "skipped" as const,
          warning: reason,
          completedAt: now()
        }
      : step
  );

const criticalUnavailableResult = ({
  brokerSymbol,
  errors,
  primaryTimeframe,
  requestedSymbol,
  steps,
  warnings
}: {
  brokerSymbol: string;
  errors: string[];
  primaryTimeframe: string;
  requestedSymbol: string;
  steps: IctActivateMarketStep[];
  warnings: string[];
}): IctActivateMarketResult => ({
  researchOnly: true,
  status: "unavailable",
  generatedAt: now(),
  requestedSymbol,
  brokerSymbol,
  primaryTimeframe,
  htfTimeframes: [],
  steps: finalizeBlockedSteps(steps, "Not run because the active source failed the MT5 read-only preflight."),
  summary: {
    dataStatus: "unavailable",
    modelDetected: false,
    opportunityDetected: false,
    opportunityType: "none",
    opportunityStage: "insufficient_data",
    opportunityQuality: "unknown",
    opportunityLaneRecommendation: "no_trade",
    opportunityNextAction: "Activate MT5 read-only market data, then rerun Activate Market.",
    selfImprovementHypothesisQueued: false,
    selfImprovementHypothesisStatus: undefined,
    selfImprovementHypothesisReason: "No hypothesis queued because the active source failed the MT5 read-only preflight.",
    displayTimeframe: primaryTimeframe,
    analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisTimeframesLoaded: [],
    requiredTimeframesLoaded: false,
    analysisDepthStatus: "unavailable",
    multiTimeframeContextStatus: "unavailable",
    analysisTimeframesUsed: [],
    missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
    weeklyBiasStatus: "unavailable",
    weeklyBiasDirection: "unknown",
    weeklyBiasReason: "W1 context unavailable from MT5 range endpoint.",
    paperSimEligibilityStatus: "not_eligible",
    paperSimEligibilityReason: "No compact research signal was built.",
    paperSimAllowed: false,
    paperOnly: false,
    readinessSummary: unavailableReadinessSummary("Active research source failed the MT5 read-only preflight."),
    latestMonteCarloStatus: "missing",
    latestMonteCarloReason: "No saved Monte Carlo - run replay then Monte Carlo.",
    recommendedMaxRiskStatus: "unavailable",
    recommendedMaxRiskReason: "Recommended max risk unavailable - no saved Monte Carlo.",
    nextAction: "Activate MT5 read-only market data, then rerun Activate Market.",
    executionAllowed: false
  },
  debug: {
    candleCount: 0,
    primaryTimeframeAvailable: false,
    htfTimeframesAvailable: [],
    phase1SignalCount: 0,
    phase2SignalCount: 0,
    approvedStatus: "no_trade",
    rejectionReasonsCount: errors.length,
    noTradeReasonsCount: warnings.length,
    lastEvaluationAt: now(),
    packetSource: "unavailable",
    selectedSessionMode: "source_blocked_before_analysis",
    sessionCandlesCount: 0,
    sessionNarrativeStatus: "insufficient_data",
    modelDetectorUsed: "not_run_source_blocked",
    fvgTargetStatus: "not_run_source_blocked",
    targetConstructionStatus: "not_run_source_blocked",
    invalidationConstructionStatus: "not_run_source_blocked",
    rrConstructionStatus: "not_run_source_blocked",
    smtStatus: "not_run_source_blocked",
    riskStatus: "not_run_source_blocked",
    hydrationSource: "unavailable",
    hydrationWarning: errors[0] ?? warnings[0],
    displayTimeframe: primaryTimeframe,
    analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisTimeframesLoaded: [],
    requiredTimeframesLoaded: false,
    analysisTimeframesUsed: [],
    analysisDepthStatus: "unavailable",
    multiTimeframeContextStatus: "unavailable",
    missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
    htfBiasSource: [],
    sessionModelSourceTimeframe: undefined,
    confirmationSourceTimeframe: undefined,
    weeklyBiasStatus: "unavailable",
    weeklyBiasDirection: "unknown",
    weeklyBiasReason: "W1 context unavailable from MT5 range endpoint."
  },
  warnings,
  errors,
  authority,
  safety
});

const operatorWorkflowFor = (currentRead: IctCurrentRead, signal: IctResearchSignal): IctActivateMarketOperatorWorkflow => {
  if (currentRead.modelQualityLane === "paper_watchlist" && currentRead.paperWatchlistEligible && currentRead.modelName === "consolidation_manipulation_distribution") {
    return {
      recommendedAction: "Track CMD Paper Candidate",
      reason: "CMD strict paper-watchlist candidate is eligible for paper-only tracking.",
      heavyActionDeferred: true,
      autoStarted: false,
      executionAllowed: false
    };
  }
  if (currentRead.modelQualityLane === "approved") {
    return {
      recommendedAction: "Create Paper Simulation / Run Replay Review",
      reason: "Approved research signal still needs paper-only simulation and replay review.",
      heavyActionDeferred: true,
      autoStarted: false,
      executionAllowed: false
    };
  }
  if (currentRead.modelName === "accumulation_manipulation_expansion" && currentRead.modelQualityLane === "watchlist") {
    return {
      recommendedAction: "Review Watchlist Reason",
      reason: "AME is watchlist only and not paper-ready.",
      heavyActionDeferred: true,
      autoStarted: false,
      executionAllowed: false
    };
  }
  if (currentRead.modelQualityLane === "rejected" || signal.status === "rejected_signal") {
    return {
      recommendedAction: "Review Blocker",
      reason: currentRead.topReasons[0] ?? signal.rejectionReasons[0] ?? "Current setup is rejected by research gates.",
      heavyActionDeferred: true,
      autoStarted: false,
      executionAllowed: false
    };
  }
  return {
    recommendedAction: "Wait / Check MT5 Depth",
    reason: currentRead.nextAction || "No paper-ready current setup is available.",
    heavyActionDeferred: true,
    autoStarted: false,
    executionAllowed: false
  };
};

const buildLatestSummary = (result: IctActivateMarketResult): IctActivateMarketLatestSummary => ({
  activationTimestamp: result.generatedAt,
  requestedSymbol: result.requestedSymbol,
  brokerSymbol: result.brokerSymbol,
  primaryTimeframe: result.primaryTimeframe,
  displayTimeframe: result.summary.displayTimeframe,
  analysisDepthStatus: result.summary.analysisDepthStatus,
  analysisTimeframesUsed: result.summary.analysisTimeframesUsed,
  missingTimeframes: result.summary.missingTimeframes,
  modelName: result.summary.modelName,
  modelLane: result.summary.modelLane,
  opportunityType: result.summary.opportunityType,
  opportunityStage: result.summary.opportunityStage,
  opportunityQuality: result.summary.opportunityQuality,
  opportunityLaneRecommendation: result.summary.opportunityLaneRecommendation,
  currentOpportunitySummary: result.summary.currentOpportunitySummary,
  recognitionTier: result.summary.recognitionTier,
  scalpStatus: result.summary.scalpStatus,
  pdArrayFocus: result.summary.pdArrayFocus,
  selfImprovementHypothesisQueued: result.summary.selfImprovementHypothesisQueued,
  selfImprovementHypothesisStatus: result.summary.selfImprovementHypothesisStatus,
  selfImprovementHypothesisReason: result.summary.selfImprovementHypothesisReason,
  nextAction: result.operatorWorkflow?.recommendedAction ?? result.summary.nextAction,
  executionAllowed: false,
  researchOnly: true,
  authority,
  safety
});

export const sanitizeActivateMarketResult = (result: IctActivateMarketResult): IctActivateMarketResult => ({
  researchOnly: true,
  status: result.status,
  generatedAt: result.generatedAt,
  requestedSymbol: result.requestedSymbol,
  brokerSymbol: result.brokerSymbol,
  primaryTimeframe: result.primaryTimeframe,
  htfTimeframes: [...result.htfTimeframes],
  steps: result.steps.map((step) => ({ ...step })),
  advisorPacket: result.advisorPacket,
  marketAnalysisContext: result.marketAnalysisContext,
  currentRead: result.currentRead,
  opportunity: result.opportunity,
  selfImprovementHypothesis: result.selfImprovementHypothesis,
  signalContract: result.signalContract,
  operatorWorkflow: result.operatorWorkflow ? { ...result.operatorWorkflow, heavyActionDeferred: true, autoStarted: false, executionAllowed: false } : undefined,
  cmdPaperEligibility: result.cmdPaperEligibility ? { ...result.cmdPaperEligibility } : undefined,
  selfImprovementQueue: result.selfImprovementQueue ? { ...result.selfImprovementQueue } : undefined,
  latestMonteCarlo: result.latestMonteCarlo ? { ...result.latestMonteCarlo, summary: result.latestMonteCarlo.summary ? { ...result.latestMonteCarlo.summary } : undefined } : undefined,
  summary: { ...result.summary, executionAllowed: false },
  debug: result.debug ? { ...result.debug } : undefined,
  warnings: result.warnings.slice(0, 12),
  errors: result.errors.slice(0, 8),
  authority,
  safety
});

export const summarizeActivateMarketResult = (result: IctActivateMarketResult) => {
  const model = result.summary.modelName ?? "no model";
  const opportunity = result.summary.opportunityDetected ? `${result.summary.opportunityType} / ${result.summary.opportunityStage}` : "no opportunity";
  const lane = result.summary.modelLane ?? "no_trade";
  const hypothesis = result.summary.selfImprovementHypothesisQueued
    ? `hypothesis ${result.summary.selfImprovementHypothesisStatus ?? "queued"}`
    : "no hypothesis queued";
  const analysis = result.summary.analysisTimeframesUsed?.length
    ? result.summary.analysisTimeframesUsed.join("/")
    : "no analysis context";
  const action = result.operatorWorkflow?.recommendedAction ?? result.summary.nextAction ?? "Wait / Check MT5 Depth";
  return `${result.status}: ${result.requestedSymbol}/${result.brokerSymbol} chart ${result.summary.displayTimeframe ?? result.primaryTimeframe}; analysis ${analysis}; ${model}; opportunity ${opportunity}; lane ${lane}; ${hypothesis}; next ${action}; execution disabled.`;
};

export async function runIctActivateMarketPipeline(
  config: IctActivateMarketPipelineConfig,
  callbacks?: IctActivateMarketCallbacks,
  dependencies: IctActivateMarketPipelineDependencies = {}
): Promise<IctActivateMarketResult> {
  const snapshot = config.snapshot;
  const requestedSymbol = sourceRequestedSymbol(snapshot);
  const brokerSymbol = sourceBrokerSymbol(snapshot);
  const primaryTimeframe = sourceTimeframe(snapshot);
  const warnings: string[] = [];
  const errors: string[] = [];
  let steps = createActivateMarketInitialSteps();
  let advisorPacket: IctAdvisorPacket | undefined;
  let marketAnalysisContextBundle: IctMarketAnalysisContextBundle | undefined;
  let currentRead: IctCurrentRead | undefined;
  let signalContract: IctResearchSignal | undefined;
  let operatorWorkflow: IctActivateMarketOperatorWorkflow | undefined;
  let cmdPaperEligibility: IctActivateMarketResult["cmdPaperEligibility"];
  let selfImprovementQueue: IctActivateMarketResult["selfImprovementQueue"];
  let latestMonteCarlo = latestMonteCarloFor(config.latestResearchState);

  const buildOrReadMarketContext = async () => {
    if (!marketAnalysisContextBundle) {
      const buildMarketContext =
        dependencies.buildMarketAnalysisContext ??
        ((nextSnapshot: ResearchRuntimeSnapshot) => buildIctMarketAnalysisContextBundle({ snapshot: nextSnapshot }));
      marketAnalysisContextBundle = await buildMarketContext(snapshot);
    }
    return marketAnalysisContextBundle;
  };

  const analysisContextFor = (timeframe: IctAnalysisTimeframe) =>
    marketAnalysisContextBundle?.context.analysisTimeframes.find((context) => context.timeframe === timeframe);

  const run = async (
    id: IctActivateMarketStepId,
    runningMessage: string,
    task: () => Promise<string | { message?: string; warning?: string; skipped?: boolean; error?: string }>
  ) => {
    steps = markActivationStepRunning(steps, id, runningMessage);
    notify(callbacks, id, steps);
    try {
      const output = await task();
      if (typeof output === "string") {
        steps = markActivationStepCompleted(steps, id, output);
      } else if (output.skipped) {
        if (output.warning) warnings.push(output.warning);
        steps = markActivationStepSkipped(steps, id, output.warning ?? output.message);
      } else if (output.error) {
        errors.push(output.error);
        steps = markActivationStepFailed(steps, id, output.error);
      } else {
        if (output.warning) warnings.push(output.warning);
        steps = markActivationStepCompleted(steps, id, output.message ?? output.warning, output.warning);
      }
    } catch (error) {
      const message = errorMessage(error);
      errors.push(message);
      steps = markActivationStepFailed(steps, id, message);
    }
    notify(callbacks, id, steps);
  };

  await run("resolve_symbol", "Resolving requested and broker symbol.", async () =>
    `${requestedSymbol} via ${brokerSymbol}; primary ${primaryTimeframe}.`
  );

  let criticalUnavailable = false;
  await run("check_mt5_readonly", "Checking canonical MT5 read-only research source.", async () => {
    const provider = sourceProvider(snapshot);
    const authorityOk =
      sourceAuthority(snapshot)?.executionAuthority === "none" &&
      sourceAuthority(snapshot)?.brokerAuthority === "none" &&
      sourceAuthority(snapshot)?.readinessOverrideAuthority === "none";
    if (provider !== "mt5_read_only") {
      criticalUnavailable = true;
      return { error: `Active canonical research source is ${provider}; MT5 read-only is required for Activate Market.` };
    }
    if (!authorityOk) {
      criticalUnavailable = true;
      return { error: "Active source authority is not none/none/none." };
    }
    return "MT5 read-only source selected; authority none/none/none.";
  });

  await run("load_display_candles", "Checking chart display source depth.", async () => {
    const count = sourceCandleCount(snapshot);
    if (count <= 0) {
      criticalUnavailable = true;
      return { error: "No primary MT5 candles are available from the active canonical research source." };
    }
    if (count < 400) {
      const warning = `${count.toLocaleString()} primary candles available; below guarded research minimum.`;
      warnings.push(warning);
      return { warning };
    }
    return `${count.toLocaleString()} primary candles available.`;
  });

  if (criticalUnavailable) {
    await run("complete", "Stopping safely.", async () => "Activate Market stopped before research read. Deterministic UI remains available.");
    return sanitizeActivateMarketResult(
      criticalUnavailableResult({
        brokerSymbol,
        errors,
        primaryTimeframe,
        requestedSymbol,
        steps,
        warnings
      })
    );
  }

  await run("load_analysis_m5", "Loading explicit M5 90-day confirmation/refinement context.", async () => {
    const bundle = await buildOrReadMarketContext();
    const context = bundle.context.analysisTimeframes.find((item) => item.timeframe === "M5");
    if (!context?.candleCount) return { error: "M5 analysis context is unavailable from MT5 read-only history." };
    return `M5 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_analysis_m15", "Loading explicit M15 90-day session-model context.", async () => {
    await buildOrReadMarketContext();
    const context = analysisContextFor("M15");
    if (!context?.candleCount) return { error: "M15 session-model context is unavailable from MT5 read-only history." };
    return `M15 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_analysis_h1", "Loading explicit H1 90-day dealing-range context.", async () => {
    await buildOrReadMarketContext();
    const context = analysisContextFor("H1");
    if (!context?.candleCount) return { skipped: true, warning: "H1 analysis context is missing; HTF bias will be partial." };
    return `H1 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_analysis_h4", "Loading explicit H4 90-day HTF bias context.", async () => {
    await buildOrReadMarketContext();
    const context = analysisContextFor("H4");
    if (!context?.candleCount) return { skipped: true, warning: "H4 analysis context is missing; HTF bias will be partial." };
    return `H4 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_analysis_daily", "Loading explicit daily 90-day bias context.", async () => {
    await buildOrReadMarketContext();
    const context = analysisContextFor("D1");
    if (!context?.candleCount) return { skipped: true, warning: "Daily analysis context is missing; daily bias will be partial." };
    return `D1 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_analysis_weekly", "Loading explicit weekly 90-day bias context.", async () => {
    await buildOrReadMarketContext();
    const context = analysisContextFor("W1");
    if (!context?.candleCount) return { skipped: true, warning: "W1 context unavailable from MT5 range endpoint." };
    return `W1 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("load_weekly_bias", "Computing compact weekly bias from W1 context.", async () => {
    const bundle = await buildOrReadMarketContext();
    const { weeklyBiasStatus, weeklyBiasDirection, weeklyBiasReason } = bundle.context;
    if (weeklyBiasStatus === "loaded") {
      return `Weekly bias ${weeklyBiasDirection}; ${weeklyBiasReason}`;
    }
    return { skipped: true, warning: weeklyBiasReason || "W1 context unavailable from MT5 range endpoint." };
  });

  await run("build_multi_timeframe_context", "Building compact multi-timeframe analysis summary.", async () => {
    const bundle = await buildOrReadMarketContext();
    const fingerprint = sourceFingerprint(snapshot);
    if (!fingerprint) return { error: "Canonical MT5 source fingerprint is missing." };
    const missing = bundle.context.missingTimeframes;
    const loaded = bundle.context.analysisTimeframesLoaded.join(", ") || "none";
    if (missing.length) {
      return {
        message: `Multi-timeframe context ${bundle.context.multiTimeframeContextStatus}; loaded ${loaded}. Fingerprint ${fingerprint}.`,
        warning: `Missing analysis timeframes: ${missing.join(", ")}.`
      };
    }
    return `Analysis ${bundle.context.analysisDepthStatus}; ${bundle.context.analysisTimeframesUsed.join(", ")} loaded. Fingerprint ${fingerprint}.`;
  });

  await run("build_current_read", "Building compact ICT current read.", async () => {
    const buildPacket = dependencies.buildAdvisorPacketFromRuntime ?? buildIctAdvisorPacketFromRuntime;
    const buildRead = dependencies.buildCurrentRead ?? buildIctCurrentReadFromPacket;
    const bundle = await buildOrReadMarketContext();
    advisorPacket = await buildPacket(snapshot, { marketAnalysisContextBundle: bundle });
    currentRead = buildRead(advisorPacket, config.latestResearchState);
    const currentOpportunityScan = detectCurrentOpportunities(buildCurrentOpportunityContext({ packet: advisorPacket, currentRead }));
    currentRead = {
      ...currentRead,
      currentOpportunitySummary: currentOpportunityScan.summary,
      currentOpportunities: currentOpportunityScan.opportunities.slice(0, 8)
    };
    advisorPacket.compactSummary.currentOpportunitySummary = currentOpportunityScan.summary;
    saveCurrentOpportunityScan(currentOpportunityScan);
    return currentRead.dataStatus === "ready"
      ? "Current read ready."
      : { message: `Current read built with data status ${currentRead.dataStatus}.`, warning: `Current read data status is ${currentRead.dataStatus}.` };
  });

  await run("detect_session_model", "Detecting current session model.", async () => {
    if (!currentRead?.modelDetected) {
      return { message: "Session model detector ran; no complete model detected.", warning: currentRead?.topReasons[0] ?? "No session model detected." };
    }
    return `${currentRead.modelName ?? "model"} detected; state ${currentRead.modelState ?? "unknown"}.`;
  });

  await run("run_universal_recognition", "Running universal model, PD-array, and scalp fallback recognition.", async () => {
    if (!currentRead) return { error: "Current read is missing." };
    const pdCount = currentRead.universalRecognition?.pdArrays.length ?? 0;
    const message = `Recognition ${currentRead.recognitionTier}; scalp ${currentRead.scalpStatus ?? "n/a"}; PD arrays ${pdCount}.`;
    const warning =
      currentRead.recognitionTier === "insufficient_data"
        ? currentRead.recognitionOpportunitySummary
        : currentRead.recognitionTier === "market_map_only"
          ? "Universal recognition found market-map context only; no model, PD-array setup, or scalp setup confirmed."
          : undefined;
    return warning ? { message, warning } : message;
  });

  await run("detect_market_opportunity", "Detecting structured ICT market opportunity before approval.", async () => {
    if (!currentRead) return { error: "Current read is missing." };
    if (!currentRead.opportunityDetected) {
      return {
        message: "Opportunity detector ran; no structured tradable opportunity was confirmed.",
        warning: currentRead.opportunityNextAction
      };
    }
    const approvalNote = currentRead.modelQualityLane === "approved"
      ? "already in approved research lane"
      : `not approved because ${currentRead.opportunityBlockers[0] ?? currentRead.opportunityMissingEvidence[0] ?? "approval evidence is incomplete"}`;
    return `${currentRead.opportunityType}; stage ${currentRead.opportunityStage}; quality ${currentRead.opportunityQuality}; lane ${currentRead.opportunityLaneRecommendation}; ${approvalNote}.`;
  });

  await run("queue_research_hypothesis", "Queueing research-only hypothesis when opportunity is not tradable.", async () => {
    if (!currentRead) return { error: "Current read is missing." };
    if (!currentRead.selfImprovementHypothesis) {
      selfImprovementQueue = {
        queued: false,
        reason: currentRead.selfImprovementHypothesisReason ?? "No eligible research hypothesis."
      };
      return `No research hypothesis queued: ${selfImprovementQueue.reason}`;
    }
    const queue = dependencies.queueResearchHypothesis ?? queueIctResearchHypothesis;
    const result = queue(currentRead.selfImprovementHypothesis);
    selfImprovementQueue = {
      queued: result.ok,
      reason: result.reason,
      journalEventId: result.journalEvent?.journalEventId,
      status: currentRead.selfImprovementHypothesis.status
    };
    return result.ok
      ? "Research hypothesis queued - needs replay validation."
      : { message: result.reason, warning: result.reason };
  });

  await run("run_phase_one", "Checking ICT Phase 1 signals.", async () => {
    const count = currentRead?.debug.phase1SignalCount ?? 0;
    return count > 0 ? `${count} Phase 1 signals summarized.` : { message: "Phase 1 evaluated.", warning: "No Phase 1 signals summarized." };
  });

  await run("run_phase_two", "Checking ICT Phase 2 signals.", async () => {
    const count = currentRead?.debug.phase2SignalCount ?? 0;
    return count > 0 ? `${count} Phase 2 signals summarized.` : { message: "Phase 2 evaluated.", warning: "No Phase 2 signals summarized." };
  });

  await run("run_smt", "Checking SMT / relative strength.", async () => {
    const smt = currentRead?.smtStatus ?? "";
    if (smt === "comparison_sources_missing") {
      return { message: "SMT check completed with missing comparison context.", warning: currentRead?.smtReason ?? "SMT comparison sources are missing; activation continues with explicit SMT warning." };
    }
    return smt && !/not available|unavailable|missing|pending/i.test(smt)
      ? `SMT status: ${smt}.`
      : { message: "SMT check completed with partial context.", warning: currentRead?.smtReason ?? "SMT comparison data unavailable; activation continues with a partial warning." };
  });

  await run("run_news_session_risk", "Checking news and session risk.", async () => {
    const risk = currentRead?.riskStatus;
    return risk ? `Risk status: ${risk}.` : "News/session risk unavailable; treat as unknown/caution.";
  });

  await run("apply_approved_profile", "Applying approved profile lane.", async () =>
    currentRead
      ? `Profile status ${currentRead.approvedStatus}; lane ${currentRead.modelQualityLane}.`
      : { error: "Current read is missing." }
  );

  await run("build_signal_contract", "Building research signal contract.", async () => {
    if (!currentRead) return { error: "Current read is missing." };
    const buildSignal = dependencies.buildSignalContract ?? buildIctResearchSignalFromCurrentRead;
    signalContract = buildSignal(currentRead, config.latestResearchState);
    return `Signal ${signalContract.status}; execution disabled.`;
  });

  await run("build_operator_workflow", "Building next safe operator action.", async () => {
    if (!currentRead || !signalContract) return { error: "Current read or signal contract missing." };
    operatorWorkflow = operatorWorkflowFor(currentRead, signalContract);
    return `${operatorWorkflow.recommendedAction}; auto-run disabled.`;
  });

  await run("check_cmd_paper_eligibility", "Checking CMD paper eligibility.", async () => {
    if (!signalContract) return { error: "Signal contract missing." };
    const evaluate = dependencies.evaluateCmdPaperEligibility ?? evaluateCmdPaperTrackingEligibility;
    const eligibility = evaluate(signalContract);
    cmdPaperEligibility = {
      eligible: eligibility.eligible,
      reason: eligibility.reasons[0] ?? (eligibility.eligible ? "CMD paper candidate eligible." : "Not eligible - no CMD paper-watchlist candidate.")
    };
    return cmdPaperEligibility.eligible
      ? "CMD paper tracking eligible."
      : { message: `CMD paper eligibility checked: ${cmdPaperEligibility.reason}`, warning: cmdPaperEligibility.reason };
  });

  await run("load_latest_monte_carlo_summary", "Loading latest saved Monte Carlo summary.", async () => {
    latestMonteCarlo = latestMonteCarloFor(config.latestResearchState);
    if (latestMonteCarlo.status === "saved") {
      return `${latestMonteCarlo.reason}; ${latestMonteCarlo.recommendedMaxRiskReason}`;
    }
    return {
      message: latestMonteCarlo.reason,
      warning: "No saved Monte Carlo - run Replay Review, then Monte Carlo."
    };
  });

  const draftResult = (): IctActivateMarketResult => {
    const resultWarnings = [...new Set([...warnings, ...steps.map((step) => step.warning).filter(Boolean) as string[]])];
    const resultErrors = [...new Set([...errors, ...steps.map((step) => step.error).filter(Boolean) as string[]])];
    const failed = resultErrors.length > 0;
    const partial = resultWarnings.length > 0 || steps.some((step) => step.status === "skipped");
    const status: IctActivateMarketStatus = failed ? "failed" : partial ? "partial" : "completed";
    return {
      researchOnly: true,
      status,
      generatedAt: now(),
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      htfTimeframes: currentRead?.htfTimeframes ?? htfTimeframes(snapshot),
      steps,
      advisorPacket,
      marketAnalysisContext: marketAnalysisContextBundle?.context,
      currentRead,
      opportunity: currentRead?.opportunity,
      selfImprovementHypothesis: currentRead?.selfImprovementHypothesis,
      signalContract,
      operatorWorkflow,
      cmdPaperEligibility,
      selfImprovementQueue,
      latestMonteCarlo,
      summary: {
        dataStatus: currentRead?.dataStatus ?? "unavailable",
        modelDetected: currentRead?.modelDetected ?? false,
        modelName: currentRead?.modelName,
        modelState: currentRead?.modelState,
        modelLane: currentRead?.modelQualityLane,
        opportunityDetected: currentRead?.opportunityDetected ?? false,
        opportunityType: currentRead?.opportunityType,
        opportunityStage: currentRead?.opportunityStage,
        opportunityQuality: currentRead?.opportunityQuality,
        opportunityLaneRecommendation: currentRead?.opportunityLaneRecommendation,
        opportunityNextAction: currentRead?.opportunityNextAction,
        currentOpportunitySummary: currentRead?.currentOpportunitySummary,
        recognitionTier: currentRead?.recognitionTier,
        scalpStatus: currentRead?.scalpStatus,
        pdArrayFocus: currentRead?.pdArrayFocus,
        recognitionOpportunitySummary: currentRead?.recognitionOpportunitySummary,
        selfImprovementHypothesisQueued: currentRead?.selfImprovementHypothesisQueued ?? false,
        selfImprovementHypothesisStatus: currentRead?.selfImprovementHypothesisStatus,
        selfImprovementHypothesisReason: selfImprovementQueue?.reason ?? currentRead?.selfImprovementHypothesisReason,
        displayTimeframe: currentRead?.displayTimeframe ?? marketAnalysisContextBundle?.context.displayTimeframe ?? primaryTimeframe,
        analysisTimeframesRequested: currentRead?.analysisTimeframesRequested ?? marketAnalysisContextBundle?.context.analysisTimeframesRequested,
        analysisTimeframesLoaded: currentRead?.analysisTimeframesLoaded ?? marketAnalysisContextBundle?.context.analysisTimeframesLoaded,
        requiredTimeframesLoaded: currentRead?.requiredTimeframesLoaded ?? marketAnalysisContextBundle?.context.requiredTimeframesLoaded,
        analysisDepthStatus: currentRead?.analysisDepthStatus ?? marketAnalysisContextBundle?.context.analysisDepthStatus,
        multiTimeframeContextStatus: currentRead?.multiTimeframeContextStatus ?? marketAnalysisContextBundle?.context.multiTimeframeContextStatus,
        analysisTimeframesUsed: currentRead?.analysisTimeframesUsed ?? marketAnalysisContextBundle?.context.analysisTimeframesUsed,
        missingTimeframes: currentRead?.missingTimeframes ?? marketAnalysisContextBundle?.context.missingTimeframes,
        weeklyBiasStatus: currentRead?.weeklyBiasStatus ?? marketAnalysisContextBundle?.context.weeklyBiasStatus,
        weeklyBiasDirection: currentRead?.weeklyBiasDirection ?? marketAnalysisContextBundle?.context.weeklyBiasDirection,
        weeklyBiasReason: currentRead?.weeklyBiasReason ?? marketAnalysisContextBundle?.context.weeklyBiasReason,
        paperSimEligibilityStatus: currentRead?.paperSimEligibilityStatus,
        paperSimEligibilityReason: currentRead?.paperSimEligibilityReason,
        paperSimAllowed: currentRead?.paperSimAllowed ?? false,
        paperOnly: currentRead?.paperOnly ?? false,
        readinessSummary: currentRead?.readinessSummary ?? unavailableReadinessSummary("Current read was not built."),
        latestMonteCarloStatus: latestMonteCarlo.status,
        latestMonteCarloReason: latestMonteCarlo.reason,
        recommendedMaxRiskPerTradePct: latestMonteCarlo.summary?.recommendedMaxRiskPerTradePct,
        recommendedMaxRiskStatus: typeof latestMonteCarlo.summary?.recommendedMaxRiskPerTradePct === "number" ? "available" : "unavailable",
        recommendedMaxRiskReason: latestMonteCarlo.recommendedMaxRiskReason,
        nextAction: operatorWorkflow?.recommendedAction ?? currentRead?.nextAction,
        executionAllowed: false
      },
      debug: currentRead?.debug,
      warnings: resultWarnings,
      errors: resultErrors,
      authority,
      safety
    };
  };

  await run("save_latest_state", "Saving compact activation summary.", async () => {
    const result = sanitizeActivateMarketResult(draftResult());
    const save = dependencies.saveLatestSummary ?? defaultSaveLatestSummary;
    if (config.saveLatestSummary !== false) {
      save(buildLatestSummary(result));
    }
    return "Compact activation summary saved; raw candles excluded.";
  });

  let result = sanitizeActivateMarketResult(draftResult());
  await run("complete", "Finalizing activation workflow.", async () => summarizeActivateMarketResult(result));
  result = sanitizeActivateMarketResult({ ...draftResult(), steps });
  return result;
}
