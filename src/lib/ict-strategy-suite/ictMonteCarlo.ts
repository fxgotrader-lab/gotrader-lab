import type { IctManualReplayReviewResult } from "./ictManualReplayReviewTypes";
import type { IctMarketScorecard } from "./ictMarketScorecardTypes";
import type {
  IctMonteCarloConfig,
  IctMonteCarloJournalEvent,
  IctMonteCarloRobustnessRating,
  IctMonteCarloSimulationPath,
  IctMonteCarloSource,
  IctMonteCarloSummary,
  IctMonteCarloTradeOutcome
} from "./ictMonteCarloTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";

const ICT_MONTE_CARLO_JOURNAL_STORAGE_KEY = "gotrader.ict-monte-carlo-summary.journal.v1";
const MAX_MONTE_CARLO_JOURNAL_EVENTS = 100;
const MIN_USABLE_OUTCOMES = 8;

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
const round = (value: number, decimals = 2) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);

const approvedStatusFor = (value?: string): IctMonteCarloTradeOutcome["approvedStatus"] =>
  value === "approved_research_candidate" ||
  value === "paper_watchlist_candidate" ||
  value === "watchlist_candidate" ||
  value === "rejected_candidate" ||
  value === "no_trade"
    ? value
    : undefined;

export const defaultIctMonteCarloConfig = (
  source: IctMonteCarloSource,
  usableOutcomeCount = 0,
  overrides: Partial<IctMonteCarloConfig> = {}
): IctMonteCarloConfig => ({
  source,
  simulationCount: Math.max(100, Math.floor(overrides.simulationCount ?? 1000)),
  tradesPerSimulation: Math.max(1, Math.floor(overrides.tradesPerSimulation ?? Math.min(100, Math.max(usableOutcomeCount, 1)))),
  startingEquityR: Number(overrides.startingEquityR ?? 0),
  riskPerTradePct: Math.max(0.1, Number(overrides.riskPerTradePct ?? 0.5)),
  ruinDrawdownPct: Math.max(1, Number(overrides.ruinDrawdownPct ?? 25)),
  maxAcceptableDrawdownPct: Math.max(1, Number(overrides.maxAcceptableDrawdownPct ?? 10)),
  includeApprovedOnly: overrides.includeApprovedOnly ?? true,
  includeWatchlist: overrides.includeWatchlist ?? false,
  randomSeed: overrides.randomSeed,
  researchOnly: true
});

export const normalizeOutcomeToRMultiple = (result: IctReplayResult): number | undefined => {
  if (result.outcome === "target_first") {
    return round(result.tradePath.rrAchieved ?? result.rrEstimate ?? 2, 2);
  }
  if (result.outcome === "invalidation_first") return -1;
  if (result.outcome === "partial_target") {
    const achieved = result.tradePath.rrAchieved;
    return round(typeof achieved === "number" && achieved > 0 ? achieved : 0.5, 2);
  }
  if (result.outcome === "stalled") return 0;
  return undefined;
};

export const extractMonteCarloOutcomesFromReplayResults = (
  replayResults: IctReplayResult[] = []
): IctMonteCarloTradeOutcome[] =>
  replayResults
    .map((result, index): IctMonteCarloTradeOutcome | undefined => {
      const rMultiple = normalizeOutcomeToRMultiple(result);
      if (rMultiple === undefined) return undefined;
      return {
        id: `mc_${result.strategyId}_${result.tradePath.signalTime ?? index}_${index}`,
        strategyId: result.strategyId,
        setup: result.setup,
        symbol: result.requestedSymbol ?? result.symbol,
        side: result.side,
        outcome: result.outcome,
        rMultiple,
        approvedStatus: approvedStatusFor(result.approvedProfileStatus),
        confidence: result.confidence,
        sourceTime: result.tradePath.signalTime,
        researchOnly: true
      };
    })
    .filter((outcome): outcome is IctMonteCarloTradeOutcome => Boolean(outcome));

export const extractMonteCarloOutcomesFromManualReplay = (
  review?: Pick<IctManualReplayReviewResult, "monteCarloOutcomes" | "status">
): IctMonteCarloTradeOutcome[] => (review?.status === "completed" ? review.monteCarloOutcomes ?? [] : []);

export const extractMonteCarloOutcomesFromMarketScorecard = (
  scorecard?: IctMarketScorecard
): IctMonteCarloTradeOutcome[] => scorecard?.monteCarloOutcomes ?? [];

