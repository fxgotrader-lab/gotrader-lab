import type { IctAdvisorSignal, IctBias } from "./ictAdvisorTypes";
import type {
  IctApprovedSetupDecision,
  IctApprovedSetupProfile,
  IctApprovedSetupProfileInput,
  IctApprovedSetupProfileJournalEvent,
  IctApprovedSetupProfileRunSummary,
  IctApprovedProfileId
} from "./ictApprovedSetupProfileTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";
import type { IctSmtSignal } from "./ictIndexSmtTypes";
import type { IctNewsSessionRiskDecision } from "./ictNewsSessionRiskTypes";
import type { IctSessionDirectionalRead } from "./ictSessionNarrativeTypes";

const APPROVED_PROFILE_JOURNAL_STORAGE_KEY = "gotrader.ict-approved-setup-profile-summary.journal.v1";
const MAX_APPROVED_PROFILE_JOURNAL_EVENTS = 100;

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

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const strategyIds = new Set([
  "ict-htf-bias",
  "ict-daily-range",
  "ict-liquidity-pool",
  "ict-fvg-displacement",
  "ict-order-block-taxonomy",
  "ict-bread-and-butter-buy",
  "ict-bread-and-butter-sell",
  "ict-one-shot-one-kill"
]);

const forbiddenFieldNames = new Set([
  "account",
  "accountdata",
  "apikey",
  "api_key",
  "candles",
  "executionauthority",
  "executionintent",
  "mt5credentials",
  "order",
  "orderdata",
  "orders",
  "password",
  "position",
  "positiondata",
  "positions",
  "rawcandles",
  "rawsnapshot",
  "secret",
  "secrets",
  "snapshot"
]);

export const getDefaultApprovedSetupProfiles = (): IctApprovedSetupProfile[] => [
  {
    id: "gotrader_ict_phase1_strict",
    label: "GoTrader ICT Phase 1 Strict",
    researchOnly: true,
    minConfidence: 70,
    minRr: 2,
    requireHtfAlignment: true,
    requireFvgPresent: true,
    requireExternalLiquidityTarget: true,
    rejectEquilibrium: true,
    rejectTargetTooClose: true,
    riskFilters: {
      rejectHighImpactNews: true,
      rejectMissingHtfContext: true,
      rejectMixedBias: true,
      rejectNoDisplacement: true,
      rejectNoLiquiditySweep: true
    }
  },
  {
    id: "gotrader_ict_phase1_balanced",
    label: "GoTrader ICT Phase 1 Balanced",
    researchOnly: true,
    minConfidence: 60,
    minRr: 1.75,
    requireHtfAlignment: true,
    requireFvgPresent: false,
    requireExternalLiquidityTarget: true,
    rejectEquilibrium: true,
    rejectTargetTooClose: true,
    riskFilters: {
      rejectHighImpactNews: true,
      rejectMissingHtfContext: true,
      rejectMixedBias: true,
      rejectNoDisplacement: true,
      rejectNoLiquiditySweep: true
    }
  },
  {
    id: "gotrader_ict_phase1_experimental",
    label: "GoTrader ICT Phase 1 Experimental",
    researchOnly: true,
    minConfidence: 50,
    minRr: 1.5,
    requireHtfAlignment: false,
    requireFvgPresent: false,
    requireExternalLiquidityTarget: false,
    rejectEquilibrium: false,
    rejectTargetTooClose: true,
    riskFilters: {
      rejectHighImpactNews: true,
      rejectMissingHtfContext: true,
      rejectMixedBias: false,
      rejectNoDisplacement: true,
      rejectNoLiquiditySweep: true
    }
  }
];

const confidencePct = (confidence: number) => clamp(confidence <= 1 ? confidence * 100 : confidence);

const isReplayInput = (input: IctApprovedSetupProfileInput): input is IctReplayResult =>
  "outcome" in input && "tradePath" in input && "fvgStatus" in input;

