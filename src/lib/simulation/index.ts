import {
  identifyWeakestAgent,
  performanceFromRecommendations,
  scoreRecommendation
} from "@/lib/scoring";
import { runAgents, synthesizeCIO } from "@/lib/agents";
import { buildICTContext } from "@/lib/ict";
import { buildMarketContext } from "@/lib/marketData";
import { mockCandles } from "@/lib/mockData/mockCandles";
import { classifyMarketRegime } from "@/lib/regime";
import type {
  AgentDebateMessage,
  DebateSession,
  LabState,
  MarketOutcome,
  PromptMutation,
  Recommendation,
  SimulatedTradePlan,
  ThesisInput,
  TradeThesis,
  Candle
} from "@/lib/types";
import { clamp, uid } from "@/lib/utils";

export function generateThesis(input: ThesisInput, state: LabState, candles: Candle[] = mockCandles) {
  const ictContext = buildICTContext(candles, input);
  const marketContext = buildMarketContext({
    symbol: input.symbol,
    timeframe: input.timeframe,
    mode: candles?.length ? "imported" : "mock",
    candles
  });
  const regimeClassification = classifyMarketRegime({
    candles,
    marketContext,
    symbol: input.symbol,
    timeframe: input.timeframe
  });
  const researchAgentOpinions = runAgents(input, ictContext, candles);
  const cioSynthesis = synthesizeCIO(input, ictContext, researchAgentOpinions);
  const agentOpinions = [...researchAgentOpinions, cioSynthesis.cioOpinion];
  const plan: SimulatedTradePlan = {
    id: uid("plan"),
    symbol: input.symbol,
    timeframe: input.timeframe,
    bias: cioSynthesis.finalBias,
    entryZone: cioSynthesis.entryZone,
    invalidation: cioSynthesis.invalidationLevel,
    targetLiquidity: cioSynthesis.targetLiquidity,
    stopRiskNotes: cioSynthesis.riskNotes,
    riskReward: cioSynthesis.riskReward,
    mode: "simulation"
  };
  const createdAt = new Date().toISOString();
  const debateId = uid("debate");

  const messages: AgentDebateMessage[] = agentOpinions.map((opinion) => ({
      id: uid("msg"),
      agentId: opinion.agentId,
      agentName: opinion.name,
      layer: opinion.layer,
      stance: opinion.bias,
      confidence: opinion.confidence,
      weight: opinion.weight,
      message: opinion.reasoning,
      supportingFactors: opinion.supportingFactors,
      warningFactors: opinion.warningFactors,
      recommendation: opinion.recommendation,
      ictTags: opinion.ictTags,
      createdAt
  }));

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
    regimeClassification,
    notes: input.notes,
    finalBias: cioSynthesis.finalBias,
    confidence: cioSynthesis.confidence,
    thesisSummary: cioSynthesis.thesisSummary,
    invalidationLevel: plan.invalidation,
    targetLiquidity: plan.targetLiquidity,
    riskNotes: plan.stopRiskNotes,
    reasoningSummary: cioSynthesis.reasoningSummary,
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
    regimeClassification,
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
