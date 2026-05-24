import {
  identifyWeakestAgent,
  performanceFromRecommendations,
  scoreRecommendation
} from "@/lib/scoring";
import { buildICTContext } from "@/lib/ict";
import { mockCandles } from "@/lib/mockData/mockCandles";
import type {
  Agent,
  AgentDebateMessage,
  DebateSession,
  ICTConcept,
  ICTContext,
  LabState,
  MarketBias,
  MarketOutcome,
  PromptMutation,
  Recommendation,
  SimulatedTradePlan,
  ThesisInput,
  TradeThesis
} from "@/lib/types";
import { clamp, uid } from "@/lib/utils";

const basePriceBySymbol = {
  ES: 5265,
  NQ: 18880,
  MES: 5265,
  MNQ: 18880
} as const;

const regimeBias: Record<string, MarketBias> = {
  trend: "bullish",
  balanced: "neutral",
  volatile: "neutral",
  range: "neutral",
  "news-driven": "neutral",
  "risk-off": "bearish",
  "risk-on": "bullish"
};

const allIctTags: ICTConcept[] = [
  "liquidity sweep",
  "market structure shift",
  "displacement",
  "fair value gap",
  "premium/discount",
  "session timing",
  "higher-timeframe bias",
  "kill-zone tagging"
];

function weightedBiasScore(agent: Agent, input: ThesisInput) {
  let score = 0;

  if (regimeBias[input.marketRegime] === "bullish") {
    score += 0.35;
  }
  if (regimeBias[input.marketRegime] === "bearish") {
    score -= 0.35;
  }
  if (input.symbol.includes("NQ") && agent.domain.includes("tech")) {
    score += 0.26;
  }
  if (agent.domain.includes("volatility") && input.marketRegime === "volatile") {
    score -= 0.18;
  }
  if (agent.domain.includes("liquidity") && input.session.includes("New York")) {
    score += 0.2;
  }
  if (agent.domain.includes("mean reversion") && input.marketRegime === "range") {
    score -= 0.08;
  }
  if (input.notes?.toLowerCase().includes("sweep")) {
    score += agent.domain.includes("liquidity") || agent.domain.includes("ICT") ? 0.24 : 0.08;
  }
  if (input.notes?.toLowerCase().includes("risk off")) {
    score -= 0.32;
  }

  return score * agent.weight;
}

function scoreToBias(score: number): MarketBias {
  if (score > 0.08) {
    return "bullish";
  }
  if (score < -0.08) {
    return "bearish";
  }
  return "neutral";
}

const biasToScore = (bias: MarketBias) => (bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0);

function messageForAgent(agent: Agent, bias: MarketBias, input: ThesisInput, ictTags: ICTConcept[], ictContext: ICTContext) {
  const stance = bias === "neutral" ? "withholds directional conviction" : `leans ${bias}`;
  const ictText = ictTags.slice(0, 2).join(" and ");
  const swingText = `swing high ${ictContext.latestSwingHigh?.price ?? "n/a"} / swing low ${ictContext.latestSwingLow?.price ?? "n/a"}`;
  const structureText = `${ictContext.hasBullishMSS || ictContext.hasBearishMSS ? "MSS present" : "no MSS"} and ${ictContext.hasBullishBOS || ictContext.hasBearishBOS ? "BOS present" : "no BOS"}`;
  const liquidityText = `${ictContext.liquiditySweeps.length} sweep(s), ${ictContext.fairValueGaps.length} FVG(s), ${ictContext.premiumDiscount} location`;

  if (agent.domain.includes("ICT") || agent.domain.includes("liquidity")) {
    return `${agent.name} ${stance} on ${input.symbol} ${input.timeframe}; deterministic ICT facts show ${structureText}, ${liquidityText}, ${swingText}, and ${ictContext.killZone} timing.`;
  }

  return `${agent.name} ${stance} on ${input.symbol} ${input.timeframe}; ${agent.domain} evidence is weighted against ${input.marketRegime} while ICT context contributes ${ictText || "limited confirmation"} at ${Math.round(ictContext.confluenceScore * 100)}% confluence.`;
}

