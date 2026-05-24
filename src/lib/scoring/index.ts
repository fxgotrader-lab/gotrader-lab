import type {
  Agent,
  LabState,
  MarketOutcome,
  PerformanceSnapshot,
  Recommendation
} from "@/lib/types";
import { clamp } from "@/lib/utils";

export function scoreRecommendation(recommendation: Recommendation, outcome?: MarketOutcome) {
  if (!outcome) {
    return recommendation.score ?? 0.5;
  }

  const directionScore =
    recommendation.bias === outcome.actualBias
      ? 1
      : recommendation.bias === "neutral" || outcome.actualBias === "neutral"
        ? 0.55
        : 0.15;

  const targetBonus = outcome.liquidityTargetReached ? 0.14 : 0;
  const invalidationPenalty = outcome.invalidationHit ? 0.22 : 0;
  const confidencePenalty = Math.abs(recommendation.confidence - directionScore) * 0.22;

  return clamp(directionScore + targetBonus - invalidationPenalty - confidencePenalty, 0, 1);
}

export function performanceFromRecommendations(
  agent: Agent,
  recommendations: Recommendation[],
  outcomes: MarketOutcome[]
): PerformanceSnapshot {
  const agentRecommendations = recommendations.filter((recommendation) => recommendation.agentId === agent.id);
  if (!agentRecommendations.length) {
    return {
      hitRate: agent.hitRate,
      drawdown: agent.drawdown,
      sharpeLike: agent.sharpeLike,
      confidenceCalibration: agent.confidenceCalibration,
      sampleSize: agent.wins + agent.losses
    };
  }

  const scores = agentRecommendations.map((recommendation) =>
    scoreRecommendation(
      recommendation,
      outcomes.find((outcome) => outcome.id === recommendation.simulatedOutcomeId)
    )
  );
  const wins = scores.filter((score) => score >= 0.6).length;
  const losses = scores.length - wins;
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + (score - avg) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance) || 0.12;
  const avgConfidenceError =
    agentRecommendations.reduce((sum, recommendation, index) => {
      return sum + Math.abs(recommendation.confidence - scores[index]);
    }, 0) / agentRecommendations.length;

  return {
    hitRate: wins / Math.max(1, wins + losses),
    drawdown: clamp(losses / Math.max(8, scores.length * 5), 0.02, 0.24),
    sharpeLike: Number(((avg - 0.5) / stdev + 0.8).toFixed(2)),
    confidenceCalibration: clamp(1 - avgConfidenceError, 0.2, 0.98),
    sampleSize: scores.length
  };
}

export function identifyWeakestAgent(state: LabState) {
  return [...state.agents]
    .filter((agent) => agent.layer !== "cio" && agent.active)
    .sort((a, b) => {
      const aScore = a.hitRate * 0.45 + a.confidenceCalibration * 0.35 + Math.max(0, a.sharpeLike) * 0.08 - a.drawdown;
      const bScore = b.hitRate * 0.45 + b.confidenceCalibration * 0.35 + Math.max(0, b.sharpeLike) * 0.08 - b.drawdown;
      return aScore - bScore;
    })[0];
}

export function aggregatePortfolioMetrics(state: LabState) {
  const cio = state.agents.find((agent) => agent.layer === "cio");
  const active = state.agents.filter((agent) => agent.active);
  const simulatedPnl = state.outcomes.reduce((sum, outcome) => sum + outcome.priceMove * 1.25, 0);
  const hitRate =
    state.recommendations.filter((recommendation) => (recommendation.score ?? 0) >= 0.6).length /
    Math.max(1, state.recommendations.length);
  const drawdown = active.reduce((sum, agent) => sum + agent.drawdown * agent.weight, 0);
  const sharpeLike = active.reduce((sum, agent) => sum + agent.sharpeLike * agent.weight, 0);

  return {
    activeAgents: active.length,
    confidence: cio?.confidence ?? 0,
    simulatedPnl,
    hitRate,
    drawdown,
    sharpeLike
  };
}
