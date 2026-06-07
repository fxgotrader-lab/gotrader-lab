import type { IctCurrentRead } from "./ictCurrentReadTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import type {
  IctResearchSignal,
  IctResearchSignalCompleteness,
  IctResearchSignalEntryZone,
  IctResearchSignalJournalEvent,
  IctResearchSignalStatus
} from "./ictSignalContractTypes";

export const ICT_RESEARCH_SIGNAL_JOURNAL_STORAGE_KEY = "gotrader.ict-research-signal.journal.v1";
const MAX_ICT_RESEARCH_SIGNAL_JOURNAL_EVENTS = 150;

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

let memoryJournal: IctResearchSignalJournalEvent[] = [];

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const generatedNow = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unique = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

const stableHash = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const formatToken = (value?: string) => (value ?? "pending").replace(/_/g, " ");

const isDirectionalSide = (side: IctCurrentRead["side"]) => side === "long" || side === "short";
const isRiskBlocked = (riskStatus?: string) =>
  riskStatus === "reject_candidate" ||
  riskStatus === "no_trade" ||
  riskStatus === "avoid" ||
  /reject|blocked|avoid/i.test(riskStatus ?? "");
const isSmtReject = (smtStatus?: string) => /rejects?_candidate|rejects|reject/i.test(smtStatus ?? "");

const parseEntryZone = (entryZone?: string): IctResearchSignalEntryZone | undefined => {
  if (!entryZone) return undefined;
  const rangeMatch = entryZone.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(-?\d+(?:\.\d+)?)/i);
  const numbers = rangeMatch
    ? [Number(rangeMatch[1]), Number(rangeMatch[2])]
    : entryZone.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (numbers.length < 2) return undefined;
  const low = Math.min(numbers[0], numbers[1]);
  const high = Math.max(numbers[0], numbers[1]);
  return {
    low,
    high,
    midpoint: finite(numbers[2]) ? numbers[2] : Number(((low + high) / 2).toFixed(4)),
    type: "compact_current_read_entry_zone"
  };
};

const phaseFor = (currentRead: IctCurrentRead): IctResearchSignal["phase"] => {
  if (!currentRead.bestSetup) return undefined;
  const isPhase1 = currentRead.bestSetup === currentRead.bestPhase1Setup;
  const isPhase2 = currentRead.bestSetup === currentRead.bestPhase2Setup;
  if (isPhase1 && isPhase2) return "combined";
  if (isPhase2) return "phase_2";
  if (isPhase1) return "phase_1";
  return currentRead.bestPhase2Setup ? "phase_2" : currentRead.bestPhase1Setup ? "phase_1" : undefined;
};

const buildBlockingReasons = (currentRead: IctCurrentRead) =>
  unique([
    !isDirectionalSide(currentRead.side) ? "Signal is flat or non-directional." : undefined,
    !finite(currentRead.target) ? "Missing target." : undefined,
    !finite(currentRead.invalidation) ? "Missing invalidation." : undefined,
    !finite(currentRead.rrEstimate) ? "Missing RR estimate." : undefined,
    !finite(currentRead.confidence) ? "Missing confidence." : undefined,
    isRiskBlocked(currentRead.riskStatus) ? `Risk governor blocks candidate: ${formatToken(currentRead.riskStatus)}.` : undefined,
    isSmtReject(currentRead.smtStatus) ? `SMT/relative strength rejects candidate: ${formatToken(currentRead.smtStatus)}.` : undefined,
    currentRead.approvedStatus === "rejected_candidate" ? "Approved-profile layer rejected the current read." : undefined,
    currentRead.modelQualityLane === "watchlist" ? currentRead.paperWatchlistReason ?? "Watchlist only - not paper eligible." : undefined,
    currentRead.dataStatus !== "ready" ? `Current read data is ${formatToken(currentRead.dataStatus)}.` : undefined
  ]);

const monteCarloWarnings = (latestState?: IctLatestResearchState) =>
  unique([
    !latestState?.latestMonteCarlo ? "Monte Carlo robustness has not been run for the latest manual evidence." : undefined,
    latestState?.latestMonteCarlo?.robustnessRating === "insufficient_data"
      ? "Monte Carlo robustness is insufficient_data; this cannot approve a signal."
      : undefined,
    ...(latestState?.latestMonteCarlo?.warnings ?? [])
  ]).slice(0, 8);

