import { safeArray } from "@/lib/utils";
import type {
  WalkForwardOverfitRisk,
  WalkForwardStabilitySummary,
  WalkForwardStabilityVerdict,
  WalkForwardWindowMetrics,
  WalkForwardWindowResult
} from "@/lib/walkForward/walkForwardTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return 0;
  }
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const consistencyScore = (values: number[], tolerance: number) => {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) {
    return clean.length ? 45 : 0;
  }
  const spread = Math.max(...clean) - Math.min(...clean);
  return clamp(100 - (spread / Math.max(tolerance, 0.0001)) * 100);
};

const oosMetrics = (windows: WalkForwardWindowResult[]) =>
  windows.map((window) => window.metricsBySplit.out_of_sample).filter(Boolean);

const windowScore = (metrics: WalkForwardWindowMetrics) =>
  clamp(
    metrics.readinessScore * 0.28 +
      metrics.confidenceCalibration * 100 * 0.18 +
      clamp(metrics.totalTrades / 8, 0, 1) * 100 * 0.16 +
      clamp((metrics.averageR + 0.3) / 0.9, 0, 1) * 100 * 0.16 +
      clamp(1 - metrics.maxDrawdownR / 8, 0, 1) * 100 * 0.14 +
      clamp(1 - metrics.falsePositiveCount / Math.max(1, metrics.totalTrades + metrics.falsePositiveCount), 0, 1) * 100 * 0.08
  );

const overfitRiskFor = (windows: WalkForwardWindowResult[], outOfSample: WalkForwardWindowMetrics[]): WalkForwardOverfitRisk => {
  const inSampleAverageR = average(windows.map((window) => window.metricsBySplit.in_sample.averageR));
  const oosAverageR = average(outOfSample.map((metrics) => metrics.averageR));
  const inSampleWinRate = average(windows.map((window) => window.metricsBySplit.in_sample.winRate));
  const oosWinRate = average(outOfSample.map((metrics) => metrics.winRate));
  const oosFailures = outOfSample.filter((metrics) => !metrics.pass).length;

  if (oosFailures >= Math.max(1, Math.ceil(outOfSample.length / 2)) || inSampleAverageR - oosAverageR > 0.45 || inSampleWinRate - oosWinRate > 0.28) {
    return "high";
  }
  if (oosFailures > 0 || inSampleAverageR - oosAverageR > 0.2 || inSampleWinRate - oosWinRate > 0.14) {
    return "medium";
  }
  return "low";
};

const verdictFor = (
  stabilityScore: number,
  outOfSamplePassRate: number,
  overfitRisk: WalkForwardOverfitRisk,
  windowCount: number,
  totalOosTrades: number
): WalkForwardStabilityVerdict => {
  if (stabilityScore >= 82 && outOfSamplePassRate >= 0.8 && overfitRisk === "low" && windowCount >= 3 && totalOosTrades >= 20) {
    return "paper_demo_review_candidate";
  }
  if (stabilityScore >= 68 && outOfSamplePassRate >= 0.67 && overfitRisk !== "high" && totalOosTrades >= 12) {
    return "robust_research";
  }
  if (stabilityScore >= 48 && outOfSamplePassRate >= 0.5 && overfitRisk !== "high") {
    return "promising";
  }
  return "fail";
};

