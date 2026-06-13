import type { PaperDemoChecklistItemStatus } from "@/lib/readiness";
import type { SourceStatusLevel } from "@/lib/sourceStatus";
import type {
  IctCmdIndependentDateEvidence,
  IctCmdIndependentDateGateResult,
  IctCmdPaperWatchlistNarrowProfile
} from "@/lib/ict-strategy-suite/ictCmdIndependentDateGateTypes";
import type {
  ValidationChainHypothesisStatus,
  ValidationChainRecognitionType,
  ValidationChainStepVerdict
} from "@/lib/validationChain";

export type PaperDemoCandidateStatus = "draft" | "watchlist" | "blocked" | "monitoring" | "retired";
export type PaperDemoChecklistCompletionStatus = "complete" | "partial" | "missing" | "pending";
export type PaperDemoEligibilityStatus = "eligible" | "blocked" | "eligible_with_warning";
export type PaperDemoDailyChecklistItemId =
  | "source_active"
  | "symbol_timeframe_confirmed"
  | "proxy_warning_reviewed"
  | "validation_chain_reviewed"
  | "replay_reviewed"
  | "walk_forward_reviewed"
  | "evidence_quality_reviewed"
  | "research_maturity_reviewed"
  | "paper_demo_blockers_reviewed"
  | "authority_none_confirmed"
  | "operator_notes_completed";

export interface PaperDemoAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface PaperDemoCandidate {
  id: string;
  createdAt: string;
  updatedAt: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe: string;
  htfContext: string[];
  sourceFingerprint: string;
  sourceProvider: string;
  sourceStatus: SourceStatusLevel | string;
  recognitionType: ValidationChainRecognitionType | string;
  setupName: string;
  validationChainId?: string;
  replayStatus: ValidationChainStepVerdict | ValidationChainHypothesisStatus | "missing" | "sufficient";
  walkForwardStatus: ValidationChainStepVerdict | ValidationChainHypothesisStatus | "missing" | "sufficient" | "needs_more_data";
  evidenceStatus: PaperDemoChecklistItemStatus | "present" | "missing" | string;
  maturityStatus: PaperDemoChecklistItemStatus | "present" | "missing" | string;
  paperDemoChecklistStatus: PaperDemoChecklistCompletionStatus | PaperDemoChecklistItemStatus | string;
  blockers: string[];
  warnings: string[];
  operatorNotes: string[];
  status: PaperDemoCandidateStatus;
  nextAction: string;
  executionIntent: "none";
  authority: PaperDemoAuthority;
  cmdPaperWatchlistProfile?: IctCmdPaperWatchlistNarrowProfile;
  cmdIndependentDateEvidence?: IctCmdIndependentDateEvidence;
  cmdIndependentDateGate?: IctCmdIndependentDateGateResult;
}

export interface PaperDemoEligibilityResult {
  candidateId?: string;
  status: PaperDemoEligibilityStatus;
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  nextAction: string;
  authority: PaperDemoAuthority;
}

export interface PaperDemoWatchlistItem {
  candidateId: string;
  addedAt: string;
  setupName: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  timeframe: string;
  recognitionType: string;
  validationStatus: string;
  evidenceStatus: string;
  maturityStatus: string;
  blockers: string[];
  nextAction: string;
  operatorNotes: string[];
  status: PaperDemoCandidateStatus;
  authority: PaperDemoAuthority;
}

export interface PaperDemoDailyChecklistItem {
  id: PaperDemoDailyChecklistItemId;
  label: string;
  completed: boolean;
  detail: string;
}

export interface PaperDemoDailyChecklist {
  id: string;
  date: string;
  updatedAt: string;
  items: PaperDemoDailyChecklistItem[];
  authority: PaperDemoAuthority;
}

export interface PaperDemoSessionJournalEntry {
  id: string;
  createdAt: string;
  symbol: string;
  setup: string;
  observation: string;
  watchedCondition: string;
  invalidation: string;
  evidenceNeeded: string;
  operatorConfidence: "low" | "medium" | "high";
  researchOnly: true;
  authority: PaperDemoAuthority;
}

export interface PaperDemoReport {
  generatedAt: string;
  candidateCount: number;
  watchlistCount: number;
  monitoringCount: number;
  blockedCount: number;
  retiredCount: number;
  checklistStatus: {
    date: string;
    completed: number;
    total: number;
  };
  candidates: PaperDemoWatchlistItem[];
  journalEntries: PaperDemoSessionJournalEntry[];
  blockers: string[];
  evidenceMaturitySummary: string[];
  authority: PaperDemoAuthority;
  safetyNotice: "Research-only paper-demo operations. No broker execution.";
}

export interface PaperDemoOperationsState {
  updatedAt: string;
  candidates: PaperDemoCandidate[];
  dailyChecklists: PaperDemoDailyChecklist[];
  journalEntries: PaperDemoSessionJournalEntry[];
  authority: PaperDemoAuthority;
}

export const PAPER_DEMO_AUTHORITY: PaperDemoAuthority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const PAPER_DEMO_SAFETY_NOTICE = "Research-only paper-demo operations. No broker execution." as const;
