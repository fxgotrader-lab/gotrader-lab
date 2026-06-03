import type { CanonicalCandleProvider } from "@/lib/candleSources";
import type { ResearchCycleStatus } from "@/lib/researchCycle/researchCycleTypes";

export type GoTraderResearchMemoryType =
  | "research_cycle"
  | "walk_forward"
  | "self_improvement"
  | "gap_analysis"
  | "agent_metric";

export type GoTraderResearchMemoryMetricStatus =
  | "real"
  | "simulated"
  | "mock"
  | "default"
  | "insufficient"
  | "unavailable";

export type GoTraderResearchMemoryExclusion =
  | "candle_arrays"
  | "raw_runtime_snapshot"
  | "secrets"
  | "account_order_position_data"
  | "screenshots_base64"
  | "imported_ohlcv_arrays";

export interface GoTraderResearchMemoryAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface GoTraderResearchMemorySourceContext {
  provider: CanonicalCandleProvider | "unknown" | string;
  sourceLabel: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe?: string;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceFingerprint?: string;
  sourceEligibility?: string;
  eligibilityReasons: string[];
  warnings: string[];
  proxyLabel?: string;
}

export interface GoTraderResearchMemoryRegimeContext {
  label: string;
  instantaneousLabel?: string;
  stableLabel?: string;
  confidence: number | null;
  dataQuality: string;
  transitionPending: boolean;
  candleCount: number;
  requiredCandleCount?: number | null;
  missingInputs: string[];
  supportingFactors: string[];
  warnings: string[];
  sourceFingerprint?: string;
}

export interface GoTraderResearchMemoryIctThesis {
  thesisId?: string;
  bias?: string;
  ictBias?: string;
  confidence?: number | null;
  confluenceScore?: number | null;
  summary: string;
}

export interface GoTraderResearchMemoryGrinchContext {
  profile: string;
  state?: string;
  entryIntent?: string;
  timingGrade?: string;
  blocker?: string;
  noValidProfile?: boolean;
  tradeProducingProfile?: string;
  detail?: string;
}

export interface GoTraderResearchMemoryMetrics {
  netR: number | null;
  averageR: number | null;
  profitFactor: number | null;
  winRate: number | null;
  maxDrawdownR: number | null;
  sampleSize: number;
  falsePositiveRate: number | null;
  processedCandles: number;
  rawCandles: number;
  metricStatus: GoTraderResearchMemoryMetricStatus;
}

export interface GoTraderResearchMemoryReadiness {
  state: string;
  recommendedNextStep: string;
  failedRequirements: string[];
  warnings: string[];
}

export interface GoTraderResearchMemoryEvidenceMaturity {
  evidenceScore: number | null;
  maturityScore: number | null;
  maturityGrade?: string;
  weakestEvidenceCategories: string[];
  maturityWarnings: string[];
}

export interface GoTraderResearchMemoryWalkForwardVerdict {
  runId?: string;
  status?: string;
  verdict?: string;
  stabilityScore?: number | null;
  windowsTested?: number;
  outOfSampleWindowsPassed?: number;
  warnings: string[];
}

export interface GoTraderResearchMemoryBase {
  packetId: string;
  timestamp: string;
  memoryType: GoTraderResearchMemoryType;
  source: GoTraderResearchMemorySourceContext;
  regime: GoTraderResearchMemoryRegimeContext;
  ictThesis: GoTraderResearchMemoryIctThesis | null;
  grinch: GoTraderResearchMemoryGrinchContext;
  metrics: GoTraderResearchMemoryMetrics;
  readiness: GoTraderResearchMemoryReadiness;
  evidenceMaturity: GoTraderResearchMemoryEvidenceMaturity;
  walkForwardVerdict: GoTraderResearchMemoryWalkForwardVerdict | null;
  blockers: string[];
  nextAction: string;
  authority: GoTraderResearchMemoryAuthority;
  exclusions: GoTraderResearchMemoryExclusion[];
}

export interface GoTraderResearchCycleMemory extends GoTraderResearchMemoryBase {
  memoryType: "research_cycle";
  cycleId?: string;
  cycleStatus?: ResearchCycleStatus;
  completedAt?: string;
  resultSummary?: string;
  advisoryStatus: "available" | "unavailable" | "skipped" | "unknown";
  sourceEligibility?: string;
}

export interface GoTraderWalkForwardMemory extends GoTraderResearchMemoryBase {
  memoryType: "walk_forward";
  runId?: string;
  splitSummary?: string;
  outOfSampleWindowsPassed?: number;
  windowsTested?: number;
}

export interface GoTraderSelfImprovementMemory extends GoTraderResearchMemoryBase {
  memoryType: "self_improvement";
  proposalId?: string;
  proposalStatus?: string;
  beforeAfterDelta?: string;
  regressionWarnings: string[];
}

export interface GoTraderGapAnalysisMemory extends GoTraderResearchMemoryBase {
  memoryType: "gap_analysis";
  recurringGapIds: string[];
  missingEvidence: string[];
  recommendedExperiments: string[];
}

export interface GoTraderAgentMetricMemory extends GoTraderResearchMemoryBase {
  memoryType: "agent_metric";
  agentId: string;
  agentLabel: string;
  metricStatus: GoTraderResearchMemoryMetricStatus;
  sampleSize: number;
  lastUpdatedCycleId?: string;
  regimeContext?: string;
}

export type GoTraderResearchMemoryPacket =
  | GoTraderResearchCycleMemory
  | GoTraderWalkForwardMemory
  | GoTraderSelfImprovementMemory
  | GoTraderGapAnalysisMemory
  | GoTraderAgentMetricMemory;

export const gotraderResearchMemoryAuthorityNone: GoTraderResearchMemoryAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const gotraderResearchMemoryExcludedSections: GoTraderResearchMemoryExclusion[] = [
  "candle_arrays",
  "raw_runtime_snapshot",
  "secrets",
  "account_order_position_data",
  "screenshots_base64",
  "imported_ohlcv_arrays"
];
