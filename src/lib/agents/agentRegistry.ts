import type { InternalAgentDefinition, InternalAgentRunContext } from "@/lib/agents/agentTypes";
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
    run({ input, ictContext, marketContext }) {
      const regimeDrivenBias = regimeBias[input.marketRegime];
      const highVol = (marketContext.macro.vix ?? 0) >= 20 || input.marketRegime === "volatile" || input.marketRegime === "news-driven";
      const bias = highVol ? "neutral" : regimeDrivenBias;
      const confidence = clamp((highVol ? 0.5 : 0.55) + ictContext.confluenceBreakdown.confidence * 0.14, 0.32, 0.84);
      const supportingFactors = [
        `Market regime: ${input.marketRegime}`,
        `VIX: ${marketContext.macro.vix ?? "n/a"}`,
        `ICT confidence: ${Math.round(ictContext.confluenceBreakdown.confidence * 100)}%`
      ];
      const warningFactors = highVol ? ["High volatility regime lowers directional conviction and widens stop/target assumptions."] : [];

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
