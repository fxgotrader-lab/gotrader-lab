import type {
  JournalEvent,
  MarketSnapshot,
  OpenClawAgentBridgeAdvisoryPacket,
  RiskDecision,
  ScannerOutput,
  StrategyCandidate
} from "@/lib/agentBridge";
import type { MarketContextSnapshot } from "@/lib/marketContext";

export type StrategyRiskEvaluationStatus =
  | "research_only"
  | "no_trade"
  | "macro_blocked"
  | "failed_data_quality"
  | "environment_blocked";

export type StrategyRiskIssueCode =
  | "missing_market_snapshot"
  | "missing_scanner_output"
  | "candle_count_too_low"
  | "latest_close_missing"
  | "raw_provider_payload_included"
  | "high_impact_macro_block"
  | "medium_impact_macro_caution"
  | "mode_not_paper"
  | "no_executable_setup";

export interface StrategyRiskEvaluationIssue {
  code: StrategyRiskIssueCode;
  severity: "block" | "caution" | "info";
  reason: string;
}

export interface StrategyRiskContextEvaluationInput {
  marketSnapshot?: MarketSnapshot | null;
  scannerOutput?: ScannerOutput | null;
  marketContext?: MarketContextSnapshot | null;
  gotraderMode?: string;
  generatedAt?: string;
}

export interface StrategyRiskContextEvaluation {
  evaluationId: string;
  status: StrategyRiskEvaluationStatus;
  issues: StrategyRiskEvaluationIssue[];
  candidate: StrategyCandidate;
  riskDecision: RiskDecision;
  journalEvent: JournalEvent;
  openClawPacket: OpenClawAgentBridgeAdvisoryPacket;
  generatedAt: string;
}
