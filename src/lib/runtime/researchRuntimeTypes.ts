import type { ResolvedBacktestConfig } from "@/lib/backtesting";
import type { EvidenceCategory, EvidenceLedgerSummary } from "@/lib/evidence";
import type { LLMAdvisoryRun, LLMProviderStatus } from "@/lib/llm";
import type { ResearchMaturitySummary } from "@/lib/maturity";
import type { RegimeClassification } from "@/lib/regime";
import type {
  TradingViewMcpStatus,
  TradingViewEvidence,
  TradingViewMcpChartFeedStatus,
  TradingViewMcpFeedUsageMode,
  TradingViewMcpResearchEligibilityState,
  TradingViewMcpRuntimeState,
  TradingViewMcpAutoRefreshState
} from "@/lib/integrations/tradingview";
import type {
  CandleDataSourceMode,
  CandleWindowSettings,
  ImportedCandleActivationStatus,
  LiveMarketDataStatus,
  PreparedCandleSource,
  WalkForwardDataPreset
} from "@/lib/marketData";
import type { CanonicalCandleSourceSummary } from "@/lib/candleSources";
import type { CanonicalPerformanceMetrics } from "@/lib/performance/canonicalMetrics";
import type { SimulatedAccount } from "@/lib/performance/simulatedAccount";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type {
  GrinchPhase1ModelOutput,
  GrinchPhase2ReversalModelOutput,
  GrinchPhase3ConsolidationModelOutput,
  GrinchPhase4SmtModelOutput,
  GrinchStrategyScore
} from "@/lib/strategyLibrary";
import type {
  ResearchCycleBacktestSummary,
  ResearchCycleQualitySummary,
  ResearchCycleRun,
  ResearchCycleValidationSummary
} from "@/lib/researchCycle/researchCycleTypes";
import type { ActiveResearchCalibration, CalibrationProposal, CalibrationProposalChanges, CalibrationProposalMetricsSnapshot } from "@/lib/selfImprovement";
import type { FuturesSymbol, Timeframe, TradeThesis } from "@/lib/types";
import type { WalkForwardRun, WalkForwardStabilitySummary } from "@/lib/walkForward";

export type RuntimeDataPreset = "mock" | "safe" | "standard" | "advanced" | "custom";
export type RuntimeBridgeStatus = "not_checked" | "running" | "not_running" | "unknown";
export type MetricSourceType = "latest_cycle" | "proposal_snapshot" | "active_baseline" | "recomputed_preview";

export interface RunFingerprint {
  fingerprintId: string;
  runId?: string;
  cycleId?: string;
  proposalId?: string;
  sourceCandidateId?: string;
  dataSource: string;
  symbol: string;
  timeframe: string;
  rawCandleCount: number;
  processedCandleCount: number;
  candleWindow: string;
  dataPreset: RuntimeDataPreset;
  activeCalibrationId?: string;
  configMergeStatus: string;
  llmReviewerSchemaVersion: string;
  llmRunId?: string;
  generatedAt: string;
  metricSourceType: MetricSourceType;
  label: string;
  compactLabel: string;
}

export interface MetricProvenance {
  fingerprint: RunFingerprint;
  metricSourceLabel: string;
  rows: Array<{ label: string; value: string }>;
  mismatchWarnings: string[];
}

export interface RuntimeFingerprintState {
  activeBaseline: RunFingerprint;
  latestCycle?: RunFingerprint;
  proposalSnapshot?: RunFingerprint;
}

export interface RuntimeMetricProvenanceState {
  activeBaseline: MetricProvenance;
  latestCycle?: MetricProvenance;
  proposalSnapshot?: MetricProvenance;
  mismatchWarnings: string[];
}

