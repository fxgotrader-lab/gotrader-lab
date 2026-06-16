import type { SourceStatusSnapshot } from "@/lib/sourceStatus";
import type { OpenClawPilotProposalDraft } from "@/lib/openclawPilot";
import type { ValidationChainEntry } from "@/lib/validationChain";

export type StrategyFamily =
  | "ict_cmd"
  | "silver_bullet"
  | "camerons_model"
  | "ifvg"
  | "turtle_soup"
  | "crt"
  | "ote"
  | "cisd"
  | "session_raid_reversal"
  | "amd"
  | "grinch"
  | "pd_array"
  | "scalp"
  | "market_map"
  | "diagnostic";

export type StrategyDetectorStatus =
  | "executable_research"
  | "research_only_placeholder"
  | "diagnostic_only";

export type StrategyStatus =
  | "draft"
  | "research_only"
  | "replay_required"
  | "walk_forward_required"
  | "evidence_building"
  | "paper_watchlist_candidate"
  | "paper_demo_blocked"
  | "paper_demo_watchlist"
  | "retired";

export type StrategySide = "long" | "short" | "both";

export interface StrategyAuthority {
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
}

export interface StrategySourceRequirements {
  allowedProviders: string[];
  requiresFingerprint: boolean;
  allowMockOrSample: boolean;
  cfdProxyAllowed: boolean;
  notes: string[];
}

export interface StrategyRequiredCondition {
  id: string;
  label: string;
  description: string;
  requiredFor: Array<"intake" | "replay" | "walk_forward" | "paper_watchlist" | "paper_demo">;
}

export interface StrategyValidationRequirement {
  id: string;
  label: string;
  required: boolean;
  minimum?: number;
  detail: string;
}

export interface StrategyEvidenceSummary {
  sampleCount?: number;
  uniqueTradingDates?: number;
  activeRollingWindows?: number;
  targetFirstRate?: number;
  invalidationFirstRate?: number;
  averageRr?: number;
  evidenceScore?: number;
  maturityScore?: number;
  oosVerdict?: string;
  robustnessClassification?: string;
  sourceFingerprint?: string;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  family: StrategyFamily;
  status: StrategyStatus;
  detectorStatus?: StrategyDetectorStatus;
  description: string;
  side: StrategySide;
  supportedSymbols: string[];
  primaryTimeframes: string[];
  higherTimeframes: string[];
  sourceRequirements: StrategySourceRequirements;
  requiredConditions: StrategyRequiredCondition[];
  invalidationRules: string[];
  targetRules: string[];
  minimumRR: number;
  sessionRules: string[];
  regimeRules: string[];
  validationRequirements: StrategyValidationRequirement[];
  paperDemoRequirements: StrategyValidationRequirement[];
  forbiddenPromotionReasons: string[];
  authority: StrategyAuthority;
}

export interface StrategyRecognitionContext {
  modelName?: string;
  setupName?: string;
  family?: StrategyFamily;
  side?: StrategySide | "flat";
  presentConditions?: string[];
  missingConditions?: string[];
  notes?: string[];
}

export interface StrategyIntakeRecord {
  id: string;
  createdAt: string;
  strategyId: string;
  strategyKnown: boolean;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  sourceIsMockOrSample: boolean;
  recognition: StrategyRecognitionContext;
  validationChainId?: string;
  validationStatus?: string;
  openClawDraftId?: string;
  openClawCandidateFamilies?: string[];
  operatorNotes: string[];
  evidenceSummary?: StrategyEvidenceSummary;
  blockedFields: string[];
  compactSummary: string;
  researchOnly: true;
  authority: StrategyAuthority;
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}

export interface StrategyEligibilityResult {
  strategyId: string;
  eligible: boolean;
  status: StrategyStatus;
  blockers: string[];
  warnings: string[];
  nextAction: string;
  evidenceSummary?: StrategyEvidenceSummary;
  authority: StrategyAuthority;
}

export interface StrategyIntakeInput {
  strategyId?: string;
  sourceStatus?: SourceStatusSnapshot;
  recognition?: StrategyRecognitionContext;
  validationChainEntry?: ValidationChainEntry;
  openClawDraft?: OpenClawPilotProposalDraft;
  operatorNotes?: string[];
  evidenceSummary?: StrategyEvidenceSummary;
  payload?: unknown;
  authority?: Partial<StrategyAuthority>;
}
