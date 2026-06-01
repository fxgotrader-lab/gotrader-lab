import type { Candle } from "@/lib/types";
import type { CanonicalCandleDataQuality, CanonicalCandleEligibility } from "@/lib/candleSources/candleSourceTypes";

export const CANONICAL_CHART_DISPLAY_MIN_CANDLES = 5;
export const CANONICAL_QUICK_ANALYSIS_MIN_CANDLES = 100;
export const CANONICAL_RESEARCH_CYCLE_MIN_CANDLES = 400;
export const CANONICAL_WALK_FORWARD_MIN_CANDLES = 1000;

export const hasValidMonotonicTimestamps = (candles: Candle[]) => {
  let previous = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const timestamp = Date.parse(candle.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= previous) {
      return false;
    }
    previous = timestamp;
  }
  return true;
};

export const hasValidOhlc = (candles: Candle[]) =>
  candles.every((candle) => {
    const values = [candle.open, candle.high, candle.low, candle.close];
    return values.every((value) => Number.isFinite(value) && value > 0) &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close);
  });

export const evaluateCanonicalCandleSourceEligibility = ({
  candles,
  symbolMatches = true,
  timeframeMatches = true,
  userSelectedForResearch = false,
  userSelectedForWalkForward = false
}: {
  candles: Candle[];
  symbolMatches?: boolean;
  timeframeMatches?: boolean;
  userSelectedForResearch?: boolean;
  userSelectedForWalkForward?: boolean;
}) => {
  const reasons: string[] = [];
  const candleCount = candles.length;
  const monotonic = hasValidMonotonicTimestamps(candles);
  const validOhlc = hasValidOhlc(candles);
  const validCandles = monotonic && validOhlc;

  if (!validCandles) {
    reasons.push("Candle series failed OHLC or monotonic timestamp validation.");
  }
  if (!symbolMatches) {
    reasons.push("Symbol does not match the active GoTrader research symbol.");
  }
  if (!timeframeMatches) {
    reasons.push("Timeframe does not match the active GoTrader research timeframe.");
  }
  if (candleCount < CANONICAL_CHART_DISPLAY_MIN_CANDLES) {
    reasons.push(`Chart display requires at least ${CANONICAL_CHART_DISPLAY_MIN_CANDLES} valid candles.`);
  }
  if (candleCount < CANONICAL_QUICK_ANALYSIS_MIN_CANDLES) {
    reasons.push(`Quick analysis prefers at least ${CANONICAL_QUICK_ANALYSIS_MIN_CANDLES} valid candles.`);
  }
  if (candleCount < CANONICAL_RESEARCH_CYCLE_MIN_CANDLES) {
    reasons.push(`Research cycle requires at least ${CANONICAL_RESEARCH_CYCLE_MIN_CANDLES} valid candles.`);
  }
  if (candleCount < CANONICAL_WALK_FORWARD_MIN_CANDLES) {
    reasons.push(`Walk-forward prefers at least ${CANONICAL_WALK_FORWARD_MIN_CANDLES} valid candles.`);
  }
  if (!userSelectedForResearch) {
    reasons.push("Research source requires explicit user selection.");
  }

  const chartDisplay = validCandles && candleCount >= CANONICAL_CHART_DISPLAY_MIN_CANDLES;
  const quickAnalysis = chartDisplay && symbolMatches && timeframeMatches && candleCount >= CANONICAL_QUICK_ANALYSIS_MIN_CANDLES;
  const researchCycle =
    quickAnalysis &&
    userSelectedForResearch &&
    candleCount >= CANONICAL_RESEARCH_CYCLE_MIN_CANDLES;
  const walkForward =
    researchCycle &&
    userSelectedForWalkForward &&
    candleCount >= CANONICAL_WALK_FORWARD_MIN_CANDLES;
  const eligibility: CanonicalCandleEligibility = {
    chartDisplay,
    quickAnalysis,
    researchCycle,
    walkForward
  };
  const dataQuality: CanonicalCandleDataQuality = !validCandles
    ? "invalid"
    : candleCount >= CANONICAL_RESEARCH_CYCLE_MIN_CANDLES
      ? "sufficient"
      : candleCount >= CANONICAL_CHART_DISPLAY_MIN_CANDLES
        ? "limited"
        : "insufficient";

  return {
    dataQuality,
    eligibility,
    reasons: reasons.length ? reasons : ["Candle source satisfies canonical validation gates."]
  };
};
