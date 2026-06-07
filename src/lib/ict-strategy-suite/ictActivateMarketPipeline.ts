import type { ResearchRuntimeSnapshot } from "../runtime";
import { buildIctAdvisorPacketFromRuntime } from "./ictAdvisorEngine";
import type { IctAdvisorPacket } from "./ictAdvisorTypes";
import { evaluateCmdPaperTrackingEligibility } from "./ictCmdPaperTracking";
import { buildIctCurrentReadFromPacket } from "./ictCurrentRead";
import type { IctCurrentRead } from "./ictCurrentReadTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import { buildIctMarketAnalysisContextBundle } from "./ictMarketAnalysisContext";
import type { IctAnalysisTimeframe, IctMarketAnalysisContextBundle } from "./ictMarketAnalysisContextTypes";
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
  { id: "load_analysis_weekly", label: "Load weekly bias" },
  { id: "build_multi_timeframe_context", label: "Build multi-timeframe context" },
  { id: "build_current_read", label: "Build current read" },
  { id: "detect_session_model", label: "Detect session model" },
  { id: "run_phase_one", label: "Run ICT Phase 1" },
  { id: "run_phase_two", label: "Run ICT Phase 2" },
  { id: "run_smt", label: "Check SMT / relative strength" },
  { id: "run_news_session_risk", label: "Check news/session risk" },
  { id: "apply_approved_profile", label: "Apply approved profile" },
  { id: "build_signal_contract", label: "Build research signal contract" },
  { id: "build_operator_workflow", label: "Build operator workflow" },
  { id: "check_cmd_paper_eligibility", label: "Check CMD paper eligibility" },
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

export const markActivationStepCompleted = (steps: IctActivateMarketStep[], id: IctActivateMarketStepId, message?: string) =>
  updateStep(steps, id, {
    status: "completed",
    message,
    completedAt: now(),
    warning: undefined,
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
    displayTimeframe: primaryTimeframe,
    analysisDepthStatus: "unavailable",
    analysisTimeframesUsed: [],
    missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
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
    analysisTimeframesUsed: [],
    analysisDepthStatus: "unavailable",
    missingTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"],
    htfBiasSource: [],
    sessionModelSourceTimeframe: undefined,
    confirmationSourceTimeframe: undefined
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
  signalContract: result.signalContract,
  operatorWorkflow: result.operatorWorkflow ? { ...result.operatorWorkflow, heavyActionDeferred: true, autoStarted: false, executionAllowed: false } : undefined,
  cmdPaperEligibility: result.cmdPaperEligibility ? { ...result.cmdPaperEligibility } : undefined,
  summary: { ...result.summary, executionAllowed: false },
  debug: result.debug ? { ...result.debug } : undefined,
  warnings: result.warnings.slice(0, 12),
  errors: result.errors.slice(0, 8),
  authority,
  safety
});

export const summarizeActivateMarketResult = (result: IctActivateMarketResult) => {
  const model = result.summary.modelName ?? "no model";
  const lane = result.summary.modelLane ?? "no_trade";
  const analysis = result.summary.analysisTimeframesUsed?.length
    ? result.summary.analysisTimeframesUsed.join("/")
    : "no analysis context";
  const action = result.operatorWorkflow?.recommendedAction ?? result.summary.nextAction ?? "Wait / Check MT5 Depth";
  return `${result.status}: ${result.requestedSymbol}/${result.brokerSymbol} chart ${result.summary.displayTimeframe ?? result.primaryTimeframe}; analysis ${analysis}; ${model}; lane ${lane}; next ${action}; execution disabled.`;
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
        steps = output.warning
          ? markActivationStepSkipped(steps, id, output.warning)
          : markActivationStepCompleted(steps, id, output.message);
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
    if (!context?.candleCount) return { skipped: true, warning: "Weekly analysis context is missing; weekly bias will be partial." };
    return `W1 ${context.dataDepthStatus}; ${context.candleCount.toLocaleString()} candles over ${context.availableLookbackDays.toFixed(1)} days.`;
  });

  await run("build_multi_timeframe_context", "Building compact multi-timeframe analysis summary.", async () => {
    const bundle = await buildOrReadMarketContext();
    const fingerprint = sourceFingerprint(snapshot);
    if (!fingerprint) return { error: "Canonical MT5 source fingerprint is missing." };
    const missing = bundle.context.missingTimeframes;
    if (missing.length) {
      return {
        skipped: true,
        warning: `Multi-timeframe context ${bundle.context.analysisDepthStatus}; missing ${missing.join(", ")}. Fingerprint ${fingerprint}.`
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
    return currentRead.dataStatus === "ready"
      ? "Current read ready."
      : { skipped: true, warning: `Current read data status is ${currentRead.dataStatus}.` };
  });

  await run("detect_session_model", "Detecting current session model.", async () => {
    if (!currentRead?.modelDetected) {
      return { skipped: true, warning: currentRead?.topReasons[0] ?? "No session model detected." };
    }
    return `${currentRead.modelName ?? "model"} detected; state ${currentRead.modelState ?? "unknown"}.`;
  });

  await run("run_phase_one", "Checking ICT Phase 1 signals.", async () => {
    const count = currentRead?.debug.phase1SignalCount ?? 0;
    return count > 0 ? `${count} Phase 1 signals summarized.` : { skipped: true, warning: "No Phase 1 signals summarized." };
  });

  await run("run_phase_two", "Checking ICT Phase 2 signals.", async () => {
    const count = currentRead?.debug.phase2SignalCount ?? 0;
    return count > 0 ? `${count} Phase 2 signals summarized.` : { skipped: true, warning: "No Phase 2 signals summarized." };
  });

  await run("run_smt", "Checking SMT / relative strength.", async () => {
    const smt = currentRead?.smtStatus ?? "";
    if (smt === "comparison_sources_missing") {
      return { skipped: true, warning: currentRead?.smtReason ?? "SMT comparison sources are missing; activation continues with explicit SMT warning." };
    }
    return smt && !/not available|unavailable|missing|pending/i.test(smt)
      ? `SMT status: ${smt}.`
      : { skipped: true, warning: currentRead?.smtReason ?? "SMT comparison data unavailable; activation continues with a partial warning." };
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
      reason: eligibility.reasons[0] ?? (eligibility.eligible ? "CMD paper candidate eligible." : "CMD paper candidate not eligible.")
    };
    return cmdPaperEligibility.eligible ? "CMD paper tracking eligible." : { skipped: true, warning: cmdPaperEligibility.reason };
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
      signalContract,
      operatorWorkflow,
      cmdPaperEligibility,
      summary: {
        dataStatus: currentRead?.dataStatus ?? "unavailable",
        modelDetected: currentRead?.modelDetected ?? false,
        modelName: currentRead?.modelName,
        modelState: currentRead?.modelState,
        modelLane: currentRead?.modelQualityLane,
        displayTimeframe: currentRead?.displayTimeframe ?? marketAnalysisContextBundle?.context.displayTimeframe ?? primaryTimeframe,
        analysisDepthStatus: currentRead?.analysisDepthStatus ?? marketAnalysisContextBundle?.context.analysisDepthStatus,
        analysisTimeframesUsed: currentRead?.analysisTimeframesUsed ?? marketAnalysisContextBundle?.context.analysisTimeframesUsed,
        missingTimeframes: currentRead?.missingTimeframes ?? marketAnalysisContextBundle?.context.missingTimeframes,
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
