import type {
  ICTConfluenceBreakdown,
  ICTConfluenceFactor,
  ICTKillZone,
  ICTScoringWeights,
  LiquiditySweep,
  MarketBias,
  PremiumDiscountZone,
  SwingPoint
} from "@/lib/types";
import { clamp } from "@/lib/utils";

const STORAGE_KEY = "gotrader-ai-lab-ict-scoring-weights";

export const defaultICTScoringWeights: ICTScoringWeights = {
  bullishMSS: 1.15,
  bearishMSS: 1.15,
  bullishBOS: 0.9,
  bearishBOS: 0.9,
  liquiditySweep: 1,
  fvgAlignment: 0.8,
  premiumDiscountAlignment: 0.7,
  sessionKillZone: 0.45,
  latestSwingStructure: 0.55,
  riskRewardQuality: 0.9
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const round = (value: number) => Number(value.toFixed(2));

const sanitizeWeight = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 3) : fallback;

export function sanitizeICTScoringWeights(weights: Partial<ICTScoringWeights> = {}): ICTScoringWeights {
  return {
    bullishMSS: sanitizeWeight(weights.bullishMSS, defaultICTScoringWeights.bullishMSS),
    bearishMSS: sanitizeWeight(weights.bearishMSS, defaultICTScoringWeights.bearishMSS),
    bullishBOS: sanitizeWeight(weights.bullishBOS, defaultICTScoringWeights.bullishBOS),
    bearishBOS: sanitizeWeight(weights.bearishBOS, defaultICTScoringWeights.bearishBOS),
    liquiditySweep: sanitizeWeight(weights.liquiditySweep, defaultICTScoringWeights.liquiditySweep),
    fvgAlignment: sanitizeWeight(weights.fvgAlignment, defaultICTScoringWeights.fvgAlignment),
    premiumDiscountAlignment: sanitizeWeight(
      weights.premiumDiscountAlignment,
      defaultICTScoringWeights.premiumDiscountAlignment
    ),
    sessionKillZone: sanitizeWeight(weights.sessionKillZone, defaultICTScoringWeights.sessionKillZone),
    latestSwingStructure: sanitizeWeight(weights.latestSwingStructure, defaultICTScoringWeights.latestSwingStructure),
    riskRewardQuality: sanitizeWeight(weights.riskRewardQuality, defaultICTScoringWeights.riskRewardQuality)
  };
}

export function loadICTScoringWeights(): ICTScoringWeights {
  if (!isBrowser()) {
    return defaultICTScoringWeights;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultICTScoringWeights;
  }

  try {
    return sanitizeICTScoringWeights(JSON.parse(raw) as Partial<ICTScoringWeights>);
  } catch {
    return defaultICTScoringWeights;
  }
}

export function saveICTScoringWeights(weights: ICTScoringWeights) {
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeICTScoringWeights(weights)));
  }
}

