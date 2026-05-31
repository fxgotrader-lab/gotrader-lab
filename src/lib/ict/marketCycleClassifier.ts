import type { Candle } from "@/lib/types";
import type { GrinchDealingRange, GrinchMarketCycleResult } from "@/lib/strategyLibrary/grinchStrategyTypes";

const candleRange = (candle: Candle) => Math.max(0, candle.high - candle.low);
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

export function classifyMarketCycle(candles: Candle[], dealingRange: GrinchDealingRange): GrinchMarketCycleResult {
  const recent = candles.slice(-20);
  const latest = recent[recent.length - 1];
  if (!latest || recent.length < 8) {
    return {
      marketCycle: "unclear",
      confidence: 0.2,
      reasons: ["Not enough candles to classify consolidation, expansion, retracement, or reversal."]
    };
  }

  const prior = recent.slice(0, -1);
  const avgRange = average(prior.map(candleRange));
  const latestRange = candleRange(latest);
  const recentHigh = Math.max(...prior.map((candle) => candle.high));
  const recentLow = Math.min(...prior.map((candle) => candle.low));
  const compression = Math.max(...recent.map((candle) => candle.high)) - Math.min(...recent.map((candle) => candle.low));
  const dealingSpan = Math.max(1, dealingRange.rangeHigh - dealingRange.rangeLow);
  const closeNearEquilibrium = Math.abs(latest.close - dealingRange.equilibrium) <= dealingSpan * 0.08;
  const breaksRecentRange = latest.high > recentHigh || latest.low < recentLow;
  const expands = latestRange > avgRange * 1.4 && breaksRecentRange;

  if (compression <= dealingSpan * 0.22 && avgRange <= dealingSpan * 0.04) {
    return {
      marketCycle: "consolidation",
      confidence: 0.66,
      reasons: ["Recent candles are compressed relative to the dealing range."]
    };
  }

  if (expands) {
    return {
      marketCycle: "expansion",
      confidence: 0.72,
      reasons: ["Latest candle expands beyond recent range with above-average range."]
    };
  }

  if (
    (dealingRange.rangeDirection === "bullish_range" && dealingRange.premiumDiscountState === "discount") ||
    (dealingRange.rangeDirection === "bearish_range" && dealingRange.premiumDiscountState === "premium") ||
    closeNearEquilibrium
  ) {
    return {
      marketCycle: "retracement",
      confidence: 0.62,
      reasons: ["Price is trading back toward equilibrium or into the expected retracement side of the A-B range."]
    };
  }

  if (
    (dealingRange.rangeDirection === "bullish_range" && latest.close < dealingRange.rangeLow) ||
    (dealingRange.rangeDirection === "bearish_range" && latest.close > dealingRange.rangeHigh) ||
    dealingRange.premiumDiscountState === "outside_range"
  ) {
    return {
      marketCycle: "reversal",
      confidence: 0.58,
      reasons: ["Price materially violated the active dealing range, weakening continuation and raising reversal risk."]
    };
  }

  return {
    marketCycle: "unclear",
    confidence: 0.4,
    reasons: ["Cycle evidence is mixed; no clean consolidation, expansion, retracement, or reversal classification."]
  };
}
