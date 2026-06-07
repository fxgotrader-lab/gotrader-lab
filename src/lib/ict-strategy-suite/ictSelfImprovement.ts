import type {
  IctResearchHypothesis,
  IctResearchHypothesisBuildInput,
  IctResearchHypothesisBuildResult,
  IctResearchHypothesisEligibility,
  IctResearchHypothesisJournalEvent,
  IctResearchHypothesisQueueResult,
  IctSelfImprovementQueue
} from "./ictSelfImprovementTypes";

export const ICT_SELF_IMPROVEMENT_QUEUE_STORAGE_KEY = "gotrader.ict-self-improvement.queue.v1";
export const ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY = "gotrader.ict-self-improvement.journal.v1";
export const ICT_SELF_IMPROVEMENT_UPDATED_EVENT = "gotrader:ict-self-improvement-updated";

const MAX_ICT_RESEARCH_HYPOTHESES = 100;
const MAX_ICT_RESEARCH_HYPOTHESIS_JOURNAL_EVENTS = 200;

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

let memoryQueue: IctSelfImprovementQueue = {
  updatedAt: new Date().toISOString(),
  researchOnly: true,
  hypotheses: [],
  authority,
  safety
};
let memoryJournal: IctResearchHypothesisJournalEvent[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error ?? "unknown_error");
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const createId = (prefix: string, seed: string) => `${prefix}_${stableHash(seed)}`;

const publishQueueUpdate = (queue: IctSelfImprovementQueue) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ICT_SELF_IMPROVEMENT_UPDATED_EVENT, { detail: { queue } }));
};

const compactToken = (value?: string) => (value ? value.replace(/_/g, " ") : "unknown");

const isInsufficientData = (input: IctResearchHypothesisBuildInput) => {
  const opportunity = input.opportunity;
  return Boolean(
    !opportunity ||
      opportunity.type === "none" ||
      opportunity.stage === "insufficient_data" ||
      input.dataStatus === "missing" ||
      input.dataStatus === "unavailable" ||
      (typeof input.candleCount === "number" && input.candleCount <= 0) ||
      opportunity.blockers.some((blocker) => /missing candle|unavailable|insufficient data|source failed/i.test(blocker))
  );
};

const isApprovedOrPaperLane = (input: IctResearchHypothesisBuildInput) =>
  input.approvedStatus === "approved_research_candidate" ||
  input.approvedStatus === "paper_watchlist_candidate" ||
  input.modelQualityLane === "approved" ||
  input.modelQualityLane === "paper_watchlist" ||
  input.opportunity?.laneRecommendation === "approved_candidate" ||
  input.opportunity?.laneRecommendation === "paper_watchlist_candidate";

const isNoisyRangeBound = (input: IctResearchHypothesisBuildInput) =>
  input.opportunity?.type === "range_liquidity_sweep" &&
  (input.opportunity.quality === "low" ||
    input.opportunity.quality === "untradable" ||
    input.opportunity.quality === "unknown" ||
    !input.opportunity.modelName);

export const evaluateIctResearchHypothesisEligibility = (
  input: IctResearchHypothesisBuildInput
): IctResearchHypothesisEligibility => {
  const blockers = unique([
    !input.opportunity ? "No compact opportunity was supplied." : undefined,
    isInsufficientData(input) ? "Data is insufficient for a research hypothesis." : undefined,
    isApprovedOrPaperLane(input) ? "Opportunity is already approved or paper-watchlist; no self-improvement hypothesis is created." : undefined,
    isNoisyRangeBound(input) ? "Range-bound/noisy action is not queued without stronger reversal or expansion evidence." : undefined,
    input.opportunity?.quality === "untradable" ? "Opportunity quality is untradable." : undefined,
    input.opportunity?.authority.executionAuthority !== "none" ? "Opportunity execution authority is not none." : undefined,
    input.opportunity?.authority.brokerAuthority !== "none" ? "Opportunity broker authority is not none." : undefined,
    input.opportunity?.authority.readinessOverrideAuthority !== "none" ? "Opportunity readiness override authority is not none." : undefined
  ]);
  return {
    eligible: blockers.length === 0,
    status: blockers.length === 0 ? "eligible" : "not_eligible",
    reason: blockers[0] ?? "Structured opportunity is eligible for a research-only hypothesis.",
    blockers
  };
};

const validationRulesFor = (input: IctResearchHypothesisBuildInput) => {
  const opportunity = input.opportunity;
  const missing = unique([...(opportunity?.missingEvidence ?? []), ...(opportunity?.confirmationNeeded ?? [])]);
  return unique([
    "Run manual replay validation on the same compact model family before any paper-watchlist review.",
    "Require target-first versus invalidation-first evidence; do not promote from a single current read.",
    "Require Monte Carlo and scorecard review if replay produces enough compact outcomes.",
    missing.some((item) => /target/i.test(item)) ? "Validate target construction from draw-on-liquidity or PD-array context." : undefined,
    missing.some((item) => /invalidation|structure/i.test(item)) ? "Validate structural invalidation construction." : undefined,
    missing.some((item) => /RR|reward|risk/i.test(item)) ? "Validate RR construction before paper testing." : undefined,
    missing.some((item) => /displacement/i.test(item)) ? "Replay displacement confirmation before upgrading the lane." : undefined,
    missing.some((item) => /FVG|PD array/i.test(item)) ? "Replay FVG/PD-array alignment and mitigation quality." : undefined,
    "Keep autoPromoteAllowed false and authority none/none/none."
  ]).slice(0, 10);
};

