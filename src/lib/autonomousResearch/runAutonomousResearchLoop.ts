import {
  diagnoseAutonomySafety,
  saveAutonomySafetyDiagnosis,
  selectScenarioFamilyFromBlockers
} from "@/lib/autonomousResearch/autonomySafetyPolicy";
import {
  autoApplyResearchCalibration,
  evaluateAutoApplyEligibility,
  markProposalAutoApplyBlocked
} from "@/lib/autonomousResearch/autoApplyResearchCalibration";
import { diagnoseAutonomousResearchBlockers, summarizeScenarioEvaluation } from "@/lib/autonomousResearch/evaluateScenarioFamily";
import { saveAutonomousResearchRun } from "@/lib/autonomousResearch/autonomousResearchStorage";
import { selectNextScenarioSet } from "@/lib/autonomousResearch/selectNextScenarioSet";
import type {
  AutonomousLoopIteration,
  AutonomousLoopStage,
  AutonomousPerformanceDiagnostics,
  AutonomousPerformancePhaseTiming,
  AutonomousResearchSourceDiagnostics,
  AutonomousResearchRun,
  AutonomousResearchSettings,
  AutonomousResearchStopReason,
  RunAutonomousResearchLoopOptions
} from "@/lib/autonomousResearch/autonomousResearchTypes";
import { autonomousToSafetyBlockers } from "@/lib/autonomousResearch/autonomousResearchTypes";
import { recordCommunicationMessage } from "@/lib/communications/communicationSpec";
import { createHermesNotificationPayload, createPlannedHermesNotificationState } from "@/lib/integrations/hermesNotificationHooks";
import { createOpenClawMemoryHookPacket, createPlannedOpenClawMemoryHookState } from "@/lib/integrations/openclawMemoryHooks";
import { resolveResearchRuntimeSnapshot, type ResearchRuntimeSnapshot } from "@/lib/runtime";
import type { CalibrationProposal } from "@/lib/selfImprovement";
import { safeArray, safeTopN, uid } from "@/lib/utils";
import { runResearchCycle } from "@/lib/researchCycle";
import { runWalkForwardValidation } from "@/lib/walkForward";

const defaultSettings: AutonomousResearchSettings = {
  maxIterations: 1,
  noImprovementStop: 1,
  safeImportedDataMode: true,
  advancedFullResearchMode: false,
  autoApplyPolicyEnabled: false
};

const now = () => new Date().toISOString();

const stageMeta: Record<AutonomousLoopStage, { label: string; percent: number }> = {
  idle: { label: "Idle", percent: 0 },
  resolving_runtime: { label: "Resolving runtime", percent: 10 },
  thesis_generation: { label: "Thesis generation", percent: 20 },
  backtest: { label: "Backtest / validation", percent: 30 },
  llm_advisory: { label: "LLM advisory", percent: 40 },
  auto_research: { label: "Auto Research", percent: 50 },
  walk_forward: { label: "Walk-forward", percent: 60 },
  self_improvement: { label: "Self-improvement", percent: 70 },
  readiness_maturity: { label: "Readiness / maturity", percent: 80 },
  audit_communications: { label: "Audit / communications", percent: 90 },
  completed: { label: "Completed", percent: 100 },
  paused: { label: "Paused", percent: 100 },
  canceled: { label: "Canceled", percent: 100 },
  failed: { label: "Failed", percent: 100 }
};

const researchStepToProgressStage: Record<string, AutonomousLoopStage> = {
  thesis_generation: "thesis_generation",
  backtest: "backtest",
  llm_advisory: "llm_advisory",
  auto_research: "auto_research",
  validation: "backtest",
  research_quality: "readiness_maturity",
  self_improvement: "self_improvement",
  simulation_verification: "readiness_maturity",
  readiness_gate: "readiness_maturity",
  communications_audit: "audit_communications"
};

const emit = (run: AutonomousResearchRun, onUpdate?: (run: AutonomousResearchRun) => void) => {
  saveAutonomousResearchRun(run);
  onUpdate?.(run);
  return run;
};

const statusFromStopReason = (reason?: AutonomousResearchStopReason): AutonomousResearchRun["status"] =>
  reason === "failed"
    ? "failed"
    : reason === "user_canceled"
      ? "canceled"
      : reason === "active_research_source_ineligible"
        ? "paused"
      : reason === "regime_mismatch_detected" ||
          reason === "evidence_quality_too_low" ||
          reason === "walk_forward_repeatedly_failed" ||
          reason === "llm_advisory_offline"
        ? "paused"
        : "completed";

const RESEARCH_SOURCE_MINIMUM_CANDLES = 400;
const AUTONOMOUS_UI_UPDATE_INTERVAL_MS = 750;
const AUTONOMOUS_CANDIDATE_LIMIT = 2;
const AUTONOMOUS_RESEARCH_TIMEOUT_MS = 18_000;

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });

const durationBetween = (startedAt?: string, completedAt?: string) => {
  if (!startedAt || !completedAt) return undefined;
  const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
};

