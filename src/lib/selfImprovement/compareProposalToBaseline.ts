import type {
  CalibrationComparisonResult,
  CalibrationProposalMetrics
} from "@/lib/selfImprovement/selfImprovementTypes";
import { materialMetricsChanged } from "@/lib/selfImprovement/proposalMetricsSnapshot";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const deltaText = (label: string, before: number, after: number, suffix = "") =>
  `${label}: ${round(before)}${suffix} -> ${round(after)}${suffix}`;

const formatPercent = (value: number) => `${round(value * 100, 1)}%`;

const promotionGuards = {
  minimumTradeCount: 10,
  minimumTradeRetentionRatio: 0.5,
  winRateCollapseRatio: 0.5,
  minimumTrustworthyWinRate: 0.08,
  materialAverageRDecline: 0.04,
  skippedSignalsIncreaseRatio: 1.1,
  skippedPerTradeIncreaseRatio: 1.75,
  exceptionalDrawdownReductionRatio: 0.7
};

const metricLine = (label: string, before: string | number, after: string | number) => `${label}: ${before} -> ${after}`;

const profitFactorText = (value: number | null) => (value === null ? "n/a" : String(round(value, 2)));

const drawdownReductionRatio = (before: CalibrationProposalMetrics, after: CalibrationProposalMetrics) =>
  before.maxDrawdown > 0 ? (before.maxDrawdown - after.maxDrawdown) / before.maxDrawdown : 0;

const stabilityImprovementIsExceptional = (before: CalibrationProposalMetrics, after: CalibrationProposalMetrics) =>
  drawdownReductionRatio(before, after) >= promotionGuards.exceptionalDrawdownReductionRatio &&
  after.falsePositiveCount <= before.falsePositiveCount * 0.65 &&
  after.confidenceCalibration >= before.confidenceCalibration + 0.15 &&
  after.totalTrades >= Math.max(promotionGuards.minimumTradeCount, before.totalTrades * 0.75) &&
  after.winRate >= before.winRate - 0.02 &&
  after.averageR >= before.averageR - 0.02;

const inferFollowUpSearchDirection = (criticalRegressions: string[]) => {
  const text = criticalRegressions.join(" ").toLowerCase();
  if (text.includes("win rate") || text.includes("average r") || text.includes("profit factor")) {
    return "Retain the lower-risk filter, then loosen confluence/confidence slightly and test session-specific stop/target variants.";
  }
  if (text.includes("trade sample") || text.includes("sample size")) {
    return "Keep the stability filter, then widen the session window or slightly lower thresholds to recover enough trades.";
  }
  if (text.includes("skipped")) {
    return "Compare threshold relief against agent weights so the strategy does not skip too many viable simulated setups.";
  }
  if (text.includes("readiness")) {
    return "Rerun focused validation on the strongest session and require readiness score recovery before promotion.";
  }
  return "Run a targeted follow-up search before approving this calibration.";
};