export function resetICTScoringWeights(): ICTScoringWeights {
  if (isBrowser()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return defaultICTScoringWeights;
}

interface ScoreICTConfluenceInput {
  hasBullishMSS: boolean;
  hasBearishMSS: boolean;
  hasBullishBOS: boolean;
  hasBearishBOS: boolean;
  latestLiquiditySweep?: LiquiditySweep;
  latestFairValueGapDirection?: "bullish" | "bearish" | "none";
  premiumDiscountZone: PremiumDiscountZone;
  killZone: ICTKillZone;
  latestSwingHigh?: SwingPoint;
  latestSwingLow?: SwingPoint;
  riskRewardQuality: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  weights?: Partial<ICTScoringWeights>;
}

const factor = (
  id: string,
  label: string,
  bias: MarketBias,
  score: number,
  weight: number,
  explanation: string
): ICTConfluenceFactor => ({
  id,
  label,
  bias,
  score: round(score),
  weight: round(weight),
  explanation
});

const addFactor = (factors: ICTConfluenceFactor[], next: ICTConfluenceFactor) => {
  if (next.weight > 0) {
    factors.push(next);
  }
};

const scoreToBias = (bullishScore: number, bearishScore: number, neutralScore: number): MarketBias => {
  const edge = bullishScore - bearishScore;
  if (Math.abs(edge) <= 0.12 || neutralScore > Math.max(bullishScore, bearishScore)) {
    return "neutral";
  }
  return edge > 0 ? "bullish" : "bearish";
};

export function scoreICTConfluence(input: ScoreICTConfluenceInput): ICTConfluenceBreakdown {
  const weights = sanitizeICTScoringWeights(input.weights);
  const factors: ICTConfluenceFactor[] = [];

  addFactor(
    factors,
    input.hasBullishMSS
      ? factor("bullish-mss", "Bullish MSS", "bullish", weights.bullishMSS, weights.bullishMSS, "Close reclaimed a prior swing high.")
      : factor("bullish-mss", "No bullish MSS", "neutral", weights.bullishMSS * 0.18, weights.bullishMSS, "No bullish market structure shift confirmed.")
  );

  addFactor(
    factors,
    input.hasBearishMSS
      ? factor("bearish-mss", "Bearish MSS", "bearish", weights.bearishMSS, weights.bearishMSS, "Close lost a prior swing low.")
      : factor("bearish-mss", "No bearish MSS", "neutral", weights.bearishMSS * 0.18, weights.bearishMSS, "No bearish market structure shift confirmed.")
  );

  addFactor(
    factors,
    input.hasBullishBOS
      ? factor("bullish-bos", "Bullish BOS", "bullish", weights.bullishBOS, weights.bullishBOS, "Continuation break through buy-side structure.")
      : factor("bullish-bos", "No bullish BOS", "neutral", weights.bullishBOS * 0.12, weights.bullishBOS, "No bullish continuation break confirmed.")
  );

  addFactor(
    factors,
    input.hasBearishBOS
      ? factor("bearish-bos", "Bearish BOS", "bearish", weights.bearishBOS, weights.bearishBOS, "Continuation break through sell-side structure.")
      : factor("bearish-bos", "No bearish BOS", "neutral", weights.bearishBOS * 0.12, weights.bearishBOS, "No bearish continuation break confirmed.")
  );

  if (input.latestLiquiditySweep?.direction === "sell-side") {
    addFactor(
      factors,
      factor(
        "liquidity-sweep",
        "Sell-side sweep",
        "bullish",
        weights.liquiditySweep,
        weights.liquiditySweep,
        "Sell-side liquidity was raided and reclaimed."
      )
    );
  } else if (input.latestLiquiditySweep?.direction === "buy-side") {
    addFactor(
      factors,
      factor(
        "liquidity-sweep",
        "Buy-side sweep",
        "bearish",
        weights.liquiditySweep,
        weights.liquiditySweep,
        "Buy-side liquidity was raided and rejected."
      )
    );
  } else {
    addFactor(
      factors,
      factor("liquidity-sweep", "No sweep", "neutral", weights.liquiditySweep * 0.2, weights.liquiditySweep, "No confirmed liquidity raid in the sample.")
    );
  }

  if (input.latestFairValueGapDirection === "bullish") {
    addFactor(
      factors,
      factor("fvg-alignment", "Bullish FVG", "bullish", weights.fvgAlignment, weights.fvgAlignment, "Latest open imbalance favors upside delivery.")
    );
  } else if (input.latestFairValueGapDirection === "bearish") {
    addFactor(
      factors,
      factor("fvg-alignment", "Bearish FVG", "bearish", weights.fvgAlignment, weights.fvgAlignment, "Latest open imbalance favors downside delivery.")
    );
  } else {
    addFactor(
      factors,
      factor("fvg-alignment", "No aligned FVG", "neutral", weights.fvgAlignment * 0.2, weights.fvgAlignment, "No open fair value gap is driving direction.")
    );
  }

  if (input.premiumDiscountZone.currentZone === "discount") {
    addFactor(
      factors,
      factor(
        "premium-discount",
        "Discount location",
        "bullish",
        weights.premiumDiscountAlignment,
        weights.premiumDiscountAlignment,
        "Price is in discount relative to the detected dealing range."
      )
    );
  } else if (input.premiumDiscountZone.currentZone === "premium") {
    addFactor(
      factors,
      factor(
        "premium-discount",
        "Premium location",
        "bearish",
        weights.premiumDiscountAlignment,
        weights.premiumDiscountAlignment,
        "Price is in premium relative to the detected dealing range."
      )
    );
  } else {
    addFactor(
      factors,
      factor(
        "premium-discount",
        "Equilibrium location",
        "neutral",
        weights.premiumDiscountAlignment * 0.6,
        weights.premiumDiscountAlignment,
        "Price is near the dealing range midpoint."
      )
    );
  }

  if (input.killZone !== "none") {
    const directionalLeader =
      input.riskRewardQuality.bullish > input.riskRewardQuality.bearish
        ? "bullish"
        : input.riskRewardQuality.bearish > input.riskRewardQuality.bullish
          ? "bearish"
          : "neutral";
    addFactor(
      factors,
      factor(
        "session-kill-zone",
        `${input.killZone} timing`,
        directionalLeader,
        weights.sessionKillZone,
        weights.sessionKillZone,
        "Current mock timestamp is inside an ICT timing window."
      )
    );
  } else {
    addFactor(
      factors,
      factor("session-kill-zone", "No kill zone", "neutral", weights.sessionKillZone * 0.25, weights.sessionKillZone, "Current mock timestamp is outside configured kill zones.")
    );
  }

  if (input.latestSwingHigh && input.latestSwingLow) {
    const swingBias: MarketBias = input.latestSwingLow.index > input.latestSwingHigh.index ? "bullish" : "bearish";
    addFactor(
      factors,
      factor(
        "latest-swing-structure",
        swingBias === "bullish" ? "Latest swing low formed last" : "Latest swing high formed last",
        swingBias,
        weights.latestSwingStructure,
        weights.latestSwingStructure,
        "Most recent confirmed swing suggests the latest structural reference."
      )
    );
  } else {
    addFactor(
      factors,
      factor(
        "latest-swing-structure",
        "Incomplete swing map",
        "neutral",
        weights.latestSwingStructure * 0.3,
        weights.latestSwingStructure,
        "Not enough confirmed swing points for structure weighting."
      )
    );
  }

  const bullishRiskScore = weights.riskRewardQuality * clamp(input.riskRewardQuality.bullish, 0, 1);
  const bearishRiskScore = weights.riskRewardQuality * clamp(input.riskRewardQuality.bearish, 0, 1);
  const neutralRiskScore = weights.riskRewardQuality * clamp(input.riskRewardQuality.neutral, 0, 1);

  if (bullishRiskScore > bearishRiskScore && bullishRiskScore > neutralRiskScore) {
    addFactor(
      factors,
      factor("risk-reward-quality", "Bullish R/R quality", "bullish", bullishRiskScore, weights.riskRewardQuality, "Upside target-to-invalidation distance is more favorable.")
    );
  } else if (bearishRiskScore > bullishRiskScore && bearishRiskScore > neutralRiskScore) {
    addFactor(
      factors,
      factor("risk-reward-quality", "Bearish R/R quality", "bearish", bearishRiskScore, weights.riskRewardQuality, "Downside target-to-invalidation distance is more favorable.")
    );
  } else {
    addFactor(
      factors,
      factor("risk-reward-quality", "Balanced R/R", "neutral", neutralRiskScore, weights.riskRewardQuality, "Risk/reward is balanced or below directional threshold.")
    );
  }

  const maxWeight = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const rawBullish = factors.filter((item) => item.bias === "bullish").reduce((sum, item) => sum + item.score, 0);
  const rawBearish = factors.filter((item) => item.bias === "bearish").reduce((sum, item) => sum + item.score, 0);
  const rawNeutral = factors.filter((item) => item.bias === "neutral").reduce((sum, item) => sum + item.score, 0);
  const bullishScore = round(clamp(rawBullish / maxWeight, 0, 1));
  const bearishScore = round(clamp(rawBearish / maxWeight, 0, 1));
  const neutralScore = round(clamp(rawNeutral / maxWeight, 0, 1));
  const finalBias = scoreToBias(bullishScore, bearishScore, neutralScore);
  const totalScore = round(Math.max(bullishScore, bearishScore, neutralScore));
  const edge = Math.abs(bullishScore - bearishScore);
  const confidence = round(clamp(0.35 + totalScore * 0.42 + edge * 0.28, 0.25, 0.95));
  const bullishFactors = factors.filter((item) => item.bias === "bullish");
  const bearishFactors = factors.filter((item) => item.bias === "bearish");
  const neutralFactors = factors.filter((item) => item.bias === "neutral");
  const positiveFactors = finalBias === "bullish" ? bullishFactors : finalBias === "bearish" ? bearishFactors : neutralFactors;
  const negativeFactors = finalBias === "bullish" ? bearishFactors : finalBias === "bearish" ? bullishFactors : [...bullishFactors, ...bearishFactors];

  return {
    totalScore,
    bullishScore,
    bearishScore,
    neutralScore,
    finalBias,
    confidence,
    explanation: `Weighted ICT confluence favors ${finalBias} with ${Math.round(confidence * 100)}% confidence. Bullish ${bullishScore.toFixed(2)}, bearish ${bearishScore.toFixed(2)}, neutral ${neutralScore.toFixed(2)} using local calibration weights.`,
    positiveFactors,
    negativeFactors,
    neutralFactors,
    bullishFactors,
    bearishFactors
  };
}
