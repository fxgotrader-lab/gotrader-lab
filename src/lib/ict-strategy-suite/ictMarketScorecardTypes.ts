import type { IctRealReplayRunResult } from "./ictRealReplayRunnerTypes";
import type { IctMonteCarloTradeOutcome } from "./ictMonteCarloTypes";
import type { IctBrowserResearchStatus } from "./ictBrowserResearchLimits";

export type IctMarketScorecardStatus =
  | "research_preferred"
  | "watchlist_only"
  | "noisy"
  | "unavailable"
  | "insufficient_data";

export interface IctMarketScorecardSymbolResult {
  requestedSymbol: string;
  brokerSymbol: string;
  displayLabel: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  status: IctMarketScorecardStatus;
  statusReason: string;
  totalWindows: number;
  totalSignals: number;
  totalNoTrades: number;
  broadTargetFirstRate: number;
  broadAverageRr: number;
  approvedCount: number;
  watchlistCount: number;
  rejectedCount: number;
  noTradeCount: number;
  approvedRejectedRatio: number;
  approvedTargetFirstRate: number;
  approvedAverageRr: number;
  signalReductionPct: number;
  smtConfirmRate?: number;
  smtRejectRate?: number;
  newsBlockedCount?: number;
  newsCautionCount?: number;
  topSetup?: string;
  worstSetup?: string;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  researchOnly: true;
}

export interface IctMarketScorecardConfig {
  requestedSymbols: string[];
  primaryTimeframe: string;
  htfTimeframes: string[];
  candleLimit: number;
  replayWindowSize: number;
  lookaheadCandles: number;
}

export interface IctMarketScorecard {
  runId: string;
  generatedAt: string;
  researchOnly: true;
  status?: IctBrowserResearchStatus;
  browserSafe?: boolean;
  warnings?: string[];
  progress?: {
    completedSymbols: number;
    totalSymbols: number;
    currentSymbol?: string;
  };
  serializedBytes?: number;
  config: IctMarketScorecardConfig;
  symbols: IctMarketScorecardSymbolResult[];
  summary: {
    completedSymbols: number;
    unavailableSymbols: number;
    researchPreferredSymbols: string[];
    watchlistOnlySymbols: string[];
    noisySymbols: string[];
    bestApprovedTargetFirstSymbol?: string;
    bestApprovedRrSymbol?: string;
    bestApprovedRejectedRatioSymbol?: string;
    cleanestSymbol?: string;
  };
  monteCarloOutcomes?: IctMonteCarloTradeOutcome[];
  authority: IctRealReplayRunResult["authority"];
  safety: IctRealReplayRunResult["safety"];
}

export interface IctMarketScorecardJournalEvent {
  eventType: "ict_market_scorecard_summary";
  journalEventId: string;
  runId: string;
  generatedAt: string;
  requestedSymbols: string[];
  completedSymbols: number;
  unavailableSymbols: number;
  researchPreferredSymbols: string[];
  watchlistOnlySymbols: string[];
  noisySymbols: string[];
  bestApprovedTargetFirstSymbol?: string;
  bestApprovedRrSymbol?: string;
  bestApprovedRejectedRatioSymbol?: string;
  totalSymbols: number;
  researchOnly: true;
  authority: IctMarketScorecard["authority"];
  safety: IctMarketScorecard["safety"];
}
