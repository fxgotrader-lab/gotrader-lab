import { detectBOS } from "@/lib/ict/detectBOS";
import { detectFairValueGaps } from "@/lib/ict/detectFVG";
import { detectLiquiditySweeps } from "@/lib/ict/detectLiquiditySweeps";
import { detectMSS } from "@/lib/ict/detectMSS";
import { detectPremiumDiscount } from "@/lib/ict/detectPremiumDiscount";
import { detectSwings } from "@/lib/ict/detectSwings";
import { tagSessions } from "@/lib/ict/sessionTagger";
import {
  loadICTScoringWeights,
  scoreICTConfluence,
  sanitizeICTScoringWeights
} from "@/lib/ict/confluenceScoring";
import type { Candle, ICTContext, ICTScoringWeights, ThesisInput } from "@/lib/types";

type ICTContextInput = Pick<ThesisInput, "symbol" | "timeframe" | "session">;

const latestByIndex = <T extends { index: number }>(items: T[]) =>
  [...items].sort((a, b) => b.index - a.index)[0];

const riskRewardQualityFor = (
  currentPrice: number,
  latestSwingHigh: number | undefined,
  latestSwingLow: number | undefined,
  rangeHigh: number,
  rangeLow: number
) => {
  const bullishTarget = Math.max(latestSwingHigh ?? rangeHigh, rangeHigh);
  const bullishInvalidation = Math.min(latestSwingLow ?? rangeLow, rangeLow);
  const bearishTarget = Math.min(latestSwingLow ?? rangeLow, rangeLow);
  const bearishInvalidation = Math.max(latestSwingHigh ?? rangeHigh, rangeHigh);
  const bullishRisk = Math.max(1, currentPrice - bullishInvalidation);
  const bearishRisk = Math.max(1, bearishInvalidation - currentPrice);
  const bullishReward = Math.max(0, bullishTarget - currentPrice);
  const bearishReward = Math.max(0, currentPrice - bearishTarget);
  const bullishRatio = bullishReward / bullishRisk;
  const bearishRatio = bearishReward / bearishRisk;
  const bullish = Math.min(1, Math.max(0, (bullishRatio - 1) / 2));
  const bearish = Math.min(1, Math.max(0, (bearishRatio - 1) / 2));

  return {
    bullish,
    bearish,
    neutral: Math.max(0, 1 - Math.max(bullish, bearish))
  };
};

export function buildICTContext(
  candles: Candle[],
  input: ICTContextInput,
  scoringWeights: Partial<ICTScoringWeights> = loadICTScoringWeights()
): ICTContext {
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
  const fairValueGap = latestGap?.direction ?? "none";
  const displacement = latestStructure?.displacement ?? (latestGap?.createdByDisplacement ? "mild" : "none");
  const killZone = latestSession?.killZone ?? "none";
  const weightsUsed = sanitizeICTScoringWeights(scoringWeights);
  const confluenceBreakdown = scoreICTConfluence({
    hasBullishMSS,
    hasBearishMSS,
    hasBullishBOS,
    hasBearishBOS,
    latestLiquiditySweep: latestSweep,
    latestFairValueGapDirection: fairValueGap,
    premiumDiscountZone,
    killZone,
    latestSwingHigh,
    latestSwingLow,
    riskRewardQuality: riskRewardQualityFor(
      premiumDiscountZone.currentPrice,
      latestSwingHigh?.price,
      latestSwingLow?.price,
      premiumDiscountZone.rangeHigh,
      premiumDiscountZone.rangeLow
    ),
    weights: weightsUsed
  });
  const bias = confluenceBreakdown.finalBias;
  const confluenceScore = confluenceBreakdown.totalScore;

  const swingHighText = latestSwingHigh ? latestSwingHigh.price : "n/a";
  const swingLowText = latestSwingLow ? latestSwingLow.price : "n/a";
  const narrativeSummary = `ICT engine reads ${bias} with ${Math.round(confluenceBreakdown.confidence * 100)}% confidence: latest swing high ${swingHighText}, latest swing low ${swingLowText}, ${mss.length} MSS, ${bos.length} BOS, ${liquiditySweeps.length} sweep(s), ${fairValueGaps.length} FVG(s), price in ${premiumDiscountZone.currentZone}, kill zone ${killZone}. ${confluenceBreakdown.explanation}`;

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
    confluenceBreakdown,
    scoringWeightsUsed: weightsUsed,
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
