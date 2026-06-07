import {
  extractMonteCarloOutcomesFromReplayResults,
  runMonteCarloBatch
} from "./ictMonteCarlo";
import type { IctMonteCarloTradeOutcome } from "./ictMonteCarloTypes";
import type {
  IctHypothesisReplayCriteria,
  IctHypothesisScoredOutcomes,
  IctHypothesisValidationInput,
  IctHypothesisValidationResult,
  IctHypothesisValidationThresholds,
  IctResearchHypothesisValidationJournalEvent
} from "./ictHypothesisValidationTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";
import {
  ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY,
  ICT_SELF_IMPROVEMENT_QUEUE_STORAGE_KEY,
  ICT_SELF_IMPROVEMENT_UPDATED_EVENT,
  readIctSelfImprovementQueue
} from "./ictSelfImprovement";
import type { IctResearchHypothesis, IctResearchHypothesisStatus, IctSelfImprovementQueue } from "./ictSelfImprovementTypes";

export const DEFAULT_ICT_HYPOTHESIS_VALIDATION_THRESHOLDS: IctHypothesisValidationThresholds = {
  minimumOccurrences: 20,
  promisingTargetFirstRate: 0.55,
  paperWatchlistTargetFirstRate: 0.6,
  maxAcceptableInvalidationFirstRate: 0.3,
  minimumAverageRr: 1.5,
  monteCarloRequiredUsableOutcomes: 20
};

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

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const round = (value: number, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const safeList = (values?: string[]) => Array.isArray(values) ? values.filter((value) => Boolean(value?.trim())).slice(0, 10) : [];

const median = (values: number[]) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? round(sorted[middle], 2)
    : round((sorted[middle - 1] + sorted[middle]) / 2, 2);
};

const rMultipleFor = (result: IctReplayResult): number | undefined => {
  if (result.outcome === "target_first") return round(result.tradePath.rrAchieved ?? result.rrEstimate ?? 2, 2);
  if (result.outcome === "invalidation_first") return -1;
  if (result.outcome === "partial_target") return round(Math.max(result.tradePath.rrAchieved ?? 0.5, 0.25), 2);
  if (result.outcome === "stalled") return 0;
  return undefined;
};

const targetSideFor = (direction?: string) =>
  direction === "bullish" ? "long" : direction === "bearish" ? "short" : undefined;

export const extractHypothesisReplayCriteria = (hypothesis: IctResearchHypothesis): IctHypothesisReplayCriteria => ({
  hypothesisId: hypothesis.hypothesisId,
  requestedSymbol: hypothesis.requestedSymbol,
  brokerSymbol: hypothesis.brokerSymbol,
  primaryTimeframe: hypothesis.primaryTimeframe,
  opportunityType: hypothesis.sourceOpportunity.type,
  opportunityStage: hypothesis.sourceOpportunity.stage,
  opportunityModelName: hypothesis.sourceOpportunity.modelName,
  opportunityDirection: hypothesis.sourceOpportunity.direction,
  sourceFingerprint: hypothesis.sourceFingerprint,
  missingConfirmation: safeList(hypothesis.missingConfirmation),
  proposedValidationRules: safeList(hypothesis.proposedValidationRules)
});

export const findHypothesisOccurrences = (
  hypothesis: IctResearchHypothesis,
  replayResults: IctReplayResult[] = []
): IctReplayResult[] => {
  const criteria = extractHypothesisReplayCriteria(hypothesis);
  const targetSide = targetSideFor(criteria.opportunityDirection);
  return replayResults.filter((result) => {
    if (result.researchOnly !== true) return false;
    if (result.requestedSymbol && result.requestedSymbol !== criteria.requestedSymbol) return false;
    if (result.brokerSymbol && result.brokerSymbol !== criteria.brokerSymbol) return false;
    if (result.primaryTimeframe && result.primaryTimeframe !== criteria.primaryTimeframe) return false;
    if (criteria.opportunityModelName && result.modelName && result.modelName !== criteria.opportunityModelName) return false;
    if (targetSide && result.side !== "flat" && result.side !== targetSide) return false;
    if (result.outcome === "no_trade" && result.decision !== "research_only") return false;
    return true;
  });
};