const keyName = (key: string) => key.toLowerCase().replace(/[^a-z0-9_]/g, "");

const hasForbiddenField = (value: unknown, depth = 0): boolean => {
  if (!value || typeof value !== "object" || depth > 5) return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenFieldNames.has(keyName(key))) return true;
    if (child && typeof child === "object" && hasForbiddenField(child, depth + 1)) return true;
  }
  return false;
};

const hasText = (values: string[] | undefined, pattern: RegExp) => (values ?? []).some((value) => pattern.test(value));
const directionConfirmsSide = (read: IctSessionDirectionalRead | undefined, side: "long" | "short" | "flat") =>
  (read === "bullish" && side === "long") || (read === "bearish" && side === "short");
const directionContradictsSide = (read: IctSessionDirectionalRead | undefined, side: "long" | "short" | "flat") =>
  (read === "bullish" && side === "short") || (read === "bearish" && side === "long");

const htfAlignedForSignal = (signal: IctAdvisorSignal) => {
  const htfValues = Object.values(signal.bias.htf);
  if (!htfValues.length || signal.bias.composite === "neutral") return false;
  return htfValues.every((bias) => bias === "neutral" || bias === signal.bias.composite);
};

const mixedBiasForSignal = (signal: IctAdvisorSignal) => {
  const htfValues = Object.values(signal.bias.htf).filter((bias) => bias !== "neutral");
  if (!htfValues.length) return true;
  const distinct = new Set<IctBias>([signal.bias.primary, ...htfValues].filter((bias) => bias !== "neutral"));
  return distinct.size > 1 || signal.bias.composite === "neutral";
};

const sessionForTimestamp = (timestamp?: string) => {
  if (!timestamp) return "unknown";
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off hours";
};

const externalLiquidityTypes = new Set([
  "previous_day_high",
  "previous_day_low",
  "session_high",
  "session_low",
  "equal_highs",
  "equal_lows",
  "old_swing_high",
  "old_swing_low"
]);

