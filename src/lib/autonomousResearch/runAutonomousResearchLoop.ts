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
  AutonomousResearchRun,
  AutonomousResearchSettings,
  AutonomousResearchStopReason,
  RunAutonomousResearchLoopOptions
} from "@/lib/autonomousResearch/autonomousResearchTypes";
import { autonomousToSafetyBlockers } from "@/lib/autonomousResearch/autonomousResearchTypes";
import { recordCommunicationMessage } from "@/lib/communications/communicationSpec";
import { createHermesNotificationPayload, createPlannedHermesNotificationState } from "@/lib/integrations/hermesNotificationHooks";
import { createOpenClawMemoryHookPacket, createPlannedOpenClawMemoryHookState } from "@/lib/integrations/openclawMemoryHooks";
import { resolveResearchRuntimeSnapshot } from "@/lib/runtime";
import type { CalibrationProposal } from "@/lib/selfImprovement";
import { safeArray, uid } from "@/lib/utils";
import { runResearchCycle } from "@/lib/researchCycle";
import { runWalkForwardValidation } from "@/lib/walkForward";

const defaultSettings: AutonomousResearchSettings = {
  maxIterations: 3,
  noImprovementStop: 2,
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
      : reason === "regime_mismatch_detected" ||
          reason === "evidence_quality_too_low" ||
          reason === "walk_forward_repeatedly_failed" ||
          reason === "llm_advisory_offline"
        ? "paused"
        : "completed";

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
  const settings: AutonomousResearchSettings = {
    ...defaultSettings,
    ...partialSettings,
    maxIterations: Math.max(1, Math.min(8, partialSettings.maxIterations ?? defaultSettings.maxIterations)),
    noImprovementStop: Math.max(1, Math.min(5, partialSettings.noImprovementStop ?? defaultSettings.noImprovementStop))
  };
  const runId = uid("autonomous_research");
  let noImprovementCount = 0;
  const startedAt = now();
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
    safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
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
          ? [
              {
                eventId: uid("autonomy_event"),
                timestamp,
                stage,
                title,
                detail
              },
              ...safeArray(previous.events)
            ]
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

  emit(run, onUpdate);

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
      emit(run, onUpdate);

      const snapshotBefore = await resolveResearchRuntimeSnapshot();
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
        selectedScenarioFamily: scenario.scenarioFamily,
        scenarioReason: scenario.reason,
        status: "running",
        notes: [blockerSummary.summary, scenario.reason]
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
      emit(run, onUpdate);

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

      const cycle = await runResearchCycle({
        state,
        searchMode: scenario.searchMode,
        maxCandidateCount: scenario.maxCandidateCount,
        advancedFullResearchMode: settings.advancedFullResearchMode,
        skipHeavyAudit: settings.safeImportedDataMode,
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
          emit(run, onUpdate);
        }
      });
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
      if (proposal) {
        updateProgress({
          stage: "walk_forward",
          title: "Walk-forward validation",
          detail: `Validating proposal ${proposal.proposalId} across walk-forward windows.`
        });
        emit(run, onUpdate);
        walkForwardRun = await runWalkForwardValidation({
          mode: settings.safeImportedDataMode ? "safe" : "standard",
          proposalId: proposal.proposalId,
          maxWindows: settings.safeImportedDataMode ? 3 : 5,
          signal
        });
      }

      updateProgress({
        stage: "self_improvement",
        title: "Evaluating self-improvement",
        detail: proposal
          ? `Evaluating auto-apply eligibility for proposal ${proposal.proposalId}.`
          : "No proposal created; recording policy decision."
      });
      emit(run, onUpdate);

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
      emit(run, onUpdate);

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
      emit(run, onUpdate);

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
        emit(run, onUpdate);
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
    emit(run, onUpdate);
    return run;
  } catch (error) {
    const canceled = signal?.aborted || (error instanceof Error && error.message.includes("canceled"));
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
    emit(run, onUpdate);
    return run;
  }
}
