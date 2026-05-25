import type {
  AutoResearchCandidateResult,
  AutoResearchScoreBreakdown
} from "@/lib/autoResearch/autoResearchTypes";
import type { CalibrationProposalMetrics } from "@/lib/selfImprovement";

const rejectionReasonsFor = (
  candidate: AutoResearchCandidateResult,
  baselineMetrics: CalibrationProposalMetrics
) => {
  const reasons: string[] = [];
  const score: AutoResearchScoreBreakdown = candidate.scoreBreakdown;
  if (!score.stabilityImproved) {
    reasons.push("Stability did not improve versus baseline.");
  }
  if (!score.sufficientSample) {
    reasons.push("Candidate did not produce enough simulated trades.");
  }
  if (candidate.metrics.maxDrawdown > baselineMetrics.maxDrawdown + 0.75) {
    reasons.push("Max drawdown worsened too much.");
  }
  if (candidate.metrics.averageR < baselineMetrics.averageR - 0.1) {
    reasons.push("Average R weakened beyond tolerance.");
  }
  if (candidate.metrics.falsePositiveCount > baselineMetrics.falsePositiveCount + 2) {
    reasons.push("Estimated false positives increased.");
  }
  if (!reasons.length && candidate.scoreBreakdown.totalScore < 45) {
    reasons.push("Composite stability-first score is too low.");
  }
  return reasons;
};

export function selectBestCandidate(
  candidates: AutoResearchCandidateResult[],
  baselineMetrics: CalibrationProposalMetrics
) {
  const scored = candidates.map((candidate) => ({
    ...candidate,
    rejectionReasons: rejectionReasonsFor(candidate, baselineMetrics)
  }));
  const eligible = scored.filter((candidate) => !candidate.rejectionReasons.length);
  const bestCandidate = [...eligible].sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore)[0];
  const rejectedCandidates = scored.filter((candidate) => candidate.candidateId !== bestCandidate?.candidateId);

  return {
    bestCandidate,
    rejectedCandidates
  };
}