const normalizeInput = (input: IctApprovedSetupProfileInput) => {
  const replay = isReplayInput(input);
  const smt: Partial<IctSmtSignal> | undefined = replay
    ? input.smtDivergenceType
      ? {
          divergenceType: input.smtDivergenceType,
          confirmsCandidate: Boolean(input.smtConfirmsCandidate),
          rejectsCandidate: Boolean(input.smtRejectsCandidate),
          relativeStrengthLeader: input.relativeStrengthLeader,
          relativeWeaknessLeader: input.relativeWeaknessLeader,
          confidenceAdjustment: input.smtConfidenceAdjustment ?? 0,
          reason: input.smtReason ?? ""
        }
      : undefined
    : input.smt;
  const newsSessionRisk: Partial<IctNewsSessionRiskDecision> | undefined = replay
    ? input.riskGovernorAction
      ? {
          newsRiskLevel: input.newsRiskLevel,
          sessionRiskState: input.sessionRiskState,
          riskGovernorAction: input.riskGovernorAction,
          riskGovernorConfidenceAdjustment: input.riskGovernorConfidenceAdjustment ?? 0,
          blockingEventsCount: input.blockingEventsCount ?? 0,
          cautionEventsCount: input.cautionEventsCount ?? 0,
          newsSessionRiskNotes: input.newsSessionRiskNotes ?? []
        }
      : undefined
    : input.newsSessionRisk;
  const confidence = confidencePct(input.confidence);
  const htfTimeframes = replay ? [] : input.htfTimeframes;
  const htfAligned = replay ? input.htfAligned : htfAlignedForSignal(input);
  const fvgStatus = replay
    ? input.fvgStatus
    : input.fairValueGap
      ? input.fairValueGap.mitigated
        ? "fully_mitigated"
        : "present"
      : "not_applicable";
  const liquidityTargetType = replay ? input.liquidityTargetType : input.drawOnLiquidity?.type;
  const noTradeReasons = input.noTradeReasons ?? [];
  const hasDisplacement = replay
    ? input.strategyId === "ict-fvg-displacement" ||
      input.strategyId === "ict-order-block-taxonomy" ||
      input.strategyId === "ict-bread-and-butter-buy" ||
      input.strategyId === "ict-bread-and-butter-sell" ||
      input.strategyId === "ict-one-shot-one-kill" ||
      input.setup.includes("displacement") ||
      input.fvgStatus !== "not_applicable"
    : Boolean(input.displacement || input.orderBlock?.displacementConfirmed);
  const hasLiquiditySweep = replay
    ? Boolean(input.liquidityTargetType) ||
      input.setup.includes("sweep") ||
      input.strategyId === "ict-fvg-displacement" ||
      input.strategyId === "ict-bread-and-butter-buy" ||
      input.strategyId === "ict-bread-and-butter-sell" ||
      input.strategyId === "ict-one-shot-one-kill"
    : Boolean(input.liquiditySwept || input.orderBlock?.liquiditySweepConfirmed);
  const mixedBias = replay ? input.htfAligned === false : mixedBiasForSignal(input);
  const missingHtfContext = replay ? input.htfAligned === undefined : htfTimeframes.length === 0;
  const targetTooClose = hasText(noTradeReasons, /target (is )?too close|too close to target/i);
  const sessionNarrativeProfile = input.sessionNarrativeProfile;
  const sessionDirectionalRead = input.sessionDirectionalRead;
  const sessionNarrativeConfidence = input.sessionNarrativeConfidence;
  const sessionMitigationDetected =
    "sessionMitigationDetected" in input
      ? input.sessionMitigationDetected
      : !replay
        ? input.sessionMitigationContext?.detected
        : undefined;
  const fvgTargetDetected = "fvgTargetDetected" in input ? input.fvgTargetDetected : undefined;
  const fvgTargetDirection = "fvgTargetDirection" in input ? input.fvgTargetDirection : undefined;
  const dataDepthStatus = input.dataDepthStatus;
  const sessionNarrativeReasons =
    "sessionNarrativeReasons" in input
      ? input.sessionNarrativeReasons
      : !replay
        ? input.sessionTopReasons
        : undefined;
  return {
    brokerSymbol: input.brokerSymbol,
    compositeBias: replay ? undefined : input.bias.composite,
    confidence,
    rawConfidence: input.confidence,
    dealingRangeLocation: replay ? input.dealingRangeLocation : input.dealingRange?.currentLocation,
    decision: input.decision,
    fvgStatus,
    hasDisplacement,
    hasExternalLiquidityTarget: Boolean(liquidityTargetType && externalLiquidityTypes.has(liquidityTargetType)),
    hasForbiddenField: hasForbiddenField(input),
    hasFvg: fvgStatus !== "not_applicable" && fvgStatus !== undefined,
    hasLiquiditySweep,
    htfAligned,
    htfTimeframes,
    liquidityTargetType,
    missingHtfContext,
    mixedBias,
    noTradeReasons,
    primaryTimeframe: input.primaryTimeframe,
    requestedSymbol: input.requestedSymbol,
    rrEstimate: input.rrEstimate ?? (replay ? input.tradePath.rrAchieved : undefined),
    session: replay ? sessionForTimestamp(input.tradePath.signalTime) : "current",
    setup: input.setup,
    side: input.side,
    smt,
    newsSessionRisk,
    sessionNarrativeProfile,
    sessionDirectionalRead,
    sessionNarrativeConfidence,
    sessionMitigationDetected,
    fvgTargetDetected,
    fvgTargetDirection,
    dataDepthStatus,
    availableLookbackDays: input.availableLookbackDays,
    requestedLookbackDays: input.requestedLookbackDays,
    sessionNarrativeReasons,
    strategyId: input.strategyId,
    symbol: input.symbol,
    targetTooClose
  };
};

