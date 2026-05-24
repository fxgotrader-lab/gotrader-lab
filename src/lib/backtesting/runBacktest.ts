import { runAgents, synthesizeCIO } from "@/lib/agents";
import {
  defaultBacktestConfig,
  sanitizeBacktestConfig
} from "@/lib/backtesting/backtestConfig";
import type {
  BacktestAgentAttributionSummary,
  BacktestAgentWeightId,
  BacktestConfig,
  BacktestDecisionPoint,
  BacktestResult,
  BacktestSkippedSignal,
  BacktestSummary,
  ResolvedBacktestConfig,
  SimulatedTradeRecord
} from "@/lib/backtesting/backtestTypes";
import { scoreSimulatedTradeOutcome } from "@/lib/backtesting/outcomeScoring";
import { buildICTContext, tagSession } from "@/lib/ict";
import type { Candle, FairValueGap, MarketBias, SimulatedTradePlan, ThesisInput, TradingSession } from "@/lib/types";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const tickSizeBySymbol = {
  ES: 0.25,
  NQ: 0.25,
  MES: 0.25,
  MNQ: 0.25
} as const;

const sessionFromCandle = (candle: Candle): TradingSession => {
  const tagged = tagSession(candle);
  if (tagged.session === "London") {
    return "London";
  }
  if (tagged.killZone === "NY Lunch") {
    return "New York Lunch";
  }
  if (tagged.killZone === "NY PM") {
    return "New York PM";
  }
  if (tagged.session === "New York") {
    return "New York AM";
  }
  return "Globex";
};

const resolveConfig = (candles: Candle[], config: BacktestConfig = {}): ResolvedBacktestConfig =>
  sanitizeBacktestConfig({
    ...defaultBacktestConfig,
    symbol: candles[0]?.symbol ?? defaultBacktestConfig.symbol,
    timeframe: candles[0]?.timeframe ?? defaultBacktestConfig.timeframe,
    ...config
  });

const signalText = (bias: MarketBias) => (bias === "neutral" ? "neutral" : `${bias} simulated thesis`);

const directionFor = (bias: MarketBias) => (bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0);

const fvgInvalidationFor = (gaps: FairValueGap[], bias: MarketBias, fallback: number, tickSize: number) => {
  const gap = [...gaps].reverse().find((item) => item.direction === bias && !item.mitigated);
  if (!gap) {
    return fallback;
  }
  return bias === "bullish"
    ? Math.min(gap.start, gap.end) - tickSize
    : bias === "bearish"
      ? Math.max(gap.start, gap.end) + tickSize
      : fallback;
};

const buildSimulatedPlan = (
  decisionIndex: number,
  input: ThesisInput,
  synthesis: ReturnType<typeof synthesizeCIO>,
  config: ResolvedBacktestConfig,
  gaps: FairValueGap[]
): SimulatedTradePlan => {
  const bias = synthesis.finalBias;
  const direction = directionFor(bias);
  const tickSize = tickSizeBySymbol[input.symbol];
  const entryMid = (synthesis.entryZone[0] + synthesis.entryZone[1]) / 2;
  const stopDistance =
    config.stopModel === "fixed ticks"
      ? config.fixedTickStopSize * tickSize
      : Math.abs(entryMid - synthesis.invalidationLevel);
  const invalidation =
    bias === "neutral"
      ? synthesis.invalidationLevel
      : config.stopModel === "fixed ticks"
        ? entryMid - direction * stopDistance
        : config.stopModel === "FVG invalidation"
          ? fvgInvalidationFor(gaps, bias, synthesis.invalidationLevel, tickSize)
          : synthesis.invalidationLevel;
  const risk = Math.max(tickSize, Math.abs(entryMid - invalidation));
  const targetLiquidity =
    bias === "neutral"
      ? synthesis.targetLiquidity
      : entryMid + direction * risk * config.targetRMultiple;

  return {
    id: `bt_plan_${decisionIndex}`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    bias,
    entryZone: synthesis.entryZone,
    invalidation: round(invalidation),
    targetLiquidity: round(targetLiquidity),
    stopRiskNotes: `${synthesis.riskNotes} Backtest assumption: ${config.stopModel} stop, ${config.targetRMultiple.toFixed(2)}R target, ${config.maxBarsToResolveTrade} bar max resolution.`,
    riskReward: bias === "neutral" ? 0 : round(config.targetRMultiple),
    mode: "simulation"
  };
};

