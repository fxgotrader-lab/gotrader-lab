export type EvidenceSourceClass =
  | "real_imported"
  | "derived_from_real"
  | "manual"
  | "mock"
  | "planned"
  | "unavailable";

export type EvidenceCategory =
  | "OHLCV candles"
  | "ICT structure"
  | "session levels"
  | "VWAP / volume profile"
  | "macro calendar"
  | "VIX / DXY / yields"
  | "intermarket context"
  | "COT / positioning"
  | "gamma levels"
  | "order flow"
  | "LLM advisory review"
  | "agent debate"
  | "backtest results"
  | "validation results"
  | "readiness inputs";

export interface EvidenceLedgerEntry {
  entryId: string;
  category: EvidenceCategory;
  label: string;
  sourceType: EvidenceSourceClass;
  completeness: number;
  freshness: number;
  reliability: number;
  coverage: number;
  qualityScore: number;
  timestamp?: string;
  notes: string;
  limitations: string[];
}

export interface EvidenceSourceCounts {
  real_imported: number;
  derived_from_real: number;
  manual: number;
  mock: number;
  planned: number;
  unavailable: number;
}

export interface EvidenceLedgerSummary {
  generatedAt: string;
  overallScore: number;
  realEvidenceCoverage: number;
  sourceCounts: EvidenceSourceCounts;
  mockPlannedUnavailableCount: number;
  strongestRealEvidence?: EvidenceLedgerEntry;
  weakestEvidenceArea?: EvidenceLedgerEntry;
  weakestEvidenceCategories: EvidenceCategory[];
  readinessEvidenceWarnings: string[];
  llmContextImpact: string;
  nextDataImprovement: string;
  entries: EvidenceLedgerEntry[];
  safetyNotice: "Evidence quality can reduce readiness confidence, but cannot approve readiness or enable execution.";
}

export interface EvidenceScoreInput {
  sourceType: EvidenceSourceClass;
  completeness: number;
  freshness: number;
  reliability: number;
  coverage: number;
}

export interface EvidenceLedgerInput {
  dataMode: "mock" | "imported" | "planning_only" | "future_provider";
  sourceLabel: string;
  rawCandleCount: number;
  processedCandleCount: number;
  researchWindow: number;
  latestCycleId?: string;
  latestCycleTimestamp?: string;
  latestLLMRunId?: string;
  llmAdvisoryPassed?: boolean;
  debateSessionId?: string;
  validationId?: string;
  researchQualityId?: string;
  readinessState?: string;
  proposalId?: string;
  smtState?: "bullish_confirmation" | "bearish_confirmation" | "conflict" | "none" | "unavailable";
}
