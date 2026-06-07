import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import type {
  IctDetectedOpportunity,
  IctMarketCycleStage,
  IctOpportunityClassificationInput,
  IctOpportunityDetectionContext,
  IctOpportunityDirection,
  IctOpportunityLaneRecommendation,
  IctOpportunityPdArrayContext,
  IctOpportunityQuality,
  IctOpportunityStage,
  IctOpportunityTradeIdea,
  IctOpportunityType
} from "./ictOpportunityDetectionTypes";
import type { IctSessionNarrative, IctSessionNarrativeEvent } from "./ictSessionNarrativeTypes";

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

const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const createOpportunityId = (context: IctOpportunityDetectionContext, type: IctOpportunityType) =>
  `ict_opportunity_${stableHash([
    context.sourceFingerprint,
    context.packet?.packetId,
    context.packet?.activeSource.sourceFingerprint,
    context.sessionNarrative?.tradingDate,
    context.recommendedSignal?.strategyId,
    context.recommendedSignal?.setup,
    type
  ].join("|"))}`;

const hasEvent = (events: IctSessionNarrativeEvent[] | undefined, ...eventTypes: IctSessionNarrativeEvent["eventType"][]) =>
  Boolean(events?.some((event) => eventTypes.includes(event.eventType)));

const eventNotes = (events: IctSessionNarrativeEvent[] | undefined, ...eventTypes: IctSessionNarrativeEvent["eventType"][]) =>
  (events ?? []).filter((event) => eventTypes.includes(event.eventType)).map((event) => event.note);

const sideToDirection = (side?: string): IctOpportunityDirection =>
  side === "long" ? "bullish" : side === "short" ? "bearish" : "neutral";

const directionalReadToSide = (direction?: string): IctAdvisorSignal["side"] =>
  direction === "bullish" ? "long" : direction === "bearish" ? "short" : "flat";

const profileToOpportunityType = (
  input: IctOpportunityClassificationInput
): IctOpportunityType => {
  const profile = input.sessionProfile ?? input.sessionNarrative?.profile;
  const modelName = input.sessionNarrative?.primaryModelDetection?.modelName;
  const events = input.events ?? input.sessionNarrative?.events;

  if (modelName === "consolidation_manipulation_distribution" || profile === "consolidation_manipulation_distribution") {
    return "expansion_from_consolidation";
  }
  if (
    modelName === "ny_session_reversal_to_premium_fvg" ||
    profile === "ny_session_reversal_to_premium_fvg" ||
    profile === "ny_session_reversal_from_premium_to_discount"
  ) {
    return "session_reversal";
  }
  if (modelName === "accumulation_manipulation_expansion" || profile === "accumulation_manipulation_expansion") {
    return "session_continuation";
  }
  if (modelName === "range_liquidity_sweep" || profile === "range_bound") {
    return "range_liquidity_sweep";
  }
  if (hasEvent(events, "premium_fvg_target", "discount_fvg_target")) return "fvg_draw";
  if (input.sessionNarrative?.mitigationContext.detected) return "mitigation_reaction";
  if (hasEvent(events, "buyside_sweep", "sellside_sweep", "london_swept_asia_high", "london_swept_asia_low")) {
    return "liquidity_raid";
  }
  if (hasEvent(events, "bearish_expansion", "bullish_expansion")) return "expansion_from_consolidation";
  if ((events?.length ?? 0) > 0 || input.sessionNarrative?.activeDealingRange) return "unknown_structured_opportunity";
  return "none";
};

export const classifyOpportunityType = (
  frameworkRead?: unknown,
  sessionNarrative?: IctSessionNarrative,
  pdArrays?: unknown
): IctOpportunityType => {
  const input =
    typeof frameworkRead === "object" && frameworkRead
      ? (frameworkRead as IctOpportunityClassificationInput)
      : ({ sessionNarrative } satisfies IctOpportunityClassificationInput);
  void pdArrays;
  return profileToOpportunityType({ ...input, sessionNarrative: input.sessionNarrative ?? sessionNarrative });
};

