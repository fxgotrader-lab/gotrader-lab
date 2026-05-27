import { runBacktest, type BacktestResult, type ResolvedBacktestConfig } from "@/lib/backtesting";
import {
  getImportedDataPreset,
  loadPreparedCandleSource
} from "@/lib/marketData";
import { resolveActiveBacktestConfig } from "@/lib/selfImprovement";
import { uid } from "@/lib/utils";
import {
  createWalkForwardWindows,
  resolveSplitRatio
} from "@/lib/walkForward/dataSplitter";
import { analyzeWalkForwardStability } from "@/lib/walkForward/stabilityAnalyzer";
import {
  saveWalkForwardProgress,
  saveWalkForwardRun
} from "@/lib/walkForward/walkForwardStorage";
import type {
  WalkForwardMode,
  WalkForwardRun,
  WalkForwardRunOptions,
  WalkForwardSplitLabel,
  WalkForwardWindowMetrics,
  WalkForwardWindowResult
} from "@/lib/walkForward/walkForwardTypes";

const now = () => new Date().toISOString();
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
const sleepFrame = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));

const modeMaxWindows: Record<WalkForwardMode, number> = {
  safe: 2,
  standard: 3,
  advanced: 5
};

const passFailReasonsFor = (metrics: WalkForwardWindowMetrics, split: WalkForwardSplitLabel) => [
  metrics.totalTrades < (split === "out_of_sample" ? 1 : 2) ? `${split.replace(/_/g, " ")} trade count too low.` : undefined,
  metrics.averageR < -0.1 ? `${split.replace(/_/g, " ")} average R is below -0.10R.` : undefined,
  metrics.maxDrawdownR > 6 ? `${split.replace(/_/g, " ")} drawdown exceeds 6R.` : undefined,
  metrics.confidenceCalibration < 0.4 ? `${split.replace(/_/g, " ")} confidence calibration is weak.` : undefined,
  metrics.readinessScore < 35 ? `${split.replace(/_/g, " ")} readiness score is too low.` : undefined
].filter((reason): reason is string => Boolean(reason));

const confidenceCalibrationFor = (result: BacktestResult) => {
  const directionalTrades = result.trades.filter((trade) => trade.bias !== "neutral");
  const wins = directionalTrades.filter((trade) => trade.outcome === "target_hit").length;
  const averageConfidence =
    directionalTrades.reduce((sum, trade) => sum + trade.confidence, 0) / Math.max(1, directionalTrades.length);
  const realizedWinRate = wins / Math.max(1, directionalTrades.length);
  return round(clamp(1 - Math.abs(averageConfidence - realizedWinRate)), 3);
};

const readinessScoreFor = (
  result: BacktestResult,
  confidenceCalibration: number,
  evidenceQualityScore: number
) => {
  const { summary } = result;
  const profitFactor = summary.profitFactor ?? 0;
  return round(
    clamp(
      summary.winRate * 0.22 +
        clamp((summary.averageR + 0.3) / 0.9) * 0.2 +
        clamp(Math.min(profitFactor, 3) / 3) * 0.14 +
        confidenceCalibration * 0.18 +
        clamp(summary.totalTrades / 8) * 0.14 +
        clamp(1 - summary.maxDrawdown / 8) * 0.08 +
        clamp(evidenceQualityScore / 100) * 0.04
    ) * 100,
    0
  );
};

const metricsFromBacktest = (
  result: BacktestResult,
  evidenceQualityScore: number,
  split: WalkForwardSplitLabel
): WalkForwardWindowMetrics => {
  const confidenceCalibration = confidenceCalibrationFor(result);
  const readinessScore = readinessScoreFor(result, confidenceCalibration, evidenceQualityScore);
  const falsePositiveCount = result.summary.losses + result.trades.filter((trade) => trade.outcome === "expired").length;
  const base: WalkForwardWindowMetrics = {
    totalTrades: result.summary.totalTrades,
    winRate: round(result.summary.winRate, 3),
    averageR: round(result.summary.averageR, 2),
    maxDrawdownR: round(result.summary.maxDrawdown, 2),
    profitFactor: result.summary.profitFactor,
    falsePositiveCount,
    skippedSignals: result.summary.skippedSignals,
    confidenceCalibration,
    readinessScore,
    evidenceQualityScore,
    pass: false,
    failReasons: []
  };
  const failReasons = passFailReasonsFor(base, split);
  return {
    ...base,
    pass: failReasons.length === 0,
    failReasons
  };
};

const configSummary = (config: ResolvedBacktestConfig): WalkForwardWindowResult["configUsed"] => ({
  symbol: config.symbol,
  timeframe: config.timeframe,
  minimumConfluenceThreshold: config.minimumConfluenceThreshold,
  minimumConfidenceThreshold: config.minimumConfidenceThreshold,
  sessionFilter: config.sessionFilter,
  targetRMultiple: config.targetRMultiple,
  stopModel: config.stopModel,
  allowLong: config.allowLong,
  allowShort: config.allowShort
});