const outcomesFromOccurrences = (occurrences: IctReplayResult[]): IctMonteCarloTradeOutcome[] =>
  occurrences
    .map((result, index): IctMonteCarloTradeOutcome | undefined => {
      const rMultiple = rMultipleFor(result);
      if (rMultiple === undefined) return undefined;
      return {
        id: `hypothesis_${result.strategyId}_${result.tradePath.signalTime ?? index}_${index}`,
        strategyId: result.strategyId,
        setup: result.setup,
        symbol: result.requestedSymbol ?? result.symbol,
        side: result.side,
        outcome: result.outcome,
        rMultiple,
        approvedStatus: result.approvedProfileStatus,
        confidence: result.confidence,
        sourceTime: result.tradePath.signalTime,
        researchOnly: true
      };
    })
    .filter((outcome): outcome is IctMonteCarloTradeOutcome => Boolean(outcome));

export const scoreHypothesisOutcomes = ({
  hypothesis,
  replayOutcomes = [],
  replayResults = []
}: Pick<IctHypothesisValidationInput, "hypothesis" | "replayOutcomes" | "replayResults">): IctHypothesisScoredOutcomes => {
  const occurrences = replayResults.length ? findHypothesisOccurrences(hypothesis, replayResults) : [];
  const derivedOutcomes = occurrences.length ? outcomesFromOccurrences(occurrences) : [];
  const outcomes = (derivedOutcomes.length ? derivedOutcomes : replayOutcomes)
    .filter((outcome) => outcome?.researchOnly === true && Number.isFinite(outcome.rMultiple));
  const totalOccurrences = occurrences.length || outcomes.length;
  const targetFirst = outcomes.filter((outcome) => outcome.outcome === "target_first").length;
  const invalidationFirst = outcomes.filter((outcome) => outcome.outcome === "invalidation_first").length;
  const rMultiples = outcomes.map((outcome) => outcome.rMultiple).filter(Number.isFinite);
  const averageRr = rMultiples.length ? round(rMultiples.reduce((total, value) => total + value, 0) / rMultiples.length, 2) : undefined;
  const targetFirstRate = outcomes.length ? round(targetFirst / outcomes.length) : undefined;
  const invalidationFirstRate = outcomes.length ? round(invalidationFirst / outcomes.length) : undefined;
  const evidence = [
    `${totalOccurrences} compact occurrences matched the queued hypothesis criteria.`,
    `${outcomes.length} usable replay outcomes were scored without exposing raw candles.`,
    targetFirstRate !== undefined ? `Target-first rate ${Math.round(targetFirstRate * 100)}%.` : undefined,
    invalidationFirstRate !== undefined ? `Invalidation-first rate ${Math.round(invalidationFirstRate * 100)}%.` : undefined,
    averageRr !== undefined ? `Average outcome ${averageRr}R.` : undefined
  ].filter((value): value is string => Boolean(value));
  const blockers = [
    !totalOccurrences ? "No replay occurrences matched this hypothesis yet." : undefined,
    !outcomes.length ? "No usable target/invalidation outcomes were available." : undefined
  ].filter((value): value is string => Boolean(value));
  return {
    totalOccurrences,
    usableOutcomes: outcomes.length,
    targetFirstRate,
    invalidationFirstRate,
    averageRr,
    medianRr: median(rMultiples),
    replayOutcomes: outcomes,
    evidence,
    blockers
  };
};

