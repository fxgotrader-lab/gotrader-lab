import type {
  IctApprovedProfileOptimizationJournalEvent,
  IctApprovedProfileOptimizationResult,
  IctProfileOptimizationCandidate,
  IctProfileOptimizationObjective
} from "./ictApprovedProfileOptimizerTypes";
import { smtSymbolMatchesIndexGroup } from "./ictIndexSmt";
import type { IctReplayResult } from "./ictReplayValidationTypes";

const OPTIMIZATION_JOURNAL_STORAGE_KEY = "gotrader.ict-approved-profile-optimization-summary.journal.v1";
const MAX_OPTIMIZATION_JOURNAL_EVENTS = 100;

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

const emptyResults = {
  totalSignalsBefore: 0,
  totalSignalsAfter: 0,
  signalReductionPct: 0,
  targetFirstRate: 0,
  averageRrAchieved: 0,
  invalidationFirstRate: 0,
  approvedCount: 0,
  watchlistCount: 0,
  rejectedCount: 0
};

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const average = (values: number[]) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const confidencePct = (confidence: number) => clamp(confidence <= 1 ? confidence * 100 : confidence);
const rrFor = (result: IctReplayResult) => result.rrEstimate ?? result.tradePath.rrAchieved ?? 0;
const signalResults = (results: IctReplayResult[]) => results.filter((result) => result.decision === "research_only");

const sessionForTimestamp = (timestamp?: string) => {
  if (!timestamp) return "unknown";
  const hour = new Date(timestamp).getUTCHours();
  if (hour >= 0 && hour < 7) return "Asia";
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  return "Off hours";
};

const targetTooClose = (result: IctReplayResult) =>
  (result.noTradeReasons ?? []).some((reason) => /target (is )?too close|too close to target/i.test(reason)) ||
  (result.rrEstimate !== undefined && result.rrEstimate < 1.5);

