import type {
  CalibrationComparisonResult,
  CalibrationProposalMetrics
} from "@/lib/selfImprovement/selfImprovementTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const deltaText = (label: string, before: number, after: number, suffix = "") =>
  `${label}: ${round(before)}${suffix} -> ${round(after)}${suffix}`;

export function compareProposalToBaseline(
  before: CalibrationProposalMetrics,
  after: CalibrationProposalMetrics
): CalibrationComparisonResult {
  const positiveChanges: string[] = [];
  const negativeChanges: string[] = [];
  const neutralChanges: string[] = [];

  if (after.maxDrawdown < before.maxDrawdown) {
    positiveChanges.push(deltaText("Max drawdown improved", before.maxDrawdown, after.maxDrawdown, "R"));
  } else if (after.maxDrawdown > before.maxDrawdown) {
    negativeChanges.push(deltaText("Max drawdown worsened", before.maxDrawdown, after.maxDrawdown, "R"));
  } else {
    neutralChanges.push("Max drawdown was unchanged.");
  }

  if (after.averageR > before.averageR) {
    positiveChanges.push(deltaText("Average R improved", before.averageR, after.averageR, "R"));
  } else if (after.averageR < before.averageR - 0.05) {
    negativeChanges.push(deltaText("Average R weakened", before.averageR, after.averageR, "R"));
  } else {
    neutralChanges.push("Average R stayed within the baseline tolerance.");
  }

  if (after.winRate > before.winRate) {
    positiveChanges.push(deltaText("Win rate improved", before.winRate * 100, after.winRate * 100, "%"));
  } else if (after.winRate < before.winRate - 0.04) {
    negativeChanges.push(deltaText("Win rate weakened", before.winRate * 100, after.winRate * 100, "%"));
  } else {
    neutralChanges.push("Win rate stayed within the baseline tolerance.");
  }

  if (after.falsePositiveCount < before.falsePositiveCount) {
    positiveChanges.push(deltaText("Estimated false positives improved", before.falsePositiveCount, after.falsePositiveCount));
  } else if (after.falsePositiveCount > before.falsePositiveCount) {
    negativeChanges.push(deltaText("Estimated false positives worsened", before.falsePositiveCount, after.falsePositiveCount));
  }

  if (after.confidenceCalibration > before.confidenceCalibration) {
    positiveChanges.push(deltaText("Confidence calibration improved", before.confidenceCalibration, after.confidenceCalibration));
  } else if (after.confidenceCalibration < before.confidenceCalibration - 0.04) {
    negativeChanges.push(deltaText("Confidence calibration weakened", before.confidenceCalibration, after.confidenceCalibration));
  }

  if (after.totalTrades < 2) {
    negativeChanges.push("Candidate produced too few simulated trades to trust.");
  } else if (after.totalTrades < Math.max(2, before.totalTrades * 0.5)) {
    negativeChanges.push("Candidate reduced the sample size too aggressively.");
  }

  if (after.skippedSignals > before.skippedSignals * 1.35 && after.totalTrades <= before.totalTrades) {
    negativeChanges.push("Candidate skipped materially more signals without improving sample quality.");
  }

  const stabilityImproved =
    after.stabilityScore >= before.stabilityScore &&
    after.maxDrawdown <= before.maxDrawdown &&
    after.confidenceCalibration >= before.confidenceCalibration - 0.03;
  const qualityImproved =
    after.readinessScore >= before.readinessScore ||
    after.averageR >= before.averageR + 0.05 ||
    after.winRate >= before.winRate + 0.04;
  const improved = stabilityImproved && qualityImproved && after.totalTrades >= 2 && negativeChanges.length <= 1;
  const recommendation = improved ? "accept" : negativeChanges.length >= 2 ? "reject" : "keep_testing";

  return {
    improved,
    stabilityImproved,
    recommendation,
    summary: improved
      ? "Candidate improved stability or readiness without silently expanding execution authority."
      : recommendation === "keep_testing"
        ? "Candidate is mixed. Keep testing before changing active simulation settings."
        : "Candidate did not improve stability enough to promote.",
    positiveChanges,
    negativeChanges,
    neutralChanges
  };
}