export const classifyHypothesisValidation = (
  score: Pick<IctHypothesisScoredOutcomes, "averageRr" | "invalidationFirstRate" | "totalOccurrences" | "usableOutcomes" | "targetFirstRate">,
  thresholds: IctHypothesisValidationThresholds,
  monteCarlo?: IctHypothesisValidationResult["monteCarlo"]
): Pick<IctHypothesisValidationResult, "classificationReason" | "nextResearchAction" | "recommendation" | "status"> => {
  const targetFirstRate = score.targetFirstRate ?? 0;
  const invalidationFirstRate = score.invalidationFirstRate ?? 1;
  const averageRr = score.averageRr ?? 0;
  if (score.totalOccurrences < thresholds.minimumOccurrences || score.usableOutcomes < thresholds.minimumOccurrences) {
    return {
      status: "needs_more_data",
      classificationReason: `Only ${score.totalOccurrences} occurrences and ${score.usableOutcomes} usable outcomes; minimum is ${thresholds.minimumOccurrences}.`,
      recommendation: "Keep the hypothesis queued for replay. Do not promote to paper-watchlist.",
      nextResearchAction: "Collect more compact replay windows before interpreting performance."
    };
  }
  const monteCarloSupportsPaper =
    score.usableOutcomes < thresholds.monteCarloRequiredUsableOutcomes ||
    monteCarlo?.robustnessRating === "moderate" ||
    monteCarlo?.robustnessRating === "strong";
  if (
    targetFirstRate >= thresholds.paperWatchlistTargetFirstRate &&
    invalidationFirstRate <= thresholds.maxAcceptableInvalidationFirstRate &&
    averageRr >= thresholds.minimumAverageRr &&
    monteCarloSupportsPaper
  ) {
    return {
      status: "paper_watchlist_recommended",
      classificationReason: "Replay quality meets the paper-watchlist recommendation thresholds; this is not an approval.",
      recommendation: "Recommend paper-watchlist review only. Keep auto-promotion and execution disabled.",
      nextResearchAction: "Review the compact result, then run a separate paper-only tracking test if accepted by a human."
    };
  }
  if (
    targetFirstRate >= thresholds.promisingTargetFirstRate &&
    invalidationFirstRate <= thresholds.maxAcceptableInvalidationFirstRate &&
    averageRr >= thresholds.minimumAverageRr
  ) {
    return {
      status: "promising",
      classificationReason: "Replay evidence is promising but does not clear paper-watchlist recommendation gates.",
      recommendation: "Keep researching the hypothesis with more replay and Monte Carlo evidence.",
      nextResearchAction: "Extend out-of-sample replay and compare against approved/paper-watchlist candidates."
    };
  }
  if (targetFirstRate < 0.35 || invalidationFirstRate > 0.45 || averageRr < 0.5) {
    return {
      status: "discarded",
      classificationReason: "Replay evidence is materially below quality thresholds.",
      recommendation: "Discard this current hypothesis shape and wait for cleaner opportunity evidence.",
      nextResearchAction: "Create a new hypothesis only if a future opportunity has stronger confirmation."
    };
  }
  return {
    status: "weak",
    classificationReason: "Replay evidence is mixed or weak; it does not justify paper-watchlist consideration.",
    recommendation: "Keep as research context only; do not paper-track or approve.",
    nextResearchAction: "Refine the missing confirmation rules before replaying again."
  };
};

const hypothesisStatusAfterValidation = (status: IctHypothesisValidationResult["status"]): IctResearchHypothesisStatus => {
  if (status === "paper_watchlist_recommended") return "paper_watchlist_candidate";
  if (status === "discarded" || status === "weak") return "discarded";
  if (status === "needs_more_data") return "needs_more_data";
  return "replay_tested";
};