const sessionMatchesFilter = (candle: Candle, config: ResolvedBacktestConfig) => {
  const tagged = tagSession(candle);
  if (config.sessionFilter === "all") {
    return true;
  }
  if (config.sessionFilter === "NY AM Kill Zone") {
    return tagged.killZone === "NY AM";
  }
  if (config.sessionFilter === "NY PM Kill Zone") {
    return tagged.killZone === "NY PM";
  }
  return tagged.session === config.sessionFilter;
};

const skipReasonFor = (decision: BacktestDecisionPoint, config: ResolvedBacktestConfig) => {
  const tagged = tagSession(decision.candle);
  if (!sessionMatchesFilter(decision.candle, config)) {
    return `Session filter ${config.sessionFilter} excluded ${tagged.label}.`;
  }
  if (decision.ictContext.confluenceScore < config.minimumConfluenceThreshold) {
    return `ICT confluence ${round(decision.ictContext.confluenceScore, 2)} below threshold ${config.minimumConfluenceThreshold}.`;
  }
  if (decision.thesis.confidence < config.minimumConfidenceThreshold) {
    return `CIO confidence ${round(decision.thesis.confidence, 2)} below threshold ${config.minimumConfidenceThreshold}.`;
  }
  if (decision.thesis.finalBias === "bullish" && !config.allowLong) {
    return "Long simulated theses disabled.";
  }
  if (decision.thesis.finalBias === "bearish" && !config.allowShort) {
    return "Short simulated theses disabled.";
  }
  if (decision.thesis.finalBias === "neutral") {
    return "CIO thesis was neutral.";
  }
  return undefined;
};

function buildDecision(
  candles: Candle[],
  decisionIndex: number,
  config: ResolvedBacktestConfig
): BacktestDecisionPoint {
  const candle = candles[decisionIndex];
  const input: ThesisInput = {
    symbol: config.symbol,
    timeframe: config.timeframe,
    session: config.session ?? sessionFromCandle(candle),
    marketRegime: config.marketRegime,
    notes: `Replay decision at candle ${decisionIndex + 1} using local mock OHLC only.`
  };
  const historicalCandles = candles.slice(0, decisionIndex + 1);
  const ictContext = buildICTContext(historicalCandles, input);
  const agentOpinions = runAgents(input, ictContext).map((opinion) => ({
    ...opinion,
    weight: config.agentWeights[opinion.agentId as BacktestAgentWeightId] ?? opinion.weight
  }));
  const cioSynthesis = synthesizeCIO(input, ictContext, agentOpinions);
  const plan = buildSimulatedPlan(decisionIndex, input, cioSynthesis, config, ictContext.fairValueGaps);
  const thesisId = `bt_thesis_${decisionIndex}`;
  const decisionId = `bt_decision_${decisionIndex}`;
  const thesis = {
    id: thesisId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    session: input.session,
    marketRegime: input.marketRegime,
    notes: input.notes,
    finalBias: cioSynthesis.finalBias,
    confidence: cioSynthesis.confidence,
    thesisSummary: cioSynthesis.thesisSummary,
    invalidationLevel: plan.invalidation,
    targetLiquidity: plan.targetLiquidity,
    riskNotes: plan.stopRiskNotes,
    reasoningSummary: cioSynthesis.reasoningSummary,
    ictContext,
    simulatedTradePlan: plan,
    createdAt: candle.timestamp,
    disclaimer: "Simulation only. No broker connection. No real trades."
  };

  return {
    id: decisionId,
    decisionIndex,
    candle,
    input,
    ictContext,
    agentOpinions: [...agentOpinions, cioSynthesis.cioOpinion],
    cioSynthesis,
    thesis
  };
}

const equityCurveFor = (trades: SimulatedTradeRecord[]) => {
  let equityR = 0;
  return trades.map((trade, index) => {
    equityR = round(equityR + trade.rMultiple, 2);
    return {
      index: index + 1,
      timestamp: trade.resolvedAt,
      equityR,
      rMultiple: trade.rMultiple
    };
  });
};

const maxDrawdownFor = (equityCurve: ReturnType<typeof equityCurveFor>) => {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equityR);
    maxDrawdown = Math.max(maxDrawdown, peak - point.equityR);
  }
  return round(maxDrawdown, 2);
};

