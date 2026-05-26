import type {
  BacktestResult,
  ResolvedBacktestConfig
} from "@/lib/backtesting/backtestTypes";
import type { Candle, TradeThesis } from "@/lib/types";
import { safeArray } from "@/lib/utils";

export type TradeGenerationReasonCode =
  | "no_candles_available"
  | "no_ict_context_generated"
  | "no_thesis_generated"
  | "thesis_signal_neutral"
  | "entry_zone_missing"
  | "invalidation_missing"
  | "target_missing"
  | "confluence_threshold_too_high"
  | "confidence_threshold_too_high"
  | "session_filter_excluded_setups"
  | "direction_filter_excluded_setups"
  | "stop_model_prevented_trade_plan"
  | "resolution_window_too_short"
  | "insufficient_mock_data"
  | "signal_not_converted_to_trade";

export type TradeGenerationDiagnosticSeverity = "info" | "warning" | "blocking";

export interface TradeGenerationDiagnostic {
  reasonCode: TradeGenerationReasonCode;
  currentValue: string;
  requiredOrSuggestedValue: string;
  explanation: string;
  suggestedFix: string;
  severity: TradeGenerationDiagnosticSeverity;
  observedConfluenceScore?: number;
  activeConfluenceThreshold?: number;
  suggestedConfluenceThreshold?: number;
  thresholdCalculation?: string;
}

const diagnostic = (
  reasonCode: TradeGenerationReasonCode,
  currentValue: string,
  requiredOrSuggestedValue: string,
  explanation: string,
  suggestedFix: string,
  severity: TradeGenerationDiagnosticSeverity,
  metadata: Partial<Pick<
    TradeGenerationDiagnostic,
    "observedConfluenceScore" | "activeConfluenceThreshold" | "suggestedConfluenceThreshold" | "thresholdCalculation"
  >> = {}
): TradeGenerationDiagnostic => ({
  reasonCode,
  currentValue,
  requiredOrSuggestedValue,
  explanation,
  suggestedFix,
  severity,
  ...metadata
});

const hasFiniteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

const reasonCount = (result: BacktestResult | undefined, pattern: string) =>
  safeArray(result?.summary.skipReasons)
    .filter((item) => item.reason.toLowerCase().includes(pattern))
    .reduce((sum, item) => sum + item.count, 0);

const firstPlan = (result?: BacktestResult, thesis?: TradeThesis) =>
  thesis?.simulatedTradePlan ?? safeArray(result?.decisions)[0]?.thesis.simulatedTradePlan;