const usableOutcomesForConfig = (outcomes: IctMonteCarloTradeOutcome[], config: IctMonteCarloConfig) =>
  outcomes.filter((outcome) => {
    if (!Number.isFinite(outcome.rMultiple)) return false;
    if (config.includeApprovedOnly) {
      if (outcome.approvedStatus === "approved_research_candidate") return true;
      if (config.includeWatchlist && outcome.approvedStatus === "paper_watchlist_candidate") return true;
      if (config.includeWatchlist && outcome.approvedStatus === "watchlist_candidate") return true;
      return false;
    }
    if (!config.includeWatchlist && outcome.approvedStatus === "paper_watchlist_candidate") return false;
    if (!config.includeWatchlist && outcome.approvedStatus === "watchlist_candidate") return false;
    return outcome.approvedStatus !== "rejected_candidate" && outcome.approvedStatus !== "no_trade";
  });

const createRandom = (seed = Date.now()) => {
  let state = Math.max(1, Math.floor(seed) % 2147483647);
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

export const calculateMaxDrawdown = (equityPath: number[]) => {
  let peak = equityPath[0] ?? 0;
  let maxDrawdown = 0;
  for (const value of equityPath) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak - value);
  }
  return round(maxDrawdown, 2);
};

export const calculateLongestLosingStreak = (rMultiples: number[]) => {
  let longest = 0;
  let current = 0;
  for (const value of rMultiples) {
    if (value < 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
};

const calculateProfitFactor = (rMultiples: number[]) => {
  const grossWin = rMultiples.filter((value) => value > 0).reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(rMultiples.filter((value) => value < 0).reduce((total, value) => total + value, 0));
  if (!grossLoss) return grossWin > 0 ? undefined : 0;
  return round(grossWin / grossLoss, 2);
};

export const runMonteCarloSimulation = (
  outcomes: IctMonteCarloTradeOutcome[],
  config: IctMonteCarloConfig,
  simulationIndex = 0,
  random = Math.random
): IctMonteCarloSimulationPath => {
  const trades = Array.from({ length: config.tradesPerSimulation }, () => {
    const sampled = outcomes[Math.floor(random() * outcomes.length)];
    return sampled?.rMultiple ?? 0;
  });
  const equityPath = trades.reduce<number[]>((path, value) => [...path, round((path.at(-1) ?? config.startingEquityR) + value, 2)], [
    config.startingEquityR
  ]);
  const endingR = equityPath.at(-1) ?? config.startingEquityR;
  const maxDrawdownR = calculateMaxDrawdown(equityPath);
  const maxDrawdownPct = round(maxDrawdownR * config.riskPerTradePct, 2);
  const longestLosingStreak = calculateLongestLosingStreak(trades);
  const winRate = trades.length ? trades.filter((value) => value > 0).length / trades.length : 0;
  return {
    simulationId: `mc_path_${simulationIndex + 1}`,
    endingR: round(endingR, 2),
    maxDrawdownR,
    maxDrawdownPct,
    longestLosingStreak,
    winRate: round(winRate, 4),
    profitFactor: calculateProfitFactor(trades),
    ruinHit: maxDrawdownPct >= config.ruinDrawdownPct
  };
};

export const calculatePercentile = (values: number[], percentile: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return round(sorted[lower], 2);
  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight, 2);
};

export const calculateRiskOfRuin = (paths: IctMonteCarloSimulationPath[]) =>
  paths.length ? round((paths.filter((path) => path.ruinHit).length / paths.length) * 100, 2) : 0;

export const calculateDrawdownProbability = (paths: IctMonteCarloSimulationPath[], maxAcceptableDrawdownPct: number) =>
  paths.length ? round((paths.filter((path) => path.maxDrawdownPct >= maxAcceptableDrawdownPct).length / paths.length) * 100, 2) : 0;

export const rateMonteCarloRobustness = (input: {
  fifthPercentileEndingR: number;
  medianEndingR: number;
  probabilityDrawdownOverLimitPct: number;
  riskOfRuinPct: number;
  usableOutcomes: number;
}): { reason: string; robustnessRating: IctMonteCarloRobustnessRating; recommendedMaxRiskPerTradePct: number; warnings: string[] } => {
  const warnings: string[] = [];
  if (input.usableOutcomes < MIN_USABLE_OUTCOMES) {
    return {
      robustnessRating: "insufficient_data",
      recommendedMaxRiskPerTradePct: 0.25,
      reason: `Only ${input.usableOutcomes} usable approved/watchlist outcomes; Monte Carlo needs more replay evidence.`,
      warnings: ["Run more replay validation before interpreting robustness."]
    };
  }
  if (input.usableOutcomes < 30) warnings.push("Sample size is small; treat robustness as preliminary.");
  if (input.riskOfRuinPct > 10) warnings.push("Risk-of-ruin estimate is elevated.");
  if (input.probabilityDrawdownOverLimitPct > 35) warnings.push("Drawdown-over-limit probability is elevated.");

  if (
    input.usableOutcomes >= 30 &&
    input.medianEndingR > 0 &&
    input.fifthPercentileEndingR >= 0 &&
    input.riskOfRuinPct <= 5 &&
    input.probabilityDrawdownOverLimitPct <= 20
  ) {
    return {
      robustnessRating: "strong",
      recommendedMaxRiskPerTradePct: 1,
      reason: "Positive median and left-tail outcomes with controlled drawdown probability.",
      warnings
    };
  }
  if (input.medianEndingR > 0 && input.riskOfRuinPct <= 20 && input.probabilityDrawdownOverLimitPct <= 45) {
    return {
      robustnessRating: "moderate",
      recommendedMaxRiskPerTradePct: 0.5,
      reason: "Median path is positive, but sample size or drawdown tail risk still requires caution.",
      warnings
    };
  }
  return {
    robustnessRating: "weak",
    recommendedMaxRiskPerTradePct: 0.25,
    reason: "Monte Carlo paths show poor median result, high drawdown probability, or elevated ruin risk.",
    warnings: warnings.length ? warnings : ["Current replay outcomes do not support robust risk assumptions."]
  };
};

export const runMonteCarloBatch = (
  outcomes: IctMonteCarloTradeOutcome[],
  configInput: Partial<IctMonteCarloConfig> & { source: IctMonteCarloSource }
): IctMonteCarloSummary => {
  const provisional = defaultIctMonteCarloConfig(configInput.source, outcomes.length, configInput);
  const usable = usableOutcomesForConfig(outcomes, provisional);
  const config = defaultIctMonteCarloConfig(configInput.source, usable.length, {
    ...configInput,
    tradesPerSimulation: configInput.tradesPerSimulation ?? Math.min(100, Math.max(usable.length, 1))
  });

  if (usable.length < MIN_USABLE_OUTCOMES) {
    const recommendation = rateMonteCarloRobustness({
      fifthPercentileEndingR: 0,
      medianEndingR: 0,
      probabilityDrawdownOverLimitPct: 0,
      riskOfRuinPct: 0,
      usableOutcomes: usable.length
    });
    return sanitizeMonteCarloSummary({
      source: config.source,
      generatedAt: new Date().toISOString(),
      researchOnly: true,
      input: {
        totalOutcomes: outcomes.length,
        usableOutcomes: usable.length,
        approvedOnly: config.includeApprovedOnly,
        watchlistIncluded: config.includeWatchlist,
        simulationCount: config.simulationCount,
        tradesPerSimulation: config.tradesPerSimulation,
        riskPerTradePct: config.riskPerTradePct
      },
      performance: {
        medianEndingR: 0,
        fifthPercentileEndingR: 0,
        ninetyFifthPercentileEndingR: 0,
        medianMaxDrawdownR: 0,
        worstMaxDrawdownR: 0,
        medianMaxDrawdownPct: 0,
        worstMaxDrawdownPct: 0,
        medianLongestLosingStreak: 0,
        worstLongestLosingStreak: 0,
        riskOfRuinPct: 0,
        probabilityDrawdownOverLimitPct: 0,
        averageWinRate: 0
      },
      recommendation,
      pathsSample: [],
      authority,
      safety
    });
  }

  const random = createRandom(config.randomSeed);
  const paths = Array.from({ length: config.simulationCount }, (_, index) => runMonteCarloSimulation(usable, config, index, random));
  const medianEndingR = calculatePercentile(paths.map((path) => path.endingR), 0.5);
  const fifthPercentileEndingR = calculatePercentile(paths.map((path) => path.endingR), 0.05);
  const probabilityDrawdownOverLimitPct = calculateDrawdownProbability(paths, config.maxAcceptableDrawdownPct);
  const riskOfRuinPct = calculateRiskOfRuin(paths);
  const recommendation = rateMonteCarloRobustness({
    fifthPercentileEndingR,
    medianEndingR,
    probabilityDrawdownOverLimitPct,
    riskOfRuinPct,
    usableOutcomes: usable.length
  });
  return sanitizeMonteCarloSummary({
    source: config.source,
    generatedAt: new Date().toISOString(),
    researchOnly: true,
    input: {
      totalOutcomes: outcomes.length,
      usableOutcomes: usable.length,
      approvedOnly: config.includeApprovedOnly,
      watchlistIncluded: config.includeWatchlist,
      simulationCount: config.simulationCount,
      tradesPerSimulation: config.tradesPerSimulation,
      riskPerTradePct: config.riskPerTradePct
    },
    performance: {
      medianEndingR,
      fifthPercentileEndingR,
      ninetyFifthPercentileEndingR: calculatePercentile(paths.map((path) => path.endingR), 0.95),
      medianMaxDrawdownR: calculatePercentile(paths.map((path) => path.maxDrawdownR), 0.5),
      worstMaxDrawdownR: round(Math.max(...paths.map((path) => path.maxDrawdownR)), 2),
      medianMaxDrawdownPct: calculatePercentile(paths.map((path) => path.maxDrawdownPct), 0.5),
      worstMaxDrawdownPct: round(Math.max(...paths.map((path) => path.maxDrawdownPct)), 2),
      medianLongestLosingStreak: calculatePercentile(paths.map((path) => path.longestLosingStreak), 0.5),
      worstLongestLosingStreak: Math.max(...paths.map((path) => path.longestLosingStreak)),
      riskOfRuinPct,
      probabilityDrawdownOverLimitPct,
      averageWinRate: round(paths.reduce((total, path) => total + path.winRate, 0) / paths.length, 4)
    },
    recommendation,
    pathsSample: paths.slice(0, 10),
    authority,
    safety
  });
};

export const runMonteCarloSimulationBatch = runMonteCarloBatch;

export const buildIctMonteCarloJournalEvent = (summary: IctMonteCarloSummary): IctMonteCarloJournalEvent => ({
  eventType: "ict_monte_carlo_summary",
  journalEventId: createId("ict_monte_carlo_journal"),
  generatedAt: summary.generatedAt,
  source: summary.source,
  totalOutcomes: summary.input.totalOutcomes,
  usableOutcomes: summary.input.usableOutcomes,
  simulationCount: summary.input.simulationCount,
  tradesPerSimulation: summary.input.tradesPerSimulation,
  riskPerTradePct: summary.input.riskPerTradePct,
  medianEndingR: summary.performance.medianEndingR,
  fifthPercentileEndingR: summary.performance.fifthPercentileEndingR,
  medianMaxDrawdownPct: summary.performance.medianMaxDrawdownPct,
  worstMaxDrawdownPct: summary.performance.worstMaxDrawdownPct,
  riskOfRuinPct: summary.performance.riskOfRuinPct,
  probabilityDrawdownOverLimitPct: summary.performance.probabilityDrawdownOverLimitPct,
  medianLongestLosingStreak: summary.performance.medianLongestLosingStreak,
  worstLongestLosingStreak: summary.performance.worstLongestLosingStreak,
  robustnessRating: summary.recommendation.robustnessRating,
  recommendedMaxRiskPerTradePct: summary.recommendation.recommendedMaxRiskPerTradePct,
  researchOnly: true,
  authority,
  safety
});

export const appendIctMonteCarloJournalEvent = (event: IctMonteCarloJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  const current = readIctMonteCarloJournalEvents();
  const next = [...current, sanitized].slice(-MAX_MONTE_CARLO_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_MONTE_CARLO_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const readIctMonteCarloJournalEvents = (): IctMonteCarloJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_MONTE_CARLO_JOURNAL_STORAGE_KEY) ?? "[]") as IctMonteCarloJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_monte_carlo_summary" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const sanitizeMonteCarloSummary = (summary: IctMonteCarloSummary): IctMonteCarloSummary => {
  const sanitized = JSON.parse(JSON.stringify(summary)) as IctMonteCarloSummary;
  sanitized.researchOnly = true;
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.pathsSample = sanitized.pathsSample.slice(0, 10).map((path) => ({
    ...path,
    endingR: round(path.endingR, 2),
    maxDrawdownR: round(path.maxDrawdownR, 2),
    maxDrawdownPct: round(path.maxDrawdownPct, 2),
    winRate: round(path.winRate, 4),
    profitFactor: path.profitFactor === undefined ? undefined : round(path.profitFactor, 2)
  }));
  return sanitized;
};

export const assertIctMonteCarloSummaryIsCompact = (summary: IctMonteCarloSummary, journalEvent?: IctMonteCarloJournalEvent) => {
  const withoutSafety = {
    journalEvent: journalEvent ? { ...journalEvent, safety: undefined } : undefined,
    summary: { ...summary, safety: undefined }
  };
  const serialized = JSON.stringify(withoutSafety);
  return {
    ok:
      summary.researchOnly === true &&
      (journalEvent?.researchOnly ?? true) === true &&
      summary.authority.executionAuthority === "none" &&
      summary.authority.brokerAuthority === "none" &&
      summary.authority.readinessOverrideAuthority === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};