const marketCycleStageFor = (type: IctOpportunityType, narrative?: IctSessionNarrative): IctMarketCycleStage => {
  if (!narrative || narrative.dataDepth.status === "unavailable") return "unknown";
  if (type === "session_reversal") return "reversal";
  if (type === "session_continuation" || type === "expansion_from_consolidation") return "expansion";
  if (type === "retracement_to_pd_array" || type === "fvg_draw" || type === "mitigation_reaction" || type === "breaker_retest") return "retracement";
  if (type === "liquidity_raid" || type === "range_liquidity_sweep") return "seek_and_destroy";
  if (narrative.profile === "range_bound") return "consolidation";
  return "unknown";
};

const modelFamilyFor = (type: IctOpportunityType, modelName?: string): IctDetectedOpportunity["modelFamily"] => {
  if (modelName && modelName !== "incomplete_session_model") return "ICT";
  if (type === "unknown_structured_opportunity") return "unknown";
  if (type === "none") return "unknown";
  return "generic_session";
};

const buildPdArrayContext = (
  narrative?: IctSessionNarrative,
  signal?: IctAdvisorSignal
): IctOpportunityPdArrayContext[] => {
  const contexts: IctOpportunityPdArrayContext[] = [];
  if (narrative?.fvgTarget?.detected) {
    contexts.push({
      type: `${narrative.fvgTarget.direction}_fvg`,
      role: "target",
      high: narrative.fvgTarget.high,
      low: narrative.fvgTarget.low,
      reason: narrative.fvgTarget.note
    });
  }
  if (signal?.fairValueGap) {
    contexts.push({
      type: `${signal.fairValueGap.direction}_fair_value_gap`,
      role: signal.entryZone?.type === "fair_value_gap" ? "entry_context" : "support",
      high: signal.fairValueGap.high,
      low: signal.fairValueGap.low,
      reason: signal.fairValueGap.mitigated ? "FVG is already mitigated." : "Compact FVG is present in the advisor signal."
    });
  }
  if (signal?.orderBlock) {
    contexts.push({
      type: `${signal.orderBlock.direction}_${signal.orderBlock.variant}`,
      role: signal.orderBlock.direction === "bullish" ? "support" : "resistance",
      high: signal.orderBlock.high,
      low: signal.orderBlock.low,
      reason: signal.orderBlock.reason
    });
  }
  if (narrative?.mitigationContext.detected) {
    contexts.push({
      type: "mitigation_context",
      role: "entry_context",
      high: narrative.mitigationContext.zoneHigh,
      low: narrative.mitigationContext.zoneLow,
      reason: narrative.mitigationContext.note
    });
  }
  if (narrative?.activeDealingRange) {
    contexts.push({
      type: `dealing_range_${narrative.activeDealingRange.currentLocation}`,
      role: narrative.activeDealingRange.currentLocation === "premium" ? "resistance" : narrative.activeDealingRange.currentLocation === "discount" ? "support" : "entry_context",
      high: narrative.activeDealingRange.high,
      low: narrative.activeDealingRange.low,
      reason: `Price is in ${narrative.activeDealingRange.currentLocation} relative to the compact session dealing range.`
    });
  }
  return contexts.slice(0, 8);
};

const liquidityObjectiveFor = (
  type: IctOpportunityType,
  narrative?: IctSessionNarrative,
  signal?: IctAdvisorSignal
): IctDetectedOpportunity["liquidityObjective"] => {
  if (signal?.drawOnLiquidity) {
    return {
      side: signal.drawOnLiquidity.type.includes("high") || signal.drawOnLiquidity.type.includes("buy") ? "buy_side" : "sell_side",
      target: signal.drawOnLiquidity.price,
      source: signal.drawOnLiquidity.type,
      reason: "Advisor signal selected this draw-on-liquidity target."
    };
  }
  if (narrative?.fvgTarget?.detected) {
    return {
      side: narrative.fvgTarget.direction === "premium" ? "buy_side" : "sell_side",
      target: narrative.fvgTarget.midpoint ?? narrative.fvgTarget.high ?? narrative.fvgTarget.low,
      source: `${narrative.fvgTarget.direction}_fvg_target`,
      reason: narrative.fvgTarget.note
    };
  }
  const sweepNotes = eventNotes(narrative?.events, "buyside_sweep", "sellside_sweep", "london_swept_asia_high", "london_swept_asia_low");
  if (sweepNotes.length) {
    const buySide = hasEvent(narrative?.events, "buyside_sweep", "london_swept_asia_high");
    return {
      side: buySide ? "buy_side" : "sell_side",
      source: "session_liquidity_sweep",
      reason: sweepNotes[0]
    };
  }
  if (type === "none") return undefined;
  return {
    side: narrative?.directionalRead === "bearish" ? "sell_side" : "buy_side",
    source: "market_map",
    reason: "Opportunity has structure but no precise compact liquidity target yet."
  };
};

