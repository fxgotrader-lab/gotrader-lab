import type { AutoResearchCycle, AutoResearchProgressSnapshot, AutoResearchSearchMode } from "@/lib/autoResearch";
import type { LLMAdvisoryRun } from "@/lib/llm";
import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { ValidationSuiteReport } from "@/lib/validation";

export type ResearchCycleStatus = "idle" | "running" | "completed" | "failed";

export type ResearchCycleStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "warning"
  | "failed"
  | "skipped";

export type ResearchCycleStepId =
  | "llm_advisory"
  | "auto_research"
  | "validation"
  | "research_quality"
  | "self_improvement"
  | "readiness_gate"
  | "communications_audit";

export interface ResearchCycleStepResult {
  stepId: ResearchCycleStepId;
  label: string;
  status: ResearchCycleStepStatus;
  summary: string;
  detail?: string;
  warning?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ResearchCycleRun {
  cycleId: string;
  startedAt: string;
  completedAt?: string;
  status: ResearchCycleStatus;
  steps: ResearchCycleStepResult[];
  llmBridgeAvailable: boolean;
  candidateProgress?: AutoResearchProgressSnapshot;
  llmRun?: LLMAdvisoryRun;
  autoResearchCycle?: AutoResearchCycle;
  validationReport?: ValidationSuiteReport;
  researchQualityReview?: ResearchQualityReview;
  readinessSnapshot?: ReadinessGateSnapshot;
  createdProposalId?: string;
  failedStepId?: ResearchCycleStepId;
  failedStepDetails?: string;
  nextRecommendedAction: string;
  resultSummary: string;
  safetyNotice: "Research cycle only. Broker execution remains disabled.";
}

export interface ResearchCycleState {
  latestRunId?: string;
  runs: ResearchCycleRun[];
  safetyNotice: "Research cycle only. Broker execution remains disabled.";
}

export interface ResearchCycleRunOptions {
  state: import("@/lib/types").LabState;
  searchMode?: AutoResearchSearchMode;
  maxCandidateCount?: number;
  onUpdate?: (run: ResearchCycleRun) => void;
}
