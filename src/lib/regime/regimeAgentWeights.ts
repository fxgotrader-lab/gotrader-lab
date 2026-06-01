import type { InternalAgentId } from "@/lib/agents/agentTypes";
import type { RegimeClassification } from "@/lib/regime/regimeTypes";

const clamp = (value: number, min = 0.01, max = 0.18) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function regimeAdjustedAgentWeight(
  agentId: InternalAgentId,
  baseWeight: number,
  regime?: RegimeClassification
) {
  if (!regime || regime.stableLabel === "insufficient_data") {
    return baseWeight;
  }
  const label = regime.stableLabel;
  const confidenceBoost = Math.max(0, regime.confidence - 0.5);
  let multiplier = 1;

  if (agentId === "composite-regime-agent" || agentId === "volatility-regime-agent") {
    multiplier += 0.35 + confidenceBoost * 0.5;
  }
  if ((label === "event_high_vol" || label === "risk_off_crisis") && agentId === "macro-event-risk-agent") {
    multiplier += 0.45;
  }
  if ((label === "trend_bull" || label === "trend_bear") && (agentId === "ict-structure-agent" || agentId === "grinch-htf-bias-agent")) {
    multiplier += 0.18;
  }
  if ((label === "range_low_vol" || label === "range_high_vol") && (agentId === "risk-reward-agent" || agentId === "session-levels-agent")) {
    multiplier += 0.16;
  }
  if (regime.transitionPending && agentId !== "composite-regime-agent") {
    multiplier -= 0.08;
  }

  return Number(clamp(baseWeight * multiplier).toFixed(3));
}