export const validateIctResearchHypothesis = (input: IctHypothesisValidationInput): IctHypothesisValidationResult => {
  const thresholds = { ...DEFAULT_ICT_HYPOTHESIS_VALIDATION_THRESHOLDS, ...input.thresholds };
  const source = input.source ?? "queued_hypothesis";
  const replayResults = input.replayResults ?? [];
  const replayOutcomes = input.replayOutcomes?.length
    ? input.replayOutcomes
    : replayResults.length
      ? extractMonteCarloOutcomesFromReplayResults(findHypothesisOccurrences(input.hypothesis, replayResults))
      : [];
  const score = scoreHypothesisOutcomes({ hypothesis: input.hypothesis, replayOutcomes, replayResults });
  const shouldRunMonteCarlo = input.runMonteCarlo !== false && score.usableOutcomes >= thresholds.monteCarloRequiredUsableOutcomes;
  const monteCarlo = shouldRunMonteCarlo
    ? runMonteCarloBatch(score.replayOutcomes, {
        source: "synthetic_test",
        includeApprovedOnly: false,
        includeWatchlist: true,
        simulationCount: 300,
        tradesPerSimulation: Math.min(60, Math.max(score.usableOutcomes, 1)),
        randomSeed: 20260607,
        researchOnly: true
      })
    : undefined;
  const monteCarloSummary: IctHypothesisValidationResult["monteCarlo"] = monteCarlo
    ? {
        attempted: true,
        robustnessRating: monteCarlo.recommendation.robustnessRating,
        riskOfRuinPct: monteCarlo.performance.riskOfRuinPct,
        recommendedMaxRiskPerTradePct: monteCarlo.recommendation.recommendedMaxRiskPerTradePct,
        reason: monteCarlo.recommendation.reason
      }
    : {
        attempted: false,
        reason: score.usableOutcomes >= thresholds.monteCarloRequiredUsableOutcomes
          ? "Monte Carlo disabled for this validation run."
          : `Monte Carlo waits for at least ${thresholds.monteCarloRequiredUsableOutcomes} usable outcomes.`
      };
  const classification = classifyHypothesisValidation(score, thresholds, monteCarloSummary);
  return sanitizeHypothesisValidationResult({
    researchOnly: true,
    hypothesisId: input.hypothesis.hypothesisId,
    generatedAt: input.generatedAt ?? now(),
    source,
    status: classification.status,
    testedWindows: input.testedWindows ?? score.totalOccurrences,
    totalOccurrences: score.totalOccurrences,
    usableOutcomes: score.usableOutcomes,
    targetFirstRate: score.targetFirstRate,
    invalidationFirstRate: score.invalidationFirstRate,
    averageRr: score.averageRr,
    medianRr: score.medianRr,
    monteCarlo: monteCarloSummary,
    classificationReason: classification.classificationReason,
    recommendation: classification.recommendation,
    evidence: score.evidence,
    blockers: score.blockers,
    nextResearchAction: classification.nextResearchAction,
    autoPromoteAllowed: false,
    executionAllowed: false,
    approvedProfileMutated: false,
    authority,
    safety
  });
};

export const sanitizeHypothesisValidationResult = (
  result: IctHypothesisValidationResult
): IctHypothesisValidationResult => {
  const sanitized = JSON.parse(JSON.stringify(result)) as IctHypothesisValidationResult;
  return {
    ...sanitized,
    researchOnly: true,
    totalOccurrences: Math.max(0, Math.round(sanitized.totalOccurrences)),
    usableOutcomes: Math.max(0, Math.round(sanitized.usableOutcomes)),
    testedWindows: Math.max(0, Math.round(sanitized.testedWindows)),
    targetFirstRate: sanitized.targetFirstRate === undefined ? undefined : round(sanitized.targetFirstRate),
    invalidationFirstRate: sanitized.invalidationFirstRate === undefined ? undefined : round(sanitized.invalidationFirstRate),
    averageRr: sanitized.averageRr === undefined ? undefined : round(sanitized.averageRr, 2),
    medianRr: sanitized.medianRr === undefined ? undefined : round(sanitized.medianRr, 2),
    evidence: safeList(sanitized.evidence),
    blockers: safeList(sanitized.blockers),
    autoPromoteAllowed: false,
    executionAllowed: false,
    approvedProfileMutated: false,
    authority,
    safety
  };
};