export interface RuntimeMarketDataState {
  activeDataSource: CandleDataSourceMode;
  activeChartSource: CanonicalCandleSourceSummary;
  activeResearchSource: CanonicalCandleSourceSummary;
  activeWalkForwardSource: CanonicalCandleSourceSummary;
  allAvailableSources: CanonicalCandleSourceSummary[];
  canonicalSourceWarnings: string[];
  activeResearchSourceLabel: string;
  activeChartDisplaySourceLabel: string;
  chartDisplayUsesTradingViewMcp: boolean;
  researchUsesTradingViewMcp: boolean;
  chartDisplayWarning?: string;
  chartDisplayCandleCount: number;
  chartDisplayDataFingerprint: string;
  chartDisplayFirstClose?: number;
  chartDisplayFirstTimestamp?: string;
  chartDisplayLastClose?: number;
  chartDisplayLastTimestamp?: string;
  chartDisplaySourceKey: string;
  importedDataFingerprint: string;
  researchDataFingerprint: string;
  researchSourceKey: string;
  tradingViewMcpDataFingerprint: string;
  activeImportId?: string;
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
  importedDatasetCount: number;
  importedDataStatus: ImportedCandleActivationStatus;
  importedDataMessage: string;
  importedDataMissing: boolean;
  activeImportIdStale: boolean;
  fallbackToMock: boolean;
  liveMarketDataStatus: LiveMarketDataStatus;
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
  grinchPhase1Summary?: GrinchPhase1ModelOutput;
  grinchPhase2ReversalSummary?: GrinchPhase2ReversalModelOutput;
  grinchPhase3ConsolidationSummary?: GrinchPhase3ConsolidationModelOutput;
  grinchPhase4SmtSummary?: GrinchPhase4SmtModelOutput;
  grinchStrategyScore?: GrinchStrategyScore;
  smtSummary?: {
    smtState: GrinchPhase4SmtModelOutput["smtState"];
    primaryPair: GrinchPhase4SmtModelOutput["primaryPair"];
    divergenceType: GrinchPhase4SmtModelOutput["divergenceType"];
    supportsBias: GrinchPhase4SmtModelOutput["supportsBias"];
    supportsActiveProfile: GrinchPhase4SmtModelOutput["supportsActiveProfile"];
    confidenceAdjustment: number;
    conflictWarning?: string;
    detail: string;
  };
  activeGrinchProfileSummary?: {
    profile: "model_1" | "reversal" | "consolidation" | "none";
    state: string;
    entryIntent: string;
    timingGrade: string;
    grinchModelScore?: number;
    falsePositiveRisk?: number;
    setupQuality?: GrinchStrategyScore["setupQuality"];
    hardGateReason?: GrinchStrategyScore["hardGateReason"];
    fallbackState?: GrinchStrategyScore["fallbackState"];
    fallbackProfileUsed?: GrinchStrategyScore["fallbackProfileUsed"];
    noValidProfile?: boolean;
    expiredTimingBlocks?: number;
    weakProfileBlocks?: number;
    reversalCandidates?: number;
    consolidationCandidates?: number;
    noValidProfileCount?: number;
    tradeProducingProfile?: "model_1" | "reversal" | "consolidation" | "none";
    primaryRuleBlock?: string;
    improvedLatestRun?: boolean;
    detail: string;
  };
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
  latestProposalIsCurrent: boolean;
  latestProposalIsHistorical: boolean;
  proposalSourceMismatchReason?: string;
  currentActionItems: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "info" | "warning" | "critical" | "action_required";
    href?: string;
  }>;
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

export interface RuntimeEvidenceState {
  evidenceQualityScore: number;
  evidenceLedgerSummary: EvidenceLedgerSummary;
  weakestEvidenceCategories: EvidenceCategory[];
  readinessEvidenceWarnings: string[];
}

export interface RuntimeMaturityState {
  maturitySummary: ResearchMaturitySummary;
  maturityWarnings: string[];
  maturityGrade: ResearchMaturitySummary["grade"];
  maturityScore: number;
  nextMaturityRequirement: string;
}

