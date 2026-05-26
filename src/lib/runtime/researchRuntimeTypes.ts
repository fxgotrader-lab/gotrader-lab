import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import type { LLMAdvisoryRun, LLMProviderStatus } from "@/lib/llm";
import type { CandleDataSourceMode, CandleWindowSettings, PreparedCandleSource } from "@/lib/marketData";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type { SimulatedAccount } from "@/lib/performance/simulatedAccount";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type {
  ResearchCycleBacktestSummary,
  ResearchCycleQualitySummary,
  ResearchCycleRun,
  ResearchCycleValidationSummary
} from "@/lib/researchCycle/researchCycleTypes";
import type { ActiveResearchCalibration, CalibrationProposal, CalibrationProposalChanges, CalibrationProposalMetricsSnapshot } from "@/lib/selfImprovement";
import type { FuturesSymbol, Timeframe, TradeThesis } from "@/lib/types";

export type RuntimeDataPreset = "mock" | "safe" | "standard" | "advanced" | "custom";
export type RuntimeBridgeStatus = "not_checked" | "running" | "not_running" | "unknown";

export interface RuntimeMarketDataState {
  activeDataSource: CandleDataSourceMode;
  sourceLabel: string;
  symbol: FuturesSymbol;
  contract?: string;
  timeframe: Timeframe;
  rawCandleCount: number;
  researchWindow: number;
  processedCandleCount: number;
  dataPreset: RuntimeDataPreset;
  isImportedDataActive: boolean;
  isMockDataActive: boolean;
  preparedSource: PreparedCandleSource;
}

export interface RuntimeActiveConfigState {
  resolvedBacktestConfig: ResolvedBacktestConfig;
  defaultConfig: ResolvedBacktestConfig;
  savedConfig: ResolvedBacktestConfig;
  activeResearchCalibration?: ActiveResearchCalibration;
  activeCalibrationId?: string;
  appliedConfigPatch?: CalibrationProposalChanges;
  configMergeStatus: string;
  configMergeStatusLabel: string;
  resolvedConfluenceThreshold: number;
}

export interface RuntimeResearchCycleState {
  latestCycleId?: string;
  latestCycleStatus?: ResearchCycleRun["status"];
  latestCycleTimestamp?: string;
  latestCycleMetrics?: CanonicalPerformanceMetrics;
  latestThesisSummary?: ResearchCycleRun["thesisSummary"] | Pick<TradeThesis, "id" | "symbol" | "timeframe" | "finalBias" | "confidence" | "thesisSummary">;
  latestBacktestSummary?: ResearchCycleBacktestSummary;
  latestValidationSummary?: ResearchCycleValidationSummary;
  latestResearchQualitySummary?: ResearchCycleQualitySummary;
  latestReadinessSummary?: ReadinessGateSnapshot;
  latestRun?: ResearchCycleRun;
}

export interface RuntimeLLMState {
  bridgeStatus: RuntimeBridgeStatus;
  providerStatus: LLMProviderStatus;
  providerConfigured: boolean;
  latestLLMRun?: LLMAdvisoryRun;
  missingReviewers: string[];
  unsafeRejections: number;
  advisoryPassed: boolean;
  readinessImpact: string;
}

export interface RuntimeProposalState {
  latestProposalId?: string;
  latestProposal?: CalibrationProposal;
  latestProposalSnapshot?: CalibrationProposalMetricsSnapshot;
  activeApprovedProposalId?: string;
  proposalSourceCycleId?: string;
}

export interface RuntimeReadinessState {
  readinessState: ReadinessGateSnapshot["state"];
  readinessSnapshot: ReadinessGateSnapshot;
  actualBlockers: string[];
  passedRequirements: string[];
  warnings: string[];
  nextAction: string;
}

export interface RuntimePerformanceState {
  canonicalPerformanceMetrics?: CanonicalPerformanceMetrics;
  simulatedAccountSummary: SimulatedAccount;
}

export interface RuntimeDiagnosticsState {
  sourceTrace: string[];
  staleStateWarnings: string[];
  mismatchWarnings: string[];
  storageKeysUsed: string[];
}

export interface ResearchRuntimeSnapshot {
  snapshotId: string;
  generatedAt: string;
  marketData: RuntimeMarketDataState;
  activeConfig: RuntimeActiveConfigState;
  latestResearchCycle: RuntimeResearchCycleState;
  llm: RuntimeLLMState;
  proposal: RuntimeProposalState;
  readiness: RuntimeReadinessState;
  performance: RuntimePerformanceState;
  diagnostics: RuntimeDiagnosticsState;
}

export interface ResolveResearchRuntimeSnapshotOptions {
  labState?: import("@/lib/types").LabState;
  preparedCandleSource?: PreparedCandleSource;
  bridgeStatus?: RuntimeBridgeStatus;
}
