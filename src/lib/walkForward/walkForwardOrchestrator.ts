import { runBacktest, type BacktestResult, type ResolvedBacktestConfig } from "@/lib/backtesting";
import {
  buildMarketContext,
  getImportedDataPreset,
  getWalkForwardDataPreset
} from "@/lib/marketData";
import { classifyMarketRegime } from "@/lib/regime";
import type { RegimeClassification } from "@/lib/regime";
import { resolveActiveBacktestConfig } from "@/lib/selfImprovement";
import type { GrinchActiveProfile } from "@/lib/strategyLibrary";
import { uid } from "@/lib/utils";
import {
  createWalkForwardWindows,
  resolveSplitRatio,
  walkForwardModeWindowSize
} from "@/lib/walkForward/dataSplitter";
import { buildWalkForwardPreflight } from "@/lib/walkForward/walkForwardPreflight";
import { analyzeWalkForwardStability } from "@/lib/walkForward/stabilityAnalyzer";
import {
  saveWalkForwardProgress,
  saveWalkForwardRun
} from "@/lib/walkForward/walkForwardStorage";
import { loadPreparedCanonicalWalkForwardCandleSource } from "@/lib/walkForward/walkForwardSourceResolver";
import type {
  WalkForwardMode,
  WalkForwardRun,
  WalkForwardRunOptions,
  WalkForwardSplitLabel,
  WalkForwardWindowMetrics,
  WalkForwardWindowVerdict,
  WalkForwardWindowResult
} from "@/lib/walkForward/walkForwardTypes";

const now = () => new Date().toISOString();
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
const sleepFrame = () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));

const modeMaxWindows: Record<WalkForwardMode, number> = {
  safe: 3,
  standard: 5,
  advanced: 5
};
const DEFAULT_MINIMUM_WINDOWS = 3;
const DEFAULT_MINIMUM_OOS_TRADES_PER_WINDOW = 5;
const DEFAULT_MINIMUM_TOTAL_OOS_TRADES = 20;

const marketContextModeFor = (sourceMode: string) =>
  sourceMode === "imported" ? "imported" as const : sourceMode === "mt5_read_only" ? "future_provider" as const : "mock" as const;

const evidenceQualityScoreFor = (sourceMode: string) =>
  sourceMode === "imported" ? 82 : sourceMode === "mt5_read_only" ? 52 : 34;

