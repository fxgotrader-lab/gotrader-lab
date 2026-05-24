import { runAgents, synthesizeCIO } from "@/lib/agents";
import type { BacktestAgentAttributionSummary, BacktestConfig, BacktestDecisionPoint, BacktestResult, BacktestSummary, ResolvedBacktestConfig, SimulatedTradeRecord } from "@/lib/backtesting/backtestTypes";
import { scoreSimulatedTradeOutcome } from "@/lib/backtesting/outcomeScoring";
import { buildICTContext, tagSession } from "@/lib/ict";
import type { Candle, MarketBias, MarketRegime, SimulatedTradePlan, ThesisInput, TradingSession } from "@/lib/types";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

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

const resolveConfig = (candles: Candle[], config: BacktestConfig = {}): ResolvedBacktestConfig => ({
  symbol: config.symbol ?? candles[0]?.symbol ?? "NQ",
  timeframe: config.timeframe ?? candles[0]?.timeframe ?? "5m",
  session: config.session,
  marketRegime: config.marketRegime ?? "trend",
  warmupCandles: Math.max(6, config.warmupCandles ?? 14),
  decisionInterval: Math.max(1, config.decisionInterval ?? 4),
  lookaheadCandles: Math.max(1, config.lookaheadCandles ?? 8),
  visibleWindow: Math.max(8, config.visibleWindow ?? 18)
});

const signalText = (bias: MarketBias) => (bias === "neutral" ? "neutral" : `${bias} simulated thesis`);

const buildSimulatedPlan = (decisionIndex: number, input: ThesisInput, synthesis: ReturnType<typeof synthesizeCIO>): SimulatedTradePlan => ({
  id: `bt_plan_${decisionIndex}`,
  symbol: input.symbol,
  timeframe: input.timeframe,
  bias: synthesis.finalBias,
  entryZone: synthesis.entryZone,
  invalidation: synthesis.invalidationLevel,
  targetLiquidity: synthesis.targetLiquidity,
  stopRiskNotes: synthesis.riskNotes,
  riskReward: synthesis.riskReward,
  mode: "simulation"
});

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
  const agentOpinions = runAgents(input, ictContext);
  const cioSynthesis = synthesizeCIO(input, ictContext, agentOpinions);
  const plan = buildSimulatedPlan(decisionIndex, input, cioSynthesis);
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

const summarizeBacktest = (trades: SimulatedTradeRecord[]): BacktestSummary => {
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
  const sample = scopedCandles.length ? scopedCandles : candles;
  const decisions: BacktestDecisionPoint[] = [];

  for (
    let decisionIndex = resolved.warmupCandles;
    decisionIndex < Math.max(resolved.warmupCandles, sample.length - 1);
    decisionIndex += resolved.decisionInterval
  ) {
    const decision = buildDecision(sample, decisionIndex, resolved);
    decisions.push(decision);
  }

  const trades = decisions.map((decision) =>
    scoreSimulatedTradeOutcome(decision, sample, resolved.lookaheadCandles)
  );

  return {
    config: resolved,
    candles: sample,
    decisions,
    trades,
    summary: summarizeBacktest(trades)
  };
}

export { signalText };
