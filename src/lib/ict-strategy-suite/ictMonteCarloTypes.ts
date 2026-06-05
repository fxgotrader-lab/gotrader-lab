import type { IctReplayOutcome } from "./ictReplayValidationTypes";

export type IctMonteCarloSource =
  | "manual_replay_review"
  | "market_scorecard"
  | "real_replay_runner"
  | "synthetic_test";

export type IctMonteCarloRobustnessRating =
  | "strong"
  | "moderate"
  | "weak"
  | "insufficient_data";

export interface IctMonteCarloTradeOutcome {
  id: string;
  strategyId?: string;
  setup?: string;
  symbol?: string;
  side?: "long" | "short" | "flat";
  outcome: IctReplayOutcome;
  rMultiple: number;
  approvedStatus?: "approved_research_candidate" | "watchlist_candidate" | "rejected_candidate" | "no_trade";
  confidence?: number;
  sourceTime?: string;
  researchOnly: true;
}

export interface IctMonteCarloConfig {
  source: IctMonteCarloSource;
  simulationCount: number;
  tradesPerSimulation: number;
  startingEquityR: number;
  riskPerTradePct: number;
  ruinDrawdownPct: number;
  maxAcceptableDrawdownPct: number;
  includeApprovedOnly: boolean;
  includeWatchlist: boolean;
  randomSeed?: number;
  researchOnly: true;
}

export interface IctMonteCarloSimulationPath {
  simulationId: string;
  endingR: number;
  maxDrawdownR: number;
  maxDrawdownPct: number;
  longestLosingStreak: number;
  winRate: number;
  profitFactor?: number;
  ruinHit: boolean;
}

export interface IctMonteCarloSummary {
  source: IctMonteCarloSource;
  generatedAt: string;
  researchOnly: true;
  input: {
    totalOutcomes: number;
    usableOutcomes: number;
    approvedOnly: boolean;
    watchlistIncluded: boolean;
    simulationCount: number;
    tradesPerSimulation: number;
    riskPerTradePct: number;
  };
  performance: {
    medianEndingR: number;
    fifthPercentileEndingR: number;
    ninetyFifthPercentileEndingR: number;
    medianMaxDrawdownR: number;
    worstMaxDrawdownR: number;
    medianMaxDrawdownPct: number;
    worstMaxDrawdownPct: number;
    medianLongestLosingStreak: number;
    worstLongestLosingStreak: number;
    riskOfRuinPct: number;
    probabilityDrawdownOverLimitPct: number;
    averageWinRate: number;
  };
  recommendation: {
    robustnessRating: IctMonteCarloRobustnessRating;
    recommendedMaxRiskPerTradePct: number;
    reason: string;
    warnings: string[];
  };
  pathsSample: IctMonteCarloSimulationPath[];
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctMonteCarloJournalEvent {
  eventType: "ict_monte_carlo_summary";
  journalEventId: string;
  generatedAt: string;
  source: IctMonteCarloSource;
  totalOutcomes: number;
  usableOutcomes: number;
  simulationCount: number;
  tradesPerSimulation: number;
  riskPerTradePct: number;
  medianEndingR: number;
  fifthPercentileEndingR: number;
  medianMaxDrawdownPct: number;
  worstMaxDrawdownPct: number;
  riskOfRuinPct: number;
  probabilityDrawdownOverLimitPct: number;
  medianLongestLosingStreak: number;
  worstLongestLosingStreak: number;
  robustnessRating: IctMonteCarloRobustnessRating;
  recommendedMaxRiskPerTradePct: number;
  researchOnly: true;
  authority: IctMonteCarloSummary["authority"];
  safety: IctMonteCarloSummary["safety"];
}
