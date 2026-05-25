import type {
  BacktestAgentWeights,
  BacktestConfig,
  BacktestResult,
  ResolvedBacktestConfig
} from "@/lib/backtesting";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type {
  CalibrationComparisonResult,
  CalibrationProposalMetrics
} from "@/lib/selfImprovement";
import type { ICTScoringWeights } from "@/lib/types";
import type { ValidationSuiteReport } from "@/lib/validation";

export type AutoResearchSearchMode =
  | "quick"
  | "standard"
  | "deep"
  | "session_focus"
  | "stop_model_focus"
  | "long_short_focus"
  | "conservative_only"
  | "conservative"
  | "balanced"
  | "aggressive_research_only"
  | "session_focused"
  | "stop_model_focused"
  | "long_short_bias";

export type AutoResearchResultCategory =
  | "rejected"
  | "improved_but_not_ready"
  | "research_ready"
  | "paper_demo_candidate"
  | "unsafe_overfit";

export type AutoResearchCycleStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "proposal_created";

export interface AutoResearchCandidateConfig {
  candidateId: string;
  label: string;
  searchMode: AutoResearchSearchMode;
  rationale: string;
  config: ResolvedBacktestConfig;
  ictScoringWeights?: Partial<ICTScoringWeights>;
  changedParameters: string[];
}

export interface AutoResearchScoringCriteria {
  stabilityFirst: true;
  weights: {
    lowerMaxDrawdown: number;
    betterAverageR: number;
    acceptableWinRate: number;
    lowerFalsePositives: number;
    confidenceCalibration: number;
    sessionConsistency: number;
    sufficientTradeCount: number;
    skippedSignalBalance: number;
    profitFactor: number;
    robustnessAcrossScenarios: number;
  };
}

export interface AutoResearchScoreBreakdown {
  totalScore: number;
  drawdownScore: number;
  averageRScore: number;
  winRateScore: number;
  falsePositiveScore: number;
  confidenceCalibrationScore: number;
  sessionConsistencyScore: number;
  tradeCountScore: number;
  skippedSignalBalanceScore: number;
  profitFactorScore: number;
  robustnessScore: number;
  stabilityImproved: boolean;
  sufficientSample: boolean;
  rationale: string;
}

export interface AutoResearchCandidateResult {
  candidateId: string;
  label: string;
  rationale: string;
  config: ResolvedBacktestConfig;
  ictScoringWeights?: Partial<ICTScoringWeights>;
  changedParameters: string[];
  backtestResult?: BacktestResult;
  validationReport?: ValidationSuiteReport;
  researchQualityReview?: ResearchQualityReview;
  readinessEstimate: ReadinessGateSnapshot;
  metrics: CalibrationProposalMetrics;
  scoreBreakdown: AutoResearchScoreBreakdown;
  comparisonResult: CalibrationComparisonResult;
  resultCategory: AutoResearchResultCategory;
  promotionEligible: boolean;
  rejectionReasons: string[];
}

export interface AutoResearchCandidateScoreSummary {
  candidateId: string;
  label: string;
  totalScore: number;
  resultCategory: AutoResearchResultCategory;
  rejectionReasons: string[];
}

export interface AutoResearchProgressSnapshot {
  currentCandidate: number;
  totalCandidates: number;
  candidateId: string;
  candidateLabel: string;
  candidateScore: number;
  bestCandidateId?: string;
  bestCandidateLabel?: string;
  bestCandidateScore?: number;
  bestCandidateCategory?: AutoResearchResultCategory;
}

export interface AutoResearchCycle {
  cycleId: string;
  timestamp: string;
  searchMode: AutoResearchSearchMode;
  baselineConfig: ResolvedBacktestConfig;
  candidateConfigs: AutoResearchCandidateConfig[];
  candidateResults: AutoResearchCandidateResult[];
  bestCandidate?: AutoResearchCandidateResult;
  closestCandidates: AutoResearchCandidateResult[];
  rejectedCandidates: AutoResearchCandidateResult[];
  candidatesTested: number;
  candidateScores: AutoResearchCandidateScoreSummary[];
  selectedCandidateId?: string;
  finalResultCategory: AutoResearchResultCategory | "no_safe_paper_demo_candidate_found";
  noSafePaperDemoCandidateFound: boolean;
  scoringCriteria: AutoResearchScoringCriteria;
  safetyNotes: string[];
  createdProposalId?: string;
  status: AutoResearchCycleStatus;
  error?: string;
}

export interface AutoResearchRunOptions {
  searchMode: AutoResearchSearchMode;
  maxCandidateCount: number;
  createProposal?: boolean;
  onCandidateEvaluated?: (progress: AutoResearchProgressSnapshot) => void;
}

export interface AutoResearchState {
  cycles: AutoResearchCycle[];
  auditTrail: Array<{
    id: string;
    timestamp: string;
    cycleId: string;
    searchMode?: AutoResearchSearchMode;
    candidatesTested?: number;
    candidateScores?: AutoResearchCandidateScoreSummary[];
    selectedCandidateId?: string;
    finalResultCategory?: AutoResearchCycle["finalResultCategory"];
    action: "cycle_started" | "candidate_tested" | "proposal_created" | "cycle_completed" | "cycle_failed";
    notes: string;
  }>;
  latestCycleId?: string;
  lastStoredBytes?: number;
  storageWarning?: string;
  storageEmergencyMode?: boolean;
  safetyNotice: "Auto Research is simulation-only and cannot execute trades or override readiness gates.";
}

export type AutoResearchSafeConfigPatch = BacktestConfig & {
  agentWeights?: Partial<BacktestAgentWeights>;
  ictScoringWeights?: Partial<ICTScoringWeights>;
};
