import type { ValidationReadinessStatus } from "@/lib/validation";

export type ResearchQualityReadinessGrade = "Not Ready" | "Research Ready" | "Paper-Demo Candidate";
export type ResearchQualityPriority = "high" | "medium" | "low";

export interface ResearchQualityFinding {
  title: string;
  detail: string;
  evidence: string;
  severity: ValidationReadinessStatus;
  relatedScenarios: string[];
}

export interface SuggestedCalibrationChange {
  parameter: string;
  currentValue: string;
  suggestedValue: string;
  rationale: string;
  priority: ResearchQualityPriority;
}

export interface SessionQualityComparison {
  session: string;
  scenarioName: string;
  totalTrades: number;
  winRate: number;
  averageR: number;
  maxDrawdown: number;
  profitFactor: number | null;
  readiness: ValidationReadinessStatus;
  note: string;
}

export interface FalsePositivePattern {
  scenarioName: string;
  estimatedFalsePositives: number;
  winRate: number;
  averageConfidence: number;
  calibrationGap: number;
  worstR: number;
  pattern: string;
  mitigation: string;
}

export interface DrawdownClusterNote {
  scenarioName: string;
  maxDrawdown: number;
  worstTradeR: number;
  clusterRisk: ValidationReadinessStatus;
  notes: string;
}

export interface AgentUsefulnessReview {
  agentId: string;
  name: string;
  usefulnessScore: number;
  averageAlignment: number;
  averageConfidence: number;
  recommendation: "increase" | "decrease" | "hold";
  evidence: string;
}

export interface ThresholdSensitivityReview {
  dimension: "confluence" | "confidence";
  strongerFilterScenario: string;
  looserFilterScenario: string;
  scoreSpread: number;
  tradeSpread: number;
  conclusion: string;
}

export interface LongShortComparison {
  bestDirection: string;
  worstDirection: string;
  longOnlyAverageR: number;
  shortOnlyAverageR: number;
  longOnlyWinRate: number;
  shortOnlyWinRate: number;
  note: string;
}

export interface InvalidationTargetQualityReview {
  model: string;
  scenarioName: string;
  averageR: number;
  maxDrawdown: number;
  profitFactor: number | null;
  bestTradeR: number;
  worstTradeR: number;
  verdict: string;
}

export interface ResearchQualityReview {
  id: string;
  generatedAt: string;
  sourceValidationId: string;
  sourceValidationGeneratedAt: string;
  readinessGrade: ResearchQualityReadinessGrade;
  readinessStatus: ValidationReadinessStatus;
  readinessScore: number;
  topWeaknesses: ResearchQualityFinding[];
  topStrengths: ResearchQualityFinding[];
  suggestedCalibrationChanges: SuggestedCalibrationChange[];
  sessionComparison: SessionQualityComparison[];
  falsePositivePatterns: FalsePositivePattern[];
  drawdownClusters: DrawdownClusterNote[];
  agentUsefulness: AgentUsefulnessReview[];
  confluenceThresholdSensitivity: ThresholdSensitivityReview;
  confidenceThresholdSensitivity: ThresholdSensitivityReview;
  longShortComparison: LongShortComparison;
  invalidationTargetQuality: InvalidationTargetQualityReview[];
  recommendedNextStep: string;
  safetyNotice: "Simulation/backtesting review only. No broker connection. No real trades.";
}
