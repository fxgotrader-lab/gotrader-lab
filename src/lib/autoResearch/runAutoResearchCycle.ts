import {
  defaultAutoResearchScoringCriteria,
  autoResearchSafetyNotes
} from "@/lib/autoResearch/configSearchSpace";
import { createSelfImprovementFromCandidate } from "@/lib/autoResearch/createSelfImprovementFromCandidate";
import { generateCandidateConfigs } from "@/lib/autoResearch/generateCandidateConfigs";
import { scoreCandidateConfig } from "@/lib/autoResearch/scoreCandidateConfig";
import { selectBestCandidate } from "@/lib/autoResearch/selectBestCandidate";
import type {
  AutoResearchCandidateResult,
  AutoResearchCycle,
  AutoResearchRunOptions,
  AutoResearchState
} from "@/lib/autoResearch/autoResearchTypes";
import {
  loadBacktestConfig,
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
  compareProposalToBaseline,
  summarizeValidationMetrics,
  upsertCalibrationProposal
} from "@/lib/selfImprovement";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { labStorage } from "@/lib/storage";
import { uid } from "@/lib/utils";
import { runValidationSuite } from "@/lib/validation";

export const AUTO_RESEARCH_STORAGE_KEY = "gotrader_ai_lab_auto_research_state";
export const AUTO_RESEARCH_UPDATED_EVENT = "gotrader-ai-lab-auto-research-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const initialState = (): AutoResearchState => ({
  cycles: [],
  auditTrail: [],
  safetyNotice: "Auto Research is simulation-only and cannot execute trades or override readiness gates."
});

const audit = (
  cycleId: string,
  action: AutoResearchState["auditTrail"][number]["action"],
  notes: string
) => ({
  id: uid("auto_research_audit"),
  timestamp: new Date().toISOString(),
  cycleId,
  action,
  notes
});

const publish = (state: AutoResearchState) => {
  if (isBrowser()) {
    window.localStorage.setItem(AUTO_RESEARCH_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(AUTO_RESEARCH_UPDATED_EVENT, { detail: state }));
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
      cycles: parsed.cycles ?? [],
      auditTrail: parsed.auditTrail ?? []
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
    cycles: [cycle, ...state.cycles.filter((item) => item.cycleId !== cycle.cycleId)].slice(0, 12),
    auditTrail: [
      audit(
        cycle.cycleId,
        cycle.status === "proposal_created" ? "proposal_created" : cycle.status === "failed" ? "cycle_failed" : "cycle_completed",
        cycle.createdProposalId
          ? `Created proposal ${cycle.createdProposalId}.`
          : cycle.error ?? `Completed ${cycle.candidateResults.length} candidate evaluations.`
      ),
      ...state.auditTrail
    ].slice(0, 80)
  });
}

export function latestAutoResearchCycle(state = loadAutoResearchState()) {
  return state.cycles.find((cycle) => cycle.cycleId === state.latestCycleId) ?? state.cycles[0];
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
      metrics,
      scoreBreakdown,
      comparisonResult,
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
      candidate.scoreBreakdown.stabilityImproved &&
      candidate.scoreBreakdown.sufficientSample &&
      candidate.comparisonResult.stabilityImproved &&
      candidate.scoreBreakdown.totalScore >= 45
  );

export function runAutoResearchCycle(options: AutoResearchRunOptions): AutoResearchCycle {
  const cycleId = uid("auto_cycle");
  try {
    const baselineConfig = loadBacktestConfig();
    const baselineValidation = runValidationSuite(mockCandles, baselineConfig);
    const baselineMetrics = summarizeValidationMetrics(baselineValidation);
    const candidateConfigs = generateCandidateConfigs(
      baselineConfig,
      options.searchMode,
      options.maxCandidateCount
    );
    const candidateResults = candidateConfigs.map((candidate) => evaluateCandidate(candidate, baselineMetrics));
    const { bestCandidate, rejectedCandidates } = selectBestCandidate(candidateResults, baselineMetrics);
    let createdProposalId: string | undefined;

    if (options.createProposal !== false && shouldCreateProposal(bestCandidate)) {
      const advisorySource = (labStorage.load().advisoryResponses?.length ?? 0) > 0 ? "openclaw" : "internal";
      const proposal = createSelfImprovementFromCandidate({
        baselineConfig,
        baselineMetrics,
        candidate: bestCandidate,
        source: advisorySource
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
      candidateConfigs,
      candidateResults,
      bestCandidate,
      rejectedCandidates,
      scoringCriteria: defaultAutoResearchScoringCriteria,
      safetyNotes: autoResearchSafetyNotes,
      createdProposalId,
      status: createdProposalId ? "proposal_created" : "completed"
    };

    saveAutoResearchCycle(cycle);
    return cycle;
  } catch (error) {
    const cycle: AutoResearchCycle = {
      cycleId,
      timestamp: new Date().toISOString(),
      baselineConfig: loadBacktestConfig(),
      candidateConfigs: [],
      candidateResults: [],
      rejectedCandidates: [],
      scoringCriteria: defaultAutoResearchScoringCriteria,
      safetyNotes: autoResearchSafetyNotes,
      status: "failed",
      error: error instanceof Error ? error.message : "Auto Research cycle failed."
    };
    saveAutoResearchCycle(cycle);
    return cycle;
  }
}