export const buildOpportunityTradeIdea = (
  opportunity: Pick<IctDetectedOpportunity, "direction" | "pdArrayContext"> & { signal?: IctAdvisorSignal }
): IctOpportunityTradeIdea => {
  const signal = opportunity.signal;
  const side = signal?.side ?? directionalReadToSide(opportunity.direction);
  return {
    side,
    entryReference: signal?.entryZone?.midpoint,
    target: signal?.target,
    invalidation: signal?.invalidation,
    rrEstimate: signal?.rrEstimate,
    confidence: signal?.confidence
  };
};

export const classifyOpportunityStage = (
  opportunity: Pick<IctDetectedOpportunity, "type" | "tradeIdea" | "missingEvidence" | "blockers"> & {
    modelState?: string;
    narrative?: IctSessionNarrative;
  }
): IctOpportunityStage => {
  if (opportunity.type === "none" || opportunity.narrative?.dataDepth.status === "unavailable") return "insufficient_data";
  if (opportunity.modelState === "invalidated" || opportunity.blockers.some((blocker) => /invalidated|expired|failed/i.test(blocker))) return "failed";
  if (finite(opportunity.tradeIdea?.target) && finite(opportunity.tradeIdea?.invalidation) && finite(opportunity.tradeIdea?.rrEstimate)) return "confirmed";
  if (opportunity.modelState === "triggered" || opportunity.modelState === "confirmed") return "triggered";
  if (opportunity.missingEvidence.length) return "forming";
  return "forming";
};

export const scoreOpportunityQuality = (
  opportunity: Pick<IctDetectedOpportunity, "type" | "stage" | "tradeIdea" | "missingEvidence" | "blockers" | "pdArrayContext"> & {
    modelDetected?: boolean;
  }
): IctOpportunityQuality => {
  if (opportunity.type === "none" || opportunity.stage === "insufficient_data") return "unknown";
  if (opportunity.blockers.some((blocker) => /missing candle|unavailable|insufficient data/i.test(blocker))) return "untradable";
  const hasTradeIdea = finite(opportunity.tradeIdea?.target) && finite(opportunity.tradeIdea?.invalidation) && finite(opportunity.tradeIdea?.rrEstimate);
  if (hasTradeIdea && opportunity.modelDetected && opportunity.stage === "confirmed" && opportunity.missingEvidence.length <= 1) return "high";
  if (hasTradeIdea && opportunity.missingEvidence.length <= 3) return "medium";
  if ((opportunity.pdArrayContext?.length ?? 0) > 0 || opportunity.modelDetected || opportunity.type === "unknown_structured_opportunity") return "low";
  return "untradable";
};

export const recommendOpportunityLane = (
  opportunity: Pick<IctDetectedOpportunity, "quality" | "tradeIdea" | "blockers"> & {
    approvedStatus?: string;
  }
): IctOpportunityLaneRecommendation => {
  const hasCompleteTradeIdea =
    (opportunity.tradeIdea?.side === "long" || opportunity.tradeIdea?.side === "short") &&
    finite(opportunity.tradeIdea?.target) &&
    finite(opportunity.tradeIdea?.invalidation) &&
    finite(opportunity.tradeIdea?.rrEstimate);
  const hardBlocked = opportunity.blockers.some((blocker) => /missing candle|unavailable|risk governor blocks|smt.*reject|approved-profile layer rejected/i.test(blocker));
  if (!hasCompleteTradeIdea) {
    return opportunity.quality === "unknown" || opportunity.quality === "untradable" ? "no_trade" : "watchlist_candidate";
  }
  if (hardBlocked) return "rejected_candidate";
  if (opportunity.approvedStatus === "approved_research_candidate") return "approved_candidate";
  if (opportunity.approvedStatus === "paper_watchlist_candidate") return "paper_watchlist_candidate";
  if (opportunity.approvedStatus === "watchlist_candidate") return "watchlist_candidate";
  if (opportunity.approvedStatus === "rejected_candidate") return "rejected_candidate";
  return "watchlist_candidate";
};

