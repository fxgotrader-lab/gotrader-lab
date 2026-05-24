import type { BacktestDecisionPoint, SimulatedTradeAgentAttribution, SimulatedTradeRecord } from "@/lib/backtesting/backtestTypes";
import type { Candle, MarketBias } from "@/lib/types";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const directionFor = (bias: MarketBias) => {
  if (bias === "bullish") {
    return 1;
  }
  if (bias === "bearish") {
    return -1;
  }
  return 0;
};

const touched = (candle: Candle, level: number) => candle.low <= level && candle.high >= level;

const touchedEntry = (candle: Candle, entryZone: [number, number]) => {
  const low = Math.min(entryZone[0], entryZone[1]);
  const high = Math.max(entryZone[0], entryZone[1]);
  return candle.high >= low && candle.low <= high;
};

const excursionFor = (candles: Candle[], entryPrice: number, direction: number) => {
  if (!candles.length || direction === 0) {
    return { mfe: 0, mae: 0 };
  }

  const favorable = candles.map((candle) =>
    direction > 0 ? candle.high - entryPrice : entryPrice - candle.low
  );
  const adverse = candles.map((candle) =>
    direction > 0 ? entryPrice - candle.low : candle.high - entryPrice
  );

  return {
    mfe: round(Math.max(0, ...favorable)),
    mae: round(Math.max(0, ...adverse))
  };
};

const attributionFor = (decision: BacktestDecisionPoint): SimulatedTradeAgentAttribution[] =>
  decision.agentOpinions.map((opinion) => ({
    agentId: opinion.agentId,
    name: opinion.name,
    bias: opinion.bias,
    confidence: opinion.confidence,
    weight: opinion.weight,
    alignsWithCIO: opinion.bias === decision.thesis.finalBias
  }));

export function scoreSimulatedTradeOutcome(
  decision: BacktestDecisionPoint,
  candles: Candle[],
  lookaheadCandles: number
): SimulatedTradeRecord {
  const thesis = decision.thesis;
  const plan = thesis.simulatedTradePlan;
  const direction = directionFor(thesis.finalBias);
  const entryPrice = round((plan.entryZone[0] + plan.entryZone[1]) / 2);
  const endIndex = Math.min(candles.length - 1, decision.decisionIndex + lookaheadCandles);
  const futureCandles = candles.slice(decision.decisionIndex + 1, endIndex + 1);
  const fallbackResolvedAt = candles[endIndex]?.timestamp ?? decision.candle.timestamp;

  if (direction === 0) {
    return {
      id: `bt_trade_${decision.decisionIndex}`,
      decisionId: decision.id,
      thesisId: thesis.id,
      symbol: thesis.symbol,
      timeframe: thesis.timeframe,
      session: thesis.session,
      marketRegime: thesis.marketRegime,
      bias: thesis.finalBias,
      confidence: thesis.confidence,
      decisionIndex: decision.decisionIndex,
      exitIndex: endIndex,
      openedAt: decision.candle.timestamp,
      resolvedAt: fallbackResolvedAt,
      entryZone: plan.entryZone,
      entryPrice,
      invalidation: plan.invalidation,
      target: plan.targetLiquidity,
      targetHit: false,
      stopHit: false,
      expired: true,
      outcome: "neutral",
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      rMultiple: 0,
      riskReward: 0,
      reason: "CIO thesis was neutral, so the replay stored a research record without directional exposure.",
      simulatedTradePlan: plan,
      agentAttribution: attributionFor(decision)
    };
  }

  let entryIndex: number | undefined;
  let exitIndex = endIndex;
  let targetHit = false;
  let stopHit = false;
  let reason = "Future mock candles expired before target or invalidation resolved the thesis.";

  for (const candle of futureCandles) {
    const index = candles.findIndex((item) => item.id === candle.id);
    if (entryIndex === undefined) {
      if (!touchedEntry(candle, plan.entryZone)) {
        continue;
      }
      entryIndex = index;
    }

    // Conservative deterministic assumption: if target and stop are inside the
    // same OHLC candle after entry, invalidation is counted first because the
    // intrabar path is unknowable from mock candles alone.
    const stopTouched = touched(candle, plan.invalidation);
    const targetTouched = touched(candle, plan.targetLiquidity);

    if (stopTouched && targetTouched) {
      stopHit = true;
      exitIndex = index;
      reason = "Target and invalidation were both inside one mock candle; conservative scoring counted stop first.";
      break;
    }

    if (stopTouched) {
      stopHit = true;
      exitIndex = index;
      reason = "Future mock candle reached the simulated invalidation level.";
      break;
    }

    if (targetTouched) {
      targetHit = true;
      exitIndex = index;
      reason = "Future mock candle reached the simulated liquidity target.";
      break;
    }
  }

  if (entryIndex === undefined) {
    reason = "Entry zone was not touched before the lookahead window expired.";
  }

  const scoredWindow =
    entryIndex === undefined ? [] : candles.slice(entryIndex, Math.min(candles.length, exitIndex + 1));
  const { mfe, mae } = excursionFor(scoredWindow, entryPrice, direction);
  const risk = Math.max(0.25, Math.abs(entryPrice - plan.invalidation));
  const terminalClose = candles[exitIndex]?.close ?? entryPrice;
  const unresolvedR =
    entryIndex === undefined ? 0 : ((terminalClose - entryPrice) * direction) / risk;
  const rMultiple = targetHit
    ? Math.abs(plan.targetLiquidity - entryPrice) / risk
    : stopHit
      ? -1
      : unresolvedR;

  return {
    id: `bt_trade_${decision.decisionIndex}`,
    decisionId: decision.id,
    thesisId: thesis.id,
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    session: thesis.session,
    marketRegime: thesis.marketRegime,
    bias: thesis.finalBias,
    confidence: thesis.confidence,
    decisionIndex: decision.decisionIndex,
    entryIndex,
    exitIndex,
    openedAt: decision.candle.timestamp,
    resolvedAt: candles[exitIndex]?.timestamp ?? fallbackResolvedAt,
    entryZone: plan.entryZone,
    entryPrice,
    invalidation: plan.invalidation,
    target: plan.targetLiquidity,
    targetHit,
    stopHit,
    expired: !targetHit && !stopHit,
    outcome: targetHit ? "target_hit" : stopHit ? "stop_hit" : "expired",
    maxFavorableExcursion: mfe,
    maxAdverseExcursion: mae,
    rMultiple: round(rMultiple, 2),
    riskReward: plan.riskReward,
    reason,
    simulatedTradePlan: plan,
    agentAttribution: attributionFor(decision)
  };
}
