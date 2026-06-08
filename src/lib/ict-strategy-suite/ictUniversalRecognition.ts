import type { IctAdvisorPacket, IctAdvisorSignal, IctSide } from "./ictAdvisorTypes";
import type { IctApprovedCandidateStatus } from "./ictApprovedSetupProfileTypes";
import type { IctDetectedOpportunity } from "./ictOpportunityDetectionTypes";
import type {
  IctSessionDirectionalRead,
  IctSessionModelDetection,
  IctSessionNarrative,
  IctSessionNarrativeEvent,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";
import type {
  IctPdArrayDirection,
  IctPdArrayRecognition,
  IctRecognitionTier,
  IctScalpDirection,
  IctScalpOpportunity,
  IctScalpSetupStatus,
  IctUniversalRecognitionResult
} from "./ictUniversalRecognitionTypes";

export interface IctUniversalRecognitionInput {
  packet?: IctAdvisorPacket;
  sessionNarrative?: IctSessionNarrative;
  recommendedSignal?: IctAdvisorSignal;
  approvedStatus?: IctApprovedCandidateStatus;
  primaryOpportunity?: IctDetectedOpportunity;
  generatedAt?: string;
}

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const knownProfiles = new Set<IctSessionNarrativeProfile>([
  "consolidation_manipulation_distribution",
  "accumulation_manipulation_expansion",
  "ny_session_reversal_to_premium_fvg",
  "ny_session_reversal_from_premium_to_discount",
  "trend_continuation"
]);

const compact = (value?: string) => value?.replace(/_/g, " ") ?? "unknown";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
const clamp = (value: number) => Math.max(0, Math.min(1, Number(value.toFixed(4))));

const directionFromSide = (side?: IctSide): IctScalpDirection =>
  side === "long" ? "bullish" : side === "short" ? "bearish" : "neutral";

const sideFromDirection = (direction?: IctScalpDirection): IctSide =>
  direction === "bullish" ? "long" : direction === "bearish" ? "short" : "flat";

const eventDirection = (event: IctSessionNarrativeEvent): IctScalpDirection => {
  if (event.direction === "bullish" || event.eventType === "sellside_sweep" || event.eventType === "ny_open_consolidation_low_sweep" || event.eventType === "bullish_expansion" || event.eventType === "ny_reversal_higher") return "bullish";
  if (event.direction === "bearish" || event.eventType === "buyside_sweep" || event.eventType === "ny_open_consolidation_high_sweep" || event.eventType === "bearish_expansion" || event.eventType === "ny_reversal_lower") return "bearish";
  return "neutral";
};

const pdDirectionFor = (direction?: "bullish" | "bearish" | "premium" | "discount" | "unknown" | IctSessionDirectionalRead): IctPdArrayDirection =>
  direction === "bullish" || direction === "discount"
    ? "bullish"
    : direction === "bearish" || direction === "premium"
      ? "bearish"
      : "neutral";

const confidenceFrom = (...values: Array<number | undefined>) => {
  const found = values.find((value) => finite(value));
  return found === undefined ? undefined : clamp(found);
};

const bestModelDetection = (detections: IctSessionModelDetection[]) =>
  detections
    .slice()
    .sort((left, right) => {
      const stateWeight = (state?: string) =>
        state === "confirmed" ? 4 : state === "triggered" ? 3 : state === "forming" ? 2 : state === "invalidated" ? 1 : 0;
      return (
        Number(right.modelDetected) - Number(left.modelDetected) ||
        stateWeight(right.modelState) - stateWeight(left.modelState) ||
        right.modelConfidence - left.modelConfidence
      );
    })[0];

export const recognizeKnownModels = (input: IctUniversalRecognitionInput): IctUniversalRecognitionResult["knownModel"] | undefined => {
  const narrative = input.sessionNarrative ?? input.packet?.sessionNarrative;
  const compactModel = input.packet?.compactSummary.primaryModelDetection;
  const model = bestModelDetection([
    ...(narrative?.modelDetections ?? []),
    ...(narrative?.primaryModelDetection ? [narrative.primaryModelDetection] : []),
    ...(compactModel ? [compactModel] : [])
  ]);

  if (model && (model.modelDetected || model.modelState === "forming" || model.modelState === "triggered")) {
    return {
      detected: model.modelDetected,
      modelName: model.modelName,
      state: model.modelState,
      direction: pdDirectionFor(model.modelDirection),
      confidence: confidenceFrom(model.modelConfidence),
      reasons: unique([...(model.modelReasons ?? []), ...(model.missingEvidence ?? []).map((reason) => `Missing: ${reason}`)]).slice(0, 8)
    };
  }

  if (narrative?.profile && knownProfiles.has(narrative.profile)) {
    return {
      detected: false,
      modelName: narrative.profile,
      state: "forming",
      direction: pdDirectionFor(narrative.directionalRead),
      confidence: confidenceFrom(narrative.confidence, 0.45),
      reasons: unique([
        `Session profile ${compact(narrative.profile)} is forming but not confirmed.`,
        ...(narrative.noTradeReasons ?? []).slice(0, 4)
      ])
    };
  }

  return undefined;
};

const arrayKey = (array: IctPdArrayRecognition) =>
  [array.type, array.timeframe, array.role, array.high, array.low, array.midpoint].join("|");

const dedupeArrays = (arrays: IctPdArrayRecognition[]) => {
  const seen = new Set<string>();
  return arrays.filter((array) => {
    const key = arrayKey(array);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 16);
};

export const recognizePdArrays = (input: IctUniversalRecognitionInput): IctPdArrayRecognition[] => {
  const packet = input.packet;
  const narrative = input.sessionNarrative ?? packet?.sessionNarrative;
  const signal = input.recommendedSignal ?? packet?.recommendedSignal;
  const arrays: IctPdArrayRecognition[] = [];

  if (signal?.fairValueGap) {
    arrays.push({
      type: "fair_value_gap",
      timeframe: signal.fairValueGap.timeframe || signal.primaryTimeframe,
      direction: pdDirectionFor(signal.fairValueGap.direction),
      role: signal.fairValueGap.mitigated ? "entry_context" : "draw",
      high: signal.fairValueGap.high,
      low: signal.fairValueGap.low,
      midpoint: signal.fairValueGap.midpoint,
      confidence: signal.fairValueGap.mitigated ? 0.52 : 0.72,
      reason: signal.fairValueGap.mitigated ? "FVG exists but is already mitigated." : "Active compact FVG is available for draw or entry context."
    });
  }

  if (signal?.entryZone) {
    const type = signal.entryZone.type === "fair_value_gap"
      ? "fair_value_gap"
      : signal.entryZone.type === "breaker_block"
        ? "breaker_block"
        : signal.entryZone.type === "mitigation_block"
          ? "mitigation_block"
          : signal.entryZone.type === "rejection_block"
            ? "rejection_block"
            : signal.entryZone.type === "propulsion_block"
              ? "propulsion_block"
              : "order_block";
    arrays.push({
      type,
      timeframe: signal.primaryTimeframe,
      direction: directionFromSide(signal.side),
      role: "entry_context",
      high: signal.entryZone.high,
      low: signal.entryZone.low,
      midpoint: signal.entryZone.midpoint,
      confidence: 0.68,
      reason: `Entry zone comes from compact ${compact(signal.entryZone.type)} context.`
    });
  }

  if (signal?.orderBlock) {
    const type = signal.orderBlock.variant === "breaker_block"
      ? "breaker_block"
      : signal.orderBlock.variant === "mitigation_block"
        ? "mitigation_block"
        : signal.orderBlock.variant === "rejection_block"
          ? "rejection_block"
          : signal.orderBlock.variant === "propulsion_block"
            ? "propulsion_block"
            : "order_block";
    arrays.push({
      type,
      timeframe: signal.primaryTimeframe,
      direction: pdDirectionFor(signal.orderBlock.direction),
      role: "entry_context",
      high: signal.orderBlock.high,
      low: signal.orderBlock.low,
      midpoint: signal.orderBlock.midpoint,
      confidence: signal.orderBlock.displacementConfirmed || signal.orderBlock.liquiditySweepConfirmed ? 0.7 : 0.5,
      reason: signal.orderBlock.reason ?? `Compact ${compact(signal.orderBlock.variant)} context detected.`
    });
  }

  if (narrative?.fvgTarget?.detected) {
    arrays.push({
      type: "fair_value_gap",
      timeframe: narrative.primaryTimeframe,
      direction: pdDirectionFor(narrative.fvgTarget.direction),
      role: "target",
      high: narrative.fvgTarget.high,
      low: narrative.fvgTarget.low,
      midpoint: narrative.fvgTarget.midpoint,
      confidence: 0.66,
      reason: narrative.fvgTarget.note
    });
  }

  if (narrative?.mitigationContext.detected) {
    arrays.push({
      type: "mitigation_block",
      timeframe: narrative.primaryTimeframe,
      direction: pdDirectionFor(narrative.mitigationContext.direction),
      role: "entry_context",
      high: narrative.mitigationContext.zoneHigh,
      low: narrative.mitigationContext.zoneLow,
      midpoint: finite(narrative.mitigationContext.zoneHigh) && finite(narrative.mitigationContext.zoneLow)
        ? Number(((narrative.mitigationContext.zoneHigh + narrative.mitigationContext.zoneLow) / 2).toFixed(2))
        : undefined,
      confidence: narrative.mitigationContext.expansionConfirmed ? 0.68 : 0.52,
      reason: narrative.mitigationContext.note
    });
  }

  if (narrative?.activeDealingRange) {
    arrays.push({
      type: "premium_discount_array",
      timeframe: narrative.primaryTimeframe,
      direction: narrative.activeDealingRange.currentLocation === "discount" ? "bullish" : narrative.activeDealingRange.currentLocation === "premium" ? "bearish" : "neutral",
      role: "entry_context",
      high: narrative.activeDealingRange.high,
      low: narrative.activeDealingRange.low,
      midpoint: narrative.activeDealingRange.midpoint,
      confidence: 0.58,
      reason: `Price is in ${compact(narrative.activeDealingRange.currentLocation)} of the active dealing range.`
    });
  }

  for (const range of narrative?.ranges ?? []) {
    if (finite(range.high)) {
      arrays.push({
        type: "session_high_low",
        timeframe: narrative?.primaryTimeframe ?? signal?.primaryTimeframe ?? packet?.primaryTimeframe ?? "5m",
        direction: "bearish",
        role: "resistance",
        high: range.high,
        low: range.high,
        midpoint: range.high,
        confidence: range.session === "asia" || range.session === "london" ? 0.62 : 0.54,
        reason: `${range.label} high can act as compact buy-side liquidity or resistance.`
      });
    }
    if (finite(range.low)) {
      arrays.push({
        type: "session_high_low",
        timeframe: narrative?.primaryTimeframe ?? signal?.primaryTimeframe ?? packet?.primaryTimeframe ?? "5m",
        direction: "bullish",
        role: "support",
        high: range.low,
        low: range.low,
        midpoint: range.low,
        confidence: range.session === "asia" || range.session === "london" ? 0.62 : 0.54,
        reason: `${range.label} low can act as compact sell-side liquidity or support.`
      });
    }
  }

  for (const context of input.primaryOpportunity?.pdArrayContext ?? []) {
    arrays.push({
      type: context.type === "fair_value_gap" ? "fair_value_gap" : context.type.includes("mitigation") ? "mitigation_block" : context.type.includes("breaker") ? "breaker_block" : context.type.includes("order") ? "order_block" : "unknown",
      timeframe: signal?.primaryTimeframe ?? narrative?.primaryTimeframe ?? packet?.primaryTimeframe ?? "5m",
      direction: "neutral",
      role: context.role,
      high: context.high,
      low: context.low,
      midpoint: finite(context.high) && finite(context.low) ? Number(((context.high + context.low) / 2).toFixed(2)) : undefined,
      confidence: 0.55,
      reason: context.reason
    });
  }

  if (signal?.drawOnLiquidity?.type === "previous_day_high" || signal?.drawOnLiquidity?.type === "previous_day_low") {
    arrays.push({
      type: "prior_day_level",
      timeframe: signal.drawOnLiquidity.timeframe || "D1",
      direction: signal.drawOnLiquidity.type === "previous_day_low" ? "bullish" : "bearish",
      role: "draw",
      high: signal.drawOnLiquidity.price,
      low: signal.drawOnLiquidity.price,
      midpoint: signal.drawOnLiquidity.price,
      confidence: 0.56,
      reason: `${compact(signal.drawOnLiquidity.type)} is the current compact liquidity draw.`
    });
  }

  return dedupeArrays(arrays);
};

const hasSweep = (events: IctSessionNarrativeEvent[] = [], signal?: IctAdvisorSignal) =>
  Boolean(signal?.liquiditySwept) ||
  events.some((event) => /sweep|swept|reclaim|rejection/i.test(event.eventType));

const hasDisplacement = (events: IctSessionNarrativeEvent[] = [], signal?: IctAdvisorSignal) =>
  Boolean(signal?.displacement) ||
  events.some((event) => /expansion|reversal_higher|reversal_lower/i.test(event.eventType));

const scalpDirectionFor = (events: IctSessionNarrativeEvent[] = [], signal?: IctAdvisorSignal, narrative?: IctSessionNarrative) => {
  const signalDirection = directionFromSide(signal?.side);
  if (signalDirection !== "neutral") return signalDirection;
  const directionalEvent = events.slice().reverse().find((event) => eventDirection(event) !== "neutral");
  const eventBasedDirection = directionalEvent ? eventDirection(directionalEvent) : "neutral";
  return eventBasedDirection !== "neutral" ? eventBasedDirection : pdDirectionFor(narrative?.directionalRead);
};

const liquidityDrawFor = (signal?: IctAdvisorSignal, opportunity?: IctDetectedOpportunity, direction?: IctScalpDirection): IctScalpOpportunity["liquidityDraw"] | undefined => {
  if (opportunity?.liquidityObjective) {
    return {
      side: opportunity.liquidityObjective.side,
      level: opportunity.liquidityObjective.target,
      reason: opportunity.liquidityObjective.reason
    };
  }
  if (signal?.drawOnLiquidity) {
    return {
      side: /low|sell/i.test(signal.drawOnLiquidity.type) ? "sell_side" : "buy_side",
      level: signal.drawOnLiquidity.price,
      reason: `${compact(signal.drawOnLiquidity.type)} is the nearest compact liquidity draw.`
    };
  }
  if (direction === "bullish") return { side: "buy_side", reason: "Bullish scalp would need a clear buy-side draw after sell-side raid." };
  if (direction === "bearish") return { side: "sell_side", reason: "Bearish scalp would need a clear sell-side draw after buy-side raid." };
  return undefined;
};

const scalpStatusFor = (input: {
  hasData: boolean;
  sweep: boolean;
  displacement: boolean;
  entryContext?: IctPdArrayRecognition;
  target?: number;
  invalidation?: number;
  rrEstimate?: number;
  riskBlocked: boolean;
}): IctScalpSetupStatus => {
  if (!input.hasData) return "insufficient_data";
  if (input.riskBlocked) return "scalp_rejected";
  if (input.sweep && input.displacement && input.entryContext && finite(input.target) && finite(input.invalidation) && finite(input.rrEstimate) && input.rrEstimate >= 1) return "scalp_candidate";
  if ((input.sweep || input.displacement) && (input.entryContext || finite(input.target) || finite(input.invalidation))) return "scalp_watchlist";
  return "no_scalp_setup";
};

export const detectScalpOpportunity = (
  input: IctUniversalRecognitionInput,
  pdArrays: IctPdArrayRecognition[]
): IctScalpOpportunity => {
  const packet = input.packet;
  const narrative = input.sessionNarrative ?? packet?.sessionNarrative;
  const signal = input.recommendedSignal ?? packet?.recommendedSignal;
  const opportunity = input.primaryOpportunity;
  const hasData = Boolean((packet?.activeSource.candleCount ?? 0) > 0 || narrative?.dataDepth.candleCount);
  const events = narrative?.events ?? [];
  const sweep = hasSweep(events, signal);
  const displacement = hasDisplacement(events, signal);
  const direction = scalpDirectionFor(events, signal, narrative);
  const entryContext = pdArrays.find((array) => array.role === "entry_context" && (array.direction === direction || array.direction === "neutral")) ?? pdArrays.find((array) => array.role === "entry_context");
  const target = signal?.target ?? opportunity?.tradeIdea?.target;
  const invalidation = signal?.invalidation ?? opportunity?.tradeIdea?.invalidation;
  const rrEstimate = signal?.rrEstimate ?? opportunity?.tradeIdea?.rrEstimate;
  const riskBlocked = /reject|blocked|avoid|no_trade/i.test(signal?.newsSessionRisk?.riskGovernorAction ?? signal?.newsSessionRisk?.sessionRiskState ?? "");
  const confirmationNeeded = unique([
    !sweep ? "Confirm sweep of local high/low or session liquidity." : undefined,
    !displacement ? "Confirm displacement after sweep." : undefined,
    !entryContext ? "Identify nearby FVG/OB/mitigation PD-array reaction." : undefined,
    !finite(target) ? "Construct logical target from liquidity draw or PD array." : undefined,
    !finite(invalidation) ? "Construct structural invalidation." : undefined,
    !finite(rrEstimate) ? "Compute reward/risk from compact target and invalidation." : undefined
  ]);
  const blockers = unique([
    !hasData ? "Insufficient compact candle context." : undefined,
    riskBlocked ? "News/session risk governor blocks scalp candidate." : undefined,
    ...confirmationNeeded
  ]).slice(0, 8);
  const status = scalpStatusFor({ hasData, sweep, displacement, entryContext, target, invalidation, rrEstimate, riskBlocked });
  const confidence = status === "scalp_candidate"
    ? confidenceFrom(signal?.confidence, 0.62)
    : status === "scalp_watchlist"
      ? confidenceFrom(signal?.confidence, 0.42)
      : status === "scalp_rejected"
        ? confidenceFrom(signal?.confidence, 0.2)
        : undefined;
  const nextAction =
    status === "scalp_candidate"
      ? "Keep as research-only scalp candidate; run replay validation before any paper-watchlist review."
      : status === "scalp_watchlist"
        ? "Watch for missing sweep/displacement/PD-array confirmation before replay testing."
        : status === "scalp_rejected"
          ? blockers[0] ?? "Reject scalp candidate for current window."
          : status === "insufficient_data"
            ? "Load MT5 read-only context before scalp recognition."
            : "Maintain market map only; no scalp setup is confirmed.";

  return {
    researchOnly: true,
    status,
    direction,
    side: sideFromDirection(direction),
    sourceTimeframe: signal?.primaryTimeframe ?? narrative?.primaryTimeframe ?? packet?.primaryTimeframe ?? "5m",
    liquidityDraw: liquidityDrawFor(signal, opportunity, direction),
    entryContext,
    target,
    invalidation,
    rrEstimate,
    confidence,
    confirmationNeeded,
    blockers,
    nextAction,
    authority
  };
};

export const classifyRecognitionTier = (input: {
  hasData: boolean;
  knownModel?: IctUniversalRecognitionResult["knownModel"];
  pdArrays: IctPdArrayRecognition[];
  scalpOpportunity?: IctScalpOpportunity;
  primaryOpportunity?: IctDetectedOpportunity;
  narrative?: IctSessionNarrative;
}): IctRecognitionTier => {
  if (!input.hasData || input.narrative?.profile === "insufficient_data") return "insufficient_data";
  if (input.knownModel?.detected && input.knownModel.state === "confirmed") return "full_model";
  if (input.knownModel && (input.knownModel.state === "forming" || input.knownModel.state === "triggered" || input.knownModel.detected)) return "forming_model";
  if (input.scalpOpportunity?.status === "scalp_candidate" || input.scalpOpportunity?.status === "scalp_watchlist") return "scalp_setup";
  if (input.pdArrays.length > 0) return "pd_array_setup";
  if (input.primaryOpportunity?.type && input.primaryOpportunity.type !== "none" && input.primaryOpportunity.stage !== "insufficient_data") return "unknown_structured_opportunity";
  if ((input.narrative?.events.length ?? 0) > 0 || (input.narrative?.ranges.length ?? 0) > 0) return "market_map_only";
  return "insufficient_data";
};

const laneFor = (tier: IctRecognitionTier, approvedStatus?: IctApprovedCandidateStatus, scalp?: IctScalpOpportunity): IctUniversalRecognitionResult["laneRecommendation"] => {
  if (approvedStatus === "approved_research_candidate") return "approved_candidate";
  if (approvedStatus === "paper_watchlist_candidate") return "paper_watchlist_candidate";
  if (approvedStatus === "watchlist_candidate") return "watchlist_candidate";
  if (approvedStatus === "rejected_candidate") return "rejected_candidate";
  if (tier === "full_model") return "watchlist_candidate";
  if (tier === "forming_model" || tier === "pd_array_setup" || tier === "unknown_structured_opportunity") return "watchlist_candidate";
  if (tier === "scalp_setup" && scalp?.status === "scalp_candidate") return "watchlist_candidate";
  return "no_trade";
};

const summaryFor = (tier: IctRecognitionTier, model: IctUniversalRecognitionResult["knownModel"], scalp: IctScalpOpportunity | undefined, pdArrays: IctPdArrayRecognition[]) => {
  if (tier === "full_model") return `Full ${compact(model?.modelName)} model detected; approval gates remain authoritative.`;
  if (tier === "forming_model") return `${compact(model?.modelName)} model is forming; wait for missing confirmation.`;
  if (tier === "scalp_setup") return `${compact(scalp?.status)}: ${compact(scalp?.direction)} lower-timeframe opportunity mapped from liquidity and PD-array context.`;
  if (tier === "pd_array_setup") return `PD-array setup detected around ${compact(pdArrays[0]?.type)}; no complete model is confirmed.`;
  if (tier === "unknown_structured_opportunity") return "Structured ICT opportunity detected, but it does not match a fully validated model contract yet.";
  if (tier === "market_map_only") return "Market map context is available, but no full model, PD-array setup, or scalp setup is confirmed.";
  return "Insufficient compact data for universal recognition.";
};

export const sanitizeUniversalRecognitionResult = (
  result: IctUniversalRecognitionResult
): IctUniversalRecognitionResult => ({
  ...result,
  researchOnly: true,
  pdArrays: result.pdArrays.slice(0, 16),
  scalpOpportunity: result.scalpOpportunity
    ? {
        ...result.scalpOpportunity,
        researchOnly: true,
        confirmationNeeded: result.scalpOpportunity.confirmationNeeded.slice(0, 8),
        blockers: result.scalpOpportunity.blockers.slice(0, 8),
        authority
      }
    : undefined,
  missingEvidence: result.missingEvidence.slice(0, 10),
  blockers: result.blockers.slice(0, 10),
  safety,
  authority
});

export const buildIctUniversalRecognition = (
  input: IctUniversalRecognitionInput = {}
): IctUniversalRecognitionResult => {
  const packet = input.packet;
  const narrative = input.sessionNarrative ?? packet?.sessionNarrative;
  const signal = input.recommendedSignal ?? packet?.recommendedSignal;
  const generatedAt = input.generatedAt ?? packet?.generatedAt ?? new Date().toISOString();
  const hasData = Boolean((packet?.activeSource.candleCount ?? 0) > 0 || (narrative?.dataDepth.candleCount ?? 0) > 0);
  const knownModel = recognizeKnownModels({ ...input, packet, sessionNarrative: narrative, recommendedSignal: signal });
  const pdArrays = recognizePdArrays({ ...input, packet, sessionNarrative: narrative, recommendedSignal: signal });
  const scalpOpportunity = detectScalpOpportunity({ ...input, packet, sessionNarrative: narrative, recommendedSignal: signal }, pdArrays);
  const tier = classifyRecognitionTier({
    hasData,
    knownModel,
    pdArrays,
    scalpOpportunity,
    primaryOpportunity: input.primaryOpportunity,
    narrative
  });
  const laneRecommendation = laneFor(tier, input.approvedStatus ?? packet?.approvedProfileDecision.status, scalpOpportunity);
  const missingEvidence = unique([
    ...(knownModel?.detected ? [] : knownModel?.reasons ?? []),
    ...(scalpOpportunity.confirmationNeeded ?? []),
    ...(input.primaryOpportunity?.missingEvidence ?? []),
    ...(narrative?.noTradeReasons ?? []).slice(0, 4)
  ]);
  const blockers = unique([
    ...(scalpOpportunity.blockers ?? []),
    ...(input.primaryOpportunity?.blockers ?? []),
    !hasData ? "Insufficient compact candle context." : undefined
  ]);
  const nextAction =
    tier === "full_model"
      ? "Review model-quality lane and replay evidence; no execution authority."
      : tier === "forming_model"
        ? "Track missing confirmation before replay validation."
        : tier === "pd_array_setup" || tier === "scalp_setup"
          ? "Queue or replay-test as research hypothesis; do not approve automatically."
          : tier === "unknown_structured_opportunity"
            ? "Document the structure and test whether repeated cases justify a model contract."
            : tier === "market_map_only"
              ? "Continue observing the market map until PD-array or scalp confirmation appears."
              : "Load MT5 read-only context and rerun Activate Market.";

  return sanitizeUniversalRecognitionResult({
    researchOnly: true,
    generatedAt,
    tier,
    knownModel,
    pdArrays,
    scalpOpportunity,
    marketCycleStage: input.primaryOpportunity?.marketCycleStage ?? narrative?.profile,
    liquiditySummary: scalpOpportunity.liquidityDraw
      ? `${scalpOpportunity.liquidityDraw.side} ${finite(scalpOpportunity.liquidityDraw.level) ? scalpOpportunity.liquidityDraw.level : ""}`.trim()
      : signal?.drawOnLiquidity
        ? `${compact(signal.drawOnLiquidity.type)} @ ${signal.drawOnLiquidity.price}`
        : undefined,
    opportunitySummary: summaryFor(tier, knownModel, scalpOpportunity, pdArrays),
    laneRecommendation,
    nextAction,
    missingEvidence,
    blockers,
    safety,
    authority
  });
};

export const assertIctUniversalRecognitionIsCompact = (result: IctUniversalRecognitionResult) => {
  const serialized = JSON.stringify(result);
  return {
    ok:
      result.researchOnly === true &&
      result.authority.executionAuthority === "none" &&
      result.authority.brokerAuthority === "none" &&
      result.authority.readinessOverrideAuthority === "none" &&
      result.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"account(Data|Number)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
