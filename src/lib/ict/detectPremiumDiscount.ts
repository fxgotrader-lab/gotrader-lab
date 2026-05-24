import type { Candle, PremiumDiscountZone, SwingPoint } from "@/lib/types";

export function detectPremiumDiscount(candles: Candle[], swings: SwingPoint[] = []): PremiumDiscountZone {
  const latestCandle = candles[candles.length - 1];

  if (!latestCandle) {
    return {
      rangeHigh: 0,
      rangeLow: 0,
      equilibrium: 0,
      premium: [0, 0],
      discount: [0, 0],
      currentPrice: 0,
      currentZone: "equilibrium"
    };
  }

  // Assumption: the dealing range is the highest confirmed swing high and lowest
  // confirmed swing low in the sample. If swings are unavailable, use candle extremes.
  const swingHighs = swings.filter((swing) => swing.type === "high").map((swing) => swing.price);
  const swingLows = swings.filter((swing) => swing.type === "low").map((swing) => swing.price);
  const rangeHigh = swingHighs.length ? Math.max(...swingHighs) : Math.max(...candles.map((candle) => candle.high));
  const rangeLow = swingLows.length ? Math.min(...swingLows) : Math.min(...candles.map((candle) => candle.low));
  const equilibrium = Number(((rangeHigh + rangeLow) / 2).toFixed(2));
  const currentPrice = latestCandle.close;
  const equilibriumBand = (rangeHigh - rangeLow) * 0.05;
  const currentZone =
    currentPrice > equilibrium + equilibriumBand
      ? "premium"
      : currentPrice < equilibrium - equilibriumBand
        ? "discount"
        : "equilibrium";

  return {
    rangeHigh,
    rangeLow,
    equilibrium,
    premium: [equilibrium, rangeHigh],
    discount: [rangeLow, equilibrium],
    currentPrice,
    currentZone
  };
}