export async function runWalkForwardValidation(options: WalkForwardRunOptions = {}): Promise<WalkForwardRun> {
  const started = Date.now();
  const runId = uid("walk_forward");
  const mode = options.mode ?? "safe";
  const source = await loadPreparedCandleSource();
  const activeConfig = resolveActiveBacktestConfig();
  const ratio = resolveSplitRatio(options.splitRatioPreset ?? "60_20_20", options.customRatio);
  const maxWindows = Math.max(1, Math.min(options.maxWindows ?? modeMaxWindows[mode], modeMaxWindows[mode]));
  const dataPreset = source.mode === "imported" ? getImportedDataPreset(source.appliedSettings) : "mock";
  const windows = createWalkForwardWindows({
    candles: source.candles,
    source,
    ratio,
    mode,
    maxWindows
  });
  const evidenceQualityScore = source.mode === "imported" ? 82 : 34;
  let run: WalkForwardRun = {
    runId,
    startedAt: now(),
    status: "running",
    mode,
    splitRatioPreset: ratio.preset,
    splitRatio: ratio,
    maxWindows,
    dataSource: source.mode,
    dataSourceLabel: source.label,
    dataPreset,
    symbol: source.metadata?.symbol ?? source.candles[0]?.symbol ?? activeConfig.config.symbol,
    contract: source.metadata?.contract,
    timeframe: source.appliedSettings.targetTimeframe,
    rawCandleCount: source.rawCandleCount,
    processedCandleCount: source.processedCandleCount,
    candleWindow: `${source.researchWindowCandles.toLocaleString()} raw / ${source.processedCandleCount.toLocaleString()} ${source.appliedSettings.targetTimeframe}`,
    activeCalibrationId: activeConfig.activeCalibrationId,
    configMergeStatus: activeConfig.mergeStatusLabel,
    proposalId: options.proposalId,
    windows: [],
    warnings: [
      source.mode !== "imported" ? "Walk-forward validation is most meaningful with imported historical OHLCV data; mock candles cap confidence." : undefined,
      windows.length < 2 ? "Only one walk-forward window could be created from the active candle window." : undefined
    ].filter((warning): warning is string => Boolean(warning)),
    safetyNotice: "Walk-forward validation is simulation-only. It cannot execute trades, enable demo/live mode, or override readiness."
  };

  const publishProgress = (message: string, currentWindow: number, currentSplit?: WalkForwardSplitLabel) => {
    run = {
      ...run,
      progress: {
        status: run.status,
        currentWindow,
        totalWindows: windows.length,
        currentSplit,
        currentWindowId: windows[currentWindow - 1]?.windowId,
        elapsedMs: Date.now() - started,
        message
      }
    };
    saveWalkForwardProgress(run);
    options.onProgress?.(run);
  };

  try {
    if (!windows.length) {
      throw new Error("No candles were available for walk-forward validation.");
    }

    for (const windowDefinition of windows) {
      if (options.signal?.aborted) {
        run = { ...run, status: "canceled", completedAt: now(), warnings: [...run.warnings, "Walk-forward run canceled by user."] };
        saveWalkForwardRun(run);
        return run;
      }
      publishProgress(`Running window ${windowDefinition.windowIndex}/${windowDefinition.totalWindows}.`, windowDefinition.windowIndex);
      await sleepFrame();

      const metricsBySplit = {} as WalkForwardWindowResult["metricsBySplit"];
      for (const split of windowDefinition.splits) {
        if (options.signal?.aborted) {
          run = { ...run, status: "canceled", completedAt: now(), warnings: [...run.warnings, "Walk-forward run canceled by user."] };
          saveWalkForwardRun(run);
          return run;
        }
        publishProgress(`Backtesting ${split.displayLabel.toLowerCase()} split.`, windowDefinition.windowIndex, split.label);
        await sleepFrame();
        const result = runBacktest(split.candles, activeConfig.config);
        metricsBySplit[split.label] = metricsFromBacktest(result, evidenceQualityScore, split.label);
      }

      const splitSummaries = windowDefinition.splits.map(({ candles, ...summary }) => summary);
      const failReasons = [
        ...metricsBySplit.in_sample.failReasons,
        ...metricsBySplit.validation.failReasons,
        ...metricsBySplit.out_of_sample.failReasons
      ];
      const verdict: WalkForwardWindowResult["verdict"] =
        metricsBySplit.out_of_sample.pass && metricsBySplit.validation.pass
          ? "pass"
          : metricsBySplit.out_of_sample.pass || metricsBySplit.validation.pass
            ? "warning"
            : "fail";
      run = {
        ...run,
        windows: [
          ...run.windows,
          {
            windowId: windowDefinition.windowId,
            windowIndex: windowDefinition.windowIndex,
            totalWindows: windowDefinition.totalWindows,
            splitSummaries,
            metricsBySplit,
            configUsed: configSummary(activeConfig.config),
            calibrationId: activeConfig.activeCalibrationId,
            verdict,
            failReasons,
            completedAt: now()
          }
        ]
      };
      saveWalkForwardProgress(run);
    }

    const stability = analyzeWalkForwardStability(run.windows);
    run = {
      ...run,
      status: stability.verdict === "fail" || run.warnings.length ? "completed_with_warnings" : "completed",
      completedAt: now(),
      stability,
      progress: {
        status: stability.verdict === "fail" || run.warnings.length ? "completed_with_warnings" : "completed",
        currentWindow: windows.length,
        totalWindows: windows.length,
        elapsedMs: Date.now() - started,
        message: stability.summary
      }
    };
    saveWalkForwardRun(run);
    options.onProgress?.(run);
    return run;
  } catch (error) {
    run = {
      ...run,
      status: "failed",
      completedAt: now(),
      error: error instanceof Error ? error.message : String(error),
      progress: {
        status: "failed",
        currentWindow: run.windows.length,
        totalWindows: windows.length,
        elapsedMs: Date.now() - started,
        message: "Walk-forward validation failed safely."
      }
    };
    saveWalkForwardRun(run);
    options.onProgress?.(run);
    return run;
  }
}