export interface RuntimeWalkForwardState {
  latestRun?: WalkForwardRun;
  latestRunId?: string;
  latestStatus?: WalkForwardRun["status"];
  latestTimestamp?: string;
  dataPreset?: WalkForwardDataPreset;
  stability?: WalkForwardStabilitySummary;
  stabilityScore?: number;
  verdict?: WalkForwardStabilitySummary["verdict"];
  overfitRisk?: WalkForwardStabilitySummary["overfitRisk"];
  windowsTested: number;
  outOfSampleWindowsPassed: number;
  proposalValidated: boolean;
  failureDiagnostics?: WalkForwardRun["failureDiagnostics"];
  followUpPlan?: WalkForwardRun["followUpPlan"];
  recommendedNextAction: string;
  warnings: string[];
}

export interface RuntimeTradingViewMcpState {
  runtime: TradingViewMcpRuntimeState;
  status: TradingViewMcpStatus;
  bridgeUrl: string;
  bridgeStatus: TradingViewMcpRuntimeState["bridgeStatus"];
  evidenceAvailable: boolean;
  latestEvidence?: TradingViewEvidence;
  latestEvidenceTimestamp?: string;
  chartFeedStatus: TradingViewMcpRuntimeState["chartFeedStatus"];
  chartFeedAvailable: boolean;
  chartFeedCandleCount: number;
  chartFeedRequestedLimit?: number;
  chartFeedEffectiveLimit?: number;
  chartFeedReturnedCount?: number;
  chartFeedUpstreamMaxBars?: number;
  chartFeedUpstreamTotalAvailable?: number;
  chartFeedResearchMinimumCandles?: number;
  chartFeedDepthStatus?: TradingViewMcpRuntimeState["chartFeedDepthStatus"];
  chartFeedDepthWarning?: string;
  chartFeedNextRecommendedAction?: string;
  chartFeedFirstTimestamp?: string;
  chartFeedSourceLabel: string;
  chartFeedMatchState: string;
  chartFeedLastTimestamp?: string;
  chartFeedSymbol?: string;
  chartFeedTimeframe?: string;
  chartFeedLatestPrice?: number;
  chartFeedStorageBackend?: string;
  chartFeedCandlesPersisted: boolean;
  chartFeedId?: string;
  autoRefresh: TradingViewMcpAutoRefreshState;
  tradingViewMcpCandleStatus: TradingViewMcpChartFeedStatus | "not_active";
  researchEligibility: TradingViewMcpResearchEligibilityState | "ineligible_disconnected" | "not_active";
  eligibilityReasons: string[];
  candleCount: number;
  symbolMatch: boolean;
  timeframeMatch: boolean;
  activeForResearch: boolean;
  usageMode: TradingViewMcpFeedUsageMode | "none" | "not_active";
  chartBias: TradingViewEvidence["chartBias"] | "unavailable";
  confidence: number;
  authorityLabel: "analysis_only";
  warnings: string[];
}

export interface RuntimeRegimeState {
  current: RegimeClassification;
  label: RegimeClassification["stableLabel"];
  instantaneousLabel: RegimeClassification["instantaneousLabel"];
  confidence: number;
  dataQuality: RegimeClassification["dataQuality"];
  transitionPending: boolean;
  supportingFactors: string[];
  warnings: string[];
  recommendedBehavior: string;
  sourceFingerprint: string;
  historyStorage: "browser_compact_history";
  jsonlHistoryPath: "state/regime_history.jsonl";
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
  evidence: RuntimeEvidenceState;
  maturity: RuntimeMaturityState;
  walkForward: RuntimeWalkForwardState;
  tradingViewMcp: RuntimeTradingViewMcpState;
  regime: RuntimeRegimeState;
  fingerprints: RuntimeFingerprintState;
  metricProvenance: RuntimeMetricProvenanceState;
  diagnostics: RuntimeDiagnosticsState;
}

export interface ResolveResearchRuntimeSnapshotOptions {
  labState?: import("@/lib/types").LabState;
  preparedCandleSource?: PreparedCandleSource;
  bridgeStatus?: RuntimeBridgeStatus;
}
