import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { SimulationRunbookState } from "@/lib/simulationRunbook";
import type { ValidationSuiteReport } from "@/lib/validation";

export type ReadinessState = "Not Ready" | "Research Ready" | "Paper-Demo Candidate";
export type ReadinessRequirementSeverity = "blocker" | "warning";
export type ManualApprovalStatus = "none" | "approved" | "rejected" | "paused";
export type ManualApprovalAction = "approved" | "rejected" | "paused" | "reset";

export interface ReadinessRequirementResult {
  id: string;
  label: string;
  passed: boolean;
  severity: ReadinessRequirementSeverity;
  detail: string;
}

export interface ReadinessGateSnapshot {
  id: string;
  evaluatedAt: string;
  state: ReadinessState;
  passedRequirements: ReadinessRequirementResult[];
  failedRequirements: ReadinessRequirementResult[];
  warnings: string[];
  recommendedNextStep: string;
  brokerExecutionDisabled: true;
  validationSnapshot?: {
    id: string;
    generatedAt: string;
    readinessStatus: string;
    readinessScore: number;
    conservativeScenario?: {
      readiness: string;
      totalTrades: number;
      averageR: number;
      maxDrawdown: number;
      confidenceCalibration: number;
    };
  };
  researchQualitySnapshot?: {
    id: string;
    generatedAt: string;
    readinessGrade: string;
    readinessScore: number;
    falsePositiveCount: number;
    redDrawdownClusters: number;
  };
  runbookSnapshot?: {
    verifiedAt?: string;
    completedChecks: number;
    totalChecks: number;
    brokerExecutionSkipped: boolean;
    positionsZero: boolean;
    tradesZero: boolean;
    shutdownComplete: boolean;
  };
}

export interface ManualApprovalAuditEntry {
  id: string;
  action: ManualApprovalAction;
  timestamp: string;
  reviewerName: string;
  notes: string;
  readinessState: ReadinessState;
}

export interface ManualApprovalRecord {
  status: ManualApprovalStatus;
  reviewerName: string;
  approvalNotes: string;
  rejectionNotes: string;
  approvedAt?: string;
  rejectedAt?: string;
  pausedAt?: string;
  resetAt?: string;
  latestGate?: ReadinessGateSnapshot;
  latestValidationSnapshot?: ValidationSuiteReport;
  latestResearchQualitySnapshot?: ResearchQualityReview;
  latestRunbookSnapshot?: SimulationRunbookState;
  auditTrail: ManualApprovalAuditEntry[];
}