export function analyzeWalkForwardStability(windowsInput: WalkForwardWindowResult[]): WalkForwardStabilitySummary {
  const windows = safeArray(windowsInput);
  const outOfSample = oosMetrics(windows);
  const winRates = outOfSample.map((metrics) => metrics.winRate);
  const averageRs = outOfSample.map((metrics) => metrics.averageR);
  const drawdowns = outOfSample.map((metrics) => metrics.maxDrawdownR);
  const tradeCounts = outOfSample.map((metrics) => metrics.totalTrades);
  const falsePositives = outOfSample.map((metrics) => metrics.falsePositiveCount);
  const readinessScores = outOfSample.map((metrics) => metrics.readinessScore);
  const outOfSampleWindowsPassed = outOfSample.filter((metrics) => metrics.pass).length;
  const windowsPassed = windows.filter((window) => window.verdict === "pass").length;
  const overfitRisk = overfitRiskFor(windows, outOfSample);
  const outOfSamplePassRate = outOfSampleWindowsPassed / Math.max(1, outOfSample.length);
  const totalOosTrades = outOfSample.reduce((sum, metrics) => sum + metrics.totalTrades, 0);
  const averageWinRate = average(winRates);
  const averageRConsistency = consistencyScore(averageRs, 0.45);
  const tradeCountConsistency = consistencyScore(tradeCounts, 12);
  const falsePositiveConsistency = consistencyScore(falsePositives, 12);
  const readinessConsistency = consistencyScore(readinessScores, 35);
  const stabilityScore = round(
    clamp(
      average(outOfSample.map(windowScore)) * 0.34 +
        averageRConsistency * 0.18 +
        tradeCountConsistency * 0.12 +
        falsePositiveConsistency * 0.12 +
        readinessConsistency * 0.14 +
        outOfSamplePassRate * 100 * 0.1 -
        (overfitRisk === "high" ? 22 : overfitRisk === "medium" ? 10 : 0)
    ),
    0
  );
  const verdict = verdictFor(stabilityScore, outOfSamplePassRate, overfitRisk, windows.length, totalOosTrades);
  const scoredWindows = windows.map((window) => ({
    windowId: window.windowId,
    score: windowScore(window.metricsBySplit.out_of_sample)
  }));
  const bestWindow = [...scoredWindows].sort((a, b) => b.score - a.score)[0];
  const worstWindow = [...scoredWindows].sort((a, b) => a.score - b.score)[0];
  const failReasons = [
    outOfSample.length < 2 ? "At least two out-of-sample windows are needed before trusting walk-forward stability." : undefined,
    totalOosTrades < 12 ? "Out-of-sample trade sample is too small." : undefined,
    outOfSamplePassRate < 0.5 ? "Most out-of-sample windows failed the stability gate." : undefined,
    overfitRisk === "high" ? "In-sample results degraded materially out-of-sample; overfit risk is high." : undefined,
    Math.min(...averageRs, 0) < -0.1 ? "Worst-window average R is too weak." : undefined
  ].filter((reason): reason is string => Boolean(reason));

  return {
    windowCount: windows.length,
    windowsPassed,
    outOfSampleWindowsPassed,
    averageWinRate: round(averageWinRate, 3),
    medianWinRate: round(median(winRates), 3),
    worstWindowWinRate: round(winRates.length ? Math.min(...winRates) : 0, 3),
    averageRConsistency: round(averageRConsistency, 0),
    worstWindowAverageR: round(averageRs.length ? Math.min(...averageRs) : 0, 2),
    worstWindowDrawdownR: round(drawdowns.length ? Math.max(...drawdowns) : 0, 2),
    tradeCountConsistency: round(tradeCountConsistency, 0),
    falsePositiveConsistency: round(falsePositiveConsistency, 0),
    readinessConsistency: round(readinessConsistency, 0),
    overfitRisk,
    stabilityScore,
    verdict,
    bestWindowId: bestWindow?.windowId,
    worstWindowId: worstWindow?.windowId,
    recommendedNextAction:
      verdict === "paper_demo_review_candidate"
        ? "Review readiness and proposal evidence manually. Broker execution remains disabled."
        : verdict === "robust_research"
          ? "Run another imported-data window or standard/deeper walk-forward pass before Paper-Demo Candidate review."
          : verdict === "promising"
            ? "Use the strongest out-of-sample window to guide a bounded calibration follow-up."
            : "Do not promote. Diagnose the weakest out-of-sample window and continue simulation research.",
    summary:
      verdict === "fail"
        ? "Walk-forward validation failed; one selected window is not enough evidence."
        : `Walk-forward validation is ${verdict.replace(/_/g, " ")} with ${overfitRisk} overfit risk.`,
    failReasons
  };
}
