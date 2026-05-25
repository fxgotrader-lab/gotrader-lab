import type {
  Agent,
  AgentPromptVersion,
  DebateSession,
  ICTConcept,
  LabState,
  MarketOutcome,
  PerformanceScore,
  PromptMutation,
  Recommendation,
  TradeThesis
} from "@/lib/types";
import { buildICTContext } from "@/lib/ict";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { numericDate } from "@/lib/utils";

type AgentSeed = Omit<
  Agent,
  "currentPromptVersionId" | "confidenceHistory" | "currentSystemPrompt"
> & {
  prompt: string;
  historySeed: number[];
};

const promptGuardrail =
  "Operate in simulation only. Do not place orders, connect to brokers, or present financial advice.";

const agentSeeds: AgentSeed[] = [
  {
    id: "macro-rates",
    name: "Rates Agent",
    layer: "macro",
    domain: "rates",
    description: "Interprets yields, policy expectations, and curve pressure for index futures.",
    active: true,
    weight: 0.08,
    prompt: `${promptGuardrail} Track front-end rates, real yield pressure, curve steepening, and Fed repricing. Translate macro pressure into ES/NQ directional bias.`,
    confidence: 0.68,
    historySeed: [0.58, 0.6, 0.63, 0.64, 0.66, 0.68],
    hitRate: 0.61,
    wins: 14,
    losses: 9,
    drawdown: 0.07,
    sharpeLike: 1.18,
    confidenceCalibration: 0.82,
    tags: ["macro", "rates", "policy"]
  },
  {
    id: "macro-dollar",
    name: "Dollar Agent",
    layer: "macro",
    domain: "dollar",
    description: "Scores USD strength and its pressure on risk assets.",
    active: true,
    weight: 0.06,
    prompt: `${promptGuardrail} Evaluate DXY impulse, USD liquidity, and cross-asset dollar sensitivity before assigning futures bias.`,
    confidence: 0.62,
    historySeed: [0.54, 0.57, 0.61, 0.6, 0.63, 0.62],
    hitRate: 0.57,
    wins: 12,
    losses: 9,
    drawdown: 0.09,
    sharpeLike: 0.96,
    confidenceCalibration: 0.77,
    tags: ["macro", "usd", "liquidity"]
  },
  {
    id: "macro-volatility",
    name: "Volatility Agent",
    layer: "macro",
    domain: "volatility",
    description: "Reads implied volatility, realized range, and vol-control stress.",
    active: true,
    weight: 0.09,
    prompt: `${promptGuardrail} Weigh VIX term structure, realized range expansion, and gamma pressure. Penalize signals when volatility regime conflicts with trade location.`,
    confidence: 0.74,
    historySeed: [0.6, 0.62, 0.66, 0.7, 0.72, 0.74],
    hitRate: 0.66,
    wins: 19,
    losses: 10,
    drawdown: 0.05,
    sharpeLike: 1.42,
    confidenceCalibration: 0.88,
    tags: ["macro", "volatility", "gamma"]
  },
  {
    id: "macro-commodities",
    name: "Commodities Agent",
    layer: "macro",
    domain: "commodities",
    description: "Tracks energy and metals impulses that can alter index risk tone.",
    active: true,
    weight: 0.04,
    prompt: `${promptGuardrail} Assess crude, copper, and gold context for inflation, growth, and defensive flows before ranking index futures bias.`,
    confidence: 0.55,
    historySeed: [0.49, 0.51, 0.53, 0.56, 0.54, 0.55],
    hitRate: 0.52,
    wins: 10,
    losses: 9,
    drawdown: 0.11,
    sharpeLike: 0.62,
    confidenceCalibration: 0.7,
    tags: ["macro", "commodities", "inflation"]
  },
  {
    id: "macro-news-sentiment",
    name: "News Sentiment Agent",
    layer: "macro",
    domain: "news sentiment",
    description: "Turns simulated headlines and event risk into directional pressure.",
    active: true,
    weight: 0.06,
    prompt: `${promptGuardrail} Extract headline tone, surprise risk, and scheduled event hazard. Reduce confidence when the tape is event-driven but direction is unresolved.`,
    confidence: 0.6,
    historySeed: [0.51, 0.55, 0.56, 0.59, 0.58, 0.6],
    hitRate: 0.56,
    wins: 13,
    losses: 10,
    drawdown: 0.08,
    sharpeLike: 0.91,
    confidenceCalibration: 0.74,
    tags: ["macro", "news", "sentiment"]
  },
  {
    id: "sector-tech",
    name: "Tech Sector Agent",
    layer: "sector",
    domain: "tech",
    description: "Maps mega-cap and semiconductor tone into NQ/MNQ bias.",
    active: true,
    weight: 0.08,
    prompt: `${promptGuardrail} Focus on mega-cap breadth, semiconductors, software momentum, and index concentration risk. Prefer NQ signals when sector alignment is clear.`,
    confidence: 0.71,
    historySeed: [0.58, 0.61, 0.63, 0.67, 0.7, 0.71],
    hitRate: 0.64,
    wins: 18,
    losses: 10,
    drawdown: 0.06,
    sharpeLike: 1.28,
    confidenceCalibration: 0.83,
    tags: ["sector", "tech", "nq"]
  },
  {
    id: "sector-energy",
    name: "Energy Sector Agent",
    layer: "sector",
    domain: "energy",
    description: "Checks crude sensitivity and energy breadth for ES risk tone.",
    active: true,
    weight: 0.04,
    prompt: `${promptGuardrail} Compare energy sector leadership, crude trend, and inflation sensitivity. Use as a secondary input for ES and risk regime only.`,
    confidence: 0.5,
    historySeed: [0.46, 0.48, 0.49, 0.52, 0.51, 0.5],
    hitRate: 0.49,
    wins: 9,
    losses: 10,
    drawdown: 0.13,
    sharpeLike: 0.35,
    confidenceCalibration: 0.64,
    tags: ["sector", "energy", "es"]
  },
  {
    id: "sector-financials",
    name: "Financials Sector Agent",
    layer: "sector",
    domain: "financials",
    description: "Reads banks, credit tone, and yield curve sensitivity.",
    active: true,
    weight: 0.05,
    prompt: `${promptGuardrail} Assess financial sector breadth, credit tone, curve sensitivity, and regional bank stress. Translate into ES risk appetite.`,
    confidence: 0.58,
    historySeed: [0.52, 0.53, 0.55, 0.56, 0.59, 0.58],
    hitRate: 0.54,
    wins: 11,
    losses: 9,
    drawdown: 0.1,
    sharpeLike: 0.78,
    confidenceCalibration: 0.71,
    tags: ["sector", "financials", "credit"]
  },
  {
    id: "sector-consumer",
    name: "Consumer Sector Agent",
    layer: "sector",
    domain: "consumer",
    description: "Uses discretionary and staples tone to infer cycle pressure.",
    active: true,
    weight: 0.04,
    prompt: `${promptGuardrail} Compare discretionary versus staples leadership and consumer impulse. Flag divergence that lowers index conviction.`,
    confidence: 0.53,
    historySeed: [0.5, 0.51, 0.5, 0.54, 0.55, 0.53],
    hitRate: 0.51,
    wins: 10,
    losses: 10,
    drawdown: 0.12,
    sharpeLike: 0.49,
    confidenceCalibration: 0.66,
    tags: ["sector", "consumer", "cycle"]
  },
  {
    id: "sector-healthcare",
    name: "Healthcare Sector Agent",
    layer: "sector",
    domain: "healthcare",
    description: "Tracks defensive sector sponsorship and rotation pressure.",
    active: true,
    weight: 0.03,
    prompt: `${promptGuardrail} Monitor healthcare breadth and defensive rotation. Treat healthcare leadership as a warning when cyclicals and tech fail to confirm.`,
    confidence: 0.49,
    historySeed: [0.45, 0.46, 0.48, 0.5, 0.48, 0.49],
    hitRate: 0.48,
    wins: 8,
    losses: 9,
    drawdown: 0.1,
    sharpeLike: 0.31,
    confidenceCalibration: 0.62,
    tags: ["sector", "healthcare", "defensive"]
  },
  {
    id: "strategy-trend",
    name: "Trend Agent",
    layer: "strategy",
    domain: "trend",
    description: "Measures trend continuation and pullback quality.",
    active: true,
    weight: 0.07,
    prompt: `${promptGuardrail} Grade trend structure across timeframe alignment, pullback depth, and failed breakdowns. Avoid chasing after extended displacement.`,
    confidence: 0.69,
    historySeed: [0.57, 0.6, 0.62, 0.65, 0.68, 0.69],
    hitRate: 0.63,
    wins: 17,
    losses: 10,
    drawdown: 0.07,
    sharpeLike: 1.14,
    confidenceCalibration: 0.8,
    tags: ["strategy", "trend"]
  },
  {
    id: "strategy-mean-reversion",
    name: "Mean Reversion Agent",
    layer: "strategy",
    domain: "mean reversion",
    description: "Finds stretched moves back toward balance.",
    active: true,
    weight: 0.05,
    prompt: `${promptGuardrail} Identify stretched price, failed continuation, and balance re-entry. Require favorable location before suggesting reversal bias.`,
    confidence: 0.57,
    historySeed: [0.52, 0.54, 0.55, 0.57, 0.56, 0.57],
    hitRate: 0.55,
    wins: 12,
    losses: 10,
    drawdown: 0.09,
    sharpeLike: 0.73,
    confidenceCalibration: 0.72,
    tags: ["strategy", "mean reversion"]
  },
  {
    id: "strategy-breakout",
    name: "Breakout Agent",
    layer: "strategy",
    domain: "breakout",
    description: "Evaluates range compression, expansion, and failed breakouts.",
    active: true,
    weight: 0.05,
    prompt: `${promptGuardrail} Confirm range compression, volume proxy, displacement, and retest quality before endorsing breakout continuation.`,
    confidence: 0.61,
    historySeed: [0.53, 0.55, 0.59, 0.62, 0.6, 0.61],
    hitRate: 0.57,
    wins: 13,
    losses: 10,
    drawdown: 0.08,
    sharpeLike: 0.87,
    confidenceCalibration: 0.73,
    tags: ["strategy", "breakout", "range"]
  },
  {
    id: "strategy-liquidity",
    name: "Liquidity Agent",
    layer: "strategy",
    domain: "liquidity",
    description: "Marks resting liquidity, stops, and magnet levels.",
    active: true,
    weight: 0.07,
    prompt: `${promptGuardrail} Map prior highs/lows, overnight range, single prints, and resting liquidity. Estimate whether price is likely to seek or reject a liquidity pool.`,
    confidence: 0.72,
    historySeed: [0.59, 0.62, 0.66, 0.68, 0.71, 0.72],
    hitRate: 0.65,
    wins: 20,
    losses: 11,
    drawdown: 0.06,
    sharpeLike: 1.33,
    confidenceCalibration: 0.84,
    tags: ["strategy", "liquidity", "stops"]
  },
  {
    id: "strategy-risk-reward",
    name: "Risk/Reward Agent",
    layer: "strategy",
    domain: "risk/reward",
    description: "Rejects ideas with poor asymmetry or unclear invalidation.",
    active: true,
    weight: 0.07,
    prompt: `${promptGuardrail} Require clear entry zone, invalidation, target liquidity, and simulated risk/reward. Downgrade any thesis without a clean stop-risk narrative.`,
    confidence: 0.76,
    historySeed: [0.64, 0.67, 0.7, 0.72, 0.74, 0.76],
    hitRate: 0.68,
    wins: 21,
    losses: 10,
    drawdown: 0.04,
    sharpeLike: 1.61,
    confidenceCalibration: 0.9,
    tags: ["strategy", "risk", "validation"]
  },
  {
    id: "strategy-ict-market-structure",
    name: "ICT Market Structure Agent",
    layer: "strategy",
    domain: "ICT market structure",
    description: "Looks for break in structure, shift, and higher-timeframe bias.",
    active: true,
    weight: 0.07,
    prompt: `${promptGuardrail} Detect higher-timeframe bias, market structure shift, break in structure, and displacement. State when structure is too noisy for conviction.`,
    confidence: 0.73,
    historySeed: [0.61, 0.63, 0.67, 0.7, 0.72, 0.73],
    hitRate: 0.67,
    wins: 22,
    losses: 11,
    drawdown: 0.05,
    sharpeLike: 1.48,
    confidenceCalibration: 0.86,
    tags: ["strategy", "ict", "structure"]
  },
  {
    id: "strategy-ict-liquidity-sweep",
    name: "ICT Liquidity Sweep Agent",
    layer: "strategy",
    domain: "ICT liquidity sweep",
    description: "Identifies sweep, failure to continue, and reversal conditions.",
    active: true,
    weight: 0.07,
    prompt: `${promptGuardrail} Identify buy-side or sell-side liquidity sweeps, rejection quality, and follow-through. Do not call a sweep valid without displacement after the raid.`,
    confidence: 0.66,
    historySeed: [0.56, 0.58, 0.61, 0.64, 0.67, 0.66],
    hitRate: 0.58,
    wins: 15,
    losses: 11,
    drawdown: 0.12,
    sharpeLike: 0.84,
    confidenceCalibration: 0.68,
    tags: ["strategy", "ict", "liquidity sweep"]
  },
  {
    id: "strategy-ict-fair-value-gap",
    name: "ICT Fair Value Gap Agent",
    layer: "strategy",
    domain: "ICT fair value gap",
    description: "Scores displacement gaps and likely mitigation zones.",
    active: true,
    weight: 0.06,
    prompt: `${promptGuardrail} Detect fair value gaps created by displacement. Score whether mitigation is likely to hold, fail, or become a draw on liquidity.`,
    confidence: 0.64,
    historySeed: [0.52, 0.55, 0.58, 0.6, 0.63, 0.64],
    hitRate: 0.59,
    wins: 16,
    losses: 11,
    drawdown: 0.09,
    sharpeLike: 0.95,
    confidenceCalibration: 0.75,
    tags: ["strategy", "ict", "fvg"]
  },
  {
    id: "strategy-ict-session-timing",
    name: "ICT Session Timing Agent",
    layer: "strategy",
    domain: "ICT session timing",
    description: "Tags kill zones, session transitions, and time-based trap risk.",
    active: true,
    weight: 0.06,
    prompt: `${promptGuardrail} Tag Asia range, London open, NY AM, lunch, and NY PM context. Penalize entries outside a meaningful session timing edge.`,
    confidence: 0.7,
    historySeed: [0.58, 0.6, 0.63, 0.66, 0.69, 0.7],
    hitRate: 0.62,
    wins: 18,
    losses: 11,
    drawdown: 0.07,
    sharpeLike: 1.1,
    confidenceCalibration: 0.81,
    tags: ["strategy", "ict", "kill zone"]
  },
  {
    id: "cio-synthesis",
    name: "CIO Synthesis Agent",
    layer: "cio",
    domain: "decision layer",
    description: "Synthesizes all agent views into a research-only final thesis.",
    active: true,
    weight: 0.16,
    prompt: `${promptGuardrail} Synthesize macro, sector, strategy, and ICT evidence. Output bullish, bearish, or neutral with confidence, invalidation, target zone, risk notes, and reasoning summary.`,
    confidence: 0.75,
    historySeed: [0.62, 0.66, 0.69, 0.72, 0.74, 0.75],
    hitRate: 0.69,
    wins: 24,
    losses: 11,
    drawdown: 0.04,
    sharpeLike: 1.67,
    confidenceCalibration: 0.89,
    tags: ["cio", "synthesis", "research only"]
  }
];

