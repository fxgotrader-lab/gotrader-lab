import type { Candle, SwingPoint } from "@/lib/types";

const roundPrice = (value: number) => Number(value.toFixed(2));

export function detectSwings(candles: Candle[], lookback = 2): SwingPoint[] {
  const windowSize = Math.max(1, lookback);
  const swings: SwingPoint[] = [];

  // Assumption: a swing is confirmed only after `lookback` candles print on both sides.
  // Equal highs/lows are ignored so the detector stays deterministic on flat ranges.
  for (let index = windowSize; index < candles.length - windowSize; index += 1) {
    const candle = candles[index];
    const left = candles.slice(index - windowSize, index);
    const right = candles.slice(index + 1, index + windowSize + 1);
    const neighbors = [...left, ...right];
    const isSwingHigh = neighbors.every((item) => candle.high > item.high);
    const isSwingLow = neighbors.every((item) => candle.low < item.low);

    if (isSwingHigh) {
      const nearestHigh = Math.max(...neighbors.map((item) => item.high));
      swings.push({
        id: `swing_high_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        type: "high",
        price: candle.high,
        strength: roundPrice(candle.high - nearestHigh)
      });
    }

    if (isSwingLow) {
      const nearestLow = Math.min(...neighbors.map((item) => item.low));
      swings.push({
        id: `swing_low_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        type: "low",
        price: candle.low,
        strength: roundPrice(nearestLow - candle.low)
      });
    }
  }

  return swings.sort((a, b) => a.index - b.index || a.price - b.price);
}
