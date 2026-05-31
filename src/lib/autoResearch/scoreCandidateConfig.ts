import { defaultAutoResearchScoringCriteria } from "@/lib/autoResearch/configSearchSpace";
import type {
  AutoResearchScoreBreakdown,
  AutoResearchScoringCriteria
} from "@/lib/autoResearch/autoResearchTypes";
import type { CalibrationProposalMetrics } from "@/lib/selfImprovement";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { GrinchStrategyScore } from "@/lib/strategyLibrary";
import type { ValidationSuiteReport } from "@/lib/validation";

const round = (value: number, digits = 0) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const scoreProfitFactor = (profitFactor: number | null) => {
  if (profitFactor === null) {
    return 35;
  }
  return clamp((Math.min(profitFactor, 3) / 3) * 100);
};

const sessionConsistencyScore = (quality: ResearchQualityReview) => {
  if (!quality.sessionComparison.length) {
    return 0;
  }
  const usable = quality.sessionComparison.filter(
    (session) => session.readiness !== "red" && session.totalTrades > 0 && session.averageR >= -0.1
  ).length;
  return clamp((usable / quality.sessionComparison.length) * 100);
};

const robustnessScore = (validation: ValidationSuiteReport) => {
  const nonRed = validation.scenarios.filter((scenario) => scenario.readiness !== "red").length;
  const averageScenarioScore =
    validation.scenarios.reduce((sum, scenario) => sum + scenario.score, 0) / Math.max(1, validation.scenarios.length);
  return clamp(averageScenarioScore * 0.6 + (nonRed / Math.max(1, validation.scenarios.length)) * 40);
};

export function scoreCandidateConfig({
  baselineMetrics,
  metrics,
  validation,
  quality,
  grinchScore,
  scoringCriteria = defaultAutoResearchScoringCriteria
}: {
  baselineMetrics: CalibrationProposalMetrics;
  metrics: CalibrationProposalMetrics;
  validation: ValidationSuiteReport;
  quality: ResearchQualityReview;
  grinchScore?: GrinchStrategyScore;
  scoringCriteria?: AutoResearchScoringCriteria;
}): AutoResearchScoreBreakdown {
  const drawdownScore = clamp(100 - metrics.maxDrawdown * 14);
  const averageRScore = clamp(((metrics.averageR + 0.4) / 1.4) * 100);
  const winRateScore = clamp(metrics.winRate * 100);
  const falsePositiveScore = clamp(100 - metrics.falsePositiveCount * 12);
  const confidenceCalibrationScore = clamp(metrics.confidenceCalibration * 100);
  const sessionScore = sessionConsistencyScore(quality);
  const tradeCountScore = clamp((metrics.totalTrades / 8) * 100);
  const skippedSignalBalanceScore = clamp(
    (metrics.totalTrades / Math.max(1, metrics.totalTrades + metrics.skippedSignals)) * 100
  );
  const profitFactorScore = scoreProfitFactor(metrics.profitFactor);
  const robustScore = robustnessScore(validation);
  const grinchModelScore = grinchScore?.grinchModelScore ?? 50;
  const grinchPenalty = grinchScore
    ? Math.min(
        28,
        grinchScore.falsePositiveRisk * 0.08 +
          (grinchScore.setupQuality === "blocked" ? 14 : grinchScore.setupQuality === "low_probability" ? 6 : 0) +
          ((grinchScore.falsePositiveBlockers ?? []).includes("missing_intermarket_confirmation") ? 3 : 0)
      )
    : 0;
  const weights = scoringCriteria.weights;
  const totalScore = round(
    drawdownScore * weights.lowerMaxDrawdown +
      averageRScore * weights.betterAverageR +
      winRateScore * weights.acceptableWinRate +
      falsePositiveScore * weights.lowerFalsePositives +
      confidenceCalibrationScore * weights.confidenceCalibration +
      sessionScore * weights.sessionConsistency +
      tradeCountScore * weights.sufficientTradeCount +
      skippedSignalBalanceScore * weights.skippedSignalBalance +
      profitFactorScore * weights.profitFactor +
      robustScore * weights.robustnessAcrossScenarios +
      grinchModelScore * weights.grinchModelSupport -
      grinchPenalty
  );
  const stabilityImproved =
    metrics.maxDrawdown <= baselineMetrics.maxDrawdown &&
    metrics.confidenceCalibration >= baselineMetrics.confidenceCalibration - 0.03 &&
    metrics.falsePositiveCount <= baselineMetrics.falsePositiveCount + 1;
  const sufficientSample = metrics.totalTrades >= 2 && metrics.totalTrades >= Math.max(2, baselineMetrics.totalTrades * 0.35);

  return {
    totalScore,
    drawdownScore: round(drawdownScore),
    averageRScore: round(averageRScore),
    winRateScore: round(winRateScore),
    falsePositiveScore: round(falsePositiveScore),
    confidenceCalibrationScore: round(confidenceCalibrationScore),
    sessionConsistencyScore: round(sessionScore),
    tradeCountScore: round(tradeCountScore),
    skippedSignalBalanceScore: round(skippedSignalBalanceScore),
    profitFactorScore: round(profitFactorScore),
    robustnessScore: round(robustScore),
    grinchModelScore: grinchScore ? round(grinchModelScore) : undefined,
    grinchFalsePositiveRisk: grinchScore ? round(grinchScore.falsePositiveRisk) : undefined,
    grinchProfileValidity: grinchScore ? round(grinchScore.profileValidity) : undefined,
    stabilityImproved,
    sufficientSample,
    rationale: stabilityImproved
      ? grinchScore
        ? `Candidate preserved or improved stability; Grinch support ${round(grinchModelScore)}/100 with false-positive risk ${round(grinchScore.falsePositiveRisk)}/100.`
        : "Candidate preserved or improved stability before profit was considered."
      : grinchScore
        ? `Candidate did not improve the stability-first gate enough; Grinch support ${round(grinchModelScore)}/100 is supporting evidence only.`
        : "Candidate did not improve the stability-first gate enough to auto-select confidently."
  };
}
