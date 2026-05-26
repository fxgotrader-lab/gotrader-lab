import type {
  AutoResearchCandidateResult,
  AutoResearchResultCategory,
  AutoResearchScoreBreakdown
} from "@/lib/autoResearch/autoResearchTypes";
import type { CalibrationProposalMetrics } from "@/lib/selfImprovement";
import { safeArray, safeTopN } from "@/lib/utils";

const conservativeScenarioFor = (candidate: AutoResearchCandidateResult) =>
  candidate.validationReport?.scenarios.find((scenario) => scenario.id === "conservative-confluence");

const skippedSignalImbalanceFor = (candidate: AutoResearchCandidateResult) =>
  candidate.metrics.skippedSignals / Math.max(1, candidate.metrics.totalTrades + candidate.metrics.skippedSignals);

const rejectionReasonsFor = (
  candidate: AutoResearchCandidateResult,
  baselineMetrics: CalibrationProposalMetrics
) => {
  const reasons: string[] = [];
  const score: AutoResearchScoreBreakdown = candidate.scoreBreakdown;
  const conservative = conservativeScenarioFor(candidate);
  const promotionVerdict = candidate.comparisonResult?.promotionVerdict ?? "needs_follow_up";
  if (!score.stabilityImproved) {
    reasons.push("Stability did not improve versus baseline.");
  }
  if (!score.sufficientSample) {
    reasons.push("Candidate did not produce enough simulated trades.");
  }
  if (candidate.metrics.maxDrawdown > Math.max(6, baselineMetrics.maxDrawdown + 1.5)) {
    reasons.push("Drawdown too high for bounded simulation readiness.");
  }
  if (candidate.metrics.averageR < baselineMetrics.averageR - 0.1) {
    reasons.push("Average R weakened beyond tolerance.");
  }
  if (safeArray(candidate.comparisonResult?.criticalRegressions).length) {
    reasons.push(...safeTopN(candidate.comparisonResult?.criticalRegressions, 3));
  }
  if (promotionVerdict === "needs_follow_up") {
    reasons.push(candidate.comparisonResult?.followUpSearchDirection ?? "Candidate needs targeted follow-up before promotion.");
  }
  if (candidate.metrics.falsePositiveCount > Math.max(6, baselineMetrics.falsePositiveCount + 3)) {
    reasons.push("False positives too high.");
  }
  if (candidate.metrics.confidenceCalibration < 0.45) {
    reasons.push("Confidence calibration is poor.");
  }
  if (!candidate.metrics.conservativeScenarioStable || conservative?.readiness === "red") {
    reasons.push("Conservative scenario is unstable.");
  }
  if ((candidate.readinessEstimate?.state ?? "Not Ready") === "Not Ready") {
    reasons.push("Readiness estimate remains Not Ready.");
  }
  if (!reasons.length && candidate.scoreBreakdown.totalScore < 45) {
    reasons.push("Composite stability-first score is too low.");
  }
  return reasons;
};

const categoryFor = (
  candidate: AutoResearchCandidateResult,
  baselineMetrics: CalibrationProposalMetrics,
  reasons: string[]
): AutoResearchResultCategory => {
  const hardFailures = reasons.filter((reason) =>
    [
      "Candidate did not produce enough simulated trades.",
      "Drawdown too high for bounded simulation readiness.",
      "False positives too high.",
      "Confidence calibration is poor.",
      "Conservative scenario is unstable.",
      "Composite stability-first score is too low."
    ].includes(reason)
  );
  const promotionVerdict = candidate.comparisonResult?.promotionVerdict ?? "needs_follow_up";
  const hasCriticalRegression = safeArray(candidate.comparisonResult?.criticalRegressions).length > 0;
  const likelyOverfit =
    candidate.scoreBreakdown.totalScore >= 70 &&
    (candidate.metrics.totalTrades < 4 ||
      skippedSignalImbalanceFor(candidate) > 0.82 ||
      candidate.metrics.maxDrawdown > baselineMetrics.maxDrawdown + 1.25);

  if (likelyOverfit) {
    return "unsafe_overfit";
  }
  if (hardFailures.length) {
    return "rejected";
  }
  if (hasCriticalRegression) {
    return candidate.scoreBreakdown.stabilityImproved ? "improved_but_not_ready" : "rejected";
  }
  if (
    candidate.readinessEstimate?.state === "Paper-Demo Candidate" &&
    candidate.researchQualityReview?.readinessGrade === "Paper-Demo Candidate"
  ) {
    return "paper_demo_candidate";
  }
  if (
    candidate.readinessEstimate?.state === "Research Ready" ||
    candidate.researchQualityReview?.readinessGrade === "Research Ready" ||
    candidate.researchQualityReview?.readinessGrade === "Paper-Demo Candidate"
  ) {
    return "research_ready_candidate";
  }
  if (
    candidate.scoreBreakdown.stabilityImproved &&
    candidate.comparisonResult?.stabilityImproved &&
    promotionVerdict !== "reject"
  ) {
    return "improved_but_not_ready";
  }
  return "rejected";
};

export function selectBestCandidate(
  candidates: AutoResearchCandidateResult[],
  baselineMetrics: CalibrationProposalMetrics
) {
  const scored = safeArray(candidates).map((candidate) => {
    const rejectionReasons = rejectionReasonsFor(candidate, baselineMetrics);
    const resultCategory = categoryFor(candidate, baselineMetrics, rejectionReasons);
    const promotionVerdict = candidate.comparisonResult?.promotionVerdict ?? "needs_follow_up";
    return {
      ...candidate,
      resultCategory,
      promotionEligible:
        ["improved_but_not_ready", "research_ready", "research_ready_candidate", "paper_demo_candidate"].includes(resultCategory) &&
        !safeArray(candidate.comparisonResult?.criticalRegressions).length &&
        promotionVerdict !== "needs_follow_up" &&
        promotionVerdict !== "reject",
      rejectionReasons
    };
  });
  const eligible = scored.filter((candidate) => candidate.promotionEligible);
  const bestCandidate = [...eligible].sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore)[0];
  const closestCandidates = safeTopN(
    [...scored]
    .filter((candidate) => candidate.resultCategory !== "unsafe_overfit")
      .sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore),
    3
  );
  const rejectedCandidates = scored.filter((candidate) => candidate.candidateId !== bestCandidate?.candidateId);

  return {
    bestCandidate,
    candidateResults: scored,
    closestCandidates,
    rejectedCandidates
  };
}
