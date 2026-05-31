import type { AgentBridgeCandle } from "@/lib/agentBridge";

export type InstrumentType = "futures" | "forex" | "cfd" | "index" | "crypto" | "unknown";
export type BrokerName = "tradovate" | "mt5" | "none";
export type BrokerAccountMode = "research" | "dry_run" | "paper" | "live";
export type ExecutionAuthorityMode = "none" | "simulated_only" | "paper_gate_required" | "live_gate_required";
export type BrokerAuthorityMode = "none" | "route_only" | "broker_adapter_required";
export type CandidateDirection = "long" | "short" | "flat" | "no_trade";
export type EvaluatorDecision = "no_trade" | "wait" | "confirm_with_broker" | "paper_trade" | "execute";
export type ExecutionOrderType = "market" | "limit" | "stop_market" | "stop_limit" | "none";
export type ExecutionIntentStatus = "blocked" | "dry_run_ready" | "paper_ready" | "live_ready";
export type ExecutionResultStatus =
  | "blocked"
  | "dry_run"
  | "paper_submitted"
  | "paper_filled"
  | "rejected"
  | "failed"
  | "live_submitted"
  | "live_filled";

export interface BrokerProvenance {
  decisionVersion: string;
  strategyVersion?: string;
  riskPolicyVersion?: string;
  runtimeFingerprint?: string;
  sourceRefs: string[];
  generatedAt: string;
}

export interface BrokerMarketSnapshot {
  snapshotId: string;
  symbol: string;
  instrumentType: InstrumentType;
  timeframe: string;
  timestamp: string;
  source: "gotrader_market_data" | "twelve_data" | "tradingview_mcp" | "broker_quote" | "mock" | "unknown";
  candles: AgentBridgeCandle[];
  latestPrice: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  session: string;
  dataQuality: {
    status: "ok" | "warning" | "error";
    candleCount: number;
    warnings: string[];
  };
  provenance: BrokerProvenance;
}

export interface BrokerStrategyCandidate {
  candidateId: string;
  strategyId: string;
  symbol: string;
  direction: CandidateDirection;
  setupType: string;
  entryZone: [number, number] | null;
  invalidation: number | null;
  targets: number[];
  confidence: number;
  evidenceRefs: string[];
  tradingViewEvidenceRef?: string;
  marketSnapshotRef?: string;
  riskAssumptions: string[];
  status: "research_only" | "no_trade" | "wait" | "needs_confirmation" | "blocked";
}

export interface BrokerRiskDecision {
  decisionId: string;
  candidateId: string;
  status: "approved" | "rejected" | "wait" | "no_trade" | "needs_confirmation";
  reason: string;
  maxRisk: number | null;
  positionSize: number | null;
  maxDailyLossRemaining: number | null;
  spreadCheck: "pass" | "fail" | "not_checked";
  slippageCheck: "pass" | "fail" | "not_checked";
  sessionCheck: "pass" | "fail" | "not_checked";
  newsCheck: "pass" | "fail" | "not_checked";
  correlationCheck: "pass" | "fail" | "not_checked";
  rejectionReasons: string[];
  timestamp: string;
}

export interface BrokerRoute {
  routeId: string;
  symbol: string;
  normalizedSymbol: string;
  broker: BrokerName;
  assetClass: InstrumentType;
  accountMode: BrokerAccountMode;
  reason: string;
  routingWarnings: string[];
  executionAuthority: ExecutionAuthorityMode;
  brokerAuthority: BrokerAuthorityMode;
}

export interface ExecutionIntent {
  intentId: string;
  candidateId: string;
  brokerRouteId: string;
  symbol: string;
  direction: CandidateDirection;
  orderType: ExecutionOrderType;
  entry: number | null;
  stop: number | null;
  targets: number[];
  positionSize: number | null;
  accountMode: BrokerAccountMode;
  status: ExecutionIntentStatus;
  riskDecisionRef: string;
  journalRefs: string[];
  createdAt: string;
  executionAuthority: ExecutionAuthorityMode;
}

export interface ExecutionResult {
  resultId: string;
  intentId: string;
  broker: BrokerName;
  mode: BrokerAccountMode;
  status: ExecutionResultStatus;
  orderId?: string;
  fillPrice?: number;
  slippage?: number;
  fees?: number;
  rejectionReason: string;
  rawBrokerResponse?: never;
  timestamp: string;
}

export interface BrokerJournalEvent {
  eventId: string;
  type: "candidate_evaluated" | "risk_rejected" | "route_blocked" | "execution_intent_blocked" | "execution_result_blocked";
  timestamp: string;
  symbol: string;
  strategyId: string;
  sourceRefs: string[];
  marketSnapshot?: BrokerMarketSnapshot;
  tradingViewEvidence?: {
    evidenceId: string;
    source: "tradingview_mcp";
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  evaluatorDecision: EvaluatorDecision;
  riskDecision: BrokerRiskDecision;
  brokerRoute: BrokerRoute;
  executionIntent: ExecutionIntent;
  executionResult?: ExecutionResult;
  rejectionReason: string;
  provenance: BrokerProvenance;
  runtimeFingerprint?: string;
}

export interface BrokerRiskControls {
  maxDailyLoss: number;
  maxTradesPerDay: number;
  maxRiskPerTrade: number;
  positionSizing: "disabled" | "fixed_fractional_future" | "fixed_lot_future";
  spreadCheckRequired: boolean;
  slippageCheckRequired: boolean;
  sessionFilterRequired: boolean;
  newsFilterRequired: boolean;
  duplicatePositionCheckRequired: boolean;
  cooldownCheckRequired: boolean;
  accountModeCheckRequired: boolean;
  brokerRouteCheckRequired: boolean;
  readinessGateRequired: boolean;
}