export const calculateApprovalScore = (input: IctApprovedSetupProfileInput, profile: IctApprovedSetupProfile) => {
  const normalized = normalizeInput(input);
  const rr = normalized.rrEstimate ?? 0;
  let score = 0;
  score += Math.min(25, (normalized.confidence / Math.max(profile.minConfidence, 1)) * 25);
  score += Math.min(20, (rr / Math.max(profile.minRr, 0.01)) * 20);
  score += normalized.htfAligned ? 15 : 0;
  score += normalized.hasExternalLiquidityTarget ? 15 : 0;
  score += normalized.hasDisplacement ? 10 : 0;
  score += normalized.hasLiquiditySweep ? 10 : 0;
  score += normalized.hasFvg ? 5 : 0;
  if (normalized.smt?.confirmsCandidate) score += 5;
  if (normalized.smt?.rejectsCandidate) score -= 10;
  if (normalized.newsSessionRisk?.riskGovernorAction === "reject_candidate" || normalized.newsSessionRisk?.riskGovernorAction === "no_trade") score -= 25;
  if (normalized.newsSessionRisk?.riskGovernorAction === "downgrade_to_watchlist") score -= 10;
  if (normalized.newsSessionRisk?.newsRiskLevel === "blocked" || normalized.newsSessionRisk?.newsRiskLevel === "high") score -= 20;
  if (normalized.newsSessionRisk?.newsRiskLevel === "medium") score -= 10;
  if (normalized.newsSessionRisk?.sessionRiskState === "avoid") score -= 15;
  if (normalized.newsSessionRisk?.sessionRiskState === "caution") score -= 5;
  if (normalized.dealingRangeLocation === "equilibrium") score -= 10;
  if (normalized.targetTooClose) score -= 10;
  if (directionConfirmsSide(normalized.sessionDirectionalRead, normalized.side)) score += 5;
  if (directionContradictsSide(normalized.sessionDirectionalRead, normalized.side)) score -= 12;
  if (normalized.side === "long" && normalized.fvgTargetDetected && normalized.fvgTargetDirection === "premium") score += 3;
  if (normalized.side === "short" && normalized.fvgTargetDetected && normalized.fvgTargetDirection === "discount") score += 3;
  if (normalized.dataDepthStatus === "limited") score -= 3;
  if (normalized.dataDepthStatus === "insufficient" || normalized.dataDepthStatus === "unavailable") score -= 8;
  return Math.round(clamp(score));
};

