import type { MacroRiskFlag, OpenClawMarketContextAdvisoryPacket } from "@/lib/marketContext";

export type AgentBridgeProvider = "twelve_data";
export type AgentBridgeTrend = "bullish" | "bearish" | "neutral";
export type AgentBridgeSetup = "no_trade";
export type StrategyCandidateSetup = "no_trade" | "research_only";
export type StrategyCandidateSide = "long" | "short" | "flat";
export type AgentBridgeMode = "paper";
export type AgentBridgeJournalStatus = "rejected" | "approved" | "submitted" | "filled" | "failed";

export interface AgentBridgeProvenance {
  decisionVersion: string;
  strategyVersion: string;
  marketSnapshotId: string;
  sentimentSnapshotId?: string;
  riskPolicyVersion: string;
  agentChain: string[];
}

export interface AgentBridgeCandle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AgentBridgeQuote {
  symbol: string;
  providerSymbol: string;
  price: number | null;
  datetime?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
}

export interface AgentBridgeDataQuality {
  status: "ok" | "warning" | "error";
  candleCount: number;
  latestCandleAt?: string;
  hasQuote: boolean;
  missingVolumeCount: number;
  warnings: string[];
  providerStatus: "ok" | "partial" | "error" | "dry_run";
}

export interface MarketSnapshot extends AgentBridgeProvenance {
  snapshotId: string;
  provider: AgentBridgeProvider;
  symbol: string;
  providerSymbol: string;
  brokerSymbolCandidates: string[];
  timeframe: string;
  candles: AgentBridgeCandle[];
  latestQuote: AgentBridgeQuote | null;
  dataQuality: AgentBridgeDataQuality;
  generatedAt: string;
  sourceFingerprint: string;
  aliasMappingVersion: string;
}

export interface ScannerOutput extends AgentBridgeProvenance {
  scanId: string;
  snapshotId: string;
  symbol: string;
  timeframe: string;
  latest_close: number;
  trend: AgentBridgeTrend;
  setup: AgentBridgeSetup;
  confidence: number;
  reason: string;
  dataProvider: AgentBridgeProvider;
  providerSymbol: string;
  generatedAt: string;
}

export interface StrategyEvidence {
  evidenceId: string;
  label: string;
  source: "market_snapshot" | "scanner" | "market_context" | "sentiment" | "risk" | "manual";
  summary: string;
  confidence: number;
}

export interface StrategyCandidate extends AgentBridgeProvenance {
  signalId: string;
  scanId: string;
  symbol: string;
  side: StrategyCandidateSide;
  setup: StrategyCandidateSetup;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  confidence: number;
  evidence: StrategyEvidence[];
  sentimentContextId?: string;
  macroRiskFlags?: MacroRiskFlag[];
  generatedAt: string;
}

export interface RiskDecision extends AgentBridgeProvenance {
  riskDecisionId: string;
  signalId: string;
  approved: boolean;
  rejectReasons: string[];
  mode: AgentBridgeMode;
  maxLoss: number | null;
  executionAllowed: boolean;
  riskPolicyVersion: string;
  macroRiskFlags?: MacroRiskFlag[];
  generatedAt: string;
}

export interface JournalEvent extends AgentBridgeProvenance {
  journalEntryId: string;
  signalId: string;
  riskDecisionId: string;
  status: AgentBridgeJournalStatus;
  reason: string;
  timestamp: string;
  decisionVersion: string;
  strategyVersion: string;
  marketSnapshotId: string;
  sentimentSnapshotId?: string;
  riskPolicyVersion: string;
  macroRiskFlags?: MacroRiskFlag[];
  agentChain: string[];
}

export interface OpenClawAgentBridgeAdvisoryPacket {
  packetId: string;
  source: "gotrader_agent_bridge";
  mode: "advisory_only";
  generatedAt: string;
  executionAuthority: "none";
  brokerAuthority: "none";
  readinessOverrideAuthority: "none";
  scanSummary: Pick<
    ScannerOutput,
    "scanId" | "snapshotId" | "symbol" | "timeframe" | "latest_close" | "trend" | "setup" | "confidence" | "reason"
  >;
  boundedNormalizedEvidence: {
    provider: AgentBridgeProvider;
    providerSymbol: string;
    candleCount: number;
    latestCandles: AgentBridgeCandle[];
    dataQuality: AgentBridgeDataQuality;
  };
  riskDecisionSummary: Pick<RiskDecision, "riskDecisionId" | "signalId" | "approved" | "rejectReasons" | "mode" | "executionAllowed">;
  marketContextSummary?: OpenClawMarketContextAdvisoryPacket;
  journalSummary?: Pick<JournalEvent, "journalEntryId" | "status" | "reason" | "marketSnapshotId" | "sentimentSnapshotId" | "riskPolicyVersion">;
  safetyLocks: {
    apiKeysIncluded: false;
    brokerCredentialsIncluded: false;
    rawProviderPayloadIncluded: false;
    executionPermissionGranted: false;
    riskManagerBypassIncluded: false;
  };
  provenance: AgentBridgeProvenance;
}
