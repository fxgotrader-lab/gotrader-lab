import type { InternalAgentDefinition, InternalAgentRunContext } from "@/lib/agents/agentTypes";
import {
  analyzeGrinchPhase1,
  analyzeGrinchPhase2Reversal,
  analyzeGrinchPhase3Consolidation,
  analyzeGrinchPhase4Smt
} from "@/lib/strategyLibrary";
import { summarizeRegimeClassification } from "@/lib/regime";
import type { MarketBias, MarketRegime } from "@/lib/types";
import { clamp } from "@/lib/utils";

const latestClose = ({ marketContext }: InternalAgentRunContext) => {
  const candles = marketContext.priceVolume.ohlcv.candles;
  return candles[candles.length - 1]?.close ?? marketContext.priceVolume.priorDay.close ?? 0;
};

const fmtLevel = (value?: number) => (typeof value === "number" ? value.toFixed(2) : "n/a");

const hasHighImpactEvent = ({ marketContext }: InternalAgentRunContext) =>
  marketContext.macro.economicCalendar.some((event) => event.impact === "high");

const regimeBias: Record<MarketRegime, MarketBias> = {
  trend: "bullish",
  balanced: "neutral",
  volatile: "neutral",
  range: "neutral",
  "news-driven": "neutral",
  "risk-off": "bearish",
  "risk-on": "bullish"
};

const contextTags = ["session timing", "higher-timeframe bias", "premium/discount"] as const;