const buildAgents = (): Agent[] =>
  agentSeeds.map((agent) => ({
    ...agent,
    currentPromptVersionId: `prompt_${agent.id}_v1`,
    currentSystemPrompt: agent.prompt,
    confidenceHistory: agent.historySeed.map((value, index) => ({
      date: numericDate(index - agent.historySeed.length + 1),
      value
    }))
  }));

const buildBasePromptVersions = (): AgentPromptVersion[] =>
  agentSeeds.map((agent) => ({
    id: `prompt_${agent.id}_v1`,
    agentId: agent.id,
    version: "1.0.0",
    prompt: agent.prompt,
    createdAt: numericDate(-21),
    mutationReason: "Initial simulation prompt",
    status: "active",
    approvedByUser: true,
    activatedAt: numericDate(-21)
  }));

const ictTags: ICTConcept[] = [
  "liquidity sweep",
  "market structure shift",
  "displacement",
  "fair value gap",
  "premium/discount",
  "session timing",
  "higher-timeframe bias",
  "kill-zone tagging"
];

export const mockRecommendations: Recommendation[] = [
  {
    id: "rec_001",
    agentId: "strategy-ict-liquidity-sweep",
    symbol: "NQ",
    timeframe: "5m",
    bias: "bullish",
    confidence: 0.72,
    reasoning: "Sell-side liquidity under the London low was swept, then price displaced back through the range midpoint.",
    entryZone: [18862, 18878],
    invalidation: 18838,
    target: 18948,
    ictTags: ["liquidity sweep", "displacement", "kill-zone tagging"],
    createdAt: numericDate(-1),
    simulatedOutcomeId: "outcome_001",
    score: 0.81
  },
  {
    id: "rec_002",
    agentId: "macro-volatility",
    symbol: "ES",
    timeframe: "15m",
    bias: "neutral",
    confidence: 0.63,
    reasoning: "Realized range expanded faster than the simulated liquidity map, lowering continuation quality.",
    ictTags: ["session timing"],
    createdAt: numericDate(-2),
    simulatedOutcomeId: "outcome_002",
    score: 0.66
  },
  {
    id: "rec_003",
    agentId: "sector-tech",
    symbol: "NQ",
    timeframe: "5m",
    bias: "bullish",
    confidence: 0.69,
    reasoning: "Mega-cap breadth and semiconductors stayed firm while index pulled into discount.",
    entryZone: [18810, 18832],
    invalidation: 18778,
    target: 18920,
    ictTags: ["premium/discount", "higher-timeframe bias"],
    createdAt: numericDate(-3),
    simulatedOutcomeId: "outcome_003",
    score: 0.74
  },
  {
    id: "rec_004",
    agentId: "strategy-breakout",
    symbol: "ES",
    timeframe: "15m",
    bias: "bearish",
    confidence: 0.58,
    reasoning: "Failed upside breakout into premium suggested a return to session balance.",
    entryZone: [5268, 5272],
    invalidation: 5281,
    target: 5244,
    ictTags: ["premium/discount", "market structure shift"],
    createdAt: numericDate(-4),
    simulatedOutcomeId: "outcome_004",
    score: 0.59
  },
  {
    id: "rec_005",
    agentId: "strategy-risk-reward",
    symbol: "MNQ",
    timeframe: "5m",
    bias: "neutral",
    confidence: 0.78,
    reasoning: "Target liquidity was too close to the proposed stop to justify directional research conviction.",
    ictTags: ["premium/discount"],
    createdAt: numericDate(-5),
    simulatedOutcomeId: "outcome_005",
    score: 0.83
  },
  {
    id: "rec_006",
    agentId: "cio-synthesis",
    symbol: "NQ",
    timeframe: "5m",
    bias: "bullish",
    confidence: 0.72,
    reasoning: "CIO composite favored a simulated long after sweep, displacement, and tech confirmation aligned.",
    entryZone: [18864, 18880],
    invalidation: 18836,
    target: 18952,
    ictTags: ["liquidity sweep", "displacement", "higher-timeframe bias"],
    createdAt: numericDate(-1),
    simulatedOutcomeId: "outcome_001",
    score: 0.84
  }
];

