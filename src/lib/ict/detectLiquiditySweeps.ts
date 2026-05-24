import type { Candle, LiquiditySweep, SwingPoint } from "@/lib/types";

const latestSwingBefore = (swings: SwingPoint[], index: number, type: SwingPoint["type"]) =>
  swings
    .filter((swing) => swing.type === type && swing.index < index)
    .sort((a, b) => b.index - a.index)[0];

export function detectLiquiditySweeps(candles: Candle[], swings: SwingPoint[]): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];

  // Assumption: a liquidity sweep raids a confirmed swing with the wick and rejects
  // back across that level on the close. This avoids treating clean breakouts as sweeps.
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const priorHigh = latestSwingBefore(swings, index, "high");
    const priorLow = latestSwingBefore(swings, index, "low");

    if (priorHigh && candle.high > priorHigh.price && candle.close < priorHigh.price) {
      sweeps.push({
        id: `sweep_buy_side_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        direction: "buy-side",
        sweptSwingId: priorHigh.id,
        sweptLevel: priorHigh.price,
        rejectionClose: candle.close,
        reclaimed: true,
        description: `Buy-side liquidity above ${priorHigh.price} was swept and rejected.`
      });
    }

    if (priorLow && candle.low < priorLow.price && candle.close > priorLow.price) {
      sweeps.push({
        id: `sweep_sell_side_${candle.id}`,
        candleId: candle.id,
        timestamp: candle.timestamp,
        index,
        direction: "sell-side",
        sweptSwingId: priorLow.id,
        sweptLevel: priorLow.price,
        rejectionClose: candle.close,
        reclaimed: true,
        description: `Sell-side liquidity below ${priorLow.price} was swept and reclaimed.`
      });
    }
  }

  return sweeps;
}