const grinchPhase1For = ({ ictContext, marketContext }: InternalAgentRunContext) =>
  analyzeGrinchPhase1({
    candles: marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: ictContext.fairValueGaps,
    liquiditySweeps: ictContext.liquiditySweeps,
    options: {
      symbol: marketContext.symbol,
      timeframe: marketContext.timeframe,
      currentTimestamp: marketContext.priceVolume.ohlcv.candles[marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });

const grinchReversalFor = (context: InternalAgentRunContext) => {
  const phase1 = grinchPhase1For(context);
  return analyzeGrinchPhase2Reversal({
    candles: context.marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: context.ictContext.fairValueGaps,
    liquiditySweeps: context.ictContext.liquiditySweeps,
    phase1,
    options: {
      symbol: context.marketContext.symbol,
      timeframe: context.marketContext.timeframe,
      currentTimestamp: context.marketContext.priceVolume.ohlcv.candles[context.marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });
};

const grinchConsolidationFor = (context: InternalAgentRunContext) => {
  const phase1 = grinchPhase1For(context);
  return analyzeGrinchPhase3Consolidation({
    candles: context.marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: context.ictContext.fairValueGaps,
    liquiditySweeps: context.ictContext.liquiditySweeps,
    phase1,
    options: {
      symbol: context.marketContext.symbol,
      timeframe: context.marketContext.timeframe,
      currentTimestamp: context.marketContext.priceVolume.ohlcv.candles[context.marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });
};

const grinchSmtFor = (context: InternalAgentRunContext) => {
  const phase1 = grinchPhase1For(context);
  const reversal = analyzeGrinchPhase2Reversal({
    candles: context.marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: context.ictContext.fairValueGaps,
    liquiditySweeps: context.ictContext.liquiditySweeps,
    phase1,
    options: {
      symbol: context.marketContext.symbol,
      timeframe: context.marketContext.timeframe,
      currentTimestamp: context.marketContext.priceVolume.ohlcv.candles[context.marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });
  const consolidation = analyzeGrinchPhase3Consolidation({
    candles: context.marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: context.ictContext.fairValueGaps,
    liquiditySweeps: context.ictContext.liquiditySweeps,
    phase1,
    options: {
      symbol: context.marketContext.symbol,
      timeframe: context.marketContext.timeframe,
      currentTimestamp: context.marketContext.priceVolume.ohlcv.candles[context.marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });
  return analyzeGrinchPhase4Smt({
    candles: context.marketContext.priceVolume.ohlcv.candles,
    fairValueGaps: context.ictContext.fairValueGaps,
    liquiditySweeps: context.ictContext.liquiditySweeps,
    phase1,
    reversal,
    consolidation,
    options: {
      symbol: context.marketContext.symbol,
      timeframe: context.marketContext.timeframe,
      currentTimestamp: context.marketContext.priceVolume.ohlcv.candles[context.marketContext.priceVolume.ohlcv.candles.length - 1]?.timestamp
    }
  });
};

const grinchBiasToMarketBias = (bias: string): MarketBias => (bias === "bullish" || bias === "bearish" ? bias : "neutral");

export const researchAgentRegistry: InternalAgentDefinition[] = [
  {
    agentId: "ict-liquidity-agent",
    name: "ICT Liquidity Agent",
    layer: "strategy",
    weight: 0.15,
    run({ ictContext }) {
      const latestSweep = [...ictContext.liquiditySweeps].sort((a, b) => b.index - a.index)[0];
      const bias: MarketBias =
        latestSweep?.direction === "sell-side" ? "bullish" : latestSweep?.direction === "buy-side" ? "bearish" : "neutral";
      const confidence = clamp(0.42 + ictContext.liquiditySweeps.length * 0.08 + ictContext.confluenceBreakdown.confidence * 0.22, 0.35, 0.9);
      const supportingFactors = latestSweep
        ? [latestSweep.description, `${ictContext.liquiditySweeps.length} sweep(s) detected`]
        : ["No confirmed liquidity sweep in the mock candle window"];
      const warningFactors = latestSweep ? [] : ["Liquidity agent is neutral until a sweep rejects back through the level"];

      return {
        agentId: "ict-liquidity-agent",
        name: "ICT Liquidity Agent",
        layer: "strategy",
        bias,
        confidence,
        weight: 0.15,
        reasoning: latestSweep
          ? `Latest liquidity event is a ${latestSweep.direction} sweep at ${latestSweep.sweptLevel}.`
          : "No deterministic sweep confirmation is present in the mock sample.",
        supportingFactors,
        warningFactors,
        recommendation:
          bias === "neutral" ? "Wait for a confirmed liquidity raid and rejection." : `Favor ${bias} research while the swept level remains respected.`,
        ictTags: ["liquidity sweep", "kill-zone tagging"]
      };
    }
  },
  {
    agentId: "ict-structure-agent",
    name: "ICT Structure Agent",
    layer: "strategy",
    weight: 0.16,
    run({ ictContext }) {
      const bullishCount = Number(ictContext.hasBullishMSS) + Number(ictContext.hasBullishBOS);
      const bearishCount = Number(ictContext.hasBearishMSS) + Number(ictContext.hasBearishBOS);
      const bias: MarketBias = bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";
      const confidence = clamp(0.38 + Math.max(bullishCount, bearishCount) * 0.16 + ictContext.confluenceBreakdown.confidence * 0.18, 0.35, 0.9);
      const supportingFactors = [
        ictContext.hasBullishMSS ? "Bullish MSS confirmed" : "No bullish MSS",
        ictContext.hasBearishMSS ? "Bearish MSS confirmed" : "No bearish MSS",
        ictContext.hasBullishBOS ? "Bullish BOS confirmed" : "No bullish BOS",
        ictContext.hasBearishBOS ? "Bearish BOS confirmed" : "No bearish BOS"
      ];
      const warningFactors = bias === "neutral" ? ["Structure is mixed or unresolved"] : [];

      return {
        agentId: "ict-structure-agent",
        name: "ICT Structure Agent",
        layer: "strategy",
        bias,
        confidence,
        weight: 0.16,
        reasoning: `Structure map reads ${bias}; latest swing high ${ictContext.latestSwingHigh?.price ?? "n/a"} and latest swing low ${ictContext.latestSwingLow?.price ?? "n/a"}.`,
        supportingFactors,
        warningFactors,
        recommendation: bias === "neutral" ? "Keep CIO thesis neutral unless structure breaks cleanly." : `Use ${bias} structure as the primary directional anchor.`,
        ictTags: ["market structure shift", "higher-timeframe bias", "displacement"]
      };
    }
  },
  {
    agentId: "grinch-htf-bias-agent",
    name: "Higher-Timeframe Bias Agent",
    layer: "strategy",
    weight: 0.08,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias = grinchBiasToMarketBias(phase1.htfBias);
      return {
        agentId: "grinch-htf-bias-agent",
        name: "Higher-Timeframe Bias Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.38 + phase1.confidenceAdjustment * 0.34, 0.3, 0.82),
        weight: 0.08,
        reasoning: `Grinch Phase 1 reads ${phase1.htfBias} with draw on ${phase1.htfDrawOnLiquidity}.`,
        supportingFactors: phase1.reasons.slice(0, 3),
        warningFactors: phase1.htfBias === "unclear" ? ["Higher-timeframe draw is unclear; do not force a thesis."] : [],
        recommendation: bias === "neutral" ? "Keep CIO neutral until HTF draw and range logic align." : `Use ${bias} HTF bias only after lower-timeframe confirmation.`,
        ictTags: ["higher-timeframe bias", "premium/discount", "liquidity sweep"]
      };
    }
  },
  {
    agentId: "grinch-pd-array-hierarchy-agent",
    name: "PD Array Hierarchy Agent",
    layer: "strategy",
    weight: 0.06,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const active = phase1.activePdArrays[0];
      const bias = grinchBiasToMarketBias(active?.direction ?? phase1.htfBias);
      return {
        agentId: "grinch-pd-array-hierarchy-agent",
        name: "PD Array Hierarchy Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.34 + (active ? active.strength * 0.32 : 0) + phase1.entryConfirmation.confirmationScore * 0.16, 0.28, 0.8),
        weight: 0.06,
        reasoning: active ? `${active.label} ranks ${active.hierarchyRank} and is ${active.respected ? "respected" : active.active ? "active" : "nearby"}.` : "No active PD array is confirmed.",
        supportingFactors: phase1.activePdArrays.slice(0, 3).map((array) => `${array.label}: ${array.reason}`),
        warningFactors: active ? [] : ["No high-quality PD array is active; lower-timeframe entries are incomplete."],
        recommendation: active ? `Prioritize ${active.label} before lower hierarchy arrays.` : "Wait for opening-price or imbalance reference to become active.",
        ictTags: ["premium/discount", "fair value gap", "higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "grinch-opening-price-equilibrium-agent",
    name: "Opening Price Equilibrium Agent",
    layer: "strategy",
    weight: 0.06,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias: MarketBias =
        phase1.twelveAmOpenState.currentRelation === "below" && phase1.htfBias === "bullish"
          ? "bullish"
          : phase1.twelveAmOpenState.currentRelation === "above" && phase1.htfBias === "bearish"
            ? "bearish"
            : "neutral";
      return {
        agentId: "grinch-opening-price-equilibrium-agent",
        name: "Opening Price Equilibrium Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.3 + phase1.twelveAmOpenState.sensitivityScore * 0.25 + phase1.sundayOpenState.sensitivityScore * 0.18, 0.28, 0.78),
        weight: 0.06,
        reasoning: `Sunday Open is ${phase1.sundayOpenState.currentRelation}; 12AM Open is ${phase1.twelveAmOpenState.currentRelation}.`,
        supportingFactors: [phase1.sundayOpenState.expectation, phase1.twelveAmOpenState.expectation],
        warningFactors: [...phase1.sundayOpenState.missingEvidence, ...phase1.twelveAmOpenState.missingEvidence],
        recommendation: "Treat Sunday Open and 12AM Open as strongest 1H-and-lower PD arrays, not standalone trade signals.",
        ictTags: ["session timing", "premium/discount", "higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "grinch-dealing-range-agent",
    name: "Dealing Range Agent",
    layer: "strategy",
    weight: 0.06,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias =
        phase1.dealingRange.rangeDirection === "bullish_range" && phase1.dealingRange.premiumDiscountState === "discount"
          ? "bullish"
          : phase1.dealingRange.rangeDirection === "bearish_range" && phase1.dealingRange.premiumDiscountState === "premium"
            ? "bearish"
            : "neutral";
      return {
        agentId: "grinch-dealing-range-agent",
        name: "Dealing Range Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.36 + (bias === "neutral" ? 0 : 0.22), 0.3, 0.78),
        weight: 0.06,
        reasoning: `${phase1.dealingRange.reasoning} Current price is in ${phase1.dealingRange.premiumDiscountState}.`,
        supportingFactors: [
          `Range high ${phase1.dealingRange.rangeHigh}`,
          `Equilibrium ${phase1.dealingRange.equilibrium}`,
          `Range low ${phase1.dealingRange.rangeLow}`
        ],
        warningFactors: phase1.dealingRange.premiumDiscountState === "outside_range" ? ["Price is outside the active dealing range."] : [],
        recommendation: "Bias starts with the current dealing range; continuation needs PD array respect after retracement.",
        ictTags: ["premium/discount", "higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "grinch-market-cycle-agent",
    name: "Market Cycle Agent",
    layer: "strategy",
    weight: 0.05,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias: MarketBias =
        phase1.marketCycle === "expansion" ? grinchBiasToMarketBias(phase1.htfBias) : phase1.marketCycle === "reversal" ? "neutral" : "neutral";
      return {
        agentId: "grinch-market-cycle-agent",
        name: "Market Cycle Agent",
        layer: "strategy",
        bias,
        confidence: phase1.marketCycle === "unclear" ? 0.32 : 0.58,
        weight: 0.05,
        reasoning: `Cycle classified as ${phase1.marketCycle}; profile timing is ${phase1.timingGrade}.`,
        supportingFactors: phase1.reasons.filter((reason) => reason.toLowerCase().includes("range") || reason.toLowerCase().includes("cycle")).slice(0, 3),
        warningFactors: phase1.marketCycle === "reversal" ? ["Continuation weakens when range violation implies reversal risk."] : [],
        recommendation: "Use cycle state to decide whether the model is accumulation, delivery, retracement, or reversal-prone.",
        ictTags: ["displacement", "premium/discount", "session timing"]
      };
    }
  },
  {
    agentId: "grinch-model-one-power-three-agent",
    name: "Model 1 / Power 3 OTE Agent",
    layer: "strategy",
    weight: 0.07,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias = phase1.modelOneState === "valid" ? grinchBiasToMarketBias(phase1.htfBias) : "neutral";
      return {
        agentId: "grinch-model-one-power-three-agent",
        name: "Model 1 / Power 3 OTE Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.3 + (phase1.modelOneState === "valid" ? 0.36 : phase1.modelOneState === "weak" ? 0.16 : 0), 0.28, 0.82),
        weight: 0.07,
        reasoning: `Model 1 is ${phase1.modelOneState}; trade intent is ${phase1.tradeIntent}.`,
        supportingFactors: phase1.reasons.slice(0, 4),
        warningFactors: phase1.missingEvidence.slice(0, 4),
        recommendation:
          phase1.modelOneState === "valid"
            ? "Treat Model 1 as a research profile only; 5m/1m confirmation is still required."
            : "Do not use Model 1 until London/12AM/displacement/NY retracement evidence is complete.",
        ictTags: ["session timing", "displacement", "fair value gap"]
      };
    }
  },
  {
    agentId: "grinch-reversal-profile-agent",
    name: "Reversal Profile Agent",
    layer: "strategy",
    weight: 0.06,
    run(context) {
      const reversal = grinchReversalFor(context);
      const bias = reversal.reversalProfileState === "valid" ? grinchBiasToMarketBias(reversal.reversalBias) : "neutral";
      return {
        agentId: "grinch-reversal-profile-agent",
        name: "Reversal Profile Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.28 + (reversal.reversalProfileState === "valid" ? 0.36 : reversal.reversalProfileState === "weak" ? 0.16 : 0), 0.28, 0.82),
        weight: 0.06,
        reasoning: `Reversal Profile is ${reversal.reversalProfileState}; London behavior ${reversal.londonBehavior}; first target ${reversal.firstTarget}.`,
        supportingFactors: reversal.reasons.slice(0, 4),
        warningFactors: reversal.missingEvidence.slice(0, 4),
        recommendation:
          reversal.reversalProfileState === "valid"
            ? "Treat reversal profile as research-only; 5m/1m confirmation is still required before any simulated entry."
            : "Do not use Reversal Profile until London fails to interact with 12AM and NY rotates toward the open.",
        ictTags: ["session timing", "displacement", "higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "grinch-consolidation-profile-agent",
    name: "Consolidation Profile Agent",
    layer: "strategy",
    weight: 0.06,
    run(context) {
      const consolidation = grinchConsolidationFor(context);
      const bias =
        consolidation.consolidationProfileState === "valid"
          ? grinchBiasToMarketBias(consolidation.expectedExpansionDirection)
          : "neutral";
      return {
        agentId: "grinch-consolidation-profile-agent",
        name: "Consolidation Profile Agent",
        layer: "strategy",
        bias,
        confidence: clamp(
          0.28 + (consolidation.consolidationProfileState === "valid" ? 0.36 : consolidation.consolidationProfileState === "weak" ? 0.16 : 0),
          0.28,
          0.82
        ),
        weight: 0.06,
        reasoning: `Consolidation Profile is ${consolidation.consolidationProfileState}; raid ${consolidation.liquidityRaidState}; expansion ${consolidation.expectedExpansionDirection}.`,
        supportingFactors: consolidation.reasons.slice(0, 4),
        warningFactors: consolidation.missingEvidence.slice(0, 4),
        recommendation:
          consolidation.consolidationProfileState === "valid"
            ? "Treat consolidation profile as research-only; expansion still needs lower-timeframe confirmation."
            : "Do not use Consolidation Profile until 12AM range, raid, and displacement evidence align with HTF bias.",
        ictTags: ["session timing", "premium/discount", "displacement"]
      };
    }
  },
  {
    agentId: "grinch-smt-intermarket-agent",
    name: "SMT / Intermarket Divergence Agent",
    layer: "strategy",
    weight: 0.04,
    run(context) {
      const smt = grinchSmtFor(context);
      const bias: MarketBias =
        smt.smtState === "bullish_confirmation"
          ? "bullish"
          : smt.smtState === "bearish_confirmation"
            ? "bearish"
            : "neutral";
      const warningFactors = [
        ...smt.missingEvidence.slice(0, 4),
        ...(smt.conflictWarning ? [smt.conflictWarning] : []),
        ...(smt.smtState === "none" ? ["Missing SMT confirmation does not invalidate the setup, but it should not be counted as confirmation."] : [])
      ];
      return {
        agentId: "grinch-smt-intermarket-agent",
        name: "SMT / Intermarket Divergence Agent",
        layer: "strategy",
        bias,
        confidence: clamp(
          0.32 +
            (smt.smtState === "bullish_confirmation" || smt.smtState === "bearish_confirmation" ? 0.2 : 0) +
            (smt.smtState === "conflict" ? -0.08 : 0) +
            smt.confidenceAdjustment * 0.4,
          0.24,
          0.78
        ),
        weight: 0.04,
        reasoning: `SMT is ${smt.smtState}; pair ${smt.primaryPair}; divergence ${smt.divergenceType}; active profile ${smt.activeProfile}.`,
        supportingFactors: smt.reasons.slice(0, 4),
        warningFactors,
        recommendation:
          smt.smtState === "unavailable"
            ? "Treat SMT as missing evidence until correlated ES/YM candles are available."
            : smt.smtState === "conflict"
              ? "Lower confidence or block weak setups when SMT conflicts with the active Grinch profile."
              : "Use SMT only as confirmation after HTF bias, PD reaction, 12AM/Sunday context, and the 15m profile already align.",
        ictTags: ["higher-timeframe bias", "liquidity sweep", "session timing"]
      };
    }
  },
  {
    agentId: "grinch-time-price-alignment-agent",
    name: "Time-Price Alignment Agent",
    layer: "strategy",
    weight: 0.04,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias = phase1.timingGrade === "ideal" || phase1.timingGrade === "acceptable" ? grinchBiasToMarketBias(phase1.htfBias) : "neutral";
      return {
        agentId: "grinch-time-price-alignment-agent",
        name: "Time-Price Alignment Agent",
        layer: "strategy",
        bias,
        confidence: phase1.timingGrade === "ideal" ? 0.74 : phase1.timingGrade === "acceptable" ? 0.62 : phase1.timingGrade === "late" ? 0.38 : 0.3,
        weight: 0.04,
        reasoning: `Timing grade is ${phase1.timingGrade}.`,
        supportingFactors: phase1.reasons.filter((reason) => reason.toLowerCase().includes("timing") || reason.toLowerCase().includes("window")).slice(0, 3),
        warningFactors: phase1.timingGrade === "late" || phase1.timingGrade === "expired" ? ["Timing is late/expired; probability is reduced."] : [],
        recommendation: "On-time profiles get higher confidence; early profiles wait and expired profiles stay no-trade.",
        ictTags: ["session timing", "kill-zone tagging"]
      };
    }
  },
  {
    agentId: "grinch-entry-confirmation-agent",
    name: "Entry Confirmation Agent",
    layer: "strategy",
    weight: 0.05,
    run(context) {
      const phase1 = grinchPhase1For(context);
      const bias = phase1.entryConfirmation.confirmationScore >= 0.7 ? grinchBiasToMarketBias(phase1.htfBias) : "neutral";
      return {
        agentId: "grinch-entry-confirmation-agent",
        name: "Entry Confirmation Agent",
        layer: "strategy",
        bias,
        confidence: clamp(0.28 + phase1.entryConfirmation.confirmationScore * 0.5, 0.28, 0.82),
        weight: 0.05,
        reasoning: `Entry confirmation score is ${Math.round(phase1.entryConfirmation.confirmationScore * 100)}%.`,
        supportingFactors: phase1.entryConfirmation.reasons.slice(0, 4),
        warningFactors: phase1.entryConfirmation.missingEvidence.slice(0, 4),
        recommendation: "15m identifies the profile; 5m/1m must confirm PD respect, displacement, MSS/BOS, and fresh FVG before any research entry.",
        ictTags: ["fair value gap", "market structure shift", "displacement", "session timing"]
      };
    }
  },
  {
    agentId: "session-timing-agent",
    name: "ICT Session Timing Agent",
    layer: "strategy",
    weight: 0.08,
    run({ ictContext, input }) {
      const inKillZone = ictContext.killZone !== "none";
      const bias = inKillZone ? ictContext.bias : "neutral";
      const confidence = clamp((inKillZone ? 0.55 : 0.36) + ictContext.confluenceBreakdown.confidence * 0.18, 0.3, 0.82);
      const supportingFactors = [`Input session: ${input.session}`, `Detected kill zone: ${ictContext.killZone}`];
      const warningFactors = inKillZone ? [] : ["Current mock timestamp is outside an ICT kill-zone tag"];

      return {
        agentId: "session-timing-agent",
        name: "ICT Session Timing Agent",
        layer: "strategy",
        bias,
        confidence,
        weight: 0.08,
        reasoning: inKillZone
          ? `${ictContext.killZone} timing supports using ICT evidence now.`
          : "Session timing does not add directional urgency.",
        supportingFactors,
        warningFactors,
        recommendation: inKillZone ? `Allow ${bias} ICT evidence into CIO synthesis.` : "Discount entries until timing improves.",
        ictTags: ["session timing", "kill-zone tagging"]
      };
    }
  },
  {
    agentId: "risk-reward-agent",
    name: "Risk/Reward Agent",
    layer: "strategy",
    weight: 0.13,
    run({ ictContext }) {
      const riskFactor = [...ictContext.confluenceBreakdown.bullishFactors, ...ictContext.confluenceBreakdown.bearishFactors, ...ictContext.confluenceBreakdown.neutralFactors].find(
        (factor) => factor.id === "risk-reward-quality"
      );
      const bias = riskFactor?.bias ?? "neutral";
      const confidence = clamp(0.38 + ((riskFactor?.score ?? 0) / Math.max(0.1, riskFactor?.weight ?? 1)) * 0.42, 0.3, 0.86);
      const supportingFactors = riskFactor ? [riskFactor.explanation] : ["Risk/reward factor was not available"];
      const warningFactors = bias === "neutral" ? ["Directional reward is not clearly superior to risk"] : [];

      return {
        agentId: "risk-reward-agent",
        name: "Risk/Reward Agent",
        layer: "strategy",
        bias,
        confidence,
        weight: 0.13,
        reasoning: riskFactor ? `${riskFactor.label}: ${riskFactor.explanation}` : "Risk/reward is unresolved.",
        supportingFactors,
        warningFactors,
        recommendation: bias === "neutral" ? "Reduce CIO conviction until target and invalidation improve." : `Use ${bias} target/invalidation asymmetry.`,
        ictTags: ["premium/discount"]
      };
    }
  },
  {
    agentId: "session-levels-agent",
    name: "Session Levels Agent",
    layer: "market_context",
    weight: 0.1,
    run(context) {
      const { marketContext, ictContext } = context;
      const current = latestClose(context);
      const { priorDay, priorWeek, priorMonth, overnight, globexRange } = marketContext.priceVolume;
      const sellSideReference = Math.min(overnight.low ?? current, globexRange.low ?? current, priorDay.low ?? current);
      const buySideReference = Math.max(overnight.high ?? current, globexRange.high ?? current, priorDay.high ?? current);
      const latestSweep = [...ictContext.liquiditySweeps].sort((a, b) => b.index - a.index)[0];
      const bias: MarketBias =
        latestSweep?.direction === "sell-side" && current > sellSideReference
          ? "bullish"
          : latestSweep?.direction === "buy-side" && current < buySideReference
            ? "bearish"
            : "neutral";
      const distanceToReference = Math.min(Math.abs(current - sellSideReference), Math.abs(current - buySideReference));
      const confidence = clamp(0.42 + (latestSweep ? 0.18 : 0) + Math.max(0, 1 - distanceToReference / Math.max(1, current * 0.01)) * 0.12, 0.32, 0.82);

      return {
        agentId: "session-levels-agent",
        name: "Session Levels Agent",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.1,
        reasoning: `Session levels compare current ${fmtLevel(current)} against overnight ${fmtLevel(overnight.low)}-${fmtLevel(overnight.high)}, Globex ${fmtLevel(globexRange.low)}-${fmtLevel(globexRange.high)}, prior day ${fmtLevel(priorDay.low)}-${fmtLevel(priorDay.high)}, prior week high ${fmtLevel(priorWeek.high)}, and prior month high ${fmtLevel(priorMonth.high)}.`,
        supportingFactors: [
          `Sell-side reference ${fmtLevel(sellSideReference)}`,
          `Buy-side reference ${fmtLevel(buySideReference)}`,
          latestSweep ? `Latest sweep ${latestSweep.direction} at ${latestSweep.sweptLevel}` : "No latest sweep at a major session level"
        ],
        warningFactors: latestSweep ? [] : ["No session-level sweep confirmation; do not treat levels alone as a thesis."],
        recommendation:
          bias === "neutral"
            ? "Use session levels as liquidity map context only."
            : `Let ${bias} session-level sweep evidence support the CIO thesis if ICT structure agrees.`,
        ictTags: ["liquidity sweep", "session timing", "higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "auction-volume-profile-agent",
    name: "Auction/Volume Profile Agent",
    layer: "market_context",
    weight: 0.1,
    run(context) {
      const { marketContext } = context;
      const current = latestClose(context);
      const profile = marketContext.priceVolume.volumeProfile;
      const aboveVwap = typeof profile.vwap === "number" && current > profile.vwap;
      const belowVal = typeof profile.val === "number" && current < profile.val;
      const aboveVah = typeof profile.vah === "number" && current > profile.vah;
      const bias: MarketBias = aboveVwap && !aboveVah ? "bullish" : belowVal ? "bearish" : "neutral";
      const confidence = clamp(0.4 + (aboveVwap || belowVal ? 0.16 : 0) + (profile.volumeProfileStatus === "available_mock" ? 0.08 : 0), 0.3, 0.78);

      return {
        agentId: "auction-volume-profile-agent",
        name: "Auction/Volume Profile Agent",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.1,
        reasoning: `Auction context reads current ${fmtLevel(current)} versus VWAP ${fmtLevel(profile.vwap)}, anchored VWAP ${fmtLevel(profile.anchoredVwap)}, VPOC ${fmtLevel(profile.vpoc)}, VAH ${fmtLevel(profile.vah)}, and VAL ${fmtLevel(profile.val)}.`,
        supportingFactors: [
          aboveVwap ? "Price is above VWAP" : "Price is not above VWAP",
          belowVal ? "Price is below value area low" : "Price is not below value area low",
          aboveVah ? "Price is extended above value area high" : "Price is inside or below upper value"
        ],
        warningFactors: [
          ...(aboveVah ? ["Above VAH can be acceptance or exhaustion; require ICT confirmation."] : []),
          ...(profile.volumeProfileStatus !== "available_mock" ? ["Volume profile is not available yet."] : [])
        ],
        recommendation:
          bias === "neutral"
            ? "Do not force direction from auction context; wait for acceptance or rejection."
            : `Use ${bias} auction acceptance/rejection as supporting context, not a standalone trigger.`,
        ictTags: ["premium/discount", "displacement"]
      };
    }
  },
  {
    agentId: "macro-event-risk-agent",
    name: "Macro Event Risk Agent",
    layer: "macro",
    weight: 0.08,
    run(context) {
      const { marketContext, input } = context;
      const highImpact = hasHighImpactEvent(context);
      const bias = highImpact || input.marketRegime === "news-driven" ? "neutral" : marketContext.macro.macroRiskBias;
      const confidence = clamp(highImpact ? 0.66 : 0.48, 0.3, 0.76);
      const eventNames = marketContext.macro.economicCalendar.map((event) => `${event.name} ${event.impact}`);

      return {
        agentId: "macro-event-risk-agent",
        name: "Macro Event Risk Agent",
        layer: "macro",
        bias,
        confidence,
        weight: 0.08,
        reasoning: `Macro calendar status is ${marketContext.macro.status}; regime is ${input.marketRegime}; macro risk bias is ${marketContext.macro.macroRiskBias}.`,
        supportingFactors: [
          `Fed funds implied path: ${marketContext.macro.fedFundsImpliedPath ?? "n/a"}`,
          `DXY ${marketContext.macro.dxy ?? "n/a"}`,
          `VIX ${marketContext.macro.vix ?? "n/a"}`,
          ...eventNames
        ],
        warningFactors: highImpact ? ["High-impact macro event can distort normal ICT behavior."] : [],
        recommendation: highImpact ? "Cap CIO confidence and require post-event confirmation." : "Macro event risk does not veto the thesis.",
        ictTags: ["session timing", "displacement"]
      };
    }
  },
  {
    agentId: "composite-regime-agent",
    name: "Composite Regime Agent",
    layer: "market_context",
    weight: 0.07,
    run({ regimeClassification }) {
      const regime = regimeClassification;
      const bullish = regime?.stableLabel === "trend_bull";
      const bearish = regime?.stableLabel === "trend_bear" || regime?.stableLabel === "risk_off_crisis";
      const bias: MarketBias = bullish ? "bullish" : bearish ? "bearish" : "neutral";
      const confidence = regime ? clamp(0.3 + regime.confidence * 0.5 - regime.conflictScore * 0.18, 0.25, 0.82) : 0.28;

      return {
        agentId: "composite-regime-agent",
        name: "Composite Regime Agent",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.07,
        reasoning: regime
          ? `Composite deterministic regime is ${summarizeRegimeClassification(regime)}.`
          : "Composite regime classifier did not receive enough market data.",
        supportingFactors: regime?.supportingFactors.slice(0, 5) ?? ["Regime output unavailable."],
        warningFactors: [
          ...(regime?.warnings.slice(0, 4) ?? []),
          regime?.transitionPending ? "Regime transition is pending; do not over-weight new candidate families yet." : undefined,
          regime?.dataQuality !== "sufficient" ? "Regime data quality is not sufficient; degrade confidence." : undefined
        ].filter((item): item is string => Boolean(item)),
        recommendation: regime
          ? regime.recommendedBehavior
          : "Do not use regime as confirmation until sufficient data exists.",
        ictTags: ["higher-timeframe bias", "session timing", "displacement"]
      };
    }
  },
  {
    agentId: "intermarket-confirmation-agent",
    name: "Intermarket Confirmation Agent",
    layer: "market_context",
    weight: 0.08,
    run({ marketContext, ictContext }) {
      const supportive =
        marketContext.intermarket.dxyNqRelationship === "supportive" &&
        marketContext.intermarket.vixEquityRelationship === "supportive" &&
        marketContext.intermarket.ymEsDivergence !== "diverging";
      const headwind =
        marketContext.intermarket.dxyNqRelationship === "headwind" ||
        marketContext.intermarket.vixEquityRelationship === "risk_off" ||
        marketContext.intermarket.ymEsDivergence === "diverging";
      const bias: MarketBias = supportive ? ictContext.bias : headwind ? "bearish" : "neutral";
      const confidence = clamp(0.38 + (supportive || headwind ? 0.18 : 0) + ictContext.confluenceBreakdown.confidence * 0.1, 0.3, 0.78);

      return {
        agentId: "intermarket-confirmation-agent",
        name: "Intermarket Confirmation Agent",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.08,
        reasoning: `Intermarket context: ES/NQ ratio ${marketContext.intermarket.esNqRatio ?? "n/a"}, YM/ES ${marketContext.intermarket.ymEsDivergence}, DXY/NQ ${marketContext.intermarket.dxyNqRelationship}, VIX/equity ${marketContext.intermarket.vixEquityRelationship}.`,
        supportingFactors: [
          marketContext.intermarket.bondFuturesContext ?? "Bond context unavailable",
          marketContext.intermarket.crudeGoldRiskContext ?? "Crude/gold context unavailable"
        ],
        warningFactors: headwind ? ["Intermarket evidence challenges directional confidence."] : [],
        recommendation: supportive ? `Intermarkets confirm the ${ictContext.bias} ICT thesis.` : "Treat intermarket evidence as a confidence filter.",
        ictTags: ["higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "positioning-gamma-agent",
    name: "Positioning/Gamma Agent",
    layer: "market_context",
    weight: 0.05,
    run({ marketContext }) {
      const bias = marketContext.positioning.netPositioningBias;
      const gammaCount = marketContext.positioning.gammaLevels.length;
      const confidence = clamp(0.34 + gammaCount * 0.04 + (bias === "neutral" ? 0 : 0.12), 0.3, 0.72);

      return {
        agentId: "positioning-gamma-agent",
        name: "Positioning/Gamma Agent",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.05,
        reasoning: `Positioning/gamma is ${marketContext.positioning.status}; net bias is ${bias}; dealer gamma flip ${fmtLevel(marketContext.positioning.dealerGammaFlip)}.`,
        supportingFactors: [
          `Gamma levels tracked: ${gammaCount}`,
          `Put/call ratio: ${marketContext.positioning.putCallRatio ?? "n/a"}`,
          `COT commercial net: ${marketContext.positioning.cot?.commercialNet ?? "n/a"}`
        ],
        warningFactors: marketContext.positioning.status !== "available_mock" ? ["Positioning/gamma is planning-only until a provider exists."] : [],
        recommendation: bias === "neutral" ? "Use positioning/gamma only as higher-timeframe risk context." : `Positioning leans ${bias}; use as secondary context.`,
        ictTags: ["higher-timeframe bias"]
      };
    }
  },
  {
    agentId: "volatility-regime-agent",
    name: "Volatility Regime Agent 2.0",
    layer: "market_context",
    weight: 0.08,
    run({ input, ictContext, marketContext, regimeClassification }) {
      const regimeDrivenBias = regimeBias[input.marketRegime];
      const highVol =
        (marketContext.macro.vix ?? 0) >= 20 ||
        input.marketRegime === "volatile" ||
        input.marketRegime === "news-driven" ||
        regimeClassification?.stableLabel === "event_high_vol" ||
        regimeClassification?.stableLabel === "risk_off_crisis";
      const bias = highVol ? "neutral" : regimeDrivenBias;
      const confidence = clamp((highVol ? 0.5 : 0.55) + ictContext.confluenceBreakdown.confidence * 0.14, 0.32, 0.84);
      const supportingFactors = [
        `Market regime: ${input.marketRegime}`,
        `Composite regime: ${regimeClassification?.stableLabel ?? "unavailable"}`,
        `VIX: ${marketContext.macro.vix ?? "n/a"}`,
        `ICT confidence: ${Math.round(ictContext.confluenceBreakdown.confidence * 100)}%`
      ];
      const warningFactors = [
        highVol ? "High volatility regime lowers directional conviction and widens stop/target assumptions." : undefined,
        regimeClassification?.transitionPending ? "Composite regime transition pending; reduce CIO certainty." : undefined,
        ...(regimeClassification?.missingInputs.slice(0, 2) ?? [])
      ].filter((item): item is string => Boolean(item));

      return {
        agentId: "volatility-regime-agent",
        name: "Volatility Regime Agent 2.0",
        layer: "market_context",
        bias,
        confidence,
        weight: 0.08,
        reasoning: highVol
          ? "Volatility regime says do not over-trust directional ICT signals."
          : `Volatility/regime evidence leans ${bias} and does not veto ICT context.`,
        supportingFactors,
        warningFactors,
        recommendation: highVol ? "Cap CIO confidence and require clean invalidation." : `Allow ${bias} regime pressure into CIO synthesis.`,
        ictTags: ["displacement", "session timing"]
      };
    }
  },
  {
    agentId: "order-flow-agent",
    name: "Order Flow Agent",
    layer: "market_context",
    weight: 0.02,
    run({ marketContext }) {
      return {
        agentId: "order-flow-agent",
        name: "Order Flow Agent",
        layer: "market_context",
        bias: "neutral",
        confidence: 0.3,
        weight: 0.02,
        reasoning: `Order flow is later/advanced only. DOM ${marketContext.orderFlow.domStatus}; footprint ${marketContext.orderFlow.footprintStatus}; cumulative delta ${marketContext.orderFlow.cumulativeDelta ?? "n/a"}.`,
        supportingFactors: ["Order flow is tracked as a future execution-refinement input only."],
        warningFactors: ["No DOM, footprint, or live order-flow feed is connected."],
        recommendation: "Do not use order flow for the core thesis yet; keep it as a planned refinement layer.",
        ictTags: ["session timing"]
      };
    }
  }
];