function buildTradePlan(input: ThesisInput, finalBias: MarketBias, ictContext: ICTContext): SimulatedTradePlan {
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
  const latestBullishGap = [...ictContext.fairValueGaps].reverse().find((gap) => gap.direction === "bullish" && !gap.mitigated);
  const latestBearishGap = [...ictContext.fairValueGaps].reverse().find((gap) => gap.direction === "bearish" && !gap.mitigated);
  const gapMidpoint =
    finalBias === "bullish"
      ? scaleLevel(latestBullishGap?.midpoint, equilibrium)
      : finalBias === "bearish"
        ? scaleLevel(latestBearishGap?.midpoint, equilibrium)
        : equilibrium;
  const entryMid =
    finalBias === "neutral"
      ? currentPrice
      : finalBias === "bullish"
        ? Math.min(currentPrice, gapMidpoint)
        : Math.max(currentPrice, gapMidpoint);
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
    id: uid("plan"),
    symbol: input.symbol,
    timeframe: input.timeframe,
    bias: finalBias,
    entryZone: [Number(entryZone[0].toFixed(2)), Number(entryZone[1].toFixed(2))],
    invalidation: Number(invalidation.toFixed(2)),
    targetLiquidity: Number(targetLiquidity.toFixed(2)),
    stopRiskNotes:
      finalBias === "neutral"
        ? "Simulation remains neutral unless price leaves balance with accepted displacement."
        : `Simulation invalidates if price accepts beyond the ICT structure level. Context: ${ictContext.narrativeSummary}`,
    riskReward: finalBias === "neutral" ? 0 : Number((reward / risk).toFixed(2)),
    mode: "simulation"
  };
}

export function generateThesis(input: ThesisInput, state: LabState) {
  const activeAgents = state.agents.filter((agent) => agent.active && agent.layer !== "cio");
  const ictContext = buildICTContext(mockCandles, input);
  const agentWeightedScore = activeAgents.reduce((sum, agent) => sum + weightedBiasScore(agent, input), 0);
  const weightedScore = agentWeightedScore + biasToScore(ictContext.bias) * ictContext.confluenceBreakdown.confidence * 0.22;
  const finalBias =
    ictContext.confluenceBreakdown.confidence >= 0.58 && ictContext.bias !== "neutral" ? ictContext.bias : scoreToBias(weightedScore);
  const relevantTags = allIctTags.filter((tag) => {
    if (tag === "liquidity sweep") {
      return ictContext.liquiditySweep;
    }
    if (tag === "market structure shift") {
      return ictContext.marketStructureShift;
    }
    if (tag === "fair value gap") {
      return ictContext.fairValueGap !== "none";
    }
    return true;
  });
  const confidence = clamp(
    0.42 + Math.abs(agentWeightedScore) * 1.1 + ictContext.confluenceBreakdown.confidence * 0.34 + (ictContext.killZoneTag !== "none" ? 0.04 : 0),
    0.42,
    0.86
  );
  const plan = buildTradePlan(input, finalBias, ictContext);
  const createdAt = new Date().toISOString();
  const debateId = uid("debate");

  const messages: AgentDebateMessage[] = activeAgents.map((agent) => {
    const localScore = weightedBiasScore(agent, input) / Math.max(agent.weight, 0.01);
    const stance = scoreToBias(localScore);
    const tags = relevantTags.slice(0, agent.layer === "strategy" ? 4 : 2);
    return {
      id: uid("msg"),
      agentId: agent.id,
      agentName: agent.name,
      layer: agent.layer,
      stance,
      confidence: clamp(agent.confidence + Math.abs(localScore) * 0.08, 0.38, 0.92),
      message: messageForAgent(agent, stance, input, tags, ictContext),
      ictTags: tags,
      createdAt
    };
  });

  const recommendations: Recommendation[] = messages.map((message) => ({
    id: uid("rec"),
    agentId: message.agentId,
    debateSessionId: debateId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    bias: message.stance,
    confidence: message.confidence,
    reasoning: message.message,
    entryZone: plan.entryZone,
    invalidation: plan.invalidation,
    target: plan.targetLiquidity,
    ictTags: message.ictTags,
    createdAt
  }));

  const thesis: TradeThesis = {
    id: uid("thesis"),
    symbol: input.symbol,
    timeframe: input.timeframe,
    session: input.session,
    marketRegime: input.marketRegime,
    notes: input.notes,
    finalBias,
    confidence,
    thesisSummary:
      finalBias === "neutral"
        ? `${input.symbol} ${input.timeframe} stays research-neutral until deterministic ICT context confirms displacement outside balance.`
        : `${input.symbol} ${input.timeframe} research thesis is ${finalBias}; ${ictContext.narrativeSummary}`,
    invalidationLevel: plan.invalidation,
    targetLiquidity: plan.targetLiquidity,
    riskNotes: plan.stopRiskNotes,
    reasoningSummary: `CIO synthesis blends ${activeAgents.length} active agents with deterministic ICT bias ${ictContext.bias} at ${Math.round(ictContext.confluenceScore * 100)}% confluence. Key context: ${relevantTags.slice(0, 4).join(", ")}.`,
    ictContext,
    simulatedTradePlan: plan,
    createdAt,
    disclaimer: "Research only. Simulation output, not financial advice."
  };

  const debateSession: DebateSession = {
    id: debateId,
    createdAt,
    symbol: input.symbol,
    timeframe: input.timeframe,
    session: input.session,
    marketRegime: input.marketRegime,
    notes: input.notes,
    messages,
    recommendationIds: recommendations.map((recommendation) => recommendation.id),
    cioThesisId: thesis.id
  };

  return {
    debateSession,
    thesis,
    recommendations
  };
}