export const classifyResearchSignalStatus = (
  currentRead: IctCurrentRead,
  latestState?: IctLatestResearchState
): IctResearchSignalStatus => {
  if (currentRead.approvedStatus === "no_trade" || currentRead.side === "flat") return "no_signal";
  const blockers = buildBlockingReasons(currentRead);
  const hasCriticalBlocker = blockers.some((reason) =>
    /Missing target|Missing invalidation|Risk governor|SMT\/relative strength rejects|rejected|data is missing|data is unavailable/i.test(reason)
  );
  if (currentRead.approvedStatus === "rejected_candidate" || hasCriticalBlocker) return "rejected_signal";
  if (
    currentRead.approvedStatus === "approved_research_candidate" &&
    isDirectionalSide(currentRead.side) &&
    finite(currentRead.target) &&
    finite(currentRead.invalidation) &&
    finite(currentRead.rrEstimate) &&
    finite(currentRead.confidence) &&
    !isRiskBlocked(currentRead.riskStatus)
  ) {
    return "approved_research_signal";
  }
  if (
    currentRead.approvedStatus === "paper_watchlist_candidate" &&
    isDirectionalSide(currentRead.side) &&
    finite(currentRead.target) &&
    finite(currentRead.invalidation) &&
    finite(currentRead.rrEstimate) &&
    finite(currentRead.confidence) &&
    !isRiskBlocked(currentRead.riskStatus)
  ) {
    return "watchlist_signal";
  }
  if (currentRead.approvedStatus === "watchlist_candidate" || monteCarloWarnings(latestState).length) return "watchlist_signal";
  return "no_signal";
};

const nextActionFor = (status: IctResearchSignalStatus, currentRead: IctCurrentRead, warnings: string[]) => {
  if (status === "approved_research_signal") {
    return "Treat as an approved research signal only; run replay, Monte Carlo, evidence, maturity, and paper-demo checklist review before any future readiness work.";
  }
  if (currentRead.modelQualityLane === "paper_watchlist") {
    return "Paper-only eligible: run explicit paper simulation and collect replay evidence; no readiness promotion.";
  }
  if (currentRead.modelQualityLane === "watchlist") {
    return currentRead.paperWatchlistReason ?? "Watchlist only - not paper eligible.";
  }
  if (status === "watchlist_signal") {
    return warnings[0] ?? currentRead.nextAction ?? "Keep on watchlist and collect additional compact validation evidence.";
  }
  if (status === "rejected_signal") {
    return currentRead.nextAction ?? "Reject this setup for the current window and wait for a cleaner research candidate.";
  }
  return currentRead.nextAction ?? "No research signal is active; continue observation.";
};

const buildSignalId = (currentRead: IctCurrentRead, status: IctResearchSignalStatus) =>
  `ict_research_signal_${stableHash([
    currentRead.debug.sourceFingerprint,
    currentRead.debug.lastEvaluationAt,
    currentRead.requestedSymbol,
    currentRead.brokerSymbol,
    currentRead.primaryTimeframe,
    currentRead.bestSetup,
    currentRead.side,
    currentRead.approvedStatus,
    status,
    currentRead.target,
    currentRead.invalidation,
    currentRead.rrEstimate
  ].join("|"))}`;

export const sanitizeResearchSignal = (signal: IctResearchSignal): IctResearchSignal => ({
  ...JSON.parse(JSON.stringify(signal)),
  researchOnly: true,
  executionReadiness: "research_only",
  executionAllowed: false,
  authority,
  safety,
  provenance: {
    ...signal.provenance,
    source: "ict_current_read",
    methodology: "ICT",
    researchOnly: true
  }
});

