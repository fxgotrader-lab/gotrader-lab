import type { LiquiditySweep } from "@/lib/types";
import type { GrinchDealingRange, GrinchHtfBiasResult } from "@/lib/strategyLibrary/grinchStrategyTypes";

const latestSweep = (sweeps: LiquiditySweep[] = []) => [...sweeps].sort((a, b) => b.index - a.index)[0];

export function resolveHigherTimeframeBias(
  dealingRange: GrinchDealingRange,
  liquiditySweeps: LiquiditySweep[] = []
): GrinchHtfBiasResult {
  const reasons: string[] = [dealingRange.reasoning];
  const missingEvidence: string[] = [];
  const sweep = latestSweep(liquiditySweeps);
  const sellsideTargetMet = sweep?.direction === "sell-side" && sweep.reclaimed;
  const buysideTargetMet = sweep?.direction === "buy-side" && sweep.reclaimed;

  if (!sweep) {
    missingEvidence.push("No recent liquidity sweep confirms whether buyside or sellside objective was met.");
  } else {
    reasons.push(sweep.description);
  }

  if (dealingRange.premiumDiscountState === "discount" && sellsideTargetMet) {
    return {
      htfBias: "bullish",
      htfDrawOnLiquidity: "buyside",
      liquidityObjective: "Sellside liquidity has been raided in discount; look for retracement or reversal higher toward buyside.",
      confidence: 0.72,
      reasons,
      missingEvidence
    };
  }

  if (dealingRange.premiumDiscountState === "premium" && buysideTargetMet) {
    return {
      htfBias: "bearish",
      htfDrawOnLiquidity: "sellside",
      liquidityObjective: "Buyside liquidity has been raided in premium; look for retracement or reversal lower toward sellside.",
      confidence: 0.72,
      reasons,
      missingEvidence
    };
  }

  if (dealingRange.rangeDirection === "bullish_range") {
    return {
      htfBias: dealingRange.premiumDiscountState === "premium" ? "neutral" : "bullish",
      htfDrawOnLiquidity: dealingRange.premiumDiscountState === "premium" ? "internal_range" : "buyside",
      liquidityObjective:
        dealingRange.premiumDiscountState === "premium"
          ? "Bullish range is extended into premium; wait for discount PD array respect before continuation."
          : "Bullish range can seek the range high or external buyside if discount PD arrays hold.",
      confidence: dealingRange.premiumDiscountState === "discount" ? 0.64 : 0.52,
      reasons,
      missingEvidence
    };
  }

  if (dealingRange.rangeDirection === "bearish_range") {
    return {
      htfBias: dealingRange.premiumDiscountState === "discount" ? "neutral" : "bearish",
      htfDrawOnLiquidity: dealingRange.premiumDiscountState === "discount" ? "internal_range" : "sellside",
      liquidityObjective:
        dealingRange.premiumDiscountState === "discount"
          ? "Bearish range is extended into discount; wait for premium PD array respect before continuation."
          : "Bearish range can seek the range low or external sellside if premium PD arrays hold.",
      confidence: dealingRange.premiumDiscountState === "premium" ? 0.64 : 0.52,
      reasons,
      missingEvidence
    };
  }

  return {
    htfBias: "unclear",
    htfDrawOnLiquidity: "unclear",
    liquidityObjective: "Higher-timeframe draw is unclear until range anchors and liquidity objectives are cleaner.",
    confidence: 0.25,
    reasons,
    missingEvidence: [...missingEvidence, "Meaningful A-B dealing range anchors are unclear."]
  };
}