export const evaluateApprovedSetupProfile = (
  input: IctApprovedSetupProfileInput,
  profile: IctApprovedSetupProfile
): IctApprovedSetupDecision => {
  const normalized = normalizeInput(input);
  const hardRejects: string[] = [];
  const watchlistReasons: string[] = [];
  const approvedReasons: string[] = [];
  const rr = normalized.rrEstimate ?? 0;
  const nearConfidence = normalized.confidence >= profile.minConfidence - 5;
  const nearRr = rr >= profile.minRr - 0.25;

  if (normalized.hasForbiddenField) hardRejects.push("Input contains a forbidden unsafe field.");
  if (!strategyIds.has(normalized.strategyId)) hardRejects.push("Unknown ICT strategy id.");
  if (normalized.decision !== "research_only") hardRejects.push("Original signal is not research-only.");
  if (normalized.side !== "long" && normalized.side !== "short") hardRejects.push("Signal is not directional.");
  if (profile.allowedSides?.length && !profile.allowedSides.includes(normalized.side as "long" | "short")) hardRejects.push("Side is outside approved profile allowed sides.");
  if (profile.allowedSetups?.length && !profile.allowedSetups.includes(normalized.setup)) hardRejects.push("Setup is outside approved profile allowed setups.");
  if (profile.allowedSessions?.length && !profile.allowedSessions.includes(normalized.session)) hardRejects.push("Session is outside approved profile allowed sessions.");
  if (profile.riskFilters.rejectMissingHtfContext && normalized.missingHtfContext) hardRejects.push("Missing higher-timeframe context.");
  if (profile.requireHtfAlignment && normalized.htfAligned !== true) hardRejects.push("Higher-timeframe alignment is missing or conflicted.");
  if (profile.riskFilters.rejectMixedBias && normalized.mixedBias) hardRejects.push("Mixed ICT bias across primary and higher timeframes.");
  if (profile.riskFilters.rejectNoDisplacement && !normalized.hasDisplacement) hardRejects.push("No displacement evidence.");
  if (profile.riskFilters.rejectNoLiquiditySweep && !normalized.hasLiquiditySweep) hardRejects.push("No liquidity sweep evidence.");
  if (profile.requireExternalLiquidityTarget && !normalized.hasExternalLiquidityTarget) hardRejects.push("External liquidity target missing.");
  if (profile.rejectEquilibrium && normalized.dealingRangeLocation === "equilibrium") hardRejects.push("Price is at equilibrium.");
  if (profile.rejectTargetTooClose && normalized.targetTooClose) hardRejects.push("Target is too close.");
  if (normalized.smt?.rejectsCandidate) hardRejects.push(`SMT/relative strength rejects candidate: ${normalized.smt.reason}`);
  if (normalized.newsSessionRisk?.riskGovernorAction === "reject_candidate") {
    hardRejects.push(`News/session risk governor rejects candidate: ${(normalized.newsSessionRisk.newsSessionRiskNotes ?? []).join(" ")}`);
  }
  if (normalized.newsSessionRisk?.riskGovernorAction === "no_trade") {
    hardRejects.push(`News/session risk governor marks no-trade: ${(normalized.newsSessionRisk.newsSessionRiskNotes ?? []).join(" ")}`);
  }
  if (normalized.newsSessionRisk?.newsRiskLevel === "blocked" || normalized.newsSessionRisk?.newsRiskLevel === "high") {
    hardRejects.push(`News risk ${normalized.newsSessionRisk.newsRiskLevel}.`);
  }
  if (normalized.newsSessionRisk?.sessionRiskState === "avoid") hardRejects.push("Session risk state is avoid.");

  if (normalized.confidence < profile.minConfidence) {
    if (nearConfidence) {
      watchlistReasons.push(`Confidence ${Math.round(normalized.confidence)} is near but below ${profile.minConfidence}.`);
    } else {
      hardRejects.push(`Confidence ${Math.round(normalized.confidence)} is below ${profile.minConfidence}.`);
    }
  } else {
    approvedReasons.push(`Confidence ${Math.round(normalized.confidence)} meets ${profile.minConfidence}.`);
  }

  if (rr < profile.minRr) {
    if (nearRr) {
      watchlistReasons.push(`RR ${rr.toFixed(2)}R is near but below ${profile.minRr.toFixed(2)}R.`);
    } else {
      hardRejects.push(`RR ${rr.toFixed(2)}R is below ${profile.minRr.toFixed(2)}R.`);
    }
  } else {
    approvedReasons.push(`RR ${rr.toFixed(2)}R meets ${profile.minRr.toFixed(2)}R.`);
  }

  if (profile.requireFvgPresent && !normalized.hasFvg) {
    watchlistReasons.push("FVG evidence missing for this profile.");
  } else if (normalized.hasFvg) {
    approvedReasons.push(`FVG status ${normalized.fvgStatus}.`);
  }
  if (normalized.htfAligned) approvedReasons.push("Higher-timeframe context aligned.");
  if (normalized.hasExternalLiquidityTarget) approvedReasons.push(`External liquidity target ${normalized.liquidityTargetType}.`);
  if (normalized.hasDisplacement) approvedReasons.push("Displacement evidence present.");
  if (normalized.hasLiquiditySweep) approvedReasons.push("Liquidity sweep evidence present.");
  if (normalized.smt?.confirmsCandidate) approvedReasons.push(`SMT/relative strength confirms candidate: ${normalized.smt.reason}`);
  if (normalized.smt?.divergenceType === "insufficient_data") watchlistReasons.push("SMT/relative strength unavailable; candidate remains governed by deterministic ICT filters.");
  if (normalized.smt && !normalized.smt.confirmsCandidate && !normalized.smt.rejectsCandidate && (normalized.smt.confidenceAdjustment ?? 0) < 0) {
    watchlistReasons.push(`SMT/relative strength confidence drag: ${normalized.smt.reason}`);
  }
  if (normalized.newsSessionRisk?.riskGovernorAction === "downgrade_to_watchlist") {
    watchlistReasons.push(`News/session risk governor downgrades candidate: ${(normalized.newsSessionRisk.newsSessionRiskNotes ?? []).join(" ")}`);
  }
  if (normalized.newsSessionRisk?.newsRiskLevel === "medium") watchlistReasons.push("Medium news risk is active near this candidate.");
  if (normalized.newsSessionRisk?.sessionRiskState === "caution") watchlistReasons.push("Session risk state is caution.");
  if (normalized.newsSessionRisk?.riskGovernorAction === "allow") approvedReasons.push("News/session risk governor allows normal ICT gate review.");
  if (directionConfirmsSide(normalized.sessionDirectionalRead, normalized.side)) {
    approvedReasons.push(`Session narrative confirms ${normalized.side} candidate: ${normalized.sessionNarrativeProfile ?? "profile pending"}.`);
  }
  if (normalized.side === "long" && normalized.fvgTargetDetected && normalized.fvgTargetDirection === "premium") {
    approvedReasons.push("Premium FVG draw supports long candidate context from discount.");
  }
  if (normalized.side === "short" && normalized.fvgTargetDetected && normalized.fvgTargetDirection === "discount") {
    approvedReasons.push("Discount FVG draw supports short candidate context from premium.");
  }
  if (directionContradictsSide(normalized.sessionDirectionalRead, normalized.side)) {
    watchlistReasons.push(`Session narrative ${normalized.sessionDirectionalRead} read conflicts with ${normalized.side} candidate.`);
  }
  if (normalized.sessionMitigationDetected === false) {
    watchlistReasons.push("Session narrative did not confirm NY mitigation context.");
  }
  if (normalized.dataDepthStatus === "limited") {
    watchlistReasons.push("Session narrative depth is limited; use 90-day depth before over-weighting this profile.");
  }
  if (normalized.dataDepthStatus === "insufficient" || normalized.dataDepthStatus === "unavailable") {
    watchlistReasons.push(`Session narrative depth is ${normalized.dataDepthStatus}.`);
  }

  const status =
    normalized.decision === "no_trade" || normalized.side === "flat"
      ? "no_trade"
      : hardRejects.length
        ? "rejected_candidate"
        : watchlistReasons.length
          ? "watchlist_candidate"
          : "approved_research_candidate";

  return sanitizeApprovedSetupDecision({
    profileId: profile.id,
    status,
    researchOnly: true,
    symbol: normalized.symbol,
    requestedSymbol: normalized.requestedSymbol,
    brokerSymbol: normalized.brokerSymbol,
    primaryTimeframe: normalized.primaryTimeframe,
    htfTimeframes: normalized.htfTimeframes,
    strategyId: normalized.strategyId,
    setup: normalized.setup,
    side: normalized.side,
    confidence: normalized.rawConfidence,
    rrEstimate: normalized.rrEstimate,
    compositeBias: normalized.compositeBias,
    htfAligned: normalized.htfAligned,
    dealingRangeLocation: normalized.dealingRangeLocation,
    liquidityTargetType: normalized.liquidityTargetType,
    fvgStatus: normalized.fvgStatus,
    smtDivergenceType: normalized.smt?.divergenceType,
    smtConfirmsCandidate: normalized.smt?.confirmsCandidate,
    smtRejectsCandidate: normalized.smt?.rejectsCandidate,
    relativeStrengthLeader: normalized.smt?.relativeStrengthLeader,
    relativeWeaknessLeader: normalized.smt?.relativeWeaknessLeader,
    smtConfidenceAdjustment: normalized.smt?.confidenceAdjustment,
    smtReason: normalized.smt?.reason,
    newsRiskLevel: normalized.newsSessionRisk?.newsRiskLevel,
    sessionRiskState: normalized.newsSessionRisk?.sessionRiskState,
    riskGovernorAction: normalized.newsSessionRisk?.riskGovernorAction,
    riskGovernorConfidenceAdjustment: normalized.newsSessionRisk?.riskGovernorConfidenceAdjustment,
    blockingEventsCount: normalized.newsSessionRisk?.blockingEventsCount,
    cautionEventsCount: normalized.newsSessionRisk?.cautionEventsCount,
    newsSessionRiskNotes: normalized.newsSessionRisk?.newsSessionRiskNotes,
    sessionNarrativeProfile: normalized.sessionNarrativeProfile,
    sessionDirectionalRead: normalized.sessionDirectionalRead,
    sessionNarrativeConfidence: normalized.sessionNarrativeConfidence,
    sessionMitigationDetected: normalized.sessionMitigationDetected,
    fvgTargetDetected: normalized.fvgTargetDetected,
    fvgTargetDirection: normalized.fvgTargetDirection,
    dataDepthStatus: normalized.dataDepthStatus,
    availableLookbackDays: normalized.availableLookbackDays,
    requestedLookbackDays: normalized.requestedLookbackDays,
    sessionNarrativeReasons: normalized.sessionNarrativeReasons,
    approvalScore: calculateApprovalScore(input, profile),
    approvedReasons: Array.from(new Set(approvedReasons)).slice(0, 8),
    rejectionReasons: Array.from(new Set(hardRejects)).slice(0, 8),
    watchlistReasons: Array.from(new Set(watchlistReasons)).slice(0, 8),
    authority,
    safety,
    provenance: {
      methodology: "ICT",
      profile: profile.id,
      sourceSet: "ICT Mentorship Core Content",
      researchOnly: true,
      generatedAt: new Date().toISOString()
    }
  });
};