export const buildIctResearchSignalFromCurrentRead = (
  currentRead: IctCurrentRead,
  latestState?: IctLatestResearchState
): IctResearchSignal => {
  const status = classifyResearchSignalStatus(currentRead, latestState);
  const blockers = buildBlockingReasons(currentRead);
  const warnings = unique([
    ...monteCarloWarnings(latestState),
    currentRead.latestResearchStateNote,
    currentRead.packetSource === "live_mt5" ? "MT5 read-only USTECH is CFD/proxy research data, not CME futures truth." : undefined,
    "Execution is disabled; this signal contract is research-only."
  ]).slice(0, 10);
  const reasons = unique([
    ...currentRead.topReasons,
    status === "approved_research_signal" ? "Current read passed the approved-profile research gate." : undefined,
    currentRead.approvedStatus === "paper_watchlist_candidate"
      ? currentRead.paperWatchlistReason ?? "Current read is complete enough for paper-watchlist simulation only; approval remains blocked."
      : undefined,
    currentRead.modelQualityLane === "watchlist" ? currentRead.paperWatchlistReason ?? "Watchlist only - not paper eligible." : undefined,
    status === "watchlist_signal" ? "Current read is watchlist or needs more non-execution validation evidence." : undefined
  ]).slice(0, 10);

  return sanitizeResearchSignal({
    signalId: buildSignalId(currentRead, status),
    generatedAt: currentRead.debug.lastEvaluationAt || generatedNow(),
    researchOnly: true,
    status,
    executionReadiness: "research_only",
    executionAllowed: false,
    requestedSymbol: currentRead.requestedSymbol,
    brokerSymbol: currentRead.brokerSymbol,
    displayLabel: `${currentRead.brokerSymbol} -> ${currentRead.requestedSymbol}`,
    primaryTimeframe: currentRead.primaryTimeframe,
    displayTimeframe: currentRead.displayTimeframe,
    displayTimeframeRole: currentRead.displayTimeframeRole,
    analysisTimeframesRequested: currentRead.analysisTimeframesRequested,
    analysisTimeframesLoaded: currentRead.analysisTimeframesLoaded,
    requiredTimeframesLoaded: currentRead.requiredTimeframesLoaded,
    analysisTimeframesUsed: currentRead.analysisTimeframesUsed,
    analysisDepthStatus: currentRead.analysisDepthStatus,
    multiTimeframeContextStatus: currentRead.multiTimeframeContextStatus,
    missingTimeframes: currentRead.missingTimeframes,
    htfBiasSource: currentRead.htfBiasSource,
    sessionModelSourceTimeframe: currentRead.sessionModelSourceTimeframe,
    confirmationSourceTimeframe: currentRead.confirmationSourceTimeframe,
    weeklyBiasStatus: currentRead.weeklyBiasStatus,
    weeklyBiasDirection: currentRead.weeklyBiasDirection,
    weeklyBiasReason: currentRead.weeklyBiasReason,
    htfTimeframes: currentRead.htfTimeframes,
    setup: currentRead.bestSetup,
    phase: phaseFor(currentRead),
    side: currentRead.side,
    entryZone: parseEntryZone(currentRead.entryZone),
    invalidation: currentRead.invalidation,
    target: currentRead.target,
    rrEstimate: currentRead.rrEstimate,
    confidence: currentRead.confidence,
    approvedProfileStatus: currentRead.approvedStatus,
    modelQualityLane: currentRead.modelQualityLane,
    paperWatchlistEligible: currentRead.paperWatchlistEligible,
    paperWatchlistReason: currentRead.paperWatchlistReason,
    paperWatchlistEvidenceSummary: currentRead.paperWatchlistEvidenceSummary,
    paperSimEligibilityStatus: currentRead.paperSimEligibilityStatus,
    paperSimEligibilityReason: currentRead.paperSimEligibilityReason,
    paperSimAllowed: currentRead.paperSimAllowed,
    paperOnly: currentRead.paperOnly,
    readinessSummary: currentRead.readinessSummary,
    approvalScore: currentRead.approvalScore,
    bias: currentRead.bias,
    smtStatus: currentRead.smtStatus,
    newsSessionRisk: currentRead.riskStatus,
    riskGovernorAction: currentRead.riskStatus,
    sessionNarrativeProfile: currentRead.sessionNarrativeProfile,
    sessionDirectionalRead: currentRead.sessionDirectionalRead,
    sessionNarrativeConfidence: currentRead.sessionNarrativeConfidence,
    modelDetected: currentRead.modelDetected,
    modelName: currentRead.modelName,
    modelState: currentRead.modelState,
    modelDirection: currentRead.modelDirection,
    modelConfidence: currentRead.modelConfidence,
    modelReasons: currentRead.modelReasons?.slice(0, 6),
    modelMissingEvidence: currentRead.modelMissingEvidence?.slice(0, 8),
    opportunity: currentRead.opportunity,
    opportunityDetected: currentRead.opportunityDetected,
    opportunityType: currentRead.opportunityType,
    opportunityStage: currentRead.opportunityStage,
    opportunityQuality: currentRead.opportunityQuality,
    opportunityDirection: currentRead.opportunityDirection,
    opportunityModelName: currentRead.opportunityModelName,
    opportunityLaneRecommendation: currentRead.opportunityLaneRecommendation,
    opportunityNextAction: currentRead.opportunityNextAction,
    opportunityMissingEvidence: currentRead.opportunityMissingEvidence?.slice(0, 8) ?? [],
    opportunityBlockers: currentRead.opportunityBlockers?.slice(0, 8) ?? [],
    opportunityTradeIdea: currentRead.opportunityTradeIdea,
    selfImprovementHypothesis: currentRead.selfImprovementHypothesis,
    selfImprovementHypothesisQueued: currentRead.selfImprovementHypothesisQueued,
    selfImprovementHypothesisStatus: currentRead.selfImprovementHypothesisStatus,
    selfImprovementHypothesisReason: currentRead.selfImprovementHypothesisReason,
    selfImprovementNextValidation: currentRead.selfImprovementNextValidation,
    fvgTargetDirection: currentRead.fvgTargetDirection,
    sessionNarrativeReasons: currentRead.sessionTopReasons?.slice(0, 5),
    dataDepthStatus: currentRead.dataDepthStatus,
    monteCarlo: latestState?.latestMonteCarlo
      ? {
          robustnessRating: latestState.latestMonteCarlo.robustnessRating,
          riskOfRuinPct: latestState.latestMonteCarlo.riskOfRuinPct,
          recommendedMaxRiskPerTradePct: latestState.latestMonteCarlo.recommendedMaxRiskPerTradePct,
          usableOutcomes: latestState.latestMonteCarlo.usableOutcomes
        }
      : undefined,
    reasons,
    rejectionReasons: blockers,
    warnings,
    nextAction: nextActionFor(status, currentRead, warnings),
    authority,
    safety,
    provenance: {
      source: "ict_current_read",
      methodology: "ICT",
      researchOnly: true,
      generatedAt: currentRead.debug.lastEvaluationAt || generatedNow()
    }
  });
};

