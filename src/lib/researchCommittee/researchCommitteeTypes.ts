import type {
  ResearchDecisionAuthority,
  ResearchDecisionLogEntry,
  ResearchDecisionVerdict,
  ResearchReflectionMemory
} from "@/lib/researchDecisionLog";

import type { ResearchReadinessDistinction } from "./researchReadinessDistinction";

export type ResearchCommitteeSectionStatus = "supportive" | "cautious" | "blocking" | "insufficient";

export interface ResearchCommitteeSection {
  title: string;
  status: ResearchCommitteeSectionStatus;
  summary: string;
  evidence: string[];
  limitations: string[];
}

export interface ResearchRiskCommitteeReport {
  conservativeView: ResearchCommitteeSection;
  balancedView: ResearchCommitteeSection;
  aggressiveView: ResearchCommitteeSection;
  finalRiskChairVerdict: string;
  blockers: string[];
}

export interface ResearchChairSynthesis {
  verdict: ResearchDecisionVerdict;
  summary: string;
  nextActions: string[];
  reproducibilityWarning: string;
}

export interface ResearchCommitteeReport {
  reportId: string;
  generatedAt: string;
  sourceProvider: string;
  sourceFingerprint?: string;
  decisionLogEntry: ResearchDecisionLogEntry;
  reflectionMemory: ResearchReflectionMemory;
  bullCase: ResearchCommitteeSection;
  bearCase: ResearchCommitteeSection;
  readinessDistinction: ResearchReadinessDistinction;
  riskCommittee: ResearchRiskCommitteeReport;
  finalResearchChairSynthesis: ResearchChairSynthesis;
  authority: ResearchDecisionAuthority;
  safetyNotice: "Research committee only. No broker execution, no order placement, no readiness override.";
}