const nextActionFor = (opportunity: IctDetectedOpportunity) => {
  if (opportunity.type === "none") return "Collect enough compact session data before classifying an opportunity.";
  if (opportunity.type === "unknown_structured_opportunity") {
    return "Create a research hypothesis and collect examples; do not approve or paper-track until replay evidence exists.";
  }
  if (opportunity.laneRecommendation === "approved_candidate") {
    return "Treat as approved research only; run replay, evidence, maturity, and readiness gates before any future review.";
  }
  if (opportunity.laneRecommendation === "paper_watchlist_candidate") {
    return "Paper-test only; collect replay/paper outcomes and do not promote readiness.";
  }
  if (opportunity.laneRecommendation === "rejected_candidate") {
    return opportunity.blockers[0] ?? "Reject this current window and wait for cleaner evidence.";
  }
  if (opportunity.missingEvidence.length || opportunity.confirmationNeeded.length) {
    return `Opportunity detected, but wait for ${unique([...opportunity.missingEvidence, ...opportunity.confirmationNeeded]).slice(0, 2).join(" and ")}.`;
  }
  return "Watchlist this opportunity and validate with replay before any paper lane review.";
};

const blockersFor = (context: IctOpportunityDetectionContext, signal?: IctAdvisorSignal) =>
  unique([
    (context.packet?.activeSource.candleCount ?? 0) <= 0 ? "Missing candle data from active canonical research source." : undefined,
    context.sessionNarrative?.dataDepth.status === "insufficient" ? context.sessionNarrative.dataDepth.note : undefined,
    context.sessionNarrative?.dataDepth.status === "unavailable" ? context.sessionNarrative.dataDepth.note : undefined,
    ...(context.packet?.approvedProfileDecision.rejectionReasons ?? []),
    ...(signal?.noTradeReasons ?? []),
    signal?.smt?.rejectsCandidate ? `SMT/relative strength rejects candidate: ${signal.smt.reason}` : undefined,
    /reject|blocked|avoid|no_trade/i.test(signal?.newsSessionRisk?.riskGovernorAction ?? "")
      ? `Risk governor blocks candidate: ${signal?.newsSessionRisk?.newsSessionRiskNotes.slice(0, 2).join("; ") ?? "risk blocked"}`
      : undefined
  ]).slice(0, 10);

const missingEvidenceFor = (context: IctOpportunityDetectionContext, signal?: IctAdvisorSignal, type?: IctOpportunityType) =>
  unique([
    ...(context.sessionNarrative?.primaryModelDetection?.missingEvidence ?? []),
    !finite(signal?.target) ? "target" : undefined,
    !finite(signal?.invalidation) ? "invalidation" : undefined,
    !finite(signal?.rrEstimate) ? "RR" : undefined,
    !signal?.fairValueGap && !context.sessionNarrative?.fvgTarget?.detected ? "PD array / FVG target" : undefined,
    !context.sessionNarrative?.mitigationContext.detected && type === "mitigation_reaction" ? "mitigation tap" : undefined,
    type === "unknown_structured_opportunity" ? "known model match" : undefined
  ]).slice(0, 10);

const confirmationNeededFor = (context: IctOpportunityDetectionContext, signal?: IctAdvisorSignal, type?: IctOpportunityType) =>
  unique([
    !finite(signal?.target) ? "compact target construction" : undefined,
    !finite(signal?.invalidation) ? "structural invalidation construction" : undefined,
    !finite(signal?.rrEstimate) ? "RR calculation" : undefined,
    !signal?.displacement && type !== "range_liquidity_sweep" ? "displacement confirmation" : undefined,
    !signal?.fairValueGap && !context.sessionNarrative?.fvgTarget?.detected ? "FVG or PD-array draw" : undefined,
    !signal?.smt ? "SMT/relative-strength context" : undefined,
    !signal?.newsSessionRisk ? "news/session risk review" : undefined
  ]).slice(0, 10);