const passFailReasonsFor = (metrics: WalkForwardWindowMetrics, split: WalkForwardSplitLabel) => [
  metrics.totalTrades < (split === "out_of_sample" ? DEFAULT_MINIMUM_OOS_TRADES_PER_WINDOW : 2)
    ? `${split.replace(/_/g, " ")} trade count too low.`
    : undefined,
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
  split: WalkForwardSplitLabel,
  regime?: RegimeClassification
): WalkForwardWindowMetrics => {
  const confidenceCalibration = confidenceCalibrationFor(result);
  const readinessScore = readinessScoreFor(result, confidenceCalibration, evidenceQualityScore);
  const falsePositiveCount = result.summary.losses + result.trades.filter((trade) => trade.outcome === "expired").length;
  const latestGrinchScore = result.summary.grinchSummary?.latestScore;
  const profileProducedTrade = result.summary.grinchSummary?.tradeProfileCounts
    ? ((Object.entries(result.summary.grinchSummary.tradeProfileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none") as GrinchActiveProfile)
    : "none";
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
    failReasons: [],
    regimeMetrics: regime
      ? {
          label: regime.stableLabel,
          instantaneousLabel: regime.instantaneousLabel,
          confidence: regime.confidence,
          dataQuality: regime.dataQuality,
          transitionPending: regime.transitionPending,
          conflictScore: regime.conflictScore,
          topFactors: regime.supportingFactors.slice(0, 4)
        }
      : undefined,
    grinchMetrics: latestGrinchScore
      ? {
          profileDetected: latestGrinchScore.activeProfile,
          profileProducedTrade,
          profileValidity: latestGrinchScore.profileValidity,
          grinchScore: result.summary.grinchSummary?.averageGrinchModelScore ?? latestGrinchScore.grinchModelScore,
          timeAlignment: latestGrinchScore.timingAlignment,
          pdAlignment: latestGrinchScore.pdArrayHierarchyAlignment,
          openingPriceAlignment: latestGrinchScore.openingPriceAlignment,
          smtState: latestGrinchScore.smtState,
          falsePositiveRisk: result.summary.grinchSummary?.averageFalsePositiveRisk ?? latestGrinchScore.falsePositiveRisk
        }
      : undefined
  };
  const failReasons = passFailReasonsFor(base, split);
  return {
    ...base,
    pass: failReasons.length === 0,
    failReasons
  };
};

const regimeSegmentsFor = (windows: WalkForwardWindowResult[]) => {
  const byLabel = new Map<string, { oosTrades: number; outOfSampleWindowsPassed: number; winRateSum: number; windowCount: number }>();
  windows.forEach((window) => {
    const oos = window.metricsBySplit.out_of_sample;
    const label = oos.regimeMetrics?.label ?? "insufficient_data";
    const current = byLabel.get(label) ?? { oosTrades: 0, outOfSampleWindowsPassed: 0, winRateSum: 0, windowCount: 0 };
    byLabel.set(label, {
      oosTrades: current.oosTrades + oos.totalTrades,
      outOfSampleWindowsPassed: current.outOfSampleWindowsPassed + (oos.pass ? 1 : 0),
      winRateSum: current.winRateSum + oos.winRate,
      windowCount: current.windowCount + 1
    });
  });
  return Array.from(byLabel.entries()).map(([label, item]) => ({
    label: label as ReturnType<typeof classifyMarketRegime>["stableLabel"],
    windowCount: item.windowCount,
    oosTrades: item.oosTrades,
    averageOosWinRate: round(item.winRateSum / Math.max(1, item.windowCount), 3),
    outOfSampleWindowsPassed: item.outOfSampleWindowsPassed
  }));
};

const attachOosVerdict = (
  metrics: WalkForwardWindowMetrics,
  verdict: WalkForwardWindowVerdict
): WalkForwardWindowMetrics => ({
  ...metrics,
  grinchMetrics: metrics.grinchMetrics ? { ...metrics.grinchMetrics, oosResult: verdict } : undefined
});

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
  const source = await loadPreparedCanonicalWalkForwardCandleSource(undefined, {
    allowMt5DeepHistory: Boolean(options.useDeepMt5History),
    requestedLookbackDays: 90
  });
  const activeConfig = resolveActiveBacktestConfig();
  const ratio = resolveSplitRatio(options.splitRatioPreset ?? "60_20_20", options.customRatio);
  const requestedMaxWindows = Math.max(1, options.maxWindows ?? modeMaxWindows[mode]);
  const maxWindows = Math.max(1, Math.min(requestedMaxWindows, modeMaxWindows[mode]));
  const dataPreset = source.mode === "imported" ? getImportedDataPreset(source.appliedSettings) : source.mode === "mt5_read_only" ? "custom" : "mock";
  const walkForwardDataPreset = source.mode === "imported" ? getWalkForwardDataPreset(source.appliedSettings) : "custom";
  const windows = createWalkForwardWindows({
    candles: source.candles,
    source,
    ratio,
    mode,
    maxWindows
  });
  const windowGenerationNotes = [
    requestedMaxWindows !== maxWindows
      ? `${mode} mode capped requested windows from ${requestedMaxWindows} to ${maxWindows}.`
      : undefined,
    windows.length < maxWindows && source.processedCandleCount <= walkForwardModeWindowSize[mode]
      ? `Only ${windows.length} rolling window could be created because ${source.processedCandleCount.toLocaleString()} processed candles are at or below the ${mode} window size of ${walkForwardModeWindowSize[mode].toLocaleString()}.`
      : undefined,
    windows.length < maxWindows && source.processedCandleCount > walkForwardModeWindowSize[mode]
      ? `Only ${windows.length}/${maxWindows} rolling windows could be created from the active candle window and split settings.`
      : undefined,
    windows.length < DEFAULT_MINIMUM_WINDOWS
      ? "Use Standard preset, a larger raw candle window, or adjusted split settings to reach the preferred 3 windows."
      : undefined
  ].filter((note): note is string => Boolean(note));
  const preflight = buildWalkForwardPreflight({
    source,
    windows,
    validationChainEntry: options.validationChainEntry,
    requireReplayHandoff: Boolean(options.requireReplayHandoff),
    minimumCandidates: options.minimumReplayCandidates ?? DEFAULT_MINIMUM_TOTAL_OOS_TRADES,
    minimumReplayPassedCandidates: options.minimumReplayPassedCandidates ?? DEFAULT_MINIMUM_TOTAL_OOS_TRADES,
    minimumUniqueTradingDates: options.minimumUniqueTradingDates ?? 3,
    minimumWindows: options.minimumWindows ?? DEFAULT_MINIMUM_WINDOWS,
    minimumOosTrades: options.minimumTotalOosTrades ?? DEFAULT_MINIMUM_TOTAL_OOS_TRADES
  });
  const evidenceQualityScore = evidenceQualityScoreFor(source.mode);
  let run: WalkForwardRun = {
    runId,
    startedAt: now(),
    status: "running",
    mode,
    splitRatioPreset: ratio.preset,
    splitRatio: ratio,
    maxWindows,
    requestedMaxWindows,
    actualWindowsGenerated: windows.length,
    windowGenerationNotes,
    walkForwardDataPreset,
    dataSource: source.mode,
    dataSourceLabel: source.label,
    dataPreset,
    sourceProvider: source.provider,
    sourceFingerprint: source.sourceFingerprint,
    sourceDataQuality: source.dataQuality,
    sourceWarnings: source.sourceWarnings,
    preflight,
    providerSymbol: source.brokerSymbol,
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
      source.mode === "mt5_read_only"
        ? "Walk-forward validation is using MT5 read-only provider/proxy data. Imported historical remains preferred before promotion."
        : source.mode !== "imported"
          ? "Walk-forward validation is most meaningful with imported historical OHLCV data; mock candles cap confidence."
          : undefined,
      windows.length < DEFAULT_MINIMUM_WINDOWS
        ? `Only ${windows.length} walk-forward window(s) could be created; ${DEFAULT_MINIMUM_WINDOWS} are preferred before judging strategy quality.`
        : undefined,
      ...source.sourceWarnings
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
    publishProgress(
      preflight.status === "ready"
        ? "Walk-forward preflight passed. Starting compact rolling-window validation."
        : `Walk-forward preflight blocked: ${preflight.blockers[0]?.message ?? "requirements are missing"}`,
      0
    );
    await sleepFrame();

    if (preflight.status === "blocked") {
      const stability = analyzeWalkForwardStability([], run.runId, {
        requestedMaxWindows,
        actualWindowsGenerated: windows.length,
        minimumWindows: options.minimumWindows ?? DEFAULT_MINIMUM_WINDOWS,
        preferredWindows: DEFAULT_MINIMUM_WINDOWS,
        minimumOosTradesPerWindow: options.minimumOosTradesPerWindow ?? DEFAULT_MINIMUM_OOS_TRADES_PER_WINDOW,
        minimumTotalOosTrades: options.minimumTotalOosTrades ?? DEFAULT_MINIMUM_TOTAL_OOS_TRADES,
        windowGenerationNotes: [
          ...windowGenerationNotes,
          ...preflight.blockers.map((item) => item.message)
        ]
      });
      const preflightSummary = preflight.blockers[0]?.message ?? "Walk-forward preflight requirements are missing.";
      run = {
        ...run,
        status: "completed_with_warnings",
        completedAt: now(),
        stability: {
          ...stability,
          summary: `Walk-forward did not run because ${preflightSummary}`,
          recommendedNextAction: preflight.nextAction,
          evidenceSummary: stability.evidenceSummary
            ? {
                ...stability.evidenceSummary,
                insufficientEvidenceReasons: preflight.blockers.map((item) => item.message)
              }
            : stability.evidenceSummary
        },
        failureDiagnostics: stability.diagnostics
          ? {
              ...stability.diagnostics,
              repeatedFailureReasons: preflight.blockers.map((item) => item.message),
              summary: `Preflight blocked walk-forward: ${preflightSummary}`
            }
          : undefined,
        followUpPlan: stability.followUpPlan,
        progress: {
          status: "completed_with_warnings",
          currentWindow: 0,
          totalWindows: windows.length,
          elapsedMs: Date.now() - started,
          message: preflight.nextAction
        }
      };
      saveWalkForwardRun(run);
      options.onProgress?.(run);
      return run;
    }

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
        const splitMarketContext = buildMarketContext({
          symbol: split.symbol,
          timeframe: split.aggregateTimeframe,
          mode: marketContextModeFor(source.mode),
          candles: split.candles
        });
        const splitRegime = classifyMarketRegime({
          candles: split.candles,
          marketContext: splitMarketContext,
          symbol: split.symbol,
          timeframe: split.aggregateTimeframe
        });
        const result = runBacktest(split.candles, activeConfig.config);
        metricsBySplit[split.label] = metricsFromBacktest(result, evidenceQualityScore, split.label, splitRegime);
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
      metricsBySplit.out_of_sample = attachOosVerdict(metricsBySplit.out_of_sample, verdict);
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

    const stability = analyzeWalkForwardStability(run.windows, run.runId, {
      requestedMaxWindows,
      actualWindowsGenerated: windows.length,
      minimumWindows: options.minimumWindows ?? DEFAULT_MINIMUM_WINDOWS,
      preferredWindows: DEFAULT_MINIMUM_WINDOWS,
      minimumOosTradesPerWindow: options.minimumOosTradesPerWindow ?? DEFAULT_MINIMUM_OOS_TRADES_PER_WINDOW,
      minimumTotalOosTrades: options.minimumTotalOosTrades ?? DEFAULT_MINIMUM_TOTAL_OOS_TRADES,
      windowGenerationNotes
    });
    const regimeSegments = regimeSegmentsFor(run.windows);
    run = {
      ...run,
      status: stability.verdict === "fail" || stability.verdict === "insufficient_evidence" || run.warnings.length ? "completed_with_warnings" : "completed",
      completedAt: now(),
      stability: {
        ...stability,
        regimeSegments
      },
      failureDiagnostics: stability.diagnostics,
      followUpPlan: stability.followUpPlan,
      progress: {
        status: stability.verdict === "fail" || stability.verdict === "insufficient_evidence" || run.warnings.length ? "completed_with_warnings" : "completed",
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