export function diagnoseTradeGeneration({
  candles,
  config,
  result,
  thesis
}: {
  candles: Candle[];
  config: ResolvedBacktestConfig;
  result?: BacktestResult;
  thesis?: TradeThesis;
}): TradeGenerationDiagnostic[] {
  const diagnostics: TradeGenerationDiagnostic[] = [];
  const candleCount = safeArray(candles).length;
  const resultCandles = safeArray(result?.candles);
  const decisions = safeArray(result?.decisions);
  const skippedSignals = result?.summary.skippedSignals ?? safeArray(result?.skippedSignals).length;
  const trades = result?.summary.totalTrades ?? safeArray(result?.trades).length;
  const plan = firstPlan(result, thesis);
  const nonNeutralDecisions = decisions.filter((decision) => decision.thesis.finalBias !== "neutral");
  const sessionSkips = reasonCount(result, "session filter");
  const confluenceSkips = reasonCount(result, "ict confluence");
  const confidenceSkips = reasonCount(result, "cio confidence");
  const directionSkips = reasonCount(result, "disabled");
  const neutralSkips = reasonCount(result, "neutral");
  const requiredCandles = config.warmupCandles + config.decisionInterval + Math.max(1, config.maxBarsToResolveTrade);
  const confluenceSkippedSignals = safeArray(result?.skippedSignals).filter((skip) =>
    skip.reason.toLowerCase().includes("ict confluence")
  );
  const observedConfluenceScore = Math.max(
    0,
    ...confluenceSkippedSignals.map((skip) => skip.confluenceScore),
    ...nonNeutralDecisions.map((decision) => decision.ictContext.confluenceScore)
  );
  const suggestedConfluenceThreshold = observedConfluenceScore > 0
    ? Math.min(
        Math.max(0.4, Number((observedConfluenceScore - 0.03).toFixed(2))),
        Number(Math.max(0.01, config.minimumConfluenceThreshold - 0.01).toFixed(2))
      )
    : Number(Math.max(0.4, config.minimumConfluenceThreshold - 0.08).toFixed(2));
  const confluenceThresholdCalculation = observedConfluenceScore > 0
    ? `max(40%, observed ${(observedConfluenceScore * 100).toFixed(0)}% - 3%) capped below active ${(config.minimumConfluenceThreshold * 100).toFixed(0)}%`
    : `observed confluence unavailable; bounded fallback below active ${(config.minimumConfluenceThreshold * 100).toFixed(0)}% with 40% floor`;

  if (!candleCount) {
    diagnostics.push(
      diagnostic(
        "no_candles_available",
        "0 candles",
        "mock OHLC candles available",
        "The backtest cannot build ICT context or theses without mock candle data.",
        "Load or regenerate the mock candle dataset before running validation.",
        "blocking"
      )
    );
  }

  if (candleCount && resultCandles.length < requiredCandles) {
    diagnostics.push(
      diagnostic(
        "insufficient_mock_data",
        `${resultCandles.length || candleCount} candles; needs about ${requiredCandles}`,
        `>= ${requiredCandles} candles for warmup, decisions, and resolution`,
        "The mock dataset is too short for the current warmup, decision interval, and max bars to resolve.",
        "Lower warmup/decision interval for research, extend max mock candles, or use a shorter resolution window.",
        "blocking"
      )
    );
  }

  if (result && !decisions.length) {
    diagnostics.push(
      diagnostic(
        "no_thesis_generated",
        "0 decision theses",
        "at least one decision thesis after warmup",
        "The backtest loop did not reach a decision point, so no thesis could be evaluated.",
        "Reduce warmup candles or decision interval, or use more mock candles.",
        "blocking"
      )
    );
    diagnostics.push(
      diagnostic(
        "no_ict_context_generated",
        "0 ICT contexts",
        "at least one ICT context at a decision point",
        "ICT context is built inside each decision point; no decisions means no ICT context was generated.",
        "Reduce warmup candles or add mock candles, then rerun the backtest.",
        "blocking"
      )
    );
  }

  if (result && decisions.length && neutralSkips > 0 && neutralSkips === skippedSignals) {
    diagnostics.push(
      diagnostic(
        "thesis_signal_neutral",
        `${neutralSkips}/${skippedSignals} skipped signals were neutral`,
        "directional bullish or bearish thesis",
        "The CIO layer produced neutral theses, so the backtest correctly refused to score trades.",
        "Review ICT bias, agent weights, and confluence scoring before lowering thresholds.",
        "blocking"
      )
    );
  }

  if (plan && (!Array.isArray(plan.entryZone) || plan.entryZone.length !== 2 || plan.entryZone.some((value) => !hasFiniteNumber(value)))) {
    diagnostics.push(
      diagnostic(
        "entry_zone_missing",
        JSON.stringify(plan.entryZone ?? null),
        "finite [low, high] entry zone",
        "A simulated trade needs a valid entry zone before it can be scored.",
        "Inspect CIO synthesis and simulated trade plan generation.",
        "blocking"
      )
    );
  }

  if (plan && !hasFiniteNumber(plan.invalidation)) {
    diagnostics.push(
      diagnostic(
        "invalidation_missing",
        String(plan.invalidation),
        "finite invalidation level",
        "A simulated trade needs a valid invalidation level to define risk.",
        "Try latest-swing or FVG invalidation and inspect ICT structure facts.",
        "blocking"
      )
    );
  }

  if (plan && !hasFiniteNumber(plan.targetLiquidity)) {
    diagnostics.push(
      diagnostic(
        "target_missing",
        String(plan.targetLiquidity),
        "finite target liquidity",
        "A simulated trade needs a target before outcome scoring can resolve target/stop/expiry.",
        "Inspect CIO target logic and target R multiple.",
        "blocking"
      )
    );
  }

  if (result && trades === 0 && confluenceSkips > 0) {
    diagnostics.push(
      diagnostic(
        "confluence_threshold_too_high",
        `${confluenceSkips}/${Math.max(1, skippedSignals)} skips; threshold ${config.minimumConfluenceThreshold}; observed confluence ${Number(observedConfluenceScore.toFixed(2))}`,
        `threshold <= ${suggestedConfluenceThreshold} or stronger ICT confluence`,
        "ICT confluence filtering blocked the decision points before outcome scoring.",
        "Calibrate threshold to recovery-tested level, or improve ICT facts before expecting readiness.",
        confluenceSkips === skippedSignals ? "blocking" : "warning",
        {
          observedConfluenceScore: Number(observedConfluenceScore.toFixed(4)),
          activeConfluenceThreshold: config.minimumConfluenceThreshold,
          suggestedConfluenceThreshold,
          thresholdCalculation: confluenceThresholdCalculation
        }
      )
    );
  }

  if (result && trades === 0 && confidenceSkips > 0) {
    diagnostics.push(
      diagnostic(
        "confidence_threshold_too_high",
        `${confidenceSkips}/${Math.max(1, skippedSignals)} skips; threshold ${config.minimumConfidenceThreshold}`,
        "slightly lower confidence threshold or better confidence calibration",
        "CIO confidence filtering blocked the decision points before outcome scoring.",
        "Lower confidence slightly for recovery, or improve agent calibration before expecting readiness.",
        confidenceSkips === skippedSignals ? "blocking" : "warning"
      )
    );
  }

  if (result && trades === 0 && sessionSkips > 0 && config.sessionFilter !== "all") {
    diagnostics.push(
      diagnostic(
        "session_filter_excluded_setups",
        `${sessionSkips}/${Math.max(1, skippedSignals)} skips; filter ${config.sessionFilter}`,
        "session filter all or the session that actually has setups",
        "The active session filter excluded available mock-data decision points.",
        "Widen session filter to all, then compare NY AM and London after trades exist.",
        sessionSkips === skippedSignals ? "blocking" : "warning"
      )
    );
  }

  if (result && trades === 0 && directionSkips > 0) {
    diagnostics.push(
      diagnostic(
        "direction_filter_excluded_setups",
        `${directionSkips}/${Math.max(1, skippedSignals)} direction skips; allowLong=${config.allowLong}; allowShort=${config.allowShort}`,
        "allow both long and short during recovery",
        "The direction filters excluded directional theses before scoring.",
        "Enable both long and short until enough evidence identifies a stable bias direction.",
        directionSkips === skippedSignals ? "blocking" : "warning"
      )
    );
  }

  if (plan && hasFiniteNumber(plan.invalidation) && hasFiniteNumber(plan.targetLiquidity) && Array.isArray(plan.entryZone)) {
    const entryMid = (plan.entryZone[0] + plan.entryZone[1]) / 2;
    const risk = Math.abs(entryMid - plan.invalidation);
    const reward = Math.abs(plan.targetLiquidity - entryMid);
    if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0 || reward <= 0) {
      diagnostics.push(
        diagnostic(
          "stop_model_prevented_trade_plan",
          `risk=${risk}; reward=${reward}; stop=${config.stopModel}`,
          "positive risk and reward distance",
          "The active stop/target model produced an invalid risk profile.",
          "Try latest-swing or FVG invalidation and rerun the backtest.",
          "blocking"
        )
      );
    }
  }

  if (config.maxBarsToResolveTrade <= 2) {
    diagnostics.push(
      diagnostic(
        "resolution_window_too_short",
        `${config.maxBarsToResolveTrade} bars`,
        "at least 6 to 12 bars for research recovery",
        "A very short resolution window may expire trades before target/stop behavior is visible.",
        "Extend max bars to resolve during recovery, then tighten only after trades exist.",
        trades === 0 ? "warning" : "info"
      )
    );
  }

  if (result && trades === 0 && decisions.length > 0 && skippedSignals === 0 && nonNeutralDecisions.length > 0) {
    diagnostics.push(
      diagnostic(
        "signal_not_converted_to_trade",
        `${nonNeutralDecisions.length} non-neutral decisions; 0 skips; 0 trades`,
        "eligible non-neutral decisions convert into simulated trade records",
        "The backtest engine reached eligible signals but did not convert them into simulated trade records.",
        "Inspect signal conversion and outcome scoring in the backtest engine.",
        "blocking"
      )
    );
  }

  if (!diagnostics.length && result && trades === 0) {
    diagnostics.push(
      diagnostic(
        "signal_not_converted_to_trade",
        "0 trades with no specific skip reason",
        "diagnostic reason available",
        "No explicit diagnostic matched, but the strategy still produced no simulated trades.",
        "Inspect decision generation, skipped signals, and trade plan conversion.",
        "blocking"
      )
    );
  }

  return diagnostics.sort((a, b) => {
    const rank = { blocking: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export const topTradeGenerationDiagnostic = (diagnostics: TradeGenerationDiagnostic[]) =>
  safeArray(diagnostics).find((item) => item.severity === "blocking") ?? safeArray(diagnostics)[0];
