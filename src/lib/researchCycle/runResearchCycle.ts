import { runAutoResearchCycle } from "@/lib/autoResearch";
import { loadBacktestConfig } from "@/lib/backtesting";
import { recordResearchCycleCommunication } from "@/lib/communications/communicationSpec";
import {
  buildLLMResearchContextPacket,
  importLLMAgentResponse,
  recordLLMResponseImport,
  recordLLMUnsafeResponseRejection,
  runLocalBridgeAdvisory,
  validateLLMContextPacket
} from "@/lib/llm";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { evaluateReadinessGate } from "@/lib/readiness";
import { analyzeValidationResults, saveLatestResearchQualityReview } from "@/lib/researchQuality";
import type {
  ResearchCycleRun,
  ResearchCycleRunOptions,
  ResearchCycleState,
  ResearchCycleStepId,
  ResearchCycleStepResult
} from "@/lib/researchCycle/researchCycleTypes";
import { loadSimulationRunbookState } from "@/lib/simulationRunbook";
import { loadSelfImprovementState } from "@/lib/selfImprovement";
import { uid } from "@/lib/utils";
import { loadLatestValidationReport, runValidationSuite, saveLatestValidationReport } from "@/lib/validation";

export const RESEARCH_CYCLE_STORAGE_KEY = "gotrader_ai_lab_research_cycle_state";
export const RESEARCH_CYCLE_UPDATED_EVENT = "gotrader-ai-lab-research-cycle-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const stepDefinitions: Array<Pick<ResearchCycleStepResult, "stepId" | "label" | "summary">> = [
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
    window.localStorage.setItem(RESEARCH_CYCLE_STORAGE_KEY, JSON.stringify(state));
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

const statusCounts = (steps: ResearchCycleStepResult[]) => ({
  warnings: steps.filter((step) => step.status === "warning").length,
  failed: steps.filter((step) => step.status === "failed").length,
  completed: steps.filter((step) => step.status === "completed").length
});

const nextActionFor = (run: ResearchCycleRun) => {
  if (run.status === "failed") {
    return "Open the failed step details, fix the blocker, then rerun the research cycle.";
  }
  if (!run.llmRun?.advisoryPassed) {
    return "Start the local LLM bridge and rerun GPT advisory review before expecting Paper-Demo Candidate readiness.";
  }
  if (run.createdProposalId) {
    return "Review the new self-improvement proposal. Approval is still required before settings change.";
  }
  if (run.readinessSnapshot?.failedRequirements.length) {
    return "Review readiness blockers and rerun validation after the weakest requirement improves.";
  }
  return "Keep broker execution disabled and continue simulation monitoring.";
};

const resultSummaryFor = (run: ResearchCycleRun) => {
  const counts = statusCounts(run.steps);
  if (run.status === "failed") {
    return `Research cycle failed at ${run.failedStepId ?? "unknown step"}. Broker execution remained disabled.`;
  }
  return [
    `${counts.completed} steps completed`,
    counts.warnings ? `${counts.warnings} warning${counts.warnings === 1 ? "" : "s"}` : "no blocking warnings",
    run.autoResearchCycle?.noSafePaperDemoCandidateFound ? "No safe Paper-Demo Candidate found" : undefined,
    run.autoResearchCycle?.finalResultCategory ? `final category: ${run.autoResearchCycle.finalResultCategory}` : undefined,
    run.createdProposalId ? `proposal ${run.createdProposalId} created` : "no proposal created",
    `readiness: ${run.readinessSnapshot?.state ?? "not evaluated"}`
  ].filter(Boolean).join(" / ");
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
      runs: parsed.runs ?? []
    };
  } catch {
    return publish(initialState());
  }
}

export function saveResearchCycleRun(run: ResearchCycleRun): ResearchCycleState {
  const state = loadResearchCycleState();
  return publish({
    ...state,
    latestRunId: run.cycleId,
    runs: [run, ...state.runs.filter((item) => item.cycleId !== run.cycleId)].slice(0, 20)
  });
}

export function latestResearchCycleRun(state = loadResearchCycleState()) {
  return state.runs.find((run) => run.cycleId === state.latestRunId) ?? state.runs[0];
}

