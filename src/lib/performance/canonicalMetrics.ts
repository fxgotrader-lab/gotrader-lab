import type { ResearchCycleRun } from "@/lib/researchCycle/researchCycleTypes";
import { summarizeValidationMetrics } from "@/lib/selfImprovement";
import type { ValidationSuiteReport } from "@/lib/validation";

import {
  DEFAULT_SIMULATED_RISK_PER_R,
  DEFAULT_SIMULATED_STARTING_BALANCE
} from "./simulatedAccount";

export interface CanonicalPerformanceMetrics {
  sourceCycleId: string;
  sourceProposalId?: string;
  dataSource: string;
  symbol: string;
  timeframe: string;
  candleWindow: string;
  rawCandleCount: number;
  processedCandleCount: number;
  startingBalance: number;
  currentBalance: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  riskDollarsPerR: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageR: number;
  realizedR: number;
  maxDrawdownR: number;
  maxDrawdownDollars: number;
  profitFactor: number | null;
  bestTradeR: number | null;
  worstTradeR: number | null;
  falsePositiveCount: number;
  skippedSignals: number;
  confidenceCalibration: number;
  readinessScore: number;
  stabilityScore: number;
  generatedAt: string;
  activeCalibrationId?: string;
  sourceMode?: string;
  metricSourceLabel: string;
  pnlAssumption: string;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const candleWindowLabel = (run: ResearchCycleRun) => {
  const raw = typeof run.researchWindowCandles === "number" ? `${run.researchWindowCandles.toLocaleString()} raw` : "unknown raw";
  const processed = typeof run.processedCandleCount === "number" ? `${run.processedCandleCount.toLocaleString()} processed` : "unknown processed";
  return `${raw} / ${processed} ${run.researchTimeframe ?? "candles"}`;
};

export function buildCanonicalPerformanceMetricsFromRun(
  run?: ResearchCycleRun,
  validationReport?: ValidationSuiteReport,
  startingBalance = DEFAULT_SIMULATED_STARTING_BALANCE
): CanonicalPerformanceMetrics | undefined {
  if (!run?.backtestSummary) {
    return undefined;
  }

  const summary = run.backtestSummary;
  const validationMetrics = validationReport ? summarizeValidationMetrics(validationReport) : undefined;
  const riskDollarsPerR = round(startingBalance * DEFAULT_SIMULATED_RISK_PER_R);
  const realizedR = summary.realizedR ?? round(summary.averageR * summary.totalTrades);
  const realizedPnL = round(realizedR * riskDollarsPerR);
  const currentBalance = round(startingBalance + realizedPnL);
  const maxDrawdownDollars = round(summary.maxDrawdown * riskDollarsPerR);
  const generatedAt = run.completedAt ?? run.startedAt;

  return {
    sourceCycleId: run.cycleId,
    sourceProposalId: run.createdProposalId,
    dataSource: run.dataSourceLabel ?? (run.dataSourceMode === "imported" ? "Imported historical data" : "Mock candles"),
    symbol: summary.config.symbol,
    timeframe: run.researchTimeframe ?? summary.config.timeframe,
    candleWindow: candleWindowLabel(run),
    rawCandleCount: run.rawCandleCount ?? 0,
    processedCandleCount: run.processedCandleCount ?? 0,
    startingBalance,
    currentBalance,
    realizedPnL,
    realizedPnLPercent: round(realizedPnL / startingBalance, 4),
    riskDollarsPerR,
    totalTrades: summary.totalTrades,
    winningTrades: summary.wins ?? Math.round(summary.winRate * summary.totalTrades),
    losingTrades: summary.losses ?? Math.max(0, summary.totalTrades - Math.round(summary.winRate * summary.totalTrades)),
    winRate: summary.winRate,
    averageR: summary.averageR,
    realizedR,
    maxDrawdownR: summary.maxDrawdown,
    maxDrawdownDollars,
    profitFactor: summary.profitFactor,
    bestTradeR: summary.bestTradeR ?? null,
    worstTradeR: summary.worstTradeR ?? null,
    falsePositiveCount: validationMetrics?.falsePositiveCount ?? 0,
    skippedSignals: summary.skippedSignals,
    confidenceCalibration: validationMetrics?.confidenceCalibration ?? 0,
    readinessScore: validationMetrics?.readinessScore ?? run.validationSummary?.readinessScore ?? 0,
    stabilityScore: validationMetrics?.stabilityScore ?? 0,
    generatedAt,
    activeCalibrationId: run.activeCalibrationId,
    sourceMode: run.dataSourceMode,
    metricSourceLabel: `latest research cycle ${run.cycleId}`,
    pnlAssumption: `Estimated simulation P&L using $${riskDollarsPerR.toLocaleString()} per 1R on a $${startingBalance.toLocaleString()} starting balance.`
  };
}

export function canonicalMetricsForRun(run?: ResearchCycleRun): CanonicalPerformanceMetrics | undefined {
  return run?.canonicalMetrics ?? buildCanonicalPerformanceMetricsFromRun(run);
}

export function normalizeCycleMetricsForDisplay(
  run?: ResearchCycleRun,
  validationReport?: ValidationSuiteReport
): CanonicalPerformanceMetrics | undefined {
  return run?.canonicalMetrics ?? buildCanonicalPerformanceMetricsFromRun(run, validationReport);
}

type MetricKey = keyof Pick<
  CanonicalPerformanceMetrics,
  | "totalTrades"
  | "winRate"
  | "averageR"
  | "maxDrawdownR"
  | "profitFactor"
  | "realizedPnL"
  | "falsePositiveCount"
  | "skippedSignals"
  | "confidenceCalibration"
  | "readinessScore"
  | "stabilityScore"
>;

const metricKeys: MetricKey[] = [
  "totalTrades",
  "winRate",
  "averageR",
  "maxDrawdownR",
  "profitFactor",
  "realizedPnL",
  "falsePositiveCount",
  "skippedSignals",
  "confidenceCalibration",
  "readinessScore",
  "stabilityScore"
];

const valuesEqual = (left: unknown, right: unknown) => {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 0.000001;
  }
  return left === right;
};

export function detectCanonicalMetricsMismatch(
  stored?: CanonicalPerformanceMetrics,
  derived?: CanonicalPerformanceMetrics
) {
  if (!stored || !derived) {
    return [];
  }
  if (stored === derived) {
    return [];
  }
  if (stored.sourceCycleId !== derived.sourceCycleId) {
    return ["Stored canonical metrics and derived metrics point to different cycle IDs."];
  }
  return metricKeys
    .filter((key) => !valuesEqual(stored[key], derived[key]))
    .map((key) => `Canonical ${String(key)} differs from derived latest-cycle summary.`);
}
