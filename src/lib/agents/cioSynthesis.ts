import type { CIOSynthesisResult, InternalAgentOpinion } from "@/lib/agents/agentTypes";
import type { ICTContext, MarketBias, ThesisInput } from "@/lib/types";
import { clamp } from "@/lib/utils";

const basePriceBySymbol = {
  ES: 5265,
  NQ: 18880,
  MES: 5265,
  MNQ: 18880
} as const;

const biasToScore = (bias: MarketBias) => (bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0);

const scoreToBias = (score: number): MarketBias => {
  if (score > 0.12) {
    return "bullish";
  }
  if (score < -0.12) {
    return "bearish";
  }
  return "neutral";
};

const latestUnmitigatedGapMidpoint = (ictContext: ICTContext, bias: MarketBias, fallback: number) => {
  const gap = [...ictContext.fairValueGaps].reverse().find((item) => item.direction === bias && !item.mitigated);
  return gap?.midpoint ?? fallback;
};

function buildLevels(input: ThesisInput, finalBias: MarketBias, ictContext: ICTContext) {
  const base = basePriceBySymbol[input.symbol];
  const unit = input.symbol.includes("NQ") ? 16 : 5;
  const rawCurrentPrice = ictContext.premiumDiscountZone.currentPrice || base;
  const scale = input.symbol === "ES" || input.symbol === "MES" ? base / Math.max(1, rawCurrentPrice) : 1;
  const scaleLevel = (value: number | undefined, fallback: number) => Number(((value ?? fallback) * scale).toFixed(2));
  const currentPrice = scaleLevel(rawCurrentPrice, base);
  const equilibrium = scaleLevel(ictContext.premiumDiscountZone.equilibrium, currentPrice);
  const latestSwingHigh = scaleLevel(ictContext.latestSwingHigh?.price, currentPrice + unit * 2);
  const latestSwingLow = scaleLevel(ictContext.latestSwingLow?.price, currentPrice - unit * 2);
  const rangeHigh = scaleLevel(ictContext.premiumDiscountZone.rangeHigh, latestSwingHigh);
  const rangeLow = scaleLevel(ictContext.premiumDiscountZone.rangeLow, latestSwingLow);
  const gapMidpoint = scaleLevel(
    finalBias === "bullish"
      ? latestUnmitigatedGapMidpoint(ictContext, "bullish", equilibrium)
      : finalBias === "bearish"
        ? latestUnmitigatedGapMidpoint(ictContext, "bearish", equilibrium)
        : equilibrium,
    equilibrium
  );
  const entryMid =
    finalBias === "neutral" ? currentPrice : finalBias === "bullish" ? Math.min(currentPrice, gapMidpoint) : Math.max(currentPrice, gapMidpoint);
  const entryZone: [number, number] =
    finalBias === "neutral" ? [currentPrice - unit, currentPrice + unit] : [entryMid - unit * 0.35, entryMid + unit * 0.35];
  const invalidation =
    finalBias === "neutral"
      ? rangeLow
      : finalBias === "bullish"
        ? Math.min(latestSwingLow, rangeLow) - unit * 0.25
        : Math.max(latestSwingHigh, rangeHigh) + unit * 0.25;
  const targetLiquidity =
    finalBias === "neutral"
      ? equilibrium
      : finalBias === "bullish"
        ? Math.max(latestSwingHigh, rangeHigh) + unit * 0.5
        : Math.min(latestSwingLow, rangeLow) - unit * 0.5;
  const risk = Math.max(unit * 0.5, Math.abs(entryMid - invalidation));
  const reward = Math.abs(targetLiquidity - entryMid);

  return {
    entryZone: [Number(entryZone[0].toFixed(2)), Number(entryZone[1].toFixed(2))] as [number, number],
    invalidationLevel: Number(invalidation.toFixed(2)),
    targetLiquidity: Number(targetLiquidity.toFixed(2)),
    riskReward: finalBias === "neutral" ? 0 : Number((reward / risk).toFixed(2))
  };
}

export function synthesizeCIO(input: ThesisInput, ictContext: ICTContext, opinions: InternalAgentOpinion[]): CIOSynthesisResult {
  const totalWeight = opinions.reduce((sum, opinion) => sum + opinion.weight, 0) || 1;
  const weightedDirectionalScore =
    opinions.reduce((sum, opinion) => sum + biasToScore(opinion.bias) * opinion.confidence * opinion.weight, 0) / totalWeight;
  const finalBias = scoreToBias(weightedDirectionalScore);
  const avgConfidence = opinions.reduce((sum, opinion) => sum + opinion.confidence * opinion.weight, 0) / totalWeight;
  const confidence = clamp(0.38 + Math.abs(weightedDirectionalScore) * 0.46 + avgConfidence * 0.24, 0.35, 0.88);
  const levels = buildLevels(input, finalBias, ictContext);
  const aligned = opinions.filter((opinion) => opinion.bias === finalBias);
  const warnings = opinions.flatMap((opinion) => opinion.warningFactors);
  const topFactors = aligned.flatMap((opinion) => opinion.supportingFactors).slice(0, 5);
  const thesisSummary =
    finalBias === "neutral"
      ? `${input.symbol} ${input.timeframe} remains neutral because internal agents do not show enough weighted directional agreement.`
      : `${input.symbol} ${input.timeframe} CIO thesis is ${finalBias}; ${aligned.length} internal agent(s) align with the weighted synthesis.`;
  const riskNotes =
    finalBias === "neutral"
      ? "Simulation remains neutral until internal agents agree on structure, timing, and risk/reward."
      : `Simulation invalidates at ${levels.invalidationLevel}; warnings: ${warnings.slice(0, 3).join("; ") || "no major internal-agent veto"}. No order execution.`;
  const targetLogic =
    finalBias === "neutral"
      ? `Target logic remains balance-oriented near ${levels.targetLiquidity}.`
      : `Target logic uses the next ICT liquidity reference at ${levels.targetLiquidity}.`;
  const invalidationLogic =
    finalBias === "neutral"
      ? `Invalidation logic references the lower dealing range at ${levels.invalidationLevel}.`
      : `Invalidation logic uses the opposite ICT structure level at ${levels.invalidationLevel}.`;

  return {
    finalBias,
    confidence,
    thesisSummary,
    reasoningSummary: `CIO synthesized ${opinions.length} deterministic internal agents. Weighted score ${weightedDirectionalScore.toFixed(2)}. ${invalidationLogic} ${targetLogic}`,
    riskNotes,
    invalidationLevel: levels.invalidationLevel,
    targetLiquidity: levels.targetLiquidity,
    entryZone: levels.entryZone,
    riskReward: levels.riskReward,
    cioOpinion: {
      agentId: "cio-agent",
      name: "CIO Agent",
      layer: "cio",
      bias: finalBias,
      confidence,
      weight: 1,
      reasoning: `${thesisSummary} ${ictContext.narrativeSummary}`,
      supportingFactors: topFactors.length ? topFactors : ["No dominant directional factor; preserving neutral research posture"],
      warningFactors: warnings.slice(0, 5),
      recommendation: finalBias === "neutral" ? "Do not form a directional simulated thesis yet." : `Use ${finalBias} CIO thesis with defined simulated invalidation and target.`,
      ictTags: ["liquidity sweep", "market structure shift", "fair value gap", "premium/discount", "session timing"]
    }
  };
}
