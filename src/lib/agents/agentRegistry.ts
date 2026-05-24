import type { InternalAgentDefinition } from "@/lib/agents/agentTypes";
import type { MarketBias, MarketRegime } from "@/lib/types";
import { clamp } from "@/lib/utils";

const has = (items: unknown[] | undefined) => (items?.length ?? 0) > 0;

const latest = <T extends { index: number }>(items: T[] | undefined) =>
  [...(items ?? [])].sort((a, b) => b.index - a.index)[0];

const regimeBias: Record<MarketRegime, MarketBias> = {
  trend: "bullish",
  balanced: "neutral",
  volatile: "neutral",
  range: "neutral",
  "news-driven": "neutral",
  "risk-off": "bearish",
  "risk-on": "bullish"
};

export const researchAgentRegistry: InternalAgentDefinition[] = [
  {
    agentId: "ict-liquidity-agent",
    name: "ICT Liquidity Agent",
    layer: "strategy",
    weight: 0.22,
    run({ ictContext }) {
      const latestSweep = latest(ictContext.liquiditySweeps);
      const bias: MarketBias =
        latestSweep?.direction === "sell-side" ? "bullish" : latestSweep?.direction === "buy-side" ? "bearish" : "neutral";
      const confidence = clamp(0.42 + ictContext.liquiditySweeps.length * 0.08 + ictContext.confluenceBreakdown.confidence * 0.24, 0.35, 0.9);
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
        weight: 0.22,
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
    weight: 0.24,
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
        weight: 0.24,
        reasoning: `Structure map reads ${bias}; latest swing high ${ictContext.latestSwingHigh?.price ?? "n/a"} and latest swing low ${ictContext.latestSwingLow?.price ?? "n/a"}.`,
        supportingFactors,
        warningFactors,
        recommendation: bias === "neutral" ? "Keep CIO thesis neutral unless structure breaks cleanly." : `Use ${bias} structure as the primary directional anchor.`,
        ictTags: ["market structure shift", "higher-timeframe bias", "displacement"]
      };
    }
  },
  {
    agentId: "session-timing-agent",
    name: "Session Timing Agent",
    layer: "strategy",
    weight: 0.14,
    run({ ictContext, input }) {
      const inKillZone = ictContext.killZone !== "none";
      const bias = inKillZone ? ictContext.bias : "neutral";
      const confidence = clamp((inKillZone ? 0.55 : 0.36) + ictContext.confluenceBreakdown.confidence * 0.18, 0.3, 0.82);
      const supportingFactors = [`Input session: ${input.session}`, `Detected kill zone: ${ictContext.killZone}`];
      const warningFactors = inKillZone ? [] : ["Current mock timestamp is outside an ICT kill-zone tag"];

      return {
        agentId: "session-timing-agent",
        name: "Session Timing Agent",
        layer: "strategy",
        bias,
        confidence,
        weight: 0.14,
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
    weight: 0.2,
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
        weight: 0.2,
        reasoning: riskFactor ? `${riskFactor.label}: ${riskFactor.explanation}` : "Risk/reward is unresolved.",
        supportingFactors,
        warningFactors,
        recommendation: bias === "neutral" ? "Reduce CIO conviction until target and invalidation improve." : `Use ${bias} target/invalidation asymmetry.`,
        ictTags: ["premium/discount"]
      };
    }
  },
  {
    agentId: "volatility-regime-agent",
    name: "Volatility/Regime Agent",
    layer: "macro",
    weight: 0.2,
    run({ input, ictContext }) {
      const regimeDrivenBias = regimeBias[input.marketRegime];
      const volatile = input.marketRegime === "volatile" || input.marketRegime === "news-driven";
      const bias = volatile ? "neutral" : regimeDrivenBias;
      const confidence = clamp((volatile ? 0.46 : 0.55) + ictContext.confluenceBreakdown.confidence * 0.16, 0.32, 0.84);
      const supportingFactors = [`Market regime: ${input.marketRegime}`, `ICT confidence: ${Math.round(ictContext.confluenceBreakdown.confidence * 100)}%`];
      const warningFactors = volatile ? ["Volatility/news regime lowers directional conviction"] : [];

      return {
        agentId: "volatility-regime-agent",
        name: "Volatility/Regime Agent",
        layer: "macro",
        bias,
        confidence,
        weight: 0.2,
        reasoning: volatile
          ? "Volatility/regime evidence says do not over-trust directional ICT signals."
          : `Regime evidence leans ${bias} and does not veto ICT context.`,
        supportingFactors,
        warningFactors,
        recommendation: volatile ? "Cap CIO confidence and require clear invalidation." : `Allow ${bias} regime pressure into CIO synthesis.`,
        ictTags: ["displacement", "session timing"]
      };
    }
  }
];
