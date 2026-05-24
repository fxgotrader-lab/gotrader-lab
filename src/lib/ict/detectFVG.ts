import type { Candle, FairValueGap } from "@/lib/types";

const averageRangeBefore = (candles: Candle[], index: number, sample = 5) => {
  const start = Math.max(0, index - sample);
  const window = candles.slice(start, index);
  if (!window.length) {
    return candles[index].high - candles[index].low;
  }
  return window.reduce((total, candle) => total + (candle.high - candle.low), 0) / window.length;
};

const isMitigated = (candles: Candle[], startIndex: number, start: number, end: number) =>
  candles.slice(startIndex + 1).some((candle) => candle.low <= end && candle.high >= start);

export function detectFairValueGaps(candles: Candle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];

  // Assumption: ICT FVG uses the three-candle imbalance: candle one high below
  // candle three low for bullish, or candle one low above candle three high for bearish.
  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];
    const middleBody = Math.abs(middle.close - middle.open);
    const createdByDisplacement = middleBody >= averageRangeBefore(candles, index - 1) * 0.55;

    if (first.high < third.low) {
      const start = first.high;
      const end = third.low;
      gaps.push({
        id: `fvg_bullish_${third.id}`,
        candleId: third.id,
        timestamp: third.timestamp,
        index,
        direction: "bullish",
        start,
        end,
        midpoint: Number(((start + end) / 2).toFixed(2)),
        mitigated: isMitigated(candles, index, start, end),
        createdByDisplacement,
        description: `Bullish imbalance between ${start} and ${end}.`
      });
    }

    if (first.low > third.high) {
      const start = third.high;
      const end = first.low;
      gaps.push({
        id: `fvg_bearish_${third.id}`,
        candleId: third.id,
        timestamp: third.timestamp,
        index,
        direction: "bearish",
        start,
        end,
        midpoint: Number(((start + end) / 2).toFixed(2)),
        mitigated: isMitigated(candles, index, start, end),
        createdByDisplacement,
        description: `Bearish imbalance between ${start} and ${end}.`
      });
    }
  }

  return gaps;
}