export const mockOutcomes: MarketOutcome[] = [
  {
    id: "outcome_001",
    symbol: "NQ",
    timeframe: "5m",
    session: "New York AM",
    resolvedAt: numericDate(0),
    actualBias: "bullish",
    priceMove: 72,
    maxAdverseExcursion: 18,
    maxFavorableExcursion: 86,
    liquidityTargetReached: true,
    invalidationHit: false,
    notes: "Simulated target liquidity above the prior AM high was reached."
  },
  {
    id: "outcome_002",
    symbol: "ES",
    timeframe: "15m",
    session: "New York PM",
    resolvedAt: numericDate(-1),
    actualBias: "neutral",
    priceMove: 7,
    maxAdverseExcursion: 12,
    maxFavorableExcursion: 13,
    liquidityTargetReached: false,
    invalidationHit: false,
    notes: "Balanced trade stayed inside the afternoon range."
  },
  {
    id: "outcome_003",
    symbol: "NQ",
    timeframe: "5m",
    session: "London",
    resolvedAt: numericDate(-2),
    actualBias: "bullish",
    priceMove: 54,
    maxAdverseExcursion: 15,
    maxFavorableExcursion: 64,
    liquidityTargetReached: true,
    invalidationHit: false,
    notes: "Discount entry held before price repriced into buy-side liquidity."
  },
  {
    id: "outcome_004",
    symbol: "ES",
    timeframe: "15m",
    session: "New York AM",
    resolvedAt: numericDate(-3),
    actualBias: "bearish",
    priceMove: -22,
    maxAdverseExcursion: 9,
    maxFavorableExcursion: 29,
    liquidityTargetReached: true,
    invalidationHit: false,
    notes: "Failed breakout returned to the session midpoint and lower liquidity."
  },
  {
    id: "outcome_005",
    symbol: "MNQ",
    timeframe: "5m",
    session: "New York Lunch",
    resolvedAt: numericDate(-4),
    actualBias: "neutral",
    priceMove: -6,
    maxAdverseExcursion: 21,
    maxFavorableExcursion: 18,
    liquidityTargetReached: false,
    invalidationHit: true,
    notes: "Chop confirmed the risk/reward veto."
  }
];

