import type {
  BacktestAgentWeights,
  BacktestSessionFilter,
  BacktestStopModel,
  ResolvedBacktestConfig
} from "@/lib/backtesting/backtestTypes";
import type { ICTScoringWeights } from "@/lib/types";
import type { ValidationReadinessStatus } from "@/lib/validation";

export type CalibrationProposalSource = "openclaw" | "hermes" | "internal";
export type CalibrationProposalStatus = "proposed" | "testing" | "accepted" | "rejected" | "reverted";
export type CalibrationProposalIntent = "research_calibration_candidate" | "paper_demo_candidate_review";

export type CalibrationTargetProblem =
  | "high_drawdown"
  | "low_win_rate"
  | "weak_average_r"
  | "false_positives"
  | "poor_session_performance"
  | "poor_confidence_calibration"
  | "unstable_agent_weight"
  | "overfitting_risk"
  | "trade_generation_issue"
  | "trade_generation_blocked";

export type CalibrationComparisonRecommendation = "accept" | "reject" | "keep_testing";

export interface CalibrationProposalChanges {
  confluenceThreshold?: number;
  confidenceThreshold?: number;
  sessionFilter?: BacktestSessionFilter;
  stopModel?: BacktestStopModel;
  targetRMultiple?: number;
  agentWeights?: Partial<BacktestAgentWeights>;
  ictScoringWeights?: Partial<ICTScoringWeights>;
}

export interface CalibrationProposalMetrics {
  validationId?: string;
  validationTimestamp?: string;
  totalTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  profitFactor: number | null;
  skippedSignals: number;
  falsePositiveCount: number;
  confidenceCalibration: number;
  readinessScore: number;
  readinessStatus: ValidationReadinessStatus;
  stabilityScore: number;
  conservativeScenarioStable: boolean;
  strongestScenario?: string;
  weakestScenario?: string;
}

export interface CalibrationComparisonResult {
  improved: boolean;
  stabilityImproved: boolean;
  recommendation: CalibrationComparisonRecommendation;
  summary: string;
  positiveChanges: string[];
  negativeChanges: string[];
  neutralChanges: string[];
}

export interface CalibrationProposal {
  proposalId: string;
  timestamp: string;
  source: CalibrationProposalSource;
  status: CalibrationProposalStatus;
  proposalIntent?: CalibrationProposalIntent;
  mode: "simulation";
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  reason: string;
  targetProblem: CalibrationTargetProblem;
  proposedChanges: CalibrationProposalChanges;
  expectedImprovement: string;
  safetyNotes: string[];
  beforeMetrics: CalibrationProposalMetrics;
  afterMetrics?: CalibrationProposalMetrics;
  comparisonResult?: CalibrationComparisonResult;
  baselineConfig: ResolvedBacktestConfig;
  proposedConfig: ResolvedBacktestConfig;
  testedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  revertedAt?: string;
  approvalRequired: true;
  approvalNotes?: string;
  tradesBeforeRecovery?: number;
  tradesAfterRecovery?: number;
  qualityGatesPassed?: string[];
}

export interface SelfImprovementAuditEntry {
  id: string;
  timestamp: string;
  proposalId: string;
  action: "created" | "tested" | "accepted" | "rejected" | "reverted";
  reviewerName?: string;
  notes: string;
}

export interface SelfImprovementState {
  proposals: CalibrationProposal[];
  auditTrail: SelfImprovementAuditEntry[];
  latestProposalId?: string;
  lastAcceptedProposalId?: string;
  safetyNotice: "Simulation self-improvement only. Broker execution remains disabled.";
}
