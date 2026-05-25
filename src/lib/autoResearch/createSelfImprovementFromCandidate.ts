import type { AutoResearchCandidateResult } from "@/lib/autoResearch/autoResearchTypes";
import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import { compareProposalToBaseline } from "@/lib/selfImprovement";
import type {
  CalibrationProposalMetrics,
  CalibrationProposal,
  CalibrationProposalChanges,
  CalibrationProposalIntent,
  CalibrationTargetProblem
} from "@/lib/selfImprovement";
import type { ICTScoringWeights } from "@/lib/types";
import { uid } from "@/lib/utils";

const diffAgentWeights = (
  baseline: ResolvedBacktestConfig,
  candidate: ResolvedBacktestConfig
) => {
  const changes = Object.fromEntries(
    Object.entries(candidate.agentWeights).filter(
      ([agentId, value]) => baseline.agentWeights[agentId as keyof typeof baseline.agentWeights] !== value
    )
  );
  return Object.keys(changes).length ? changes : undefined;
};

const changesFor = (
  baseline: ResolvedBacktestConfig,
  candidate: AutoResearchCandidateResult
): CalibrationProposalChanges => ({
  confluenceThreshold:
    baseline.minimumConfluenceThreshold !== candidate.config.minimumConfluenceThreshold
      ? candidate.config.minimumConfluenceThreshold
      : undefined,
  confidenceThreshold:
    baseline.minimumConfidenceThreshold !== candidate.config.minimumConfidenceThreshold
      ? candidate.config.minimumConfidenceThreshold
      : undefined,
  sessionFilter: baseline.sessionFilter !== candidate.config.sessionFilter ? candidate.config.sessionFilter : undefined,
  stopModel: baseline.stopModel !== candidate.config.stopModel ? candidate.config.stopModel : undefined,
  targetRMultiple: baseline.targetRMultiple !== candidate.config.targetRMultiple ? candidate.config.targetRMultiple : undefined,
  agentWeights: diffAgentWeights(baseline, candidate.config),
  ictScoringWeights: candidate.ictScoringWeights as Partial<ICTScoringWeights> | undefined
});

const targetProblemFor = (candidate: AutoResearchCandidateResult): CalibrationTargetProblem => {
  const scores = candidate.scoreBreakdown;
  if (candidate.metrics.totalTrades < 3 || candidate.rejectionReasons.some((reason) => reason.toLowerCase().includes("simulated trades"))) {
    return "trade_generation_issue";
  }
  if (scores.drawdownScore < 60) {
    return "high_drawdown";
  }
  if (scores.winRateScore < 48) {
    return "low_win_rate";
  }
  if (scores.averageRScore < 50) {
    return "weak_average_r";
  }
  if (scores.falsePositiveScore < 70) {
    return "false_positives";
  }
  if (scores.sessionConsistencyScore < 50) {
    return "poor_session_performance";
  }
  if (scores.confidenceCalibrationScore < 60) {
    return "poor_confidence_calibration";
  }
  return "overfitting_risk";
};

export function createSelfImprovementFromCandidate({
  baselineConfig,
  baselineMetrics,
  candidate,
  source = "internal",
  proposalIntent = candidate.resultCategory === "paper_demo_candidate"
    ? "paper_demo_candidate_review"
    : "research_calibration_candidate"
}: {
  baselineConfig: ResolvedBacktestConfig;
  baselineMetrics: CalibrationProposalMetrics;
  candidate: AutoResearchCandidateResult;
  source?: "internal" | "openclaw";
  proposalIntent?: CalibrationProposalIntent;
}): CalibrationProposal {
  const comparisonResult = compareProposalToBaseline(baselineMetrics, candidate.metrics);
  const intentLabel =
    proposalIntent === "paper_demo_candidate_review"
      ? "paper-demo candidate review"
      : "research calibration candidate";

  return {
    proposalId: uid("calibration_proposal"),
    timestamp: new Date().toISOString(),
    source,
    status: "proposed",
    proposalIntent,
    mode: "simulation",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    reason: `Auto Research selected ${candidate.label} as a ${intentLabel}: ${candidate.scoreBreakdown.rationale}`,
    targetProblem: targetProblemFor(candidate),
    proposedChanges: changesFor(baselineConfig, candidate),
    expectedImprovement:
      proposalIntent === "paper_demo_candidate_review"
        ? "Review a Paper-Demo Candidate calibration in simulation. Approval remains required and broker/demo execution stays disabled."
        : "Improve stability-first validation metrics as a research calibration candidate without changing broker settings, execution authority, or readiness gates.",
    safetyNotes: [
      "Auto Research cannot execute trades.",
      proposalIntent === "paper_demo_candidate_review"
        ? "Paper-demo candidate review does not enable paper, demo, or live trading."
        : "Research calibration candidate is not approved and does not mark Paper-Demo Candidate readiness.",
      "Candidate must be accepted manually in the Self-Improvement workflow.",
      "No broker, execution, live mode, demo mode, API key, or readiness permission can be changed."
    ],
    beforeMetrics: baselineMetrics,
    afterMetrics: candidate.metrics,
    comparisonResult,
    baselineConfig,
    proposedConfig: candidate.config,
    approvalRequired: true
  };
}
