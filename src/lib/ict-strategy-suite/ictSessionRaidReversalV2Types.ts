import type {
  IctSessionRaidReversalAuthority,
  IctSessionRaidReversalInput,
  IctSessionRaidReversalNarrative
} from "./ictSessionRaidReversalTypes";

export type IctSessionRaidReversalV2StrategyId = "nasdaq_london_raid_ny_reversal_v2_filtered_research";

export type IctSessionRaidReversalV2FailedFilter =
  | "base_v1_not_complete"
  | "source_mock_sample"
  | "source_fingerprint_missing"
  | "weak_displacement_body"
  | "fvg_too_small"
  | "fvg_too_large"
  | "fvg_retrace_too_deep"
  | "raid_too_extended"
  | "stop_too_wide"
  | "target_feasibility_weak"
  | "high_rr_trap";

export type IctSessionRaidReversalV2Outcome =
  | "target_first"
  | "invalidation_first"
  | "partial"
  | "stalled"
  | "not_replay_ready"
  | "insufficient_future_candles";

export interface IctSessionRaidReversalV2Thresholds {
  minDisplacementBodySize: number;
  minFvgSize: number;
  maxFvgSize: number;
  maxRetraceDepthPercent: number;
  maxRaidDistanceAboveLondonHigh: number;
  maxStopDistance: number;
  minTargetFeasibilityScore: number;
  maxRrWithoutStrongFeasibility: number;
  strongFeasibilityScore: number;
}

export interface IctSessionRaidReversalV2Telemetry {
  strategyId: IctSessionRaidReversalV2StrategyId;
  baseStrategyId: "nasdaq_london_raid_ny_reversal_v1";
  baseCandidateId: string;
  tradingDate?: string;
  requestedSymbol: string;
  brokerSymbol: string;
  sourceProvider: string;
  sourceFingerprint?: string;
  passedV2: boolean;
  failedFilters: IctSessionRaidReversalV2FailedFilter[];
  displacementBodySize?: number;
  fvgSize?: number;
  retraceDepthPercent?: number;
  raidDistanceAboveLondonHigh?: number;
  stopDistance?: number;
  targetDistance?: number;
  targetFeasibilityScore?: number;
  rr?: number;
  selectedTargetType?: string;
  outcome: IctSessionRaidReversalV2Outcome;
  outcomeTimestamp?: string;
  thresholdSet: IctSessionRaidReversalV2Thresholds;
  authority: IctSessionRaidReversalAuthority;
}

export interface IctSessionRaidReversalV2Evaluation {
  strategyId: IctSessionRaidReversalV2StrategyId;
  baseStrategyId: "nasdaq_london_raid_ny_reversal_v1";
  baseStatus: IctSessionRaidReversalNarrative["status"];
  status: "filtered_research_candidate" | "filtered_out" | "needs_more_data" | "rejected";
  researchOnly: true;
  replayRequired: true;
  paperDemoEligible: false;
  walkForwardReady: false;
  telemetry: IctSessionRaidReversalV2Telemetry;
  nextAction: string;
  authority: IctSessionRaidReversalAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface IctSessionRaidReversalV2Input extends IctSessionRaidReversalInput {
  thresholds?: Partial<IctSessionRaidReversalV2Thresholds>;
}
