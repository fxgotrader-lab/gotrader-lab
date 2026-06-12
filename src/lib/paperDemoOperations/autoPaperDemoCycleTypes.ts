import type { PaperDemoAuthority, PaperDemoEligibilityResult, PaperDemoReport } from "./paperDemoTypes";
import type { PaperDemoChecklistSummary } from "../readiness";
import type {
  ValidationChainEvidenceSummary,
  ValidationChainRecognitionType,
  ValidationChainReplaySummary,
  ValidationChainWalkForwardSummary
} from "../validationChain/validationChainTypes";

export type AutoPaperDemoCycleStatus =
  | "idle"
  | "source_required"
  | "scanning"
  | "recognition_found"
  | "validation_queued"
  | "replay_running"
  | "replay_passed"
  | "replay_failed"
  | "walk_forward_running"
  | "walk_forward_passed"
  | "walk_forward_failed"
  | "evidence_updated"
  | "paper_demo_blocked"
  | "paper_demo_candidate_created"
  | "daily_report_created"
  | "stopped"
  | "error";

export interface AutoPaperDemoCycleEvent {
  id: string;
  timestamp: string;
  status: AutoPaperDemoCycleStatus;
  title: string;
  detail: string;
  severity: "info" | "success" | "warning" | "error";
}

export interface AutoPaperDemoCycleDecision {
  stage: AutoPaperDemoCycleStatus;
  status: "passed" | "blocked" | "queued" | "warning";
  reason: string;
  nextAction: string;
}

export interface AutoPaperDemoCycleRecognitionSummary {
  recognitionId: string;
  recognitionType: ValidationChainRecognitionType;
  setupLabel: string;
  candidateFamily: string;
  laneRecommendation?: string;
  sourceFingerprint: string;
}

export interface AutoPaperDemoCycleSourceSummary {
  sourceProvider: string;
  sourceStatus: string;
  requestedSymbol: string;
  brokerSymbol?: string;
  primaryTimeframe: string;
  candleCount: number;
  sourceFingerprint: string;
  proxyWarning?: string;
}

export interface AutoPaperDemoDailyReport {
  reportId: string;
  date: string;
  generatedAt: string;
  sourceStatus: AutoPaperDemoCycleSourceSummary;
  recognizedSetups: AutoPaperDemoCycleRecognitionSummary[];
  validationChainChanges: string[];
  replayStatus: string;
  walkForwardStatus: string;
  evidenceMaturityStatus: string;
  watchlistChanges: string[];
  checklistStatus: {
    date: string;
    completed: number;
    total: number;
  };
  journalSummary: string[];
  blockers: string[];
  nextRecommendedResearchAction: string;
  authority: PaperDemoAuthority;
  disclaimer: "Research-only manual paper-demo operations. No broker execution.";
}

export interface AutoPaperDemoCycleConfig {
  persist?: boolean;
  createWatchlistCandidate?: boolean;
  sourceSnapshot?: AutoPaperDemoCycleSourceSummary & {
    isMockOrSample?: boolean;
    isResearchActive?: boolean;
    isProxyInstrument?: boolean;
    warningLabel?: string;
  };
  recognition?: {
    recognitionId?: string;
    recognitionType: ValidationChainRecognitionType;
    setupLabel: string;
    laneRecommendation?: string;
  };
  replaySummary?: ValidationChainReplaySummary;
  walkForwardSummary?: ValidationChainWalkForwardSummary;
  evidenceSummary?: ValidationChainEvidenceSummary;
  checklistSummary?: PaperDemoChecklistSummary;
  deterministicReplayRunner?: () => Promise<ValidationChainReplaySummary | undefined>;
  deterministicWalkForwardRunner?: () => Promise<ValidationChainWalkForwardSummary | undefined>;
  deterministicEvidenceRunner?: () => Promise<ValidationChainEvidenceSummary | undefined>;
  now?: string;
}

export interface AutoPaperDemoCycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  status: AutoPaperDemoCycleStatus;
  currentStage: AutoPaperDemoCycleStatus;
  sourceStatus?: AutoPaperDemoCycleSourceSummary;
  recognitionSummary?: AutoPaperDemoCycleRecognitionSummary;
  validationChainId?: string;
  replaySummary?: ValidationChainReplaySummary;
  walkForwardSummary?: ValidationChainWalkForwardSummary;
  evidenceMaturitySummary?: ValidationChainEvidenceSummary;
  paperDemoEligibility?: PaperDemoEligibilityResult;
  watchlistCandidateId?: string;
  dailyReport?: AutoPaperDemoDailyReport;
  paperDemoReport?: PaperDemoReport;
  decisions: AutoPaperDemoCycleDecision[];
  events: AutoPaperDemoCycleEvent[];
  blockers: string[];
  nextAction: string;
  authority: PaperDemoAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
    executionIntentCreated: false;
    brokerMutation: false;
  };
}

export interface AutoPaperDemoCycleState {
  updatedAt: string;
  latestCycle?: AutoPaperDemoCycleResult;
  history: AutoPaperDemoCycleResult[];
  authority: PaperDemoAuthority;
}