export const evaluateApprovedSetupProfiles = (
  input: IctApprovedSetupProfileInput,
  profiles: IctApprovedSetupProfile[] = getDefaultApprovedSetupProfiles()
) => profiles.map((profile) => evaluateApprovedSetupProfile(input, profile));

export const sanitizeApprovedSetupDecision = (decision: IctApprovedSetupDecision): IctApprovedSetupDecision => ({
  ...JSON.parse(JSON.stringify(decision)),
  researchOnly: true,
  authority,
  safety,
  provenance: {
    ...decision.provenance,
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true
  }
});

const signalResults = (results: IctReplayResult[]) => results.filter((result) => result.decision === "research_only");
const average = (values: number[]) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);

const countReasons = (decisions: IctApprovedSetupDecision[], selector: (decision: IctApprovedSetupDecision) => string[]) => {
  const counts = new Map<string, number>();
  decisions.flatMap(selector).forEach((reason) => counts.set(reason, (counts.get(reason) ?? 0) + 1));
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 6);
};

export const buildApprovedSetupProfileRunSummary = (
  results: IctReplayResult[],
  profile: IctApprovedSetupProfile
): IctApprovedSetupProfileRunSummary => {
  const decisions = results.map((result) => evaluateApprovedSetupProfile(result, profile));
  const totalSignalsBefore = signalResults(results).length;
  const approvedReplayResults = results.filter((result, index) => decisions[index]?.status === "approved_research_candidate");
  const approvedSignals = approvedReplayResults.filter((result) => result.decision === "research_only");
  return {
    profileId: profile.id,
    label: profile.label,
    researchOnly: true,
    totalSignalsBefore,
    totalApproved: decisions.filter((decision) => decision.status === "approved_research_candidate").length,
    totalWatchlist: decisions.filter((decision) => decision.status === "watchlist_candidate").length,
    totalRejected: decisions.filter((decision) => decision.status === "rejected_candidate").length,
    totalNoTrade: decisions.filter((decision) => decision.status === "no_trade").length,
    signalReductionPct: totalSignalsBefore ? round((totalSignalsBefore - approvedSignals.length) / totalSignalsBefore) : 0,
    approvedTargetFirstRate: approvedSignals.length
      ? round(approvedReplayResults.filter((result) => result.outcome === "target_first").length / approvedSignals.length)
      : 0,
    approvedAverageRr: average(
      approvedReplayResults.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number")
    ),
    topApprovalReasons: countReasons(decisions, (decision) => decision.approvedReasons),
    topRejectionReasons: countReasons(decisions, (decision) => [...decision.rejectionReasons, ...decision.watchlistReasons])
  };
};

