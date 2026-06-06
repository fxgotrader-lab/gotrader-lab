import type { IctAdvisorSignal } from "./ictAdvisorTypes";
import type { IctIndexComparisonCandles, IctSmtSignal } from "./ictIndexSmtTypes";
import type {
  IctNewsRiskLevel,
  IctNewsSessionRiskContextInput,
  IctRiskGovernorAction,
  IctSessionName,
  IctSessionRiskState
} from "./ictNewsSessionRiskTypes";
import type {
  IctDataDepthStatus,
  IctSessionDirectionalRead,
  IctSessionNarrativeProfile
} from "./ictSessionNarrativeTypes";

export type IctReplayOutcome =
  | "target_first"
  | "invalidation_first"
  | "partial_target"
  | "stalled"
  | "no_trade"
  | "insufficient_future_candles";

export type IctFvgReplayStatus =
  | "respected"
  | "partially_mitigated"
  | "fully_mitigated"
  | "ignored"
  | "not_applicable";

export interface IctReplayInput {
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  candles: unknown[];
  htfCandles?: Record<string, unknown[]>;
  indexComparisonCandles?: IctIndexComparisonCandles | Record<string, unknown[]>;
  newsSessionRiskContext?: IctNewsSessionRiskContextInput;
  replayWindowSize: number;
  lookaheadCandles: number;
  maxReplayWindows?: number;
  requestedLookbackDays?: number;
  availableLookbackDays?: number;
  dataDepthStatus?: IctDataDepthStatus;
  appendJournal?: boolean;
  researchOnly: true;
}

export interface IctReplayTradePath {
  signalTime: string;
  entryReference?: number;
  invalidation?: number;
  target?: number;
  maxFavorableExcursion?: number;
  maxAdverseExcursion?: number;
  candlesToTarget?: number;
  candlesToInvalidation?: number;
  rrAchieved?: number;
}

export interface IctReplayResult {
  strategyId: IctAdvisorSignal["strategyId"];
  phase: IctAdvisorSignal["phase"];
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  side: "long" | "short" | "flat";
  setup: IctAdvisorSignal["setup"];
  decision: "research_only" | "no_trade";
  confidence: number;
  htfAligned?: boolean;
  dealingRangeLocation?: "premium" | "discount" | "equilibrium";
  liquidityTargetType?: string;
  orderBlockVariant?: string;
  approvedProfileStatus?: string;
  smtDivergenceType?: IctSmtSignal["divergenceType"];
  smtConfirmsCandidate?: boolean;
  smtRejectsCandidate?: boolean;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  smtConfidenceAdjustment?: number;
  smtReason?: string;
  newsRiskLevel?: IctNewsRiskLevel;
  sessionRiskState?: IctSessionRiskState;
  riskGovernorAction?: IctRiskGovernorAction;
  riskGovernorConfidenceAdjustment?: number;
  blockingEventsCount?: number;
  cautionEventsCount?: number;
  sessionName?: IctSessionName;
  newsSessionRiskNotes?: string[];
  sessionNarrativeProfile?: IctSessionNarrativeProfile;
  sessionDirectionalRead?: IctSessionDirectionalRead;
  sessionNarrativeConfidence?: number;
  sessionMitigationDetected?: boolean;
  dataDepthStatus?: IctDataDepthStatus;
  availableLookbackDays?: number;
  requestedLookbackDays?: number;
  sessionNarrativeReasons?: string[];
  rrEstimate?: number;
  outcome: IctReplayOutcome;
  fvgStatus: IctFvgReplayStatus;
  tradePath: IctReplayTradePath;
  noTradeReasons: string[];
  riskNotes: string[];
  summary: string;
  researchOnly: true;
  provenance: {
    methodology: "ICT";
    sourceSet: "ICT Mentorship Core Content";
    replay: true;
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctReplayStrategySummary {
  totalSignals: number;
  targetFirstCount: number;
  invalidationFirstCount: number;
  targetFirstRate: number;
  averageRrAchieved: number;
}

export interface IctReplaySummary {
  symbol: string;
  primaryTimeframe: string;
  totalWindows: number;
  totalSignals: number;
  totalNoTrades: number;
  targetFirstCount: number;
  invalidationFirstCount: number;
  partialTargetCount: number;
  stalledCount: number;
  insufficientFutureCandlesCount: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  averageRrAchieved: number;
  mostCommonNoTradeReasons: Array<{ reason: string; count: number }>;
  byStrategyId: Record<string, IctReplayStrategySummary>;
  researchOnly: true;
}

export interface IctReplayJournalEvent {
  eventType: "ict_replay_result";
  journalEventId: string;
  strategyId: IctAdvisorSignal["strategyId"];
  phase: IctAdvisorSignal["phase"];
  symbol: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  signalTime: string;
  side: IctReplayResult["side"];
  setup: IctReplayResult["setup"];
  decision: IctReplayResult["decision"];
  confidence: number;
  outcome: IctReplayOutcome;
  fvgStatus: IctFvgReplayStatus;
  orderBlockVariant?: string;
  approvedProfileStatus?: string;
  smtDivergenceType?: IctSmtSignal["divergenceType"];
  smtConfirmsCandidate?: boolean;
  smtRejectsCandidate?: boolean;
  relativeStrengthLeader?: string;
  relativeWeaknessLeader?: string;
  smtConfidenceAdjustment?: number;
  smtReason?: string;
  newsRiskLevel?: IctNewsRiskLevel;
  sessionRiskState?: IctSessionRiskState;
  riskGovernorAction?: IctRiskGovernorAction;
  riskGovernorConfidenceAdjustment?: number;
  blockingEventsCount?: number;
  cautionEventsCount?: number;
  sessionName?: IctSessionName;
  newsSessionRiskNotes?: string[];
  sessionNarrativeProfile?: IctSessionNarrativeProfile;
  sessionDirectionalRead?: IctSessionDirectionalRead;
  sessionMitigationDetected?: boolean;
  dataDepthStatus?: IctDataDepthStatus;
  entryReference?: number;
  invalidation?: number;
  target?: number;
  maxFavorableExcursion?: number;
  maxAdverseExcursion?: number;
  candlesToTarget?: number;
  candlesToInvalidation?: number;
  rrAchieved?: number;
  noTradeReasons: string[];
  riskNotes: string[];
  researchOnly: true;
}

export interface IctReplayValidationReport {
  replayId: string;
  generatedAt: string;
  input: Omit<IctReplayInput, "candles" | "htfCandles" | "indexComparisonCandles" | "newsSessionRiskContext"> & {
    candleCount: number;
    indexComparisonSourceCount?: number;
    newsSessionRiskContextStatus?: "synthetic_no_risk" | "provided" | "unavailable";
  };
  summary: IctReplaySummary;
  results: IctReplayResult[];
  journalEvents: IctReplayJournalEvent[];
  safetyLocks: {
    rawCandlesIncluded: false;
    rawSnapshotsIncluded: false;
    secretsIncluded: false;
    accountDataIncluded: false;
    orderDataIncluded: false;
    positionDataIncluded: false;
  };
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  researchOnly: true;
}