export const buildIctResearchHypothesisValidationJournalEvent = (
  result: IctHypothesisValidationResult
): IctResearchHypothesisValidationJournalEvent => ({
  eventType: "ict_research_hypothesis_validated",
  journalEventId: createId("ict_research_hypothesis_validated"),
  hypothesisId: result.hypothesisId,
  generatedAt: result.generatedAt,
  status: result.status,
  hypothesisStatusAfterValidation: hypothesisStatusAfterValidation(result.status),
  totalOccurrences: result.totalOccurrences,
  usableOutcomes: result.usableOutcomes,
  targetFirstRate: result.targetFirstRate,
  invalidationFirstRate: result.invalidationFirstRate,
  averageRr: result.averageRr,
  monteCarloRobustnessRating: result.monteCarlo?.robustnessRating,
  recommendation: result.recommendation,
  researchOnly: true,
  autoPromoteAllowed: false,
  executionAllowed: false,
  approvedProfileMutated: false,
  authority,
  safety
});

const readRawSelfImprovementJournalEvents = (): unknown[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const appendIctResearchHypothesisValidationJournalEvent = (
  event: IctResearchHypothesisValidationJournalEvent
) => {
  const sanitized = { ...event, researchOnly: true as const, autoPromoteAllowed: false as const, executionAllowed: false as const, approvedProfileMutated: false as const, authority, safety };
  if (!isBrowser()) return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  try {
    const next = [...readRawSelfImprovementJournalEvents(), sanitized].slice(-250);
    window.localStorage.setItem(ICT_SELF_IMPROVEMENT_JOURNAL_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
  } catch (error) {
    return { ok: false, storage: "localStorage_failed" as const, event: sanitized, error: error instanceof Error ? error.message : String(error) };
  }
};

export const applyIctHypothesisValidationToQueue = (result: IctHypothesisValidationResult) => {
  const queue = readIctSelfImprovementQueue();
  const status = hypothesisStatusAfterValidation(result.status);
  const hypotheses = queue.hypotheses.map((hypothesis) =>
    hypothesis.hypothesisId === result.hypothesisId
      ? {
          ...hypothesis,
          status,
          nextAction: result.nextResearchAction,
          blockers: result.blockers.length ? result.blockers : hypothesis.blockers,
          autoPromoteAllowed: false as const,
          executionAllowed: false as const,
          authority,
          safety
        }
      : hypothesis
  );
  const nextQueue: IctSelfImprovementQueue = {
    ...queue,
    updatedAt: now(),
    researchOnly: true,
    hypotheses,
    authority,
    safety
  };
  if (isBrowser()) {
    try {
      window.localStorage.setItem(ICT_SELF_IMPROVEMENT_QUEUE_STORAGE_KEY, JSON.stringify(nextQueue));
      window.dispatchEvent(new CustomEvent(ICT_SELF_IMPROVEMENT_UPDATED_EVENT, { detail: { queue: nextQueue } }));
    } catch {
      // Queue update failure must not interrupt validation display.
    }
  }
  return { ok: true, queue: nextQueue, status, authority, safety };
};

export const assertIctHypothesisValidationIsCompact = (
  result?: IctHypothesisValidationResult,
  journalEvent?: IctResearchHypothesisValidationJournalEvent
) => {
  const serialized = JSON.stringify({ result, journalEvent });
  return {
    ok:
      (result?.researchOnly ?? true) === true &&
      (journalEvent?.researchOnly ?? true) === true &&
      (result?.autoPromoteAllowed ?? false) === false &&
      (result?.executionAllowed ?? false) === false &&
      (result?.approvedProfileMutated ?? false) === false &&
      (journalEvent?.autoPromoteAllowed ?? false) === false &&
      (journalEvent?.executionAllowed ?? false) === false &&
      (journalEvent?.approvedProfileMutated ?? false) === false &&
      (result?.authority.executionAuthority ?? "none") === "none" &&
      (result?.authority.brokerAuthority ?? "none") === "none" &&
      (result?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized),
    serializedBytes: serialized.length
  };
};
