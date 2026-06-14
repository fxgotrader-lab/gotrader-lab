import type { IctApprovedSetupDecision } from "./ictApprovedSetupProfileTypes";
import type { IctReplayResult } from "./ictReplayValidationTypes";

export type IctCmdTelemetryOutcome =
  | "target_first"
  | "invalidation_first"
  | "stalled"
  | "no_trade"
  | "insufficient_data";

export type IctCmdTelemetryQuality = "missing" | "weak" | "partial" | "strong";

export type IctCmdTelemetryBucket = "missing" | "low" | "medium" | "high" | "extreme";

export interface IctCmdTelemetryAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface IctCmdTelemetryHtfContext {
  alignmentStatus: "aligned" | "partially_aligned" | "mixed" | "conflicted" | "missing" | "not_required_for_model";
  W1?: string;
  D1?: string;
  H4?: string;
  H1?: string;
  M15?: string;
  M5?: string;
  setupDirection: "long" | "short" | "flat";
  conflictReason?: string;
}

export interface IctCmdCandidateTelemetry {
  candidateId: string;
  tradingDate: string;
  session: string;
  side: "long" | "short" | "flat";
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  htfContext: IctCmdTelemetryHtfContext;
  sourceFingerprint: string;
  consolidationRangeSize?: number;
  consolidationDuration?: number;
  manipulationSide?: "buy_side" | "sell_side" | "unknown";
  manipulationDepth?: number;
  sweepType?: string;
  sweepQuality: IctCmdTelemetryQuality;
  expansionDistance?: number;
  displacementScore: number;
  displacementScoreBucket: IctCmdTelemetryBucket;
  fvgPresent: boolean;
  fvgRespected: boolean;
  externalLiquidityTargetPresent: boolean;
  targetDistance?: number;
  invalidationDistance?: number;
  rr?: number;
  rrBucket: IctCmdTelemetryBucket;
  smtState?: "confirms" | "rejects" | "neutral" | "insufficient_data" | "unknown";
  htfAlignment: IctCmdTelemetryHtfContext["alignmentStatus"];
  premiumDiscountContext?: string;
  sessionNarrative?: string;
  newsRiskState?: string;
  modelState?: string;
  modelConfidence?: number;
  candidateLane?: IctApprovedSetupDecision["status"] | "unscored";
  outcome: IctCmdTelemetryOutcome;
  blockerReasons: string[];
  authority: IctCmdTelemetryAuthority;
  researchOnly: true;
}

export interface IctCmdTelemetryBuildInput {
  result: IctReplayResult;
  decision?: IctApprovedSetupDecision;
  sourceFingerprint: string;
  fallbackHtfContext?: Partial<IctCmdTelemetryHtfContext>;
}

export interface IctCmdTelemetryFeatureComparison {
  winnerCount: number;
  loserCount: number;
  differentiators: Array<{
    feature: string;
    winnerValue: string | number;
    loserValue: string | number;
    note: string;
  }>;
}

export interface IctCmdVariantDiscoveryResult {
  variantId: string;
  description: string;
  candidateCount: number;
  targetFirstRate: number;
  invalidationFirstRate: number;
  uniqueTradingDates: number;
  activeRollingWindows: number;
  overfitRisk: boolean;
  deservesFutureExecutableVariantTest: boolean;
  blocker?: string;
}

export interface IctCmdTelemetrySummary {
  totalTelemetry: number;
  paperWatchlistTelemetry: number;
  winningTelemetry: number;
  losingTelemetry: number;
  uniqueTradingDates: number;
  activeRollingWindows: number;
  countBySession: Record<string, number>;
  countBySide: Record<string, number>;
  countByHtfAlignment: Record<string, number>;
  countByDisplacementScoreBucket: Record<string, number>;
  countByFvgRespected: Record<string, number>;
  countBySweepQuality: Record<string, number>;
  countByRrBucket: Record<string, number>;
  countByExternalLiquidityTarget: Record<string, number>;
  countByConsolidationRangeSizeBucket: Record<string, number>;
  authority: IctCmdTelemetryAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
  researchOnly: true;
}