export async function runResearchCycle({
  state,
  searchMode = "standard",
  maxCandidateCount = 10,
  onUpdate
}: ResearchCycleRunOptions): Promise<ResearchCycleRun> {
  let steps = initialSteps();
  const run: ResearchCycleRun = {
    cycleId: uid("research_cycle"),
    startedAt: now(),
    status: "running",
    steps,
    llmBridgeAvailable: false,
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
  const completeStep = (
    stepId: ResearchCycleStepId,
    patch: Partial<ResearchCycleStepResult> & Pick<ResearchCycleStepResult, "summary">
  ) => setStep(stepId, { status: "completed", completedAt: now(), ...patch });
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
    run.status = "failed";
    run.completedAt = now();
    run.failedStepId = stepId;
    run.failedStepDetails = message;
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    notify();
  };

  notify();

  try {
    startStep("llm_advisory");
    const startingValidation = loadLatestValidationReport();
    const startingRunbook = loadSimulationRunbookState();
    const startingQuality = startingValidation ? analyzeValidationResults(startingValidation) : undefined;
    const startingReadiness = evaluateReadinessGate({
      validation: startingValidation,
      quality: startingQuality,
      runbook: startingRunbook
    });
    const llmPacket = buildLLMResearchContextPacket({
      state,
      validation: startingValidation,
      quality: startingQuality,
      readiness: startingReadiness,
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
        const importResult = importLLMAgentResponse(JSON.stringify(bridgeResult.responses), llmPacket.packetId);
        if (!importResult.run || !importResult.valid) {
          recordLLMUnsafeResponseRejection(Math.max(1, importResult.unsafeResponseRejections));
          warnStep("llm_advisory", {
            summary: "Local LLM bridge responded, but advisory validation failed.",
            warning: importResult.errors.join(" ") || "Unsafe or incomplete advisory response."
          });
        } else {
          run.llmRun = importResult.run;
          recordLLMResponseImport(importResult.run, importResult.run.timestamp);
          completeStep("llm_advisory", {
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
    const autoResearchCycle = runAutoResearchCycle({
      searchMode,
      maxCandidateCount,
      createProposal: true,
      onCandidateEvaluated: (progress) => {
        run.candidateProgress = progress;
        setStep("auto_research", {
          status: "running",
          summary: `Candidate ${progress.currentCandidate}/${progress.totalCandidates}: ${progress.candidateLabel}.`,
          detail: progress.bestCandidateLabel
            ? `Best so far: ${progress.bestCandidateLabel} (${progress.bestCandidateCategory}, score ${progress.bestCandidateScore}).`
            : "No stable best candidate selected yet."
        });
      }
    });
    run.autoResearchCycle = autoResearchCycle;
    run.createdProposalId = autoResearchCycle.createdProposalId;
    if (autoResearchCycle.status === "failed") {
      failStep("auto_research", autoResearchCycle.error ?? "Auto Research cycle failed.");
      saveResearchCycleRun(snapshot());
      return snapshot();
    }
    completeStep("auto_research", {
      summary: autoResearchCycle.bestCandidate
        ? `Best candidate: ${autoResearchCycle.bestCandidate.label}.`
        : "Auto Research completed without a viable best candidate.",
      detail: autoResearchCycle.noSafePaperDemoCandidateFound
        ? `Candidate ${autoResearchCycle.candidatesTested}/${autoResearchCycle.candidatesTested}. No safe Paper-Demo Candidate found. Continue research.`
        : `Candidate ${autoResearchCycle.candidatesTested}/${autoResearchCycle.candidatesTested}. Final category: ${autoResearchCycle.finalResultCategory}.`
    });

    startStep("validation");
    const validationReport = runValidationSuite(mockCandles, loadBacktestConfig());
    saveLatestValidationReport(validationReport);
    run.validationReport = validationReport;
    completeStep("validation", {
      summary: `Validation completed: ${validationReport.calibration.readinessStatus} readiness, score ${validationReport.calibration.readinessScore}.`,
      detail: `Strongest: ${validationReport.calibration.strongestScenario}; weakest: ${validationReport.calibration.weakestScenario}.`
    });

    startStep("research_quality");
    const researchQualityReview = analyzeValidationResults(validationReport);
    saveLatestResearchQualityReview(researchQualityReview);
    run.researchQualityReview = researchQualityReview;
    completeStep("research_quality", {
      summary: `Research quality grade: ${researchQualityReview.readinessGrade}.`,
      detail: researchQualityReview.recommendedNextStep
    });

    startStep("self_improvement");
    const improvementState = loadSelfImprovementState();
    const latestProposal =
      improvementState.proposals.find((proposal) => proposal.proposalId === improvementState.latestProposalId) ??
      improvementState.proposals[0];
    if (run.createdProposalId) {
      completeStep("self_improvement", {
        summary: `Approval-required proposal created: ${run.createdProposalId}.`,
        detail: "Proposal remains simulation-only until the user reviews and approves it."
      });
    } else if (latestProposal?.status === "proposed" || latestProposal?.status === "testing") {
      warnStep("self_improvement", {
        summary: `Existing proposal still requires review: ${latestProposal.proposalId}.`,
        warning: "No new proposal was created because the best candidate did not clear the stability gate."
      });
    } else {
      completeStep("self_improvement", {
        summary: "No self-improvement proposal was created.",
        detail: "Best candidate did not improve stability enough to justify a proposal."
      });
    }

    startStep("readiness_gate");
    const readinessSnapshot = evaluateReadinessGate({
      validation: validationReport,
      quality: researchQualityReview,
      runbook: loadSimulationRunbookState()
    });
    run.readinessSnapshot = readinessSnapshot;
    completeStep("readiness_gate", {
      summary: `Readiness remains ${readinessSnapshot.state}.`,
      detail: `${readinessSnapshot.failedRequirements.length} failed requirement${readinessSnapshot.failedRequirements.length === 1 ? "" : "s"}; no override applied.`
    });

    run.status = "completed";
    run.completedAt = now();
    run.nextRecommendedAction = nextActionFor(run);
    run.resultSummary = resultSummaryFor(run);
    startStep("communications_audit");
    recordResearchCycleCommunication({
      cycleId: run.cycleId,
      status: run.status,
      summary: resultSummaryFor({ ...run, steps }),
      validationId: validationReport.id,
      proposalId: run.createdProposalId,
      readinessState: readinessSnapshot.state,
      actionRequired: Boolean(run.createdProposalId || readinessSnapshot.failedRequirements.length || !run.llmRun?.advisoryPassed)
    });
    completeStep("communications_audit", {
      summary: "Research cycle logged to the in-app communications audit trail.",
      detail: "Audit message has no execution authority."
    });

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
    recordResearchCycleCommunication({
      cycleId: run.cycleId,
      status: "failed",
      summary: message,
      readinessState: run.readinessSnapshot?.state,
      actionRequired: true
    });
    saveResearchCycleRun(snapshot());
    return snapshot();
  }
}