const seededIctContext = buildICTContext(mockCandles, {
  symbol: "NQ",
  timeframe: "5m",
  session: "New York AM"
});

export const mockTradeTheses: TradeThesis[] = [
  {
    id: "thesis_001",
    symbol: "NQ",
    timeframe: "5m",
    session: "New York AM",
    marketRegime: "trend",
    notes: "Mock session: sweep of London low, tech breadth stable.",
    finalBias: "bullish",
    confidence: 0.72,
    thesisSummary: "Research thesis favors a simulated NQ long from discount after a sell-side sweep and displacement.",
    invalidationLevel: 18836,
    targetLiquidity: 18952,
    riskNotes: "Invalid if price accepts below the swept low or if volatility expands without upside displacement.",
    reasoningSummary: "Liquidity sweep, session timing, and tech breadth aligned while risk/reward remained above 2R.",
    ictContext: seededIctContext,
    simulatedTradePlan: {
      id: "plan_001",
      symbol: "NQ",
      timeframe: "5m",
      bias: "bullish",
      entryZone: [18864, 18880],
      invalidation: 18836,
      targetLiquidity: 18952,
      stopRiskNotes: "Use the swept low as invalidation in simulation. No order execution.",
      riskReward: 2.3,
      mode: "simulation"
    },
    createdAt: numericDate(-1),
    disclaimer: "Research only. Simulation output, not financial advice."
  }
];