export function compareProposalToBaseline(
  before: CalibrationProposalMetrics,
  after: CalibrationProposalMetrics
): CalibrationComparisonResult {
  if (!materialMetricsChanged(before, after)) {
    return {
      improved: false,
      stabilityImproved: false,
      recommendation: "reject",
      summary: "This proposal does not materially change the baseline.",
      positiveChanges: [],
      negativeChanges: [],
      neutralChanges: ["No material before/after metric change was detected."],
      improvedMetrics: [],
      worsenedMetrics: [],
      criticalRegressions: ["This proposal does not materially change the baseline."],
      sanityWarnings: ["Before and after metrics are identical within tolerance."],
      promotionVerdict: "no_material_change",
      followUpSearchDirection: "Reject this no-op proposal or rebuild the snapshot from the source candidate."
    };
  }

  const positiveChanges: string[] = [];
  const negativeChanges: string[] = [];
  const neutralChanges: string[] = [];
  const improvedMetrics: string[] = [];
  const worsenedMetrics: string[] = [];
  const criticalRegressions: string[] = [];
  const sanityWarnings: string[] = [];

  if (after.maxDrawdown < before.maxDrawdown) {
    positiveChanges.push(deltaText("Max drawdown improved", before.maxDrawdown, after.maxDrawdown, "R"));
    improvedMetrics.push(metricLine("Max drawdown", `${round(before.maxDrawdown)}R`, `${round(after.maxDrawdown)}R`));
  } else if (after.maxDrawdown > before.maxDrawdown) {
    negativeChanges.push(deltaText("Max drawdown worsened", before.maxDrawdown, after.maxDrawdown, "R"));
    worsenedMetrics.push(metricLine("Max drawdown", `${round(before.maxDrawdown)}R`, `${round(after.maxDrawdown)}R`));
  } else {
    neutralChanges.push("Max drawdown was unchanged.");
  }

  if (after.averageR > before.averageR) {
    positiveChanges.push(deltaText("Average R improved", before.averageR, after.averageR, "R"));
    improvedMetrics.push(metricLine("Average R", `${round(before.averageR)}R`, `${round(after.averageR)}R`));
  } else if (after.averageR < before.averageR - 0.05) {
    negativeChanges.push(deltaText("Average R weakened", before.averageR, after.averageR, "R"));
    worsenedMetrics.push(metricLine("Average R", `${round(before.averageR)}R`, `${round(after.averageR)}R`));
  } else {
    neutralChanges.push("Average R stayed within the baseline tolerance.");
  }

  if (after.winRate > before.winRate) {
    positiveChanges.push(deltaText("Win rate improved", before.winRate * 100, after.winRate * 100, "%"));
    improvedMetrics.push(metricLine("Win rate", formatPercent(before.winRate), formatPercent(after.winRate)));
  } else if (after.winRate < before.winRate - 0.04) {
    negativeChanges.push(deltaText("Win rate weakened", before.winRate * 100, after.winRate * 100, "%"));
    worsenedMetrics.push(metricLine("Win rate", formatPercent(before.winRate), formatPercent(after.winRate)));
  } else {
    neutralChanges.push("Win rate stayed within the baseline tolerance.");
  }

  if (after.falsePositiveCount < before.falsePositiveCount) {
    positiveChanges.push(deltaText("Estimated false positives improved", before.falsePositiveCount, after.falsePositiveCount));
    improvedMetrics.push(metricLine("False positives", before.falsePositiveCount, after.falsePositiveCount));
  } else if (after.falsePositiveCount > before.falsePositiveCount) {
    negativeChanges.push(deltaText("Estimated false positives worsened", before.falsePositiveCount, after.falsePositiveCount));
    worsenedMetrics.push(metricLine("False positives", before.falsePositiveCount, after.falsePositiveCount));
  }

  if (after.confidenceCalibration > before.confidenceCalibration) {
    positiveChanges.push(deltaText("Confidence calibration improved", before.confidenceCalibration, after.confidenceCalibration));
    improvedMetrics.push(metricLine("Confidence calibration", formatPercent(before.confidenceCalibration), formatPercent(after.confidenceCalibration)));
  } else if (after.confidenceCalibration < before.confidenceCalibration - 0.04) {
    negativeChanges.push(deltaText("Confidence calibration weakened", before.confidenceCalibration, after.confidenceCalibration));
    worsenedMetrics.push(metricLine("Confidence calibration", formatPercent(before.confidenceCalibration), formatPercent(after.confidenceCalibration)));
  }

  if (after.profitFactor !== before.profitFactor) {
    const beforeText = profitFactorText(before.profitFactor);
    const afterText = profitFactorText(after.profitFactor);
    if ((after.profitFactor ?? 0) > (before.profitFactor ?? 0)) {
      positiveChanges.push(`Profit factor improved: ${beforeText} -> ${afterText}`);
      improvedMetrics.push(metricLine("Profit factor", beforeText, afterText));
    } else if ((after.profitFactor ?? 0) < (before.profitFactor ?? 0)) {
      negativeChanges.push(`Profit factor weakened: ${beforeText} -> ${afterText}`);
      worsenedMetrics.push(metricLine("Profit factor", beforeText, afterText));
    }
  }

  if (after.readinessScore > before.readinessScore) {
    positiveChanges.push(deltaText("Readiness score improved", before.readinessScore, after.readinessScore));
    improvedMetrics.push(metricLine("Readiness score", before.readinessScore, after.readinessScore));
  } else if (after.readinessScore < before.readinessScore) {
    negativeChanges.push(deltaText("Readiness score weakened", before.readinessScore, after.readinessScore));
    worsenedMetrics.push(metricLine("Readiness score", before.readinessScore, after.readinessScore));
  }

  if (after.skippedSignals < before.skippedSignals) {
    positiveChanges.push(deltaText("Skipped signals improved", before.skippedSignals, after.skippedSignals));
    improvedMetrics.push(metricLine("Skipped signals", before.skippedSignals, after.skippedSignals));
  } else if (after.skippedSignals > before.skippedSignals) {
    negativeChanges.push(deltaText("Skipped signals increased", before.skippedSignals, after.skippedSignals));
    worsenedMetrics.push(metricLine("Skipped signals", before.skippedSignals, after.skippedSignals));
  }

  if (after.stabilityScore > before.stabilityScore) {
    positiveChanges.push(deltaText("Stability score improved", before.stabilityScore, after.stabilityScore));
    improvedMetrics.push(metricLine("Stability score", before.stabilityScore, after.stabilityScore));
  } else if (after.stabilityScore < before.stabilityScore) {
    negativeChanges.push(deltaText("Stability score weakened", before.stabilityScore, after.stabilityScore));
    worsenedMetrics.push(metricLine("Stability score", before.stabilityScore, after.stabilityScore));
  }

  const minimumTradeCount = Math.max(
    promotionGuards.minimumTradeCount,
    Math.floor(before.totalTrades * promotionGuards.minimumTradeRetentionRatio)
  );
  if (after.totalTrades < promotionGuards.minimumTradeCount) {
    criticalRegressions.push(
      `Trade sample too small: ${before.totalTrades} -> ${after.totalTrades}; minimum trustworthy sample is ${promotionGuards.minimumTradeCount}.`
    );
  } else if (after.totalTrades < minimumTradeCount) {
    criticalRegressions.push(
      `Trade count collapsed: ${before.totalTrades} -> ${after.totalTrades}; promotion needs at least ${minimumTradeCount}.`
    );
  } else if (after.totalTrades < before.totalTrades) {
    worsenedMetrics.push(metricLine("Total trades", before.totalTrades, after.totalTrades));
  }

  if (
    before.winRate > 0 &&
    after.winRate < Math.max(promotionGuards.minimumTrustworthyWinRate, before.winRate * promotionGuards.winRateCollapseRatio)
  ) {
    criticalRegressions.push(`Win rate collapsed: ${formatPercent(before.winRate)} -> ${formatPercent(after.winRate)}.`);
  }

  if (after.averageR < before.averageR - promotionGuards.materialAverageRDecline) {
    criticalRegressions.push(`Average R declined materially: ${round(before.averageR)}R -> ${round(after.averageR)}R.`);
  }

  if (after.readinessScore < before.readinessScore && !stabilityImprovementIsExceptional(before, after)) {
    criticalRegressions.push(`Readiness score declined: ${before.readinessScore} -> ${after.readinessScore}.`);
  }

  const beforeSkippedPerTrade = before.skippedSignals / Math.max(1, before.totalTrades);
  const afterSkippedPerTrade = after.skippedSignals / Math.max(1, after.totalTrades);
  if (
    after.skippedSignals > before.skippedSignals * promotionGuards.skippedSignalsIncreaseRatio ||
    afterSkippedPerTrade > beforeSkippedPerTrade * promotionGuards.skippedPerTradeIncreaseRatio
  ) {
    criticalRegressions.push(
      `Skipped-signal load worsened: ${before.skippedSignals} skipped / ${before.totalTrades} trades -> ${after.skippedSignals} skipped / ${after.totalTrades} trades.`
    );
  }

  if (after.totalTrades > 0 && after.winRate > 0 && after.winRate * after.totalTrades < 1) {
    sanityWarnings.push(
      `Win rate looks suspicious for the sample: ${formatPercent(after.winRate)} across ${after.totalTrades} trades implies fewer than one winning trade.`
    );
  }

  if ((after.profitFactor ?? 0) > 3 && after.winRate < 0.15 && after.averageR < 0.05) {
    sanityWarnings.push(
      `Profit factor is high (${profitFactorText(after.profitFactor)}) while win rate (${formatPercent(after.winRate)}) and average R (${round(after.averageR)}R) are extremely low. Treat profit factor as insufficient evidence.`
    );
  }

  if (after.totalTrades < minimumTradeCount) {
    sanityWarnings.push(`Sample size is too small to trust: ${after.totalTrades} trades versus required ${minimumTradeCount}.`);
  }

  const stabilityImproved =
    after.stabilityScore >= before.stabilityScore &&
    after.maxDrawdown <= before.maxDrawdown &&
    after.confidenceCalibration >= before.confidenceCalibration - 0.03;
  const qualityImproved =
    after.readinessScore >= before.readinessScore ||
    after.averageR >= before.averageR + 0.05 ||
    after.winRate >= before.winRate + 0.04;
  const balancedEnough =
    criticalRegressions.length === 0 &&
    after.totalTrades >= minimumTradeCount &&
    after.averageR >= before.averageR - promotionGuards.materialAverageRDecline &&
    after.winRate >= Math.max(0.05, before.winRate * 0.75) &&
    after.readinessScore >= before.readinessScore;
  const improved = stabilityImproved && qualityImproved && balancedEnough && sanityWarnings.length <= 1;
  const promotionVerdict =
    improved && after.readinessStatus === "green" && after.readinessScore >= Math.max(70, before.readinessScore)
      ? "paper_demo_review_candidate" as const
      : improved && after.stabilityScore >= before.stabilityScore + 20
        ? "strong_research_candidate" as const
        : improved
          ? "research_candidate" as const
          : stabilityImproved && (criticalRegressions.length > 0 || sanityWarnings.length > 0)
            ? "needs_follow_up" as const
            : "reject" as const;
  const recommendation =
    promotionVerdict === "research_candidate" ||
    promotionVerdict === "strong_research_candidate" ||
    promotionVerdict === "paper_demo_review_candidate"
      ? "accept"
      : promotionVerdict === "needs_follow_up"
        ? "keep_testing"
        : "reject";
  const followUpSearchDirection =
    promotionVerdict === "needs_follow_up" || promotionVerdict === "reject"
      ? inferFollowUpSearchDirection([...criticalRegressions, ...sanityWarnings])
      : undefined;

  return {
    improved,
    stabilityImproved,
    recommendation,
    summary: improved
      ? "Candidate passed balanced promotion guards across stability, trade quality, sample size, and readiness."
      : recommendation === "keep_testing"
        ? "Candidate improved some stability metrics but has critical trade-quality regressions. Run a targeted follow-up before approval."
        : "Candidate did not pass balanced promotion guards.",
    positiveChanges,
    negativeChanges,
    neutralChanges,
    improvedMetrics,
    worsenedMetrics,
    criticalRegressions,
    sanityWarnings,
    promotionVerdict,
    followUpSearchDirection
  };
}