export const buildApprovedSetupProfileRunSummaries = (
  results: IctReplayResult[],
  profiles: IctApprovedSetupProfile[] = getDefaultApprovedSetupProfiles()
) => profiles.map((profile) => buildApprovedSetupProfileRunSummary(results, profile));

export const buildIctApprovedSetupProfileJournalEvent = ({
  profileSummary,
  runId
}: {
  profileSummary: IctApprovedSetupProfileRunSummary;
  runId?: string;
}): IctApprovedSetupProfileJournalEvent => ({
  eventType: "ict_approved_setup_profile_summary",
  journalEventId: createId("ict_approved_profile_journal"),
  runId,
  generatedAt: new Date().toISOString(),
  profileId: profileSummary.profileId,
  totalSignalsBefore: profileSummary.totalSignalsBefore,
  totalApproved: profileSummary.totalApproved,
  totalWatchlist: profileSummary.totalWatchlist,
  totalRejected: profileSummary.totalRejected,
  totalNoTrade: profileSummary.totalNoTrade,
  signalReductionPct: profileSummary.signalReductionPct,
  approvedTargetFirstRate: profileSummary.approvedTargetFirstRate,
  approvedAverageRr: profileSummary.approvedAverageRr,
  topApprovalReasons: profileSummary.topApprovalReasons,
  topRejectionReasons: profileSummary.topRejectionReasons,
  researchOnly: true,
  authority,
  safety
});