export const mockDebateSessions: DebateSession[] = [
  {
    id: "debate_001",
    createdAt: numericDate(-1),
    symbol: "NQ",
    timeframe: "5m",
    session: "New York AM",
    marketRegime: "trend",
    notes: "Mock session: sweep of London low, tech breadth stable.",
    messages: [
      {
        id: "msg_001",
        agentId: "macro-volatility",
        agentName: "Volatility Agent",
        layer: "macro",
        stance: "bullish",
        confidence: 0.66,
        message: `Volatility is elevated but controlled; ICT confluence is ${Math.round(seededIctContext.confluenceScore * 100)}% with ${seededIctContext.displacement} displacement and ${seededIctContext.killZone} timing.`,
        ictTags: ["displacement", "session timing"],
        createdAt: numericDate(-1)
      },
      {
        id: "msg_002",
        agentId: "sector-tech",
        agentName: "Tech Sector Agent",
        layer: "sector",
        stance: "bullish",
        confidence: 0.7,
        message: `Tech breadth is supportive while structured ICT bias is ${seededIctContext.bias}; latest swing high ${seededIctContext.latestSwingHigh?.price ?? "n/a"} remains the upside liquidity reference.`,
        ictTags: ["higher-timeframe bias"],
        createdAt: numericDate(-1)
      },
      {
        id: "msg_003",
        agentId: "strategy-ict-liquidity-sweep",
        agentName: "ICT Liquidity Sweep Agent",
        layer: "strategy",
        stance: "bullish",
        confidence: 0.72,
        message: `ICT sweep engine found ${seededIctContext.liquiditySweeps.length} sweep(s), ${seededIctContext.fairValueGaps.length} FVG(s), and ${seededIctContext.premiumDiscount} location during ${seededIctContext.killZone} timing.`,
        ictTags,
        createdAt: numericDate(-1)
      }
    ],
    recommendationIds: ["rec_001", "rec_006"],
    cioThesisId: "thesis_001"
  }
];

