import type { CanonicalCandleProvider } from "@/lib/candleSources";

export type ResearchDecisionVerdict =
  | "observe"
  | "reject_current_setup"
  | "run_walk_forward"
  | "run_calibration_test"
  | "collect_more_data"
  | "draft_self_improvement_proposal";

export type ResearchDecisionExclusion =
  | "candle_arrays"
  | "raw_runtime_snapshot"
  | "secrets"
  | "account_order_position_data"
  | "raw_logs"
  | "screenshots_base64";

export interface ResearchDecisionAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface ResearchDecisionSourceContext {
  provider: CanonicalCandleProvider | "unknown" | string;
  sourceLabel: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe?: string;
  sourceFingerprint?: string;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceEligibility?: string;
  proxyLabel?: string;
  warnings: string[];
}

export interface ResearchDecisionRegimeContext {
  label: string;
  confidence?: number | null;
  dataQuality?: string;
  missingInputs: string[];
}

export interface ResearchDecisionIctContext {
  thesisId?: string;
  bias?: string;
  ictBias?: string;
  confidence?: number | null;
  summary?: string;
}

export interface ResearchDecisionGrinchContext {
  selectedProfile: string;
  state?: string;
  timingGrade?: string;
  blocker?: string;
  detail?: string;
  expansionReplayResult?: {
    title: string;
    timingDate?: string;
    timingZone?: string;
    failedRule?: string;
    failureReason?: string;
    nearMissScore?: number;
    recommendation?: string;
  };
}

export interface ResearchDecisionMetrics {
  trades: number;
  winRate: number | null;
  averageR: number | null;
  drawdown: number | null;
  profitFactor: number | null;
  falsePositiveRate: number | null;
}

export interface ResearchDecisionWalkForwardContext {
  runId?: string;
  verdict?: string;
  windowsTested: number;
  outOfSampleWindowsPassed: number;
  stabilityScore?: number | null;
  warnings: string[];
}

export interface ResearchDecisionQualityContext {
  evidenceScore: number | null;
  maturityScore: number | null;
  maturityGrade?: string;
}

export interface ResearchDecisionReadinessContext {
  state: string;
  recommendedNextStep: string;
  blockers: string[];
  warnings: string[];
}

export interface ResearchDecisionLogEntry {
  decisionId: string;
  timestamp: string;
  cycleId?: string;
  source: ResearchDecisionSourceContext;
  regime: ResearchDecisionRegimeContext;
  ictThesis: ResearchDecisionIctContext | null;
  grinch: ResearchDecisionGrinchContext;
  metrics: ResearchDecisionMetrics;
  walkForward: ResearchDecisionWalkForwardContext | null;
  quality: ResearchDecisionQualityContext;
  readiness: ResearchDecisionReadinessContext;
  blockers: string[];
  finalResearchVerdict: ResearchDecisionVerdict;
  finalResearchVerdictReason: string;
  authority: ResearchDecisionAuthority;
  exclusions: ResearchDecisionExclusion[];
}

export type ResearchReflectionSupport =
  | "supported"
  | "not_supported"
  | "needs_more_evidence"
  | "none";

export interface ResearchReflectionMemory {
  reflectionId: string;
  timestamp: string;
  decisionId: string;
  whatWorked: string[];
  whatFailed: string[];
  repeatedBlocker?: string;
  whatToTestNext: string;
  calibrationProposalSupport: {
    status: ResearchReflectionSupport;
    reason: string;
  };
  gbrainMemoryPacketHint: {
    shouldCreateLater: boolean;
    reason: string;
  };
  authority: ResearchDecisionAuthority;
  exclusions: ResearchDecisionExclusion[];
}

export const researchDecisionAuthorityNone: ResearchDecisionAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const researchDecisionExcludedSections: ResearchDecisionExclusion[] = [
  "candle_arrays",
  "raw_runtime_snapshot",
  "secrets",
  "account_order_position_data",
  "raw_logs",
  "screenshots_base64"
];
