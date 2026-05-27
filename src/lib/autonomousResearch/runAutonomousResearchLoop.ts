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
  AutonomousResearchRun,
  AutonomousResearchSettings,
  AutonomousResearchStopReason,
  RunAutonomousResearchLoopOptions
} from "@/lib/autonomousResearch/autonomousResearchTypes";
import { autonomousToSafetyBlockers } from "@/lib/autonomousResearch/autonomousResearchTypes";
import { recordCommunicationMessage } from "@/lib/communications/communicationSpec";
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
      : reason === "regime_mismatch_detected" || reason === "evidence_quality_too_low" || reason === "walk_forward_repeatedly_failed"
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
  let run: AutonomousResearchRun = {
    runId,
    startedAt: now(),
    status: "running",
    settings,
    currentIteration: 0,
    iterations: [],
    readinessTrend: "unknown",
    maturityTrend: "unknown",
    goTraderHandoffGate: {
      eligibleForReview: false,
      reasons: ["Loop has not completed a runtime snapshot yet."],
      brokerExecutionDisabled: true
    },
    calibrationDriftHistory: [],
    openClawHooks: {
      failureAnalysisMemory: { executionAuthority: "none" },
      scenarioRecommendation: { executionAuthority: "none" },
      proposalReview: { executionAuthority: "none" }
    },
    hermesNotification: { executionAuthority: "none" },
    safetyNotice: "Autonomous research is simulation-only. It cannot execute trades, approve Paper-Demo Candidate, send go-trader handoffs, or override readiness."
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
        signal
      });
      const proposal = latestProposalFromCycle(cycle);
      const bestCandidateLabel =
        cycle.bestCandidateSummary?.label ??
        cycle.autoResearchCycle?.bestCandidate?.label ??
        cycle.autoResearchCycle?.closestCandidates[0]?.label;

      iteration = {
        ...iteration,
        cycleId: cycle.cycleId,
        autoResearchCycleId: cycle.autoResearchCycle?.cycleId,
        bestCandidateLabel,
        proposalId: proposal?.proposalId,
        latestCandidateResult: bestCandidateLabel,
        notes: [
          ...iteration.notes,
          cycle.resultSummary,
          proposal ? `Proposal ${proposal.proposalId} available for policy review.` : "No proposal was created."
        ]
      } as AutonomousLoopIteration;

      let walkForwardRun;
      if (proposal) {
        walkForwardRun = await runWalkForwardValidation({
          mode: settings.safeImportedDataMode ? "safe" : "standard",
          proposalId: proposal.proposalId,
          maxWindows: settings.safeImportedDataMode ? 3 : 5,
          signal
        });
      }

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
    emit(run, onUpdate);
    return run;
  }
}