const sourceDiagnosticsFor = (
  snapshot: ResearchRuntimeSnapshot,
  blocker?: string
): AutonomousResearchSourceDiagnostics => {
  const source = snapshot.marketData.activeResearchSource;
  const mt5 = snapshot.mt5ReadOnly;
  const eligibility = source.provider === "mt5_read_only"
    ? mt5.researchEligibility
    : source.eligibility.researchCycle
      ? "eligible_for_research_cycle"
      : source.eligibility.quickAnalysis
        ? "eligible_for_analysis"
        : "ineligible";
  return {
    provider: source.provider,
    sourceLabel: source.provenance.sourceLabel,
    requestedSymbol: source.symbol,
    brokerSymbol: source.provenance.providerSymbol,
    timeframe: source.timeframe,
    candleCount: source.candleCount,
    firstTimestamp: source.firstTimestamp,
    lastTimestamp: source.lastTimestamp,
    sourceFingerprint: source.fingerprint,
    eligibility,
    eligibilityReasons: source.provider === "mt5_read_only" ? mt5.eligibilityReasons : source.eligibilityReasons,
    fallbackReason: source.provider === "mock" && snapshot.marketData.fallbackToMock
      ? "Runtime prepared source is mock fallback."
      : snapshot.marketData.chartDisplayWarning,
    blocker,
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
};

const validateAutonomousResearchSource = (snapshot: ResearchRuntimeSnapshot): string | undefined => {
  const source = snapshot.marketData.activeResearchSource;
  if (source.provider === "mock") {
    return "active research source is mock/demo data. Select MT5 read-only or another explicit eligible canonical research source first.";
  }
  if (!source.fingerprint) {
    return "active research source is missing a canonical source fingerprint.";
  }
  if (source.candleCount < RESEARCH_SOURCE_MINIMUM_CANDLES) {
    return `active research source has ${source.candleCount.toLocaleString()} candles; ${RESEARCH_SOURCE_MINIMUM_CANDLES.toLocaleString()} are required.`;
  }
  if (!source.eligibility.researchCycle) {
    return `active research source is not research-cycle eligible: ${source.eligibilityReasons.join(" ")}`;
  }
  if (
    source.authority.executionAuthority !== "none" ||
    source.authority.brokerAuthority !== "none" ||
    source.authority.readinessOverrideAuthority !== "none"
  ) {
    return "active research source authority is invalid. Execution, broker, and readiness override authority must all be none.";
  }
  if (source.provider === "mt5_read_only") {
    if (!snapshot.marketData.researchUsesMt5ReadOnly || !snapshot.mt5ReadOnly.activeForResearch) {
      return "MT5 read-only is loaded but not selected as the active research source. Click Use MT5 for Research first.";
    }
    if (snapshot.mt5ReadOnly.researchEligibility !== "eligible_for_research_cycle") {
      return `MT5 read-only is not eligible for autonomous research: ${snapshot.mt5ReadOnly.eligibilityReasons.join(" ")}`;
    }
  }
  return undefined;
};

const latestProposalFromCycle = (run: Awaited<ReturnType<typeof runResearchCycle>>): CalibrationProposal | undefined =>
  run.latestGeneratedProposal ?? run.autoResearchCycle?.createdProposal;

const goTraderHandoffGateFor = (snapshot: Awaited<ReturnType<typeof resolveResearchRuntimeSnapshot>>) => {
  const reasons = [
    snapshot.readiness.readinessState !== "Paper-Demo Candidate" ? "Readiness is not Paper-Demo Candidate." : undefined,
    snapshot.maturity.maturityScore < 70 ? "Research maturity is not high enough." : undefined,
    snapshot.evidence.evidenceQualityScore < 70 ? "Evidence quality is below review threshold." : undefined,
    !["robust_research", "paper_demo_review_candidate"].includes(snapshot.walkForward.verdict ?? "")
      ? "Walk-forward has not passed robust review."
      : undefined,
    snapshot.readiness.actualBlockers.some((blocker) => blocker.toLowerCase().includes("runbook"))
      ? "Simulation runbook is not fully verified."
      : undefined
  ].filter((reason): reason is string => Boolean(reason));
  return {
    eligibleForReview: reasons.length === 0,
    reasons: reasons.length ? reasons : ["Ready for go-trader review only; broker execution still remains disabled."],
    brokerExecutionDisabled: true as const
  };
};

const shouldStopAfterIteration = ({
  iteration,
  noImprovementCount,
  run,
  settings,
  snapshot
}: {
  iteration: AutonomousLoopIteration;
  noImprovementCount: number;
  run: AutonomousResearchRun;
  settings: AutonomousResearchSettings;
  snapshot: Awaited<ReturnType<typeof resolveResearchRuntimeSnapshot>>;
}): { stop: boolean; reason?: AutonomousResearchStopReason; detail?: string } => {
  if (iteration.safetyDiagnosis?.regimeMismatchPaused) {
    return {
      stop: true,
      reason: "regime_mismatch_detected",
      detail: "Regime mismatch or insufficient regime evidence paused the autonomous loop."
    };
  }
  if (iteration.llmAdvisoryUnavailable) {
    return {
      stop: true,
      reason: "llm_advisory_offline",
      detail: "LLM advisory offline - deterministic cycle completed; autonomous loop paused to avoid repeated bridge retries."
    };
  }
  if (snapshot.evidence.evidenceQualityScore < 45) {
    return {
      stop: true,
      reason: "evidence_quality_too_low",
      detail: "Evidence quality is too low for autonomous calibration."
    };
  }
  if (snapshot.walkForward.verdict === "fail" && safeArray(run.iterations).filter((item) => item.walkForwardVerdict === "fail").length >= 2) {
    return {
      stop: true,
      reason: "walk_forward_repeatedly_failed",
      detail: "Walk-forward failed repeatedly; human review and targeted follow-up are required."
    };
  }
  if (snapshot.readiness.readinessState === "Paper-Demo Candidate") {
    return {
      stop: true,
      reason: "paper_demo_candidate_review_reached",
      detail: "Paper-Demo Candidate review was reached. The autonomous loop stops before approval or handoff."
    };
  }
  if (snapshot.readiness.readinessState === "Research Ready" && snapshot.maturity.maturitySummary.trendAvailability.basicTrendAvailable) {
    return {
      stop: true,
      reason: "research_ready_stable",
      detail: "Research Ready state has enough basic trend history for review."
    };
  }
  if (noImprovementCount >= settings.noImprovementStop) {
    return {
      stop: true,
      reason: "no_improvement_limit_reached",
      detail: `${noImprovementCount} iteration(s) produced no auto-applied improvement.`
    };
  }
  return {
    stop: false
  };
};

export async function runAutonomousResearchLoop({
  state,
  settings: partialSettings = {},
  signal,
  onUpdate
}: RunAutonomousResearchLoopOptions): Promise<AutonomousResearchRun> {
  const requestedMaxIterations = Math.max(1, Math.min(8, partialSettings.maxIterations ?? defaultSettings.maxIterations));
  const settings: AutonomousResearchSettings = {
    ...defaultSettings,
    ...partialSettings,
    maxIterations: partialSettings.advancedFullResearchMode ? requestedMaxIterations : 1,
    noImprovementStop: Math.max(1, Math.min(5, partialSettings.noImprovementStop ?? defaultSettings.noImprovementStop))
  };
  const runId = uid("autonomous_research");
  let noImprovementCount = 0;
  const startedAt = now();
  const startedAtMs = Date.now();
  const skippedHeavyDiagnostics = settings.advancedFullResearchMode
    ? []
    : [
        "Full AI Research Cycle deferred in autonomous stability mode.",
        "Auto Research candidate search deferred.",
        "Adaptive Auto Research follow-up passes deferred.",
        "Full walk-forward validation deferred unless Advanced full research mode is enabled.",
        "Deep audit traces skipped for autonomous stability mode."
      ];
  let yieldedStepsCount = 0;
  let throttledUpdateCount = 0;
  let storageWriteCount = 0;
  let lastEmitAt = 0;
  let currentPhase = "initializing";
  let cancellationStatus: AutonomousPerformanceDiagnostics["cancellationStatus"] = "running";
  const phaseTimings: AutonomousPerformancePhaseTiming[] = [];
  let run: AutonomousResearchRun = {
    runId,
    startedAt,
    status: "running",
    settings,
    currentIteration: 0,
    progress: {
      status: "running",
      activeStage: "resolving_runtime",
      activeStageLabel: stageMeta.resolving_runtime.label,
      currentIteration: 0,
      maxIterations: settings.maxIterations,
      progressPercent: stageMeta.resolving_runtime.percent,
      startedAt,
      updatedAt: startedAt,
      currentTask: "Starting autonomous research loop...",
      events: [
        {
          eventId: uid("autonomy_event"),
          timestamp: startedAt,
          stage: "resolving_runtime",
          title: "Loop started",
          detail: "Starting autonomous research loop..."
        }
      ]
    },
    iterations: [],
    readinessTrend: "unknown",
    maturityTrend: "unknown",
    goTraderHandoffGate: {
      eligibleForReview: false,
      reasons: ["Loop has not completed a runtime snapshot yet."],
      brokerExecutionDisabled: true
    },
    calibrationDriftHistory: [],
    openClawHooks: createPlannedOpenClawMemoryHookState(),
    hermesNotifications: {
      ...createPlannedHermesNotificationState(),
      latestPayload: createHermesNotificationPayload({
        eventType: "autonomous_loop_started",
        title: "Autonomous research loop started",
        summary: `Loop ${runId} started in ${settings.autoApplyPolicyEnabled ? "policy-enabled" : "proposal-only"} mode.`,
        routeToOpen: "/autonomous-research"
      })
    },
    safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness.",
    performanceDiagnostics: {
      lastLoopDurationMs: 0,
      currentPhase,
      cancellationStatus,
      yieldedStepsCount,
      skippedHeavyDiagnostics,
      phaseTimings: [],
      throttledUpdateCount,
      storageWriteCount
    }
  };

  const updatePerformanceDiagnostics = (lastBlocker?: string) => {
    const slowestPhase = phaseTimings.reduce<AutonomousPerformancePhaseTiming | undefined>(
      (slowest, timing) => (!slowest || timing.durationMs > slowest.durationMs ? timing : slowest),
      undefined
    );
    run = {
      ...run,
      performanceDiagnostics: {
        lastLoopDurationMs: Math.max(0, Date.now() - startedAtMs),
        slowestPhase,
        currentPhase,
        cancellationStatus,
        yieldedStepsCount,
        skippedHeavyDiagnostics,
        lastBlocker: lastBlocker ?? run.latestBlocker,
        sourceProvider: run.sourceDiagnostics?.provider,
        sourceFingerprint: run.sourceDiagnostics?.sourceFingerprint,
        phaseTimings: safeTopN([...phaseTimings].reverse(), 16),
        throttledUpdateCount,
        storageWriteCount
      }
    };
  };

  const recordTiming = (phase: string, startedMs: number, detail?: string, skipped = false) => {
    const completedMs = Date.now();
    phaseTimings.push({
      phase,
      durationMs: Math.max(0, completedMs - startedMs),
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date(completedMs).toISOString(),
      detail,
      skipped
    });
    updatePerformanceDiagnostics();
  };

  const addCycleStepTimings = (cycle: Awaited<ReturnType<typeof runResearchCycle>>) => {
    safeArray(cycle.steps).forEach((step) => {
      const durationMs = durationBetween(step.startedAt, step.completedAt);
      if (durationMs === undefined) return;
      phaseTimings.push({
        phase: `research_cycle.${step.stepId}`,
        durationMs,
        startedAt: step.startedAt ?? now(),
        completedAt: step.completedAt ?? now(),
        detail: step.summary
      });
    });
    updatePerformanceDiagnostics();
  };

  const cooperativeYield = async (phase: string) => {
    currentPhase = phase;
    yieldedStepsCount += 1;
    updatePerformanceDiagnostics();
    await yieldToBrowser();
    if (signal?.aborted) {
      cancellationStatus = "canceled";
      throw new Error("Autonomous research loop canceled by user.");
    }
  };

  const publishRun = (force = false) => {
    updatePerformanceDiagnostics();
    const shouldPublish = force || run.status !== "running" || Date.now() - lastEmitAt >= AUTONOMOUS_UI_UPDATE_INTERVAL_MS;
    if (!shouldPublish) {
      throttledUpdateCount += 1;
      updatePerformanceDiagnostics();
      return run;
    }
    storageWriteCount += 1;
    lastEmitAt = Date.now();
    return emit(run, onUpdate);
  };

  const updateProgress = ({
    detail,
    stage,
    status = run.status,
    title
  }: {
    detail: string;
    stage: AutonomousLoopStage;
    status?: AutonomousResearchRun["status"];
    title: string;
  }) => {
    const previous = run.progress;
    const timestamp = now();
    const stageChanged = previous.activeStage !== stage;
    const previousStageCanComplete = !["idle", "completed", "paused", "canceled", "failed"].includes(previous.activeStage);
    run = {
      ...run,
      status,
      progress: {
        ...previous,
        status,
        activeStage: stage,
        activeStageLabel: stageMeta[stage].label,
        currentIteration: run.currentIteration,
        maxIterations: settings.maxIterations,
        progressPercent: stageMeta[stage].percent,
        updatedAt: timestamp,
        currentTask: detail,
        lastCompletedStage: stageChanged && previousStageCanComplete ? previous.activeStage : previous.lastCompletedStage,
        lastCompletedStageLabel:
          stageChanged && previousStageCanComplete ? previous.activeStageLabel : previous.lastCompletedStageLabel,
        stopReason: run.stopReason,
        stopReasonDetail: run.stopReasonDetail,
        events: stageChanged
          ? safeTopN([
              {
                eventId: uid("autonomy_event"),
                timestamp,
                stage,
                title,
                detail
              },
              ...safeArray(previous.events)
            ], 12)
          : safeArray(previous.events)
      }
    };
  };

  recordCommunicationMessage({
    source: "openclaw_research_supervisor",
    agentName: "Autonomous Research Supervisor",
    category: "openclaw_supervisor_message",
    severity: "info",
    title: "Autonomous research loop started",
    summary: `Loop ${runId} started in ${settings.autoApplyPolicyEnabled ? "policy-enabled" : "proposal-only"} mode.`,
    body: "The loop can run research scenarios and may only auto-apply safe research calibration when policy allows it. Broker/demo/live execution remains disabled.",
    actionRequired: false,
    resolved: true
  });

  publishRun(true);

  try {
    for (let iterationNumber = 1; iterationNumber <= settings.maxIterations; iterationNumber += 1) {
      if (signal?.aborted) {
        throw new Error("Autonomous research loop canceled by user.");
      }

      run = {
        ...run,
        currentIteration: iterationNumber
      };
      updateProgress({
        stage: "resolving_runtime",
        title: "Resolving runtime",
        detail: `Resolving runtime snapshot for iteration ${iterationNumber}/${settings.maxIterations}.`
      });
      publishRun();

      const runtimeStartedMs = Date.now();
      await cooperativeYield("runtime_snapshot");
      const snapshotBefore = await resolveResearchRuntimeSnapshot();
      recordTiming("runtime_snapshot", runtimeStartedMs, `Snapshot ${snapshotBefore.snapshotId}.`);
      const sourceGuardStartedMs = Date.now();
      const sourceBlocker = validateAutonomousResearchSource(snapshotBefore);
      const sourceDiagnostics = sourceDiagnosticsFor(snapshotBefore, sourceBlocker);
      run = {
        ...run,
        sourceDiagnostics
      };
      recordTiming(
        "source_guard",
        sourceGuardStartedMs,
        sourceBlocker
          ? `Blocked: ${sourceBlocker}`
          : `${sourceDiagnostics.provider}; ${sourceDiagnostics.candleCount.toLocaleString()} candles; fingerprint ${sourceDiagnostics.sourceFingerprint ?? "n/a"}.`
      );
      if (sourceBlocker) {
        const detail = `Autonomous Research blocked: active research source is not eligible. ${sourceBlocker}`;
        const iteration: AutonomousLoopIteration = {
          iteration: iterationNumber,
          startedAt: now(),
          completedAt: now(),
          blockerDiagnosis: [],
          status: "failed",
          sourceDiagnostics,
          notes: [
            detail,
            `Source provider ${sourceDiagnostics.provider}; requested ${sourceDiagnostics.requestedSymbol ?? "n/a"}; broker ${sourceDiagnostics.brokerSymbol ?? "n/a"}; ${sourceDiagnostics.candleCount.toLocaleString()} candles.`,
            "No mock fallback, broker execution, readiness override, or go-trader handoff was used."
          ]
        };
        run = {
          ...run,
          status: "paused",
          completedAt: now(),
          stopReason: "active_research_source_ineligible",
          stopReasonDetail: detail,
          iterations: [...run.iterations.filter((item) => item.iteration !== iterationNumber), iteration],
          progress: {
            ...run.progress,
            stopReason: "active_research_source_ineligible",
            stopReasonDetail: detail
          }
        };
        updateProgress({
          stage: "paused",
          status: "paused",
          title: "Source guard blocked",
          detail
        });
        recordCommunicationMessage({
          source: "openclaw_research_supervisor",
          agentName: "Autonomous Research Supervisor",
          category: "openclaw_supervisor_message",
          severity: "warning",
          title: "Autonomous Research source guard blocked",
          summary: detail,
          body: [
            `Provider: ${sourceDiagnostics.provider}.`,
            `Requested symbol: ${sourceDiagnostics.requestedSymbol ?? "n/a"}.`,
            `Broker symbol: ${sourceDiagnostics.brokerSymbol ?? "n/a"}.`,
            `Candles: ${sourceDiagnostics.candleCount.toLocaleString()}.`,
            "Mock fallback was refused; execution authority remained none."
          ].join(" "),
          actionRequired: true,
          requestedAction: "acknowledge_readiness_blocker",
          resolved: false
        });
        cancellationStatus = "stopped";
        publishRun(true);
        return run;
      }
      const scenarioStartedMs = Date.now();
      const blockerSummary = summarizeScenarioEvaluation(snapshotBefore);
      const scenario = selectNextScenarioSet(blockerSummary.blockers, {
        safeImportedDataMode: settings.safeImportedDataMode && snapshotBefore.marketData.isImportedDataActive
      });
      const safetyBlockers = blockerSummary.blockers.map((blocker) => autonomousToSafetyBlockers[blocker]);
      const scenarioReasoning = selectScenarioFamilyFromBlockers(safetyBlockers, {
        evidenceUsed: [
          `runtime snapshot ${snapshotBefore.snapshotId}`,
          `latest cycle ${snapshotBefore.latestResearchCycle.latestCycleId ?? "none"}`,
          `evidence ${snapshotBefore.evidence.evidenceQualityScore}/100`,
          `maturity ${snapshotBefore.maturity.maturityScore}/100`
        ],
        consecutiveCount: Math.max(1, noImprovementCount + 1)
      });
      const safetyDiagnosis = diagnoseAutonomySafety(snapshotBefore, {
        failedGates: safetyBlockers,
        scenarioSelectionReasoning: scenarioReasoning
      });
      saveAutonomySafetyDiagnosis(safetyDiagnosis);
      recordTiming("scenario_selection", scenarioStartedMs, scenario.reason);
      run = {
        ...run,
        openClawHooks: {
          ...run.openClawHooks,
          packets: {
            ...run.openClawHooks.packets,
            failure_analysis_memory: createOpenClawMemoryHookPacket({
              eventType: "failure_analysis_memory",
              snapshot: snapshotBefore,
              blockers: blockerSummary.blockers,
              scenarioFamily: scenario.scenarioFamily
            }),
            scenario_recommendation: createOpenClawMemoryHookPacket({
              eventType: "scenario_recommendation",
              snapshot: snapshotBefore,
              blockers: blockerSummary.blockers,
              scenarioFamily: scenario.scenarioFamily
            })
          }
        }
      };

      let iteration: AutonomousLoopIteration = {
        iteration: iterationNumber,
        startedAt: now(),
        blockerDiagnosis: blockerSummary.blockers,
        safetyDiagnosis,
        sourceDiagnostics,
        selectedScenarioFamily: scenario.scenarioFamily,
        scenarioReason: scenario.reason,
        status: "running",
        notes: [
          blockerSummary.summary,
          scenario.reason,
          `Autonomous source ${sourceDiagnostics.provider}: ${sourceDiagnostics.candleCount.toLocaleString()} candles; fingerprint ${sourceDiagnostics.sourceFingerprint ?? "n/a"}.`
        ]
      };

      run = {
        ...run,
        currentIteration: iterationNumber,
        latestBlocker: blockerSummary.topBlocker,
        latestScenarioFamily: scenario.scenarioFamily,
        latestScenarioReason: scenario.reason,
        iterations: [...run.iterations.filter((item) => item.iteration !== iterationNumber), iteration],
        readinessTrend: snapshotBefore.readiness.readinessState,
        maturityTrend: snapshotBefore.maturity.maturitySummary.trendAvailability.message,
        goTraderHandoffGate: goTraderHandoffGateFor(snapshotBefore)
      };
      updateProgress({
        stage: "thesis_generation",
        title: "Research cycle started",
        detail: `Iteration ${iterationNumber}/${settings.maxIterations}: ${scenario.reason}`
      });
      publishRun();

      recordCommunicationMessage({
        source: "openclaw_research_supervisor",
        agentName: "Autonomous Research Supervisor",
        category: "openclaw_supervisor_message",
        severity: "info",
        title: "Scenario family selected",
        summary: scenario.reason,
        body: `${scenario.reason} ${scenarioReasoning.reasoningSummary} No execution authority was granted.`,
        actionRequired: false,
        resolved: true
      });

      if (!settings.advancedFullResearchMode) {
        const deferredStartedMs = Date.now();
        recordTiming(
          "research_cycle",
          deferredStartedMs,
          "Deferred in autonomous stability mode; use manual AI Research or enable Advanced full research mode for the full synchronous cycle.",
          true
        );
        iteration = {
          ...iteration,
          completedAt: now(),
          status: "warning",
          readinessState: snapshotBefore.readiness.readinessState,
          maturityScore: snapshotBefore.maturity.maturityScore,
          notes: [
            ...iteration.notes,
            "Autonomous stability preflight completed with the canonical MT5 source.",
            "Full deterministic AI Research Cycle, candidate search, LLM advisory, and walk-forward were deferred to keep the page responsive.",
            "No mock fallback, auto-apply, broker execution, readiness override, or go-trader handoff was used."
          ]
        };
        run = {
          ...run,
          status: "completed_with_warnings",
          completedAt: now(),
          stopReason: "completed",
          stopReasonDetail: "Autonomous stability preflight completed. Run manual AI Research, or enable Advanced full research mode for the full synchronous cycle.",
          iterations: [...run.iterations.filter((item) => item.iteration !== iterationNumber), iteration],
          latestBlocker: blockerSummary.topBlocker,
          readinessTrend: snapshotBefore.readiness.readinessState,
          maturityTrend: snapshotBefore.maturity.maturitySummary.trendAvailability.message,
          goTraderHandoffGate: goTraderHandoffGateFor(snapshotBefore)
        };
        updateProgress({
          stage: "completed",
          status: "completed_with_warnings",
          title: "Autonomous preflight completed",
          detail: "Canonical source guard passed; heavy research cycle deferred for page responsiveness."
        });
        cancellationStatus = "stopped";
        publishRun(true);
        return run;
      }

      await cooperativeYield("research_cycle");
      const researchCycleStartedMs = Date.now();
      const autonomousMaxCandidateCount = settings.advancedFullResearchMode
        ? scenario.maxCandidateCount
        : Math.min(AUTONOMOUS_CANDIDATE_LIMIT, scenario.maxCandidateCount);
      const cycle = await runResearchCycle({
        state,
        searchMode: scenario.searchMode,
        maxCandidateCount: autonomousMaxCandidateCount,
        maxAdaptivePasses: settings.advancedFullResearchMode ? undefined : 0,
        autoResearchTimeoutMs: settings.advancedFullResearchMode ? undefined : AUTONOMOUS_RESEARCH_TIMEOUT_MS,
        autoResearchCheckpointPersistence: "memory_only",
        advancedFullResearchMode: settings.advancedFullResearchMode,
        skipHeavyAudit: settings.safeImportedDataMode,
        skipLlmAdvisory: !settings.advancedFullResearchMode,
        skipAutoResearch: !settings.advancedFullResearchMode,
        sourceGuard: {
          requireEligibleResearchSource: true,
          allowedSourceModes: ["mt5_read_only", "imported", "tradingview_mcp_chart"],
          minimumCandleCount: RESEARCH_SOURCE_MINIMUM_CANDLES,
          messagePrefix: "Autonomous Research blocked"
        },
        signal,
        onUpdate: (cycleRun) => {
          const runningStep = safeArray(cycleRun.steps).find((step) => step.status === "running");
          const latestCompletedStep = [...safeArray(cycleRun.steps)].reverse().find((step) =>
            ["passed", "completed", "warning", "failed", "skipped"].includes(step.status)
          );
          const stage = researchStepToProgressStage[runningStep?.stepId ?? latestCompletedStep?.stepId ?? "thesis_generation"];
          updateProgress({
            stage,
            title: runningStep?.label ?? latestCompletedStep?.label ?? "Research cycle running",
            detail: runningStep?.summary ?? latestCompletedStep?.summary ?? "Research cycle running."
          });
          publishRun();
        }
      });
      recordTiming(
        "research_cycle_total",
        researchCycleStartedMs,
        `Status ${cycle.status}; data ${cycle.dataSourceMode}; candidates ${cycle.autoResearchCycle?.candidatesTested ?? 0}.`
      );
      addCycleStepTimings(cycle);
      if (cycle.status === "failed" && /active research source|source guard/i.test(cycle.failedStepDetails ?? cycle.resultSummary)) {
        const detail = cycle.failedStepDetails ?? cycle.resultSummary;
        iteration = {
          ...iteration,
          cycleId: cycle.cycleId,
          completedAt: now(),
          status: "failed",
          notes: [...iteration.notes, detail]
        };
        run = {
          ...run,
          status: "paused",
          completedAt: now(),
          stopReason: "active_research_source_ineligible",
          stopReasonDetail: detail,
          iterations: [...run.iterations.filter((item) => item.iteration !== iterationNumber), iteration]
        };
        updateProgress({
          stage: "paused",
          status: "paused",
          title: "Source guard blocked",
          detail
        });
        cancellationStatus = "stopped";
        publishRun(true);
        return run;
      }
      const proposal = latestProposalFromCycle(cycle);
      const bestCandidateLabel =
        cycle.bestCandidateSummary?.label ??
        cycle.autoResearchCycle?.bestCandidate?.label ??
        cycle.autoResearchCycle?.closestCandidates[0]?.label;

      iteration = {
        ...iteration,
        cycleId: cycle.cycleId,
        llmAdvisoryUnavailable: cycle.llmAdvisoryUnavailable,
        llmAdvisoryUnavailableReason: cycle.llmAdvisoryUnavailableReason,
        autoResearchCycleId: cycle.autoResearchCycle?.cycleId,
        bestCandidateLabel,
        proposalId: proposal?.proposalId,
        latestCandidateResult: bestCandidateLabel,
        notes: [
          ...iteration.notes,
          cycle.resultSummary,
          cycle.llmAdvisoryUnavailable
            ? "LLM advisory bridge offline. Deterministic research completed; advisory unavailable."
            : undefined,
          proposal ? `Proposal ${proposal.proposalId} available for policy review.` : "No proposal was created."
        ].filter((note): note is string => Boolean(note))
      } as AutonomousLoopIteration;

      let walkForwardRun;
      if (proposal && settings.advancedFullResearchMode) {
        updateProgress({
          stage: "walk_forward",
          title: "Walk-forward validation",
          detail: `Validating proposal ${proposal.proposalId} across walk-forward windows.`
        });
        publishRun();
        await cooperativeYield("walk_forward");
        const walkForwardStartedMs = Date.now();
        walkForwardRun = await runWalkForwardValidation({
          mode: settings.safeImportedDataMode ? "safe" : "standard",
          proposalId: proposal.proposalId,
          maxWindows: settings.safeImportedDataMode ? 3 : 5,
          signal
        });
        recordTiming(
          "walk_forward",
          walkForwardStartedMs,
          `Verdict ${walkForwardRun.stability?.verdict ?? "unknown"}; windows ${walkForwardRun.stability?.windowCount ?? 0}.`
        );
      } else if (proposal) {
        recordTiming(
          "walk_forward",
          Date.now(),
          "Deferred in autonomous stability mode; enable Advanced full research mode to run full walk-forward inside the loop.",
          true
        );
      }

      updateProgress({
        stage: "self_improvement",
        title: "Evaluating self-improvement",
        detail: proposal
          ? `Evaluating auto-apply eligibility for proposal ${proposal.proposalId}.`
          : "No proposal created; recording policy decision."
      });
      publishRun();

      await cooperativeYield("self_improvement");
      const selfImprovementStartedMs = Date.now();
      const snapshotAfter = await resolveResearchRuntimeSnapshot();
      const postSafetyDiagnosis = diagnoseAutonomySafety(snapshotAfter, cycle.autoResearchCycle);
      saveAutonomySafetyDiagnosis(postSafetyDiagnosis);
      const previousDrift = run.calibrationDriftHistory[0];
      const eligibility = evaluateAutoApplyEligibility({
        autoApplyPolicyEnabled: settings.autoApplyPolicyEnabled,
        previousAppliedPatch: previousDrift?.appliedConfigPatch,
        proposal,
        snapshot: snapshotAfter,
        safetyDiagnosis: postSafetyDiagnosis,
        walkForwardRun
      });
      let driftEntry;
      let finalEligibility = eligibility;
      if (eligibility.eligible && proposal) {
        const applied = autoApplyResearchCalibration({
          eligibility,
          proposal,
          runId,
          snapshot: snapshotAfter
        });
        driftEntry = applied.driftEntry;
        finalEligibility = applied.eligibility;
      } else {
        markProposalAutoApplyBlocked(proposal, eligibility);
      }
      recordTiming(
        "self_improvement_policy",
        selfImprovementStartedMs,
        finalEligibility.applied
          ? `Applied ${finalEligibility.proposalId ?? "research calibration"}.`
          : `Blocked: ${finalEligibility.reasons[0] ?? "policy did not allow it"}.`
      );

      noImprovementCount = finalEligibility.applied ? 0 : noImprovementCount + 1;
      const latestNotification = createHermesNotificationPayload({
        eventType: finalEligibility.applied ? "calibration_auto_applied" : "auto_apply_blocked",
        title: finalEligibility.applied ? "Research calibration auto-applied" : "Auto-apply blocked",
        summary: finalEligibility.applied
          ? `Research-only calibration ${finalEligibility.proposalId} was auto-applied.`
          : finalEligibility.reasons[0] ?? "Auto-apply blocked by policy.",
        routeToOpen: finalEligibility.proposalId ? `/self-improvement?proposalId=${finalEligibility.proposalId}` : "/autonomous-research",
        severity: finalEligibility.applied ? "info" : "warning"
      });
      run = {
        ...run,
        openClawHooks: {
          ...run.openClawHooks,
          packets: {
            ...run.openClawHooks.packets,
            ...(proposal
              ? {
                  proposal_review: createOpenClawMemoryHookPacket({
                    eventType: "proposal_review",
                    snapshot: snapshotAfter,
                    scenarioFamily: scenario.scenarioFamily,
                    proposalSummary: {
                      proposalId: proposal.proposalId,
                      status: proposal.status,
                      category: proposal.proposalIntent,
                      sourceCycleId: proposal.metricsSnapshot?.sourceCycleId,
                      approvalRequired: proposal.approvalRequired
                    }
                  })
                }
              : {}),
            ...(driftEntry
              ? {
                  calibration_drift_note: createOpenClawMemoryHookPacket({
                    eventType: "calibration_drift_note",
                    snapshot: snapshotAfter,
                    scenarioFamily: scenario.scenarioFamily,
                    proposalSummary: {
                      proposalId: driftEntry.proposalId,
                      status: "auto_applied",
                      approvalRequired: false
                    }
                  })
                }
              : {}),
            post_cycle_summary: createOpenClawMemoryHookPacket({
              eventType: "post_cycle_summary",
              snapshot: snapshotAfter,
              scenarioFamily: scenario.scenarioFamily,
              candidateSummary: cycle.bestCandidateSummary,
              walkForwardSummary: walkForwardRun
                ? {
                    runId: walkForwardRun.runId,
                    verdict: walkForwardRun.stability?.verdict,
                    overfitRisk: walkForwardRun.stability?.overfitRisk,
                    windowsTested: walkForwardRun.stability?.windowCount,
                    outOfSampleWindowsPassed: walkForwardRun.stability?.outOfSampleWindowsPassed,
                    stabilityScore: walkForwardRun.stability?.stabilityScore
                  }
                : undefined
            })
          }
        },
        hermesNotifications: {
          ...run.hermesNotifications,
          latestPayload: latestNotification
        }
      };

      updateProgress({
        stage: "readiness_maturity",
        title: "Updating readiness and maturity",
        detail: `Readiness ${snapshotAfter.readiness.readinessState}; maturity ${snapshotAfter.maturity.maturityScore}/100.`
      });
      publishRun();

      iteration = {
        ...iteration,
        completedAt: now(),
        safetyDiagnosis: postSafetyDiagnosis,
        walkForwardRunId: walkForwardRun?.runId,
        walkForwardVerdict: walkForwardRun?.stability?.verdict,
        autoApplyEligibility: finalEligibility,
        autoAppliedCalibrationId: driftEntry?.proposalId,
        readinessState: snapshotAfter.readiness.readinessState,
        maturityScore: snapshotAfter.maturity.maturityScore,
        status: finalEligibility.applied ? "completed" : "warning",
        notes: [
          ...iteration.notes,
          walkForwardRun ? `Walk-forward verdict: ${walkForwardRun.stability?.verdict ?? "not evaluated"}.` : "Walk-forward was skipped because no proposal was created.",
          finalEligibility.applied
            ? `Auto-applied research-only calibration ${finalEligibility.proposalId}.`
            : `Auto-apply blocked: ${finalEligibility.reasons[0] ?? "policy did not allow it"}.`
        ]
      };

      run = {
        ...run,
        iterations: [...run.iterations.filter((item) => item.iteration !== iterationNumber), iteration],
        latestCandidateResult: bestCandidateLabel,
        latestAutoApplyEligibility: finalEligibility,
        latestAutoAppliedCalibrationId: driftEntry?.proposalId ?? run.latestAutoAppliedCalibrationId,
        calibrationDriftHistory: driftEntry ? [driftEntry, ...run.calibrationDriftHistory] : run.calibrationDriftHistory,
        readinessTrend: snapshotAfter.readiness.readinessState,
        maturityTrend: snapshotAfter.maturity.maturitySummary.trendAvailability.message,
        goTraderHandoffGate: goTraderHandoffGateFor(snapshotAfter)
      };
      updateProgress({
        stage: "audit_communications",
        title: "Writing audit event",
        detail: finalEligibility.applied
          ? `Research-only calibration ${finalEligibility.proposalId} was auto-applied.`
          : `Auto-apply blocked: ${finalEligibility.reasons[0] ?? "policy did not allow it"}.`
      });
      publishRun();

      await cooperativeYield("audit_communications");
      const auditStartedMs = Date.now();
      recordCommunicationMessage({
        source: "openclaw_research_supervisor",
        agentName: "Autonomous Research Supervisor",
        category: "openclaw_supervisor_message",
        severity: finalEligibility.applied ? "info" : "warning",
        title: finalEligibility.applied ? "Research calibration auto-applied" : "Auto-apply blocked",
        summary: finalEligibility.applied
          ? `Research-only calibration ${finalEligibility.proposalId} was auto-applied.`
          : finalEligibility.reasons[0] ?? "Auto-apply blocked by policy.",
        body: [
          `Loop ${runId}, iteration ${iterationNumber}.`,
          finalEligibility.applied
            ? "A safe research-only calibration was applied to the local baseline."
            : `Blocked reasons: ${finalEligibility.reasons.join(" ")}`,
          "No broker, demo/live, go-trader handoff, order execution, or readiness approval authority was used."
        ].join(" "),
        relatedProposalId: finalEligibility.proposalId,
        actionRequired: !finalEligibility.applied,
        requestedAction: finalEligibility.applied ? undefined : "acknowledge_readiness_blocker",
        resolved: finalEligibility.applied
      });
      recordTiming("audit_communications", auditStartedMs, "Compact autonomous audit message recorded.");

      const stopCheck = shouldStopAfterIteration({
        iteration,
        noImprovementCount,
        run,
        settings,
        snapshot: snapshotAfter
      });
      if (stopCheck.stop) {
        run = {
          ...run,
          status: statusFromStopReason(stopCheck.reason),
          completedAt: now(),
          stopReason: stopCheck.reason,
          stopReasonDetail: stopCheck.detail
        };
        updateProgress({
          stage: run.status === "paused" ? "paused" : "completed",
          status: run.status,
          title: run.status === "paused" ? "Loop paused" : "Loop completed",
          detail: stopCheck.detail ?? "Autonomous research loop stopped."
        });
        cancellationStatus = "stopped";
        publishRun(true);
        return run;
      }
    }

    run = {
      ...run,
      status: "completed",
      completedAt: now(),
      stopReason: "max_iterations_reached",
      stopReasonDetail: `Reached configured max iterations (${settings.maxIterations}).`
    };
    updateProgress({
      stage: "completed",
      status: "completed",
      title: "Loop completed",
      detail: `Reached configured max iterations (${settings.maxIterations}).`
    });
    cancellationStatus = "stopped";
    publishRun(true);
    return run;
  } catch (error) {
    const canceled = signal?.aborted || (error instanceof Error && error.message.includes("canceled"));
    cancellationStatus = canceled ? "canceled" : "stopped";
    run = {
      ...run,
      status: canceled ? "canceled" : "failed",
      completedAt: now(),
      stopReason: canceled ? "user_canceled" : "failed",
      stopReasonDetail: error instanceof Error ? error.message : "Autonomous research loop failed."
    };
    updateProgress({
      stage: canceled ? "canceled" : "failed",
      status: run.status,
      title: canceled ? "Loop canceled" : "Loop failed",
      detail: run.stopReasonDetail ?? (canceled ? "Loop canceled." : "Loop failed.")
    });
    publishRun(true);
    return run;
  }
}