export const validateResearchSignalCompleteness = (signal: IctResearchSignal): IctResearchSignalCompleteness => {
  const missing = unique([
    !signal.requestedSymbol ? "requestedSymbol" : undefined,
    !signal.brokerSymbol ? "brokerSymbol" : undefined,
    !signal.primaryTimeframe ? "primaryTimeframe" : undefined,
    signal.status === "approved_research_signal" && !isDirectionalSide(signal.side) ? "directional side" : undefined,
    signal.status === "approved_research_signal" && !finite(signal.target) ? "target" : undefined,
    signal.status === "approved_research_signal" && !finite(signal.invalidation) ? "invalidation" : undefined,
    signal.status === "approved_research_signal" && !finite(signal.rrEstimate) ? "rrEstimate" : undefined,
    signal.status === "approved_research_signal" && !finite(signal.confidence) ? "confidence" : undefined
  ]);
  const warnings = unique([
    signal.executionAllowed !== false ? "executionAllowed must remain false" : undefined,
    signal.authority.executionAuthority !== "none" ? "executionAuthority must remain none" : undefined,
    signal.authority.brokerAuthority !== "none" ? "brokerAuthority must remain none" : undefined,
    signal.authority.readinessOverrideAuthority !== "none" ? "readinessOverrideAuthority must remain none" : undefined
  ]);
  return {
    ok: missing.length === 0 && warnings.length === 0,
    missing,
    warnings
  };
};

export const buildIctResearchSignalJournalEvent = (signal: IctResearchSignal): IctResearchSignalJournalEvent => ({
  eventType: "ict_research_signal_generated",
  journalEventId: createId("ict_research_signal_journal"),
  signalId: signal.signalId,
  generatedAt: signal.generatedAt,
  status: signal.status,
  requestedSymbol: signal.requestedSymbol,
  brokerSymbol: signal.brokerSymbol,
  side: signal.side,
  setup: signal.setup,
  rrEstimate: signal.rrEstimate,
  confidence: signal.confidence,
  target: signal.target,
  invalidation: signal.invalidation,
  monteCarloRobustnessRating: signal.monteCarlo?.robustnessRating,
  riskOfRuinPct: signal.monteCarlo?.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: signal.monteCarlo?.recommendedMaxRiskPerTradePct,
  executionAllowed: false,
  researchOnly: true,
  authority,
  safety
});

export const readIctResearchSignalJournalEvents = (): IctResearchSignalJournalEvent[] => {
  if (!isBrowser()) return memoryJournal;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_RESEARCH_SIGNAL_JOURNAL_STORAGE_KEY) ?? "[]") as IctResearchSignalJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_research_signal_generated" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctResearchSignalJournalEvent = (event: IctResearchSignalJournalEvent) => {
  const sanitized = { ...event, executionAllowed: false as const, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    memoryJournal = [...memoryJournal, sanitized].slice(-MAX_ICT_RESEARCH_SIGNAL_JOURNAL_EVENTS);
    return { ok: true, storage: "memory" as const, event: sanitized, totalEvents: memoryJournal.length };
  }
  const next = [...readIctResearchSignalJournalEvents(), sanitized].slice(-MAX_ICT_RESEARCH_SIGNAL_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_RESEARCH_SIGNAL_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const assertIctResearchSignalIsCompact = (
  signal: IctResearchSignal,
  journalEvent?: IctResearchSignalJournalEvent
) => {
  const serialized = JSON.stringify({ signal, journalEvent });
  return {
    ok:
      signal.researchOnly === true &&
      signal.executionAllowed === false &&
      signal.authority.executionAuthority === "none" &&
      signal.authority.brokerAuthority === "none" &&
      signal.authority.readinessOverrideAuthority === "none" &&
      signal.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