export const sanitizeIctResearchHypothesis = (hypothesis: IctResearchHypothesis): IctResearchHypothesis => ({
  ...hypothesis,
  researchOnly: true,
  status: hypothesis.status,
  sourceOpportunity: { ...hypothesis.sourceOpportunity },
  missingConfirmation: hypothesis.missingConfirmation.slice(0, 10),
  proposedValidationRules: hypothesis.proposedValidationRules.slice(0, 10),
  blockers: hypothesis.blockers.slice(0, 10),
  autoPromoteAllowed: false,
  executionAllowed: false,
  authority,
  safety
});

export const buildIctResearchHypothesisFromOpportunity = (
  input: IctResearchHypothesisBuildInput
): IctResearchHypothesisBuildResult => {
  const eligibility = evaluateIctResearchHypothesisEligibility(input);
  if (!eligibility.eligible || !input.opportunity) {
    return {
      ok: false,
      reason: eligibility.reason,
      eligibility,
      authority,
      safety
    };
  }
  const generatedAt = input.generatedAt ?? input.opportunity.generatedAt ?? now();
  const missingConfirmation = unique([
    ...input.opportunity.missingEvidence,
    ...input.opportunity.confirmationNeeded,
    ...(input.topReasons ?? [])
  ]).slice(0, 10);
  const title = `${compactToken(input.opportunity.type)} hypothesis`;
  const hypothesis = sanitizeIctResearchHypothesis({
    researchOnly: true,
    hypothesisId: createId("ict_research_hypothesis", [
      input.opportunity.opportunityId,
      input.sourceFingerprint,
      input.requestedSymbol,
      input.brokerSymbol,
      input.primaryTimeframe,
      input.opportunity.type,
      input.opportunity.stage
    ].join("|")),
    generatedAt,
    status: "queued_for_replay",
    title,
    sourceOpportunity: {
      opportunityId: input.opportunity.opportunityId,
      type: input.opportunity.type,
      stage: input.opportunity.stage,
      quality: input.opportunity.quality,
      direction: input.opportunity.direction,
      modelName: input.opportunity.modelName,
      modelFamily: input.opportunity.modelFamily,
      marketCycleStage: input.opportunity.marketCycleStage,
      laneRecommendation: input.opportunity.laneRecommendation,
      nextAction: input.opportunity.nextAction
    },
    requestedSymbol: input.requestedSymbol,
    brokerSymbol: input.brokerSymbol,
    primaryTimeframe: input.primaryTimeframe,
    sourceFingerprint: input.sourceFingerprint,
    candleCount: input.candleCount,
    missingConfirmation,
    proposedValidationRules: validationRulesFor(input),
    blockers: eligibility.blockers,
    nextAction: "Research hypothesis queued - needs replay validation.",
    autoPromoteAllowed: false,
    executionAllowed: false,
    authority,
    safety
  });
  return {
    ok: true,
    hypothesis,
    eligibility
  };
};

const sanitizeQueue = (queue?: Partial<IctSelfImprovementQueue> | null): IctSelfImprovementQueue => {
  const hypotheses = Array.isArray(queue?.hypotheses)
    ? queue.hypotheses
        .filter((hypothesis): hypothesis is IctResearchHypothesis => Boolean(hypothesis?.researchOnly && hypothesis.hypothesisId))
        .map(sanitizeIctResearchHypothesis)
        .slice(-MAX_ICT_RESEARCH_HYPOTHESES)
    : [];
  return {
    updatedAt: typeof queue?.updatedAt === "string" ? queue.updatedAt : now(),
    researchOnly: true,
    latestHypothesisId: typeof queue?.latestHypothesisId === "string" ? queue.latestHypothesisId : hypotheses[hypotheses.length - 1]?.hypothesisId,
    hypotheses,
    authority,
    safety
  };
};

export const readIctSelfImprovementQueue = (): IctSelfImprovementQueue => {
  if (!isBrowser()) return memoryQueue;
  try {
    return sanitizeQueue(JSON.parse(window.localStorage.getItem(ICT_SELF_IMPROVEMENT_QUEUE_STORAGE_KEY) ?? "null"));
  } catch {
    return sanitizeQueue();
  }
};