export function applySimulatedOutcome(state: LabState, thesis: TradeThesis): LabState {
  const direction = thesis.finalBias === "bearish" ? -1 : thesis.finalBias === "bullish" ? 1 : 0;
  const confidenceMove = Math.round((thesis.confidence * 70 + Math.random() * 18) * (direction || (Math.random() > 0.5 ? 1 : -1)));
  const outcome: MarketOutcome = {
    id: uid("outcome"),
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    session: thesis.session,
    resolvedAt: new Date().toISOString(),
    actualBias: thesis.finalBias,
    priceMove: confidenceMove,
    maxAdverseExcursion: Number((Math.abs(confidenceMove) * 0.25).toFixed(2)),
    maxFavorableExcursion: Number((Math.abs(confidenceMove) * 1.2).toFixed(2)),
    liquidityTargetReached: thesis.finalBias !== "neutral",
    invalidationHit: false,
    notes: "Generated local simulated outcome for research scoring."
  };

  const scoredRecommendations = state.recommendations.map((recommendation) => {
    const session = state.debateSessions.find((debate) => debate.recommendationIds.includes(recommendation.id));
    if (session?.cioThesisId !== thesis.id) {
      return recommendation;
    }
    return {
      ...recommendation,
      simulatedOutcomeId: outcome.id,
      score: scoreRecommendation(recommendation, outcome)
    };
  });

  const updatedAgents = state.agents.map((agent) => {
    const snapshot = performanceFromRecommendations(agent, scoredRecommendations, [...state.outcomes, outcome]);
    return {
      ...agent,
      hitRate: snapshot.hitRate,
      drawdown: snapshot.drawdown,
      sharpeLike: snapshot.sharpeLike,
      confidenceCalibration: snapshot.confidenceCalibration,
      confidenceHistory: [
        ...agent.confidenceHistory.slice(-5),
        { date: new Date().toISOString(), value: clamp(agent.confidence * 0.8 + snapshot.confidenceCalibration * 0.2, 0.25, 0.95) }
      ]
    };
  });

  const updatedState = {
    ...state,
    agents: updatedAgents,
    outcomes: [...state.outcomes, outcome],
    recommendations: scoredRecommendations
  };

  return proposePromptMutation(updatedState);
}

export function proposePromptMutation(state: LabState): LabState {
  const weakest = identifyWeakestAgent(state);
  if (!weakest) {
    return state;
  }

  const hasPendingMutation = state.promptMutations.some(
    (mutation) => mutation.agentId === weakest.id && mutation.status === "pending"
  );
  if (hasPendingMutation) {
    return state;
  }

  const activePrompt = state.promptVersions.find((prompt) => prompt.id === weakest.currentPromptVersionId);
  if (!activePrompt) {
    return state;
  }

  const versionNumber = state.promptVersions.filter((prompt) => prompt.agentId === weakest.id).length + 1;
  const candidateId = uid("prompt");
  const mutationId = uid("mutation");
  const oldPerformance = {
    hitRate: weakest.hitRate,
    drawdown: weakest.drawdown,
    sharpeLike: weakest.sharpeLike,
    confidenceCalibration: weakest.confidenceCalibration,
    sampleSize: weakest.wins + weakest.losses
  };

  return {
    ...state,
    promptVersions: [
      ...state.promptVersions,
      {
        id: candidateId,
        agentId: weakest.id,
        version: `1.${versionNumber}.0-candidate`,
        prompt: `${activePrompt.prompt} Add a pre-decision checklist: state the invalidation, one opposing scenario, and why confidence should not be reduced before issuing a bias.`,
        createdAt: new Date().toISOString(),
        mutationReason: "Auto-proposed after simulated scoring identified this as the weakest active agent.",
        status: "candidate",
        approvedByUser: false,
        supersedesVersionId: activePrompt.id,
        performanceBefore: oldPerformance
      }
    ],
    promptMutations: [
      ...state.promptMutations,
      {
        id: mutationId,
        agentId: weakest.id,
        fromPromptVersionId: activePrompt.id,
        candidatePromptVersionId: candidateId,
        createdAt: new Date().toISOString(),
        reason: "Weakest agent after simulated outcome scoring.",
        proposedDiffSummary: "Adds invalidation, opposing scenario, and confidence-reduction checklist.",
        status: "pending",
        requiresUserConfirmation: true,
        oldPerformance
      } satisfies PromptMutation
    ]
  };
}
