import type { CalibrationProposal } from "@/lib/selfImprovement";

export type ResearchMaturityGrade =
  | "untested"
  | "early_research"
  | "research_ready"
  | "robust_research"
  | "paper_demo_candidate_review";

export interface ResearchMaturityBreakdown {
  calibrationSurvival: number;
  cycleCoverage: number;
  windowCoverage: number;
  tradeSample: number;
  performanceConsistency: number;
  llmReview: number;
  evidenceQuality: number;
  readinessTrend: number;
  proposalDiscipline: number;
  dataReality: number;
}

export interface ResearchMaturityCycleInput {
  cycleId: string;
  timestamp?: string;
  status?: string;
  activeCalibrationId?: string;
  dataSourceMode?: string;
  researchPreset?: string;
  candleWindow?: string;
  rawCandleCount?: number;
  processedCandleCount?: number;
  totalTrades?: number;
  winRate?: number;
  averageR?: number;
  maxDrawdownR?: number;
  falsePositiveCount?: number;
  readinessScore?: number;
  readinessState?: string;
  llmAdvisoryPassed?: boolean;
}

export interface ResearchMaturityInput {
  activeCalibrationId?: string;
  activeCalibrationApprovedAt?: string;
  cycles: ResearchMaturityCycleInput[];
  evidenceQualityScore: number;
  proposals: CalibrationProposal[];
  latestReadinessState?: string;
}

export interface ResearchMaturitySummary {
  generatedAt: string;
  grade: ResearchMaturityGrade;
  score: number;
  breakdown: ResearchMaturityBreakdown;
  activeCalibrationId?: string;
  activeCalibrationApprovedAt?: string;
  activeCalibrationSurvivalCount: number;
  cyclesTested: number;
  cyclesWithCurrentCalibration: number;
  dataWindowsTested: number;
  safeWindowCycles: number;
  standardWindowCycles: number;
  advancedWindowCycles: number;
  importedDataCycles: number;
  mockDataCycles: number;
  totalSimulatedTrades: number;
  winRateConsistency: number;
  averageRConsistency: number;
  drawdownConsistency: number;
  falsePositiveConsistency: number;
  sessionConsistency: number;
  llmAdvisoryPassCount: number;
  evidenceQualityScore: number;
  readinessTrend: "improving" | "stable" | "declining" | "unknown";
  acceptedProposalCount: number;
  rejectedProposalCount: number;
  noOpOrFailedProposalCount: number;
  missingRequirements: string[];
  maturityWarnings: string[];
  nextMaturityRequirement: string;
  cycleWindowHistory: Array<{
    cycleId: string;
    timestamp?: string;
    dataSourceMode?: string;
    researchPreset?: string;
    candleWindow?: string;
    totalTrades: number;
    winRate: number;
    averageR: number;
    maxDrawdownR: number;
    readinessScore: number;
    llmAdvisoryPassed: boolean;
  }>;
  safetyNotice: "Research maturity can block advancement, but cannot approve execution or override readiness.";
}