export const buildIctApprovedSetupProfileJournalEvents = ({
  profileSummaries,
  runId
}: {
  profileSummaries: IctApprovedSetupProfileRunSummary[];
  runId?: string;
}) => profileSummaries.map((profileSummary) => buildIctApprovedSetupProfileJournalEvent({ profileSummary, runId }));

export const readIctApprovedSetupProfileJournalEvents = (): IctApprovedSetupProfileJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APPROVED_PROFILE_JOURNAL_STORAGE_KEY) ?? "[]") as IctApprovedSetupProfileJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_approved_setup_profile_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctApprovedSetupProfileJournalEvents = (events: IctApprovedSetupProfileJournalEvent[]) => {
  const sanitized = events.map((event) => ({ ...event, researchOnly: true as const, authority, safety }));
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, events: sanitized };
  }
  const current = readIctApprovedSetupProfileJournalEvents();
  const next = [...current, ...sanitized].slice(-MAX_APPROVED_PROFILE_JOURNAL_EVENTS);
  window.localStorage.setItem(APPROVED_PROFILE_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, events: sanitized, totalEvents: next.length };
};

export const assertIctApprovedSetupDecisionIsCompact = (decision: IctApprovedSetupDecision) => {
  const { safety: _safety, ...payloadWithoutSafetyLabels } = decision;
  const serialized = JSON.stringify(payloadWithoutSafetyLabels);
  return {
    ok:
      decision.researchOnly === true &&
      decision.authority.executionAuthority === "none" &&
      decision.authority.brokerAuthority === "none" &&
      decision.authority.readinessOverrideAuthority === "none" &&
      decision.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};

export const getApprovedSetupProfileById = (profileId: IctApprovedProfileId) =>
  getDefaultApprovedSetupProfiles().find((profile) => profile.id === profileId);
