import type { Candle, MarketStructureEvent, StructureDirection, SwingPoint } from "@/lib/types";

const latestSwingBefore = (swings: SwingPoint[], index: number, type: SwingPoint["type"]) =>
  swings
    .filter((swing) => swing.type === type && swing.index < index)
    .sort((a, b) => b.index - a.index)[0];

const averageRangeBefore = (candles: Candle[], index: number, sample = 5) => {
  const start = Math.max(0, index - sample);
  const window = candles.slice(start, index);
  if (!window.length) {
    return candles[index].high - candles[index].low;
  }
  return window.reduce((total, candle) => total + (candle.high - candle.low), 0) / window.length;
};

const displacementFor = (candles: Candle[], index: number): MarketStructureEvent["displacement"] => {
  const candle = candles[index];
  const body = Math.abs(candle.close - candle.open);
  return body >= averageRangeBefore(candles, index) * 0.65 ? "strong" : "mild";
};

export function detectBOS(candles: Candle[], swings: SwingPoint[]): MarketStructureEvent[] {
  const events: MarketStructureEvent[] = [];
  const brokenSwingIds = new Set<string>();
  let structure: StructureDirection | "neutral" = "neutral";

  // Assumption: BOS is continuation, so the first structural close sets direction
  // and later closes through new confirmed swings in that same direction become BOS.
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const priorHigh = latestSwingBefore(swings, index, "high");
    const priorLow = latestSwingBefore(swings, index, "low");

    if (priorHigh && candle.close > priorHigh.price && previous.close <= priorHigh.price) {
      if (structure === "bullish" && !brokenSwingIds.has(priorHigh.id)) {
        brokenSwingIds.add(priorHigh.id);
        events.push({
          id: `bos_bullish_${candle.id}`,
          candleId: candle.id,
          timestamp: candle.timestamp,
          index,
          type: "BOS",
          direction: "bullish",
          price: priorHigh.price,
          brokenSwingId: priorHigh.id,
          displacement: displacementFor(candles, index),
          description: `Continuation close through buy-side structure at ${priorHigh.price}.`
        });
      }
      structure = "bullish";
      continue;
    }

    if (priorLow && candle.close < priorLow.price && previous.close >= priorLow.price) {
      if (structure === "bearish" && !brokenSwingIds.has(priorLow.id)) {
        brokenSwingIds.add(priorLow.id);
        events.push({
          id: `bos_bearish_${candle.id}`,
          candleId: candle.id,
          timestamp: candle.timestamp,
          index,
          type: "BOS",
          direction: "bearish",
          price: priorLow.price,
          brokenSwingId: priorLow.id,
          displacement: displacementFor(candles, index),
          description: `Continuation close through sell-side structure at ${priorLow.price}.`
        });
      }
      structure = "bearish";
    }
  }

  return events;
}