const baselineFor = (results: IctReplayResult[]) => {
  const signals = signalResults(results);
  const totalSignals = signals.length;
  return {
    totalSignals,
    targetFirstRate: totalSignals ? round(signals.filter((result) => result.outcome === "target_first").length / totalSignals) : 0,
    averageRrAchieved: average(signals.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number")),
    invalidationFirstRate: totalSignals ? round(signals.filter((result) => result.outcome === "invalidation_first").length / totalSignals) : 0
  };
};

export const buildOptimizationCandidates = (): IctProfileOptimizationCandidate[] => {
  const candidates: IctProfileOptimizationCandidate[] = [];
  const minConfidenceValues = [50, 60, 70, 80];
  const minRrValues = [1.5, 1.75, 2, 2.5, 3];
  const booleans = [false, true];

  for (const minConfidence of minConfidenceValues) {
    for (const minRr of minRrValues) {
      for (const requireHtfAlignment of booleans) {
        for (const requireFvgPresent of booleans) {
          for (const requireExternalLiquidityTarget of booleans) {
            for (const rejectEquilibrium of booleans) {
              for (const requireSmtConfirmationForIndex of booleans) {
                for (const rejectMediumNewsRisk of booleans) {
                  for (const preferredSessionsOnly of booleans) {
                    const flags = [
                      requireHtfAlignment ? "htf" : "",
                      requireFvgPresent ? "fvg" : "",
                      requireExternalLiquidityTarget ? "dol" : "",
                      rejectEquilibrium ? "no_eq" : "",
                      requireSmtConfirmationForIndex ? "smt" : "",
                      rejectMediumNewsRisk ? "no_med_news" : "",
                      preferredSessionsOnly ? "preferred_session" : ""
                    ].filter(Boolean);
                    candidates.push({
                      id: [
                        "ict_profile_opt",
                        `conf_${minConfidence}`,
                        `rr_${String(minRr).replace(".", "_")}`,
                        flags.join("_") || "minimal"
                      ].join("__"),
                      label: `Confidence ${minConfidence} / ${minRr.toFixed(2)}R${flags.length ? ` / ${flags.join(" + ")}` : ""}`,
                      researchOnly: true,
                      minConfidence,
                      minRr,
                      requireHtfAlignment,
                      requireFvgPresent,
                      requireExternalLiquidityTarget,
                      rejectEquilibrium,
                      rejectTargetTooClose: true,
                      requireSmtConfirmationForIndex,
                      rejectSmtAgainstCandidate: true,
                      rejectHighNewsRisk: true,
                      rejectMediumNewsRisk,
                      preferredSessionsOnly,
                      results: { ...emptyResults },
                      score: 0,
                      strengths: [],
                      weaknesses: []
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return candidates;
};

const passesCandidate = (result: IctReplayResult, candidate: IctProfileOptimizationCandidate) => {
  if (result.decision !== "research_only") return false;
  if (result.side !== "long" && result.side !== "short") return false;
  if (confidencePct(result.confidence) < candidate.minConfidence) return false;
  if (rrFor(result) < candidate.minRr) return false;
  if (candidate.requireHtfAlignment && result.htfAligned !== true) return false;
  if (candidate.requireFvgPresent && result.fvgStatus === "not_applicable") return false;
  if (candidate.requireExternalLiquidityTarget && !result.liquidityTargetType) return false;
  if (candidate.rejectEquilibrium && result.dealingRangeLocation === "equilibrium") return false;
  if (candidate.rejectTargetTooClose && targetTooClose(result)) return false;
  if (candidate.requireSmtConfirmationForIndex && smtSymbolMatchesIndexGroup(result.brokerSymbol) && result.smtConfirmsCandidate !== true) {
    return false;
  }
  if (candidate.rejectSmtAgainstCandidate && result.smtRejectsCandidate === true) return false;
  if (candidate.rejectHighNewsRisk && (result.newsRiskLevel === "blocked" || result.newsRiskLevel === "high")) return false;
  if (candidate.rejectMediumNewsRisk && ["blocked", "high", "medium"].includes(result.newsRiskLevel ?? "")) return false;
  if (candidate.preferredSessionsOnly && result.sessionRiskState !== "preferred") return false;
  return true;
};

const nearCandidate = (result: IctReplayResult, candidate: IctProfileOptimizationCandidate) =>
  result.decision === "research_only" &&
  !passesCandidate(result, candidate) &&
  confidencePct(result.confidence) >= candidate.minConfidence - 5 &&
  rrFor(result) >= candidate.minRr - 0.25 &&
  (!candidate.requireHtfAlignment || result.htfAligned !== false);

const qualityForSignalReduction = (reduction: number) => {
  if (reduction < 0.1) return reduction * 4;
  if (reduction <= 0.8) return 0.4 + ((reduction - 0.1) / 0.7) * 0.6;
  return Math.max(0.25, 1 - (reduction - 0.8) * 3);
};

const objectiveWeights = (objective: IctProfileOptimizationObjective) => {
  if (objective === "maximize_target_first_rate") return { target: 46, rr: 18, reduction: 18, approval: 10, invalidationPenalty: 28 };
  if (objective === "maximize_average_rr") return { target: 24, rr: 44, reduction: 16, approval: 8, invalidationPenalty: 24 };
  if (objective === "reduce_noise") return { target: 24, rr: 14, reduction: 36, approval: 16, invalidationPenalty: 24 };
  return { target: 34, rr: 26, reduction: 22, approval: 10, invalidationPenalty: 26 };
};

const buildStrengths = (
  candidate: IctProfileOptimizationCandidate,
  baseline: ReturnType<typeof baselineFor>
) => {
  const strengths: string[] = [];
  if (candidate.results.targetFirstRate >= baseline.targetFirstRate + 0.05) strengths.push("Improves target-first rate versus broad replay baseline.");
  if (candidate.results.averageRrAchieved >= baseline.averageRrAchieved + 0.25) strengths.push("Improves average achieved RR.");
  if (candidate.results.signalReductionPct >= 0.2 && candidate.results.signalReductionPct <= 0.85) {
    strengths.push("Reduces noisy signals without eliminating the sample.");
  }
  if (candidate.requireHtfAlignment) strengths.push("Requires higher-timeframe alignment.");
  if (candidate.requireFvgPresent) strengths.push("Requires FVG/displacement context.");
  if (candidate.requireExternalLiquidityTarget) strengths.push("Requires external liquidity target.");
  if (candidate.requireSmtConfirmationForIndex) strengths.push("Requires SMT/relative-strength confirmation for index candidates.");
  if (candidate.rejectHighNewsRisk || candidate.rejectMediumNewsRisk) strengths.push("Filters elevated news/session risk.");
  return strengths.slice(0, 8);
};

const buildWeaknesses = (
  candidate: IctProfileOptimizationCandidate,
  baseline: ReturnType<typeof baselineFor>
) => {
  const weaknesses: string[] = [];
  const approvalRate = baseline.totalSignals ? candidate.results.approvedCount / baseline.totalSignals : 0;
  if (candidate.results.approvedCount === 0) weaknesses.push("Approves no replay signals.");
  if (candidate.results.approvedCount > 0 && candidate.results.approvedCount < Math.max(3, baseline.totalSignals * 0.03)) {
    weaknesses.push("Approved sample may be too small for confidence.");
  }
  if (approvalRate > 0.85) weaknesses.push("Approves nearly everything; noise reduction is weak.");
  if (candidate.results.invalidationFirstRate >= 0.45) weaknesses.push("Invalidation-first rate remains high.");
  if (candidate.results.targetFirstRate < baseline.targetFirstRate) weaknesses.push("Target-first rate is worse than baseline.");
  if (candidate.results.averageRrAchieved < baseline.averageRrAchieved) weaknesses.push("Average achieved RR is worse than baseline.");
  return weaknesses.slice(0, 8);
};

export const scoreOptimizationCandidate = (
  candidate: IctProfileOptimizationCandidate,
  results: IctReplayResult[],
  objective: IctProfileOptimizationObjective = "balanced_quality"
): IctProfileOptimizationCandidate => {
  const signals = signalResults(results);
  const baseline = baselineFor(results);
  const approved = signals.filter((result) => passesCandidate(result, candidate));
  const watchlistCount = signals.filter((result) => nearCandidate(result, candidate)).length;
  const totalSignalsBefore = signals.length;
  const approvalRate = totalSignalsBefore ? approved.length / totalSignalsBefore : 0;
  const targetFirstRate = approved.length ? round(approved.filter((result) => result.outcome === "target_first").length / approved.length) : 0;
  const invalidationFirstRate = approved.length ? round(approved.filter((result) => result.outcome === "invalidation_first").length / approved.length) : 0;
  const averageRrAchieved = average(approved.map((result) => result.tradePath.rrAchieved).filter((value): value is number => typeof value === "number"));
  const signalReductionPct = totalSignalsBefore ? round((totalSignalsBefore - approved.length) / totalSignalsBefore) : 0;
  const weights = objectiveWeights(objective);
  let score = 0;
  score += targetFirstRate * weights.target;
  score += Math.min(1.25, Math.max(0, averageRrAchieved) / 3) * weights.rr;
  score += qualityForSignalReduction(signalReductionPct) * weights.reduction;
  score += (approvalRate > 0.03 && approvalRate < 0.75 ? 1 : approvalRate <= 0.03 ? approvalRate / 0.03 : Math.max(0, 1 - (approvalRate - 0.75) * 3)) * weights.approval;
  score -= invalidationFirstRate * weights.invalidationPenalty;
  if (approved.length === 0) score -= 85;
  if (approved.length > 0 && approved.length < Math.max(3, totalSignalsBefore * 0.03)) score -= 35;
  if (approvalRate > 0.85) score -= 28;
  if (approvalRate > 0.7) score -= 10;
  if (targetFirstRate < baseline.targetFirstRate) score -= 12;
  if (averageRrAchieved < baseline.averageRrAchieved) score -= 8;

  const scored: IctProfileOptimizationCandidate = {
    ...candidate,
    researchOnly: true,
    results: {
      totalSignalsBefore,
      totalSignalsAfter: approved.length,
      signalReductionPct,
      targetFirstRate,
      averageRrAchieved,
      invalidationFirstRate,
      approvedCount: approved.length,
      watchlistCount,
      rejectedCount: Math.max(0, totalSignalsBefore - approved.length - watchlistCount)
    },
    score: round(score, 2),
    strengths: [],
    weaknesses: []
  };
  return {
    ...scored,
    strengths: buildStrengths(scored, baseline),
    weaknesses: buildWeaknesses(scored, baseline)
  };
};

export const rankOptimizationCandidates = (
  results: IctReplayResult[],
  objective: IctProfileOptimizationObjective = "balanced_quality"
) =>
  buildOptimizationCandidates()
    .map((candidate) => scoreOptimizationCandidate(candidate, results, objective))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.results.targetFirstRate - left.results.targetFirstRate ||
        right.results.averageRrAchieved - left.results.averageRrAchieved ||
        left.results.signalReductionPct - right.results.signalReductionPct ||
        left.id.localeCompare(right.id)
    );

const fallbackCandidate = (totalSignals = 0): IctProfileOptimizationCandidate => ({
  id: "ict_profile_opt__unavailable",
  label: "Optimization unavailable",
  researchOnly: true,
  minConfidence: 70,
  minRr: 2,
  requireHtfAlignment: true,
  requireFvgPresent: true,
  requireExternalLiquidityTarget: true,
  rejectEquilibrium: true,
  rejectTargetTooClose: true,
  requireSmtConfirmationForIndex: false,
  rejectSmtAgainstCandidate: true,
  rejectHighNewsRisk: true,
  rejectMediumNewsRisk: false,
  preferredSessionsOnly: false,
  results: { ...emptyResults, totalSignalsBefore: totalSignals, rejectedCount: totalSignals },
  score: 0,
  strengths: [],
  weaknesses: ["Replay results are unavailable; run real replay before optimizing."]
});

const buildRecommendationSummary = (
  candidate: IctProfileOptimizationCandidate,
  baseline: ReturnType<typeof baselineFor>
) => {
  if (!baseline.totalSignals || candidate.id === "ict_profile_opt__unavailable") {
    return "Profile optimization needs replay signals before recommending approved-profile settings.";
  }
  return `Recommend ${candidate.label}: ${Math.round(candidate.results.signalReductionPct * 100)}% signal reduction, ${Math.round(candidate.results.targetFirstRate * 100)}% target-first, ${candidate.results.averageRrAchieved.toFixed(2)}R average achieved RR.`;
};

const buildNextTestSuggestion = (candidate: IctProfileOptimizationCandidate) => {
  if (candidate.results.approvedCount === 0) {
    return "Run a larger replay sample before changing approved-profile settings.";
  }
  if (candidate.results.approvedCount < 5) {
    return "Keep this as a draft and test more replay windows before considering profile changes.";
  }
  if (candidate.results.invalidationFirstRate >= 0.45) {
    return "Review invalidation-first cases and no-trade reasons before promoting this profile.";
  }
  return "Run a follow-up replay/walk-forward review using this recommended profile as a research-only candidate.";
};

export const optimizeApprovedProfileFromReplayResults = (
  results: IctReplayResult[],
  objective: IctProfileOptimizationObjective = "balanced_quality"
): IctApprovedProfileOptimizationResult => {
  const baseline = baselineFor(results);
  const ranked = rankOptimizationCandidates(results, objective);
  const recommendedProfile = ranked[0] ?? fallbackCandidate(baseline.totalSignals);
  return sanitizeOptimizationResult({
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    objective,
    baseline: {
      totalSignals: baseline.totalSignals,
      targetFirstRate: baseline.targetFirstRate,
      averageRrAchieved: baseline.averageRrAchieved
    },
    recommendedProfile,
    candidates: ranked.slice(0, 50),
    recommendationSummary: buildRecommendationSummary(recommendedProfile, baseline),
    nextTestSuggestion: buildNextTestSuggestion(recommendedProfile),
    authority,
    safety
  });
};

export const sanitizeOptimizationResult = (
  result: IctApprovedProfileOptimizationResult
): IctApprovedProfileOptimizationResult => {
  const sanitized = JSON.parse(JSON.stringify(result)) as IctApprovedProfileOptimizationResult;
  sanitized.researchOnly = true;
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.baseline = {
    totalSignals: sanitized.baseline.totalSignals,
    targetFirstRate: round(sanitized.baseline.targetFirstRate),
    averageRrAchieved: round(sanitized.baseline.averageRrAchieved, 2)
  };
  sanitized.recommendedProfile = {
    ...sanitized.recommendedProfile,
    researchOnly: true,
    score: round(sanitized.recommendedProfile.score, 2),
    results: {
      ...sanitized.recommendedProfile.results,
      signalReductionPct: round(sanitized.recommendedProfile.results.signalReductionPct),
      targetFirstRate: round(sanitized.recommendedProfile.results.targetFirstRate),
      averageRrAchieved: round(sanitized.recommendedProfile.results.averageRrAchieved, 2),
      invalidationFirstRate: round(sanitized.recommendedProfile.results.invalidationFirstRate)
    }
  };
  sanitized.candidates = sanitized.candidates.map((candidate) => ({
    ...candidate,
    researchOnly: true,
    score: round(candidate.score, 2),
    results: {
      ...candidate.results,
      signalReductionPct: round(candidate.results.signalReductionPct),
      targetFirstRate: round(candidate.results.targetFirstRate),
      averageRrAchieved: round(candidate.results.averageRrAchieved, 2),
      invalidationFirstRate: round(candidate.results.invalidationFirstRate)
    }
  }));
  return sanitized;
};

export const buildIctApprovedProfileOptimizationJournalEvent = (
  result: IctApprovedProfileOptimizationResult
): IctApprovedProfileOptimizationJournalEvent => ({
  eventType: "ict_profile_optimization_summary",
  journalEventId: createId("ict_profile_optimization_journal"),
  generatedAt: result.generatedAt,
  objective: result.objective,
  baselineTargetFirstRate: result.baseline.targetFirstRate,
  baselineAverageRr: result.baseline.averageRrAchieved,
  recommendedProfileId: result.recommendedProfile.id,
  recommendedMinConfidence: result.recommendedProfile.minConfidence,
  recommendedMinRr: result.recommendedProfile.minRr,
  recommendedSignalReductionPct: result.recommendedProfile.results.signalReductionPct,
  recommendedTargetFirstRate: result.recommendedProfile.results.targetFirstRate,
  recommendedAverageRr: result.recommendedProfile.results.averageRrAchieved,
  nextTestSuggestion: result.nextTestSuggestion,
  researchOnly: true,
  authority,
  safety
});

export const readIctApprovedProfileOptimizationJournalEvents = (): IctApprovedProfileOptimizationJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPTIMIZATION_JOURNAL_STORAGE_KEY) ?? "[]") as IctApprovedProfileOptimizationJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_profile_optimization_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const appendIctApprovedProfileOptimizationJournalEvent = (
  event: IctApprovedProfileOptimizationJournalEvent
) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctApprovedProfileOptimizationJournalEvents();
  const next = [...current, sanitized].slice(-MAX_OPTIMIZATION_JOURNAL_EVENTS);
  window.localStorage.setItem(OPTIMIZATION_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const assertIctApprovedProfileOptimizationOutputIsCompact = (output: {
  result?: IctApprovedProfileOptimizationResult;
  journalEvent?: IctApprovedProfileOptimizationJournalEvent;
}) => {
  const withoutSafety = {
    result: output.result ? { ...output.result, safety: undefined } : undefined,
    journalEvent: output.journalEvent ? { ...output.journalEvent, safety: undefined } : undefined
  };
  const serialized = JSON.stringify(withoutSafety);
  return {
    ok:
      (output.result?.researchOnly ?? true) === true &&
      (output.journalEvent?.researchOnly ?? true) === true &&
      (output.result?.authority.executionAuthority ?? "none") === "none" &&
      (output.result?.authority.brokerAuthority ?? "none") === "none" &&
      (output.result?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