export const sanitizeDetectedOpportunity = (opportunity: IctDetectedOpportunity): IctDetectedOpportunity => {
  const sanitized = JSON.parse(JSON.stringify(opportunity)) as IctDetectedOpportunity;
  return {
    ...sanitized,
    researchOnly: true,
    tradeIdea: sanitized.tradeIdea
      ? {
          side: sanitized.tradeIdea.side,
          entryReference: sanitized.tradeIdea.entryReference,
          target: sanitized.tradeIdea.target,
          invalidation: sanitized.tradeIdea.invalidation,
          rrEstimate: sanitized.tradeIdea.rrEstimate,
          confidence: sanitized.tradeIdea.confidence
        }
      : undefined,
    confirmationNeeded: sanitized.confirmationNeeded.slice(0, 10),
    missingEvidence: sanitized.missingEvidence.slice(0, 10),
    blockers: sanitized.blockers.slice(0, 10),
    pdArrayContext: sanitized.pdArrayContext?.slice(0, 8),
    authority,
    safety
  };
};

export const detectIctOpportunities = (context: IctOpportunityDetectionContext): IctDetectedOpportunity[] => {
  const narrative = context.sessionNarrative ?? context.packet?.sessionNarrative;
  const signal = context.recommendedSignal ?? context.packet?.recommendedSignal;
  const generatedAt = context.generatedAt ?? context.packet?.generatedAt ?? new Date().toISOString();
  const hasData = Boolean((context.packet?.activeSource.candleCount ?? 0) > 0 || narrative);
  const type = hasData
    ? profileToOpportunityType({ sessionNarrative: narrative, recommendedSignal: signal })
    : "none";
  const modelDetection = narrative?.primaryModelDetection;
  const modelName = modelDetection?.modelName && modelDetection.modelName !== "incomplete_session_model"
    ? modelDetection.modelName
    : narrative?.profile && narrative.profile !== "unknown" && narrative.profile !== "insufficient_data"
      ? narrative.profile
      : undefined;
  const direction = sideToDirection(signal?.side) !== "neutral"
    ? sideToDirection(signal?.side)
    : narrative?.directionalRead ?? "neutral";
  const marketCycleStage = marketCycleStageFor(type, narrative);
  const pdArrayContext = buildPdArrayContext(narrative, signal);
  const tradeIdea = buildOpportunityTradeIdea({ direction, pdArrayContext, signal });
  const blockers = blockersFor(context, signal);
  const missingEvidence = missingEvidenceFor(context, signal, type);
  const confirmationNeeded = confirmationNeededFor(context, signal, type);

  const draft = {
    researchOnly: true as const,
    opportunityId: createOpportunityId(context, type),
    generatedAt,
    type,
    stage: "forming" as IctOpportunityStage,
    quality: "unknown" as IctOpportunityQuality,
    modelName,
    modelFamily: modelFamilyFor(type, modelName),
    direction,
    marketCycleStage,
    liquidityObjective: liquidityObjectiveFor(type, narrative, signal),
    pdArrayContext,
    tradeIdea,
    confirmationNeeded,
    missingEvidence,
    blockers,
    laneRecommendation: "no_trade" as IctOpportunityLaneRecommendation,
    nextAction: "",
    authority,
    safety
  } satisfies IctDetectedOpportunity;

  const stage = classifyOpportunityStage({
    ...draft,
    modelState: modelDetection?.modelState,
    narrative
  });
  const quality = scoreOpportunityQuality({
    ...draft,
    stage,
    modelDetected: Boolean(modelDetection?.modelDetected || modelName)
  });
  const laneRecommendation = recommendOpportunityLane({
    ...draft,
    quality,
    approvedStatus: context.approvedStatus ?? context.packet?.approvedProfileDecision.status
  });
  const opportunity = sanitizeDetectedOpportunity({
    ...draft,
    stage,
    quality,
    laneRecommendation,
    nextAction: ""
  });
  return [
    sanitizeDetectedOpportunity({
      ...opportunity,
      nextAction: nextActionFor(opportunity)
    })
  ];
};

export const assertIctDetectedOpportunityIsCompact = (opportunity: IctDetectedOpportunity) => {
  const serialized = JSON.stringify(opportunity);
  return {
    ok:
      opportunity.researchOnly === true &&
      opportunity.authority.executionAuthority === "none" &&
      opportunity.authority.brokerAuthority === "none" &&
      opportunity.authority.readinessOverrideAuthority === "none" &&
      opportunity.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: serialized.length
  };
};