const agentAttributionFor = (trades: SimulatedTradeRecord[]): BacktestAgentAttributionSummary[] => {
  const map = new Map<string, BacktestAgentAttributionSummary & { confidenceTotal: number; weightTotal: number; aligned: number }>();

  for (const trade of trades) {
    for (const agent of trade.agentAttribution) {
      const current =
        map.get(agent.agentId) ??
        {
          agentId: agent.agentId,
          name: agent.name,
          averageConfidence: 0,
          averageWeight: 0,
          totalOpinions: 0,
          bullishCount: 0,
          bearishCount: 0,
          neutralCount: 0,
          cioAlignmentRate: 0,
          confidenceTotal: 0,
          weightTotal: 0,
          aligned: 0
        };
      current.totalOpinions += 1;
      current.confidenceTotal += agent.confidence;
      current.weightTotal += agent.weight;
      current.aligned += agent.alignsWithCIO ? 1 : 0;
      current.bullishCount += agent.bias === "bullish" ? 1 : 0;
      current.bearishCount += agent.bias === "bearish" ? 1 : 0;
      current.neutralCount += agent.bias === "neutral" ? 1 : 0;
      map.set(agent.agentId, current);
    }
  }

  return [...map.values()]
    .map(({ confidenceTotal, weightTotal, aligned, ...summary }) => ({
      ...summary,
      averageConfidence: round(confidenceTotal / Math.max(1, summary.totalOpinions), 3),
      averageWeight: round(weightTotal / Math.max(1, summary.totalOpinions), 3),
      cioAlignmentRate: round(aligned / Math.max(1, summary.totalOpinions), 3)
    }))
    .sort((a, b) => b.averageWeight - a.averageWeight);
};

const skipReasonsFor = (skippedSignals: BacktestSkippedSignal[]) =>
  Object.entries(
    skippedSignals.reduce<Record<string, number>>((counts, skip) => {
      counts[skip.reason] = (counts[skip.reason] ?? 0) + 1;
      return counts;
    }, {})
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

const summarizeBacktest = (trades: SimulatedTradeRecord[], skippedSignals: BacktestSkippedSignal[]): BacktestSummary => {
  const totalTrades = trades.length;
  const directionalTrades = trades.filter((trade) => trade.bias !== "neutral").length;
  const wins = trades.filter((trade) => trade.outcome === "target_hit").length;
  const losses = trades.filter((trade) => trade.outcome === "stop_hit").length;
  const unresolved = trades.filter((trade) => trade.outcome === "expired" || trade.outcome === "neutral").length;
  const averageR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / Math.max(1, totalTrades);
  const equityCurve = equityCurveFor(trades);
  const bestTrade = [...trades].sort((a, b) => b.rMultiple - a.rMultiple)[0];
  const worstTrade = [...trades].sort((a, b) => a.rMultiple - b.rMultiple)[0];

  return {
    totalTrades,
    directionalTrades,
    skippedSignals: skippedSignals.length,
    skipReasons: skipReasonsFor(skippedSignals),
    wins,
    losses,
    unresolved,
    winRate: wins / Math.max(1, directionalTrades),
    averageR: round(averageR, 2),
    maxDrawdown: maxDrawdownFor(equityCurve),
    bestTrade,
    worstTrade,
    equityCurve,
    agentAttribution: agentAttributionFor(trades)
  };
};

export function runBacktest(candles: Candle[], config: BacktestConfig = {}): BacktestResult {
  const resolved = resolveConfig(candles, config);
  const scopedCandles = candles.filter(
    (candle) => candle.symbol === resolved.symbol && candle.timeframe === resolved.timeframe
  );
  const sample = scopedCandles.length
    ? scopedCandles
    : candles.map((candle) => ({ ...candle, symbol: resolved.symbol, timeframe: resolved.timeframe }));
  const decisions: BacktestDecisionPoint[] = [];
  const skippedSignals: BacktestSkippedSignal[] = [];
  const eligibleDecisions: BacktestDecisionPoint[] = [];

  for (
    let decisionIndex = resolved.warmupCandles;
    decisionIndex < Math.max(resolved.warmupCandles, sample.length - 1);
    decisionIndex += resolved.decisionInterval
  ) {
    const decision = buildDecision(sample, decisionIndex, resolved);
    decisions.push(decision);
    const skipReason = skipReasonFor(decision, resolved);
    if (skipReason) {
      skippedSignals.push({
        id: `bt_skip_${decisionIndex}`,
        decisionIndex,
        timestamp: decision.candle.timestamp,
        reason: skipReason,
        bias: decision.thesis.finalBias,
        confidence: decision.thesis.confidence,
        confluenceScore: decision.ictContext.confluenceScore,
        sessionLabel: tagSession(decision.candle).label
      });
    } else {
      eligibleDecisions.push(decision);
    }
  }

  const trades = eligibleDecisions.map((decision) =>
    scoreSimulatedTradeOutcome(decision, sample, resolved.maxBarsToResolveTrade)
  );

  return {
    config: resolved,
    candles: sample,
    decisions,
    skippedSignals,
    trades,
    summary: summarizeBacktest(trades, skippedSignals)
  };
}

export { signalText };