export const buildIctResearchHypothesisJournalEvent = (
  hypothesis: IctResearchHypothesis
): IctResearchHypothesisJournalEvent => ({
  eventType: "ict_research_hypothesis_created",
  journalEventId: createId("ict_research_hypothesis_journal", `${hypothesis.hypothesisId}|${hypothesis.generatedAt}`),
  hypothesisId: hypothesis.hypothesisId,
  generatedAt: hypothesis.generatedAt,
  status: hypothesis.status,
  requestedSymbol: hypothesis.requestedSymbol,
  brokerSymbol: hypothesis.brokerSymbol,
  primaryTimeframe: hypothesis.primaryTimeframe,
  sourceFingerprint: hypothesis.sourceFingerprint,
  opportunityType: hypothesis.sourceOpportunity.type,
  opportunityStage: hypothesis.sourceOpportunity.stage,
  opportunityQuality: hypothesis.sourceOpportunity.quality,
  opportunityLaneRecommendation: hypothesis.sourceOpportunity.laneRecommendation,
  missingConfirmation: hypothesis.missingConfirmation.slice(0, 10),
  proposedValidationRules: hypothesis.proposedValidationRules.slice(0, 10),
  nextAction: hypothesis.nextAction,
  autoPromoteAllowed: false,
  executionAllowed: false,
  researchOnly: true,
  authority,
  safety
});

const readJournalEvents = (): IctResearchHypothesisJournalEvent[] => {
  if (!isBrowser()) return memoryJournal;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((event) => event?.eventType === "ict_research_hypothesis_created" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctResearchHypothesisJournalEvent = (event: IctResearchHypothesisJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, autoPromoteAllowed: false as const, executionAllowed: false as const, authority, safety };
  if (!isBrowser()) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_ICT_RESEARCH_HYPOTHESIS_JOURNAL_EVENTS);
    return { ok: true, storage: "memory" as const, event: sanitized, totalEvents: memoryJournal.length };
  }
  try {
    const next = [...readJournalEvents(), sanitized].slice(-MAX_ICT_RESEARCH_HYPOTHESIS_JOURNAL_EVENTS);
    window.localStorage.setItem(ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
  } catch (error) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_ICT_RESEARCH_HYPOTHESIS_JOURNAL_EVENTS);
    return { ok: false, storage: "localStorage_failed" as const, event: sanitized, error: errorMessage(error) };
  }
};

export const queueIctResearchHypothesis = (
  hypothesis?: IctResearchHypothesis
): IctResearchHypothesisQueueResult => {
  if (!hypothesis) {
    return {
      ok: false,
      storage: "memory",
      reason: "No eligible research hypothesis to queue.",
      authority,
      safety
    };
  }
  const sanitized = sanitizeIctResearchHypothesis(hypothesis);
  const journalEvent = buildIctResearchHypothesisJournalEvent(sanitized);
  const current = readIctSelfImprovementQueue();
  const hypotheses = [
    ...current.hypotheses.filter((item) => item.hypothesisId !== sanitized.hypothesisId),
    sanitized
  ].slice(-MAX_ICT_RESEARCH_HYPOTHESES);
  const nextQueue: IctSelfImprovementQueue = {
    updatedAt: now(),
    researchOnly: true,
    latestHypothesisId: sanitized.hypothesisId,
    hypotheses,
    authority,
    safety
  };
  memoryQueue = nextQueue;
  const journalWrite = appendIctResearchHypothesisJournalEvent(journalEvent);
  if (!isBrowser()) {
    return {
      ok: true,
      storage: "memory",
      hypothesis: sanitized,
      journalEvent,
      totalHypotheses: nextQueue.hypotheses.length,
      reason: "Research hypothesis queued - needs replay validation."
    };
  }
  try {
    window.localStorage.setItem(ICT_SELF_IMPROVEMENT_QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
    publishQueueUpdate(nextQueue);
    return {
      ok: true,
      storage: "localStorage",
      hypothesis: sanitized,
      journalEvent,
      totalHypotheses: nextQueue.hypotheses.length,
      reason: journalWrite.ok === false
        ? "Research hypothesis queued; journal fallback used."
        : "Research hypothesis queued - needs replay validation."
    };
  } catch (error) {
    return {
      ok: false,
      storage: "localStorage_failed",
      hypothesis: sanitized,
      journalEvent,
      reason: "Research hypothesis built, but queue storage failed.",
      error: errorMessage(error),
      authority,
      safety
    };
  }
};

export const assertIctResearchHypothesisIsCompact = (
  hypothesis?: IctResearchHypothesis,
  journalEvent?: IctResearchHypothesisJournalEvent
) => {
  const serialized = JSON.stringify({ hypothesis, journalEvent });
  return {
    ok:
      (hypothesis?.researchOnly ?? true) === true &&
      (journalEvent?.researchOnly ?? true) === true &&
      (hypothesis?.autoPromoteAllowed ?? false) === false &&
      (hypothesis?.executionAllowed ?? false) === false &&
      (journalEvent?.autoPromoteAllowed ?? false) === false &&
      (journalEvent?.executionAllowed ?? false) === false &&
      (hypothesis?.authority.executionAuthority ?? "none") === "none" &&
      (hypothesis?.authority.brokerAuthority ?? "none") === "none" &&
      (hypothesis?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: serialized.length
  };
};
