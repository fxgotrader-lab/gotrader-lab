import type { IctMonteCarloRobustnessRating, IctMonteCarloSource } from "./ictMonteCarloTypes";

export type IctLatestResearchSource =
  | "current_read"
  | "manual_replay_review"
  | "monte_carlo"
  | "market_scorecard";

export interface IctLatestReplaySnapshot {
  runId?: string;
  generatedAt: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  primaryTimeframe?: string;
  totalSignals?: number;
  targetFirstRate?: number;
  approvedTargetFirstRate?: number;
  averageRrAchieved?: number;
  approvedAverageRr?: number;
  researchOnly: true;
}

export interface IctLatestMonteCarloSnapshot {
  generatedAt: string;
  source: IctMonteCarloSource | string;
  usableOutcomes: number;
  robustnessRating: IctMonteCarloRobustnessRating;
  medianEndingR?: number;
  fifthPercentileEndingR?: number;
  medianMaxDrawdownPct?: number;
  worstMaxDrawdownPct?: number;
  riskOfRuinPct?: number;
  recommendedMaxRiskPerTradePct?: number;
  warnings: string[];
  researchOnly: true;
}

export interface IctLatestScorecardSnapshot {
  runId?: string;
  generatedAt: string;
  completedSymbols: number;
  researchPreferredSymbols: string[];
  watchlistOnlySymbols: string[];
  noisySymbols: string[];
  bestApprovedTargetFirstSymbol?: string;
  bestApprovedRrSymbol?: string;
  researchOnly: true;
}

export interface IctLatestResearchState {
  updatedAt: string;
  researchOnly: true;
  latestReplay?: IctLatestReplaySnapshot;
  latestMonteCarlo?: IctLatestMonteCarloSnapshot;
  latestScorecard?: IctLatestScorecardSnapshot;
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

export interface IctLatestResearchStateJournalEvent {
  eventType: "ict_latest_research_state_updated";
  journalEventId: string;
  updatedAt: string;
  source: IctLatestResearchSource;
  hasReplay: boolean;
  hasMonteCarlo: boolean;
  hasScorecard: boolean;
  monteCarloRobustnessRating?: IctMonteCarloRobustnessRating;
  riskOfRuinPct?: number;
  recommendedMaxRiskPerTradePct?: number;
  researchOnly: true;
  authority: IctLatestResearchState["authority"];
  safety: IctLatestResearchState["safety"];
}