export const createInitialLabState = (): LabState => {
  const basePromptVersions = buildBasePromptVersions();
  const extraPromptVersions: AgentPromptVersion[] = [
    {
      id: "prompt_macro_volatility_v2",
      agentId: "macro-volatility",
      version: "1.1.0",
      prompt: `${promptGuardrail} Weigh VIX term structure, realized range expansion, gamma pressure, and whether volatility supports the proposed holding window before scoring continuation.`,
      createdAt: numericDate(-6),
      mutationReason: "Added holding-window volatility check after simulated chop.",
      status: "accepted",
      approvedByUser: true,
      activatedAt: numericDate(-5),
      supersedesVersionId: "prompt_macro-volatility_v1",
      performanceBefore: {
        hitRate: 0.59,
        drawdown: 0.08,
        sharpeLike: 0.98,
        confidenceCalibration: 0.74,
        sampleSize: 22
      },
      performanceAfter: {
        hitRate: 0.66,
        drawdown: 0.05,
        sharpeLike: 1.42,
        confidenceCalibration: 0.88,
        sampleSize: 29
      }
    },
    {
      id: "prompt_strategy_ict_liquidity_sweep_v2_candidate",
      agentId: "strategy-ict-liquidity-sweep",
      version: "1.1.0-candidate",
      prompt: `${promptGuardrail} Require a sweep, clear rejection, displacement through a reference level, and session kill-zone alignment before assigning confidence above 0.65.`,
      createdAt: numericDate(-1),
      mutationReason: "Weakest agent by calibration; tighten confirmation rules.",
      status: "candidate",
      approvedByUser: false,
      supersedesVersionId: "prompt_strategy-ict-liquidity-sweep_v1",
      performanceBefore: {
        hitRate: 0.58,
        drawdown: 0.12,
        sharpeLike: 0.84,
        confidenceCalibration: 0.68,
        sampleSize: 26
      }
    },
    {
      id: "prompt_sector_tech_v2_rejected",
      agentId: "sector-tech",
      version: "1.1.0-rejected",
      prompt: `${promptGuardrail} Overweight simulated mega-cap momentum above all other sector evidence.`,
      createdAt: numericDate(-9),
      mutationReason: "Tested heavier concentration weighting.",
      status: "rejected",
      approvedByUser: false,
      supersedesVersionId: "prompt_sector-tech_v1",
      performanceBefore: {
        hitRate: 0.64,
        drawdown: 0.06,
        sharpeLike: 1.28,
        confidenceCalibration: 0.83,
        sampleSize: 28
      },
      performanceAfter: {
        hitRate: 0.52,
        drawdown: 0.14,
        sharpeLike: 0.44,
        confidenceCalibration: 0.61,
        sampleSize: 12
      }
    }
  ];

  const agents = buildAgents().map((agent) =>
    agent.id === "macro-volatility"
      ? {
          ...agent,
          currentPromptVersionId: "prompt_macro_volatility_v2",
          currentSystemPrompt:
            extraPromptVersions.find((prompt) => prompt.id === "prompt_macro_volatility_v2")?.prompt ??
            agent.currentSystemPrompt
        }
      : agent
  );

  const promptMutations: PromptMutation[] = [
    {
      id: "mutation_001",
      agentId: "macro-volatility",
      fromPromptVersionId: "prompt_macro-volatility_v1",
      candidatePromptVersionId: "prompt_macro_volatility_v2",
      createdAt: numericDate(-6),
      reason: "Volatility signals were too early during range expansion.",
      proposedDiffSummary: "Added holding-window and gamma-pressure filters.",
      status: "accepted",
      requiresUserConfirmation: true,
      oldPerformance: {
        hitRate: 0.59,
        drawdown: 0.08,
        sharpeLike: 0.98,
        confidenceCalibration: 0.74,
        sampleSize: 22
      },
      candidatePerformance: {
        hitRate: 0.66,
        drawdown: 0.05,
        sharpeLike: 1.42,
        confidenceCalibration: 0.88,
        sampleSize: 29
      },
      userDecisionAt: numericDate(-5)
    },
    {
      id: "mutation_002",
      agentId: "strategy-ict-liquidity-sweep",
      fromPromptVersionId: "prompt_strategy-ict-liquidity-sweep_v1",
      candidatePromptVersionId: "prompt_strategy_ict_liquidity_sweep_v2_candidate",
      createdAt: numericDate(-1),
      reason: "Weakest current confidence calibration after simulated scoring.",
      proposedDiffSummary: "Requires sweep, rejection, displacement, and kill-zone alignment before high confidence.",
      status: "pending",
      requiresUserConfirmation: true,
      oldPerformance: {
        hitRate: 0.58,
        drawdown: 0.12,
        sharpeLike: 0.84,
        confidenceCalibration: 0.68,
        sampleSize: 26
      }
    },
    {
      id: "mutation_003",
      agentId: "sector-tech",
      fromPromptVersionId: "prompt_sector-tech_v1",
      candidatePromptVersionId: "prompt_sector_tech_v2_rejected",
      createdAt: numericDate(-9),
      reason: "Tested heavier mega-cap weighting.",
      proposedDiffSummary: "Overweighted concentration and reduced breadth confirmation.",
      status: "rejected",
      requiresUserConfirmation: true,
      oldPerformance: {
        hitRate: 0.64,
        drawdown: 0.06,
        sharpeLike: 1.28,
        confidenceCalibration: 0.83,
        sampleSize: 28
      },
      candidatePerformance: {
        hitRate: 0.52,
        drawdown: 0.14,
        sharpeLike: 0.44,
        confidenceCalibration: 0.61,
        sampleSize: 12
      },
      userDecisionAt: numericDate(-8)
    }
  ];

  const performanceScores: PerformanceScore[] = agents.map((agent) => ({
    id: `perf_${agent.id}`,
    agentId: agent.id,
    createdAt: numericDate(0),
    window: "30d",
    hitRate: agent.hitRate,
    drawdown: agent.drawdown,
    sharpeLike: agent.sharpeLike,
    confidenceCalibration: agent.confidenceCalibration,
    sampleSize: agent.wins + agent.losses,
    averageRecommendationScore: Math.min(0.95, agent.hitRate * 0.7 + agent.confidenceCalibration * 0.3)
  }));

  return {
    agents,
    promptVersions: [...basePromptVersions, ...extraPromptVersions],
    recommendations: mockRecommendations,
    outcomes: mockOutcomes,
    performanceScores,
    promptMutations,
    debateSessions: mockDebateSessions,
    tradeTheses: mockTradeTheses,
    handoffExports: [],
    advisoryPackets: [],
    userApprovals: [
      {
        id: "approval_001",
        createdAt: numericDate(-5),
        entityType: "prompt_mutation",
        entityId: "mutation_001",
        decision: "approved"
      },
      {
        id: "approval_002",
        createdAt: numericDate(-8),
        entityType: "prompt_mutation",
        entityId: "mutation_003",
        decision: "rejected"
      }
    ]
  };
};
