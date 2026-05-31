import type { Candle, SwingPoint } from "@/lib/types";
import type { GrinchDealingRange, GrinchPremiumDiscountState, GrinchRangeDirection } from "@/lib/strategyLibrary/grinchStrategyTypes";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const strongest = (swings: SwingPoint[], type: SwingPoint["type"]) =>
  swings
    .filter((swing) => swing.type === type)
    .sort((a, b) => b.strength - a.strength || b.index - a.index)[0];

const latestOpposingPair = (swings: SwingPoint[]) => {
  const highs = swings.filter((swing) => swing.type === "high");
  const lows = swings.filter((swing) => swing.type === "low");
  const latestHigh = highs[highs.length - 1];
  const latestLow = lows[lows.length - 1];

  if (latestHigh && latestLow) {
    return { high: latestHigh, low: latestLow };
  }

  return {
    high: strongest(swings, "high"),
    low: strongest(swings, "low")
  };
};

const stateFor = (current: number, rangeHigh: number, rangeLow: number): GrinchPremiumDiscountState => {
  if (rangeHigh <= rangeLow) {
    return "unclear";
  }
  if (current > rangeHigh || current < rangeLow) {
    return "outside_range";
  }
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const band = (rangeHigh - rangeLow) * 0.04;
  if (Math.abs(current - equilibrium) <= band) {
    return "equilibrium";
  }
  return current > equilibrium ? "premium" : "discount";
};

const directionFor = (high?: SwingPoint, low?: SwingPoint): GrinchRangeDirection => {
  if (!high || !low) {
    return "unclear";
  }
  if (low.index < high.index) {
    return "bullish_range";
  }
  if (high.index < low.index) {
    return "bearish_range";
  }
  return "balanced_range";
};

export function resolveDealingRange(candles: Candle[], swings: SwingPoint[] = [], lookbackCandles = 240): GrinchDealingRange {
  const sample = candles.slice(-Math.max(20, lookbackCandles));
  const latest = sample[sample.length - 1];

  if (!latest) {
    return {
      rangeHigh: 0,
      rangeLow: 0,
      equilibrium: 0,
      premium: [0, 0],
      discount: [0, 0],
      premiumDiscountState: "unclear",
      currentPrice: 0,
      rangeDirection: "unclear",
      reasoning: "No candles available to define a dealing range."
    };
  }

  const firstSampleIndex = candles.length - sample.length;
  const scopedSwings = swings.filter((swing) => swing.index >= firstSampleIndex);
  const pair = latestOpposingPair(scopedSwings.length ? scopedSwings : swings);
  const rangeHigh = pair.high?.price ?? Math.max(...sample.map((candle) => candle.high));
  const rangeLow = pair.low?.price ?? Math.min(...sample.map((candle) => candle.low));
  const equilibrium = round((rangeHigh + rangeLow) / 2);
  const premiumDiscountState = stateFor(latest.close, rangeHigh, rangeLow);
  const rangeDirection = directionFor(pair.high, pair.low);

  return {
    rangeHigh,
    rangeLow,
    equilibrium,
    premium: [equilibrium, rangeHigh],
    discount: [rangeLow, equilibrium],
    premiumDiscountState,
    currentPrice: latest.close,
    rangeDirection,
    anchorLow: pair.low,
    anchorHigh: pair.high,
    reasoning:
      rangeDirection === "bullish_range"
        ? "A meaningful low printed before the range high; first expectation is retracement into discount before continuation."
        : rangeDirection === "bearish_range"
          ? "A meaningful high printed before the range low; first expectation is retracement into premium before continuation lower."
          : "Range anchors are mixed or unavailable; bias remains cautious."
  };
}
