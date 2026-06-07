import type { IctCmdPaperTrackingRecord } from "./ictCmdPaperTrackingTypes";
import type { IctCurrentRead, IctCurrentReadPacketSource } from "./ictCurrentReadTypes";
import type { IctLatestResearchState } from "./ictLatestResearchStateTypes";
import type { IctResearchSignal } from "./ictSignalContractTypes";

export type IctResearchAdvisorDecisionSectionId =
  | "source_context"
  | "htf_alignment"
  | "lane_decision"
  | "paper_sim"
  | "cmd_paper"
  | "monte_carlo"
  | "readiness_split"
  | "walk_forward"
  | "evidence_quality"
  | "next_safe_action";

export type IctResearchAdvisorDecisionStatus =
  | "ready"
  | "eligible"
  | "not_eligible"
  | "blocked"
  | "rejected"
  | "missing"
  | "insufficient"
  | "weak"
  | "saved"
  | "tracking"
  | "disabled"
  | "warning";

export interface IctResearchAdvisorDecisionSection {
  id: IctResearchAdvisorDecisionSectionId;
  label: string;
  status: IctResearchAdvisorDecisionStatus;
  reason: string;
  nextAction: string;
  facts: string[];
}

export interface IctResearchAdvisorDecisionExplanationInput {
  currentRead: IctCurrentRead;
  researchSignal: IctResearchSignal;
  latestResearchState?: IctLatestResearchState;
  cmdPaperTracking?: IctCmdPaperTrackingRecord;
}

export interface IctResearchAdvisorDecisionExplanation {
  generatedAt: string;
  researchOnly: true;
  sourceMode: IctCurrentReadPacketSource;
  packetSource: IctCurrentReadPacketSource;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  displayTimeframe?: string;
  displayTimeframeRole?: "chart_display_reference_only";
  analysisTimeframesUsed: string[];
  analysisDepthStatus: string;
  weeklyBiasStatus: string;
  weeklyBiasDirection: string;
  candleHydrationStatus: string;
  sourceFingerprint?: string;
  sections: IctResearchAdvisorDecisionSection[];
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
