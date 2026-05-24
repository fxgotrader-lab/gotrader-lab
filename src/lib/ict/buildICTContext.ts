import { detectBOS } from "@/lib/ict/detectBOS";
import { detectFairValueGaps } from "@/lib/ict/detectFVG";
import { detectLiquiditySweeps } from "@/lib/ict/detectLiquiditySweeps";
import { detectMSS } from "@/lib/ict/detectMSS";
import { detectPremiumDiscount } from "@/lib/ict/detectPremiumDiscount";
import { detectSwings } from "@/lib/ict/detectSwings";
import { tagSessions } from "@/lib/ict/sessionTagger";
import type { Candle, ICTContext, MarketBias, ThesisInput } from "@/lib/types";
import { clamp } from "@/lib/utils";

type ICTContextInput = Pick<ThesisInput, "symbol" | "timeframe" | "session">;

const latestByIndex = <T extends { index: number }>(items: T[]) =>
  [...items].sort((a, b) => b.index - a.index)[0];

const biasScore = (bias: MarketBias) => (bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0);

const scoreToBias = (score: number): MarketBias => {
  if (score > 0.14) {
    return "bullish";
  }
  if (score < -0.14) {
    return "bearish";
  }
  return "neutral";
};

export function buildICTContext(candles: Candle[], input: ICTContextInput): ICTContext {
  const scopedCandles = candles.filter((candle) => candle.symbol === input.symbol && candle.timeframe === input.timeframe);
  const sample = scopedCandles.length ? scopedCandles : candles;
  const swings = detectSwings(sample, 2);
  const mss = detectMSS(sample, swings);
  const bos = detectBOS(sample, swings);
  const liquiditySweeps = detectLiquiditySweeps(sample, swings);
  const fairValueGaps = detectFairValueGaps(sample);
  const premiumDiscountZone = detectPremiumDiscount(sample, swings);
  const sessions = tagSessions(sample);
  const latestSwingHigh = latestByIndex(swings.filter((swing) => swing.type === "high"));
  const latestSwingLow = latestByIndex(swings.filter((swing) => swing.type === "low"));
  const latestStructure = latestByIndex([...mss, ...bos]);
  const latestSweep = latestByIndex(liquiditySweeps);
  const latestGap = latestByIndex(fairValueGaps.filter((gap) => !gap.mitigated)) ?? latestByIndex(fairValueGaps);
  const latestSession = sessions[sessions.length - 1];

  const hasBullishMSS = mss.some((event) => event.direction === "bullish");
  const hasBearishMSS = mss.some((event) => event.direction === "bearish");
  const hasBullishBOS = bos.some((event) => event.direction === "bullish");
  const hasBearishBOS = bos.some((event) => event.direction === "bearish");
  const structureBias = latestStructure?.direction ?? "neutral";
  const sweepBias: MarketBias =
    latestSweep?.direction === "sell-side" ? "bullish" : latestSweep?.direction === "buy-side" ? "bearish" : "neutral";
  const gapBias = latestGap?.direction ?? "neutral";
  const locationBias: MarketBias =
    premiumDiscountZone.currentZone === "discount"
      ? "bullish"
      : premiumDiscountZone.currentZone === "premium"
        ? "bearish"
        : "neutral";

  // Assumption: structure gets the largest vote, then liquidity raids, imbalance,
  // and location. Session timing raises confidence only when directional facts exist.
  const directionalScore =
    biasScore(structureBias) * 0.36 +
    biasScore(sweepBias) * 0.26 +
    biasScore(gapBias) * 0.18 +
    biasScore(locationBias) * 0.12;
  const killZoneBoost = latestSession?.killZone !== "none" && directionalScore !== 0 ? 0.08 : 0;
  const confluenceScore = Number(clamp(0.42 + Math.abs(directionalScore) + killZoneBoost, 0.25, 0.95).toFixed(2));
  const bias = scoreToBias(directionalScore);
  const fairValueGap = latestGap?.direction ?? "none";
  const displacement = latestStructure?.displacement ?? (latestGap?.createdByDisplacement ? "mild" : "none");
  const killZone = latestSession?.killZone ?? "none";

  const swingHighText = latestSwingHigh ? latestSwingHigh.price : "n/a";
  const swingLowText = latestSwingLow ? latestSwingLow.price : "n/a";
  const narrativeSummary = `ICT engine reads ${bias} with ${Math.round(confluenceScore * 100)}% confluence: latest swing high ${swingHighText}, latest swing low ${swingLowText}, ${mss.length} MSS, ${bos.length} BOS, ${liquiditySweeps.length} sweep(s), ${fairValueGaps.length} FVG(s), price in ${premiumDiscountZone.currentZone}, kill zone ${killZone}.`;

  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    session: input.session,
    bias,
    latestSwingHigh,
    latestSwingLow,
    hasBullishMSS,
    hasBearishMSS,
    hasBullishBOS,
    hasBearishBOS,
    liquiditySweeps,
    fairValueGaps,
    premiumDiscountZone,
    killZone,
    confluenceScore,
    narrativeSummary,
    liquiditySweep: liquiditySweeps.length > 0,
    marketStructureShift: mss.length > 0,
    displacement,
    fairValueGap,
    premiumDiscount: premiumDiscountZone.currentZone,
    sessionTiming: input.session,
    higherTimeframeBias: bias,
    killZoneTag: killZone
  };
}
