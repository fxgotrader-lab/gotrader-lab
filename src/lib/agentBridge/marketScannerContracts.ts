import type {
  AgentBridgeCandle,
  AgentBridgeDataQuality,
  AgentBridgeProvenance,
  MarketSnapshot,
  OpenClawAgentBridgeAdvisoryPacket,
  RiskDecision,
  ScannerOutput,
  StrategyCandidate,
  StrategyEvidence
} from "@/lib/agentBridge/agentBridgeTypes";
import type { MarketContextSnapshot, OpenClawMarketContextAdvisoryPacket } from "@/lib/marketContext";

export const AGENT_BRIDGE_CONTRACT_VERSION = "gotrader_agent_bridge_v1" as const;
export const AGENT_BRIDGE_STRATEGY_VERSION = "market_scanner_no_trade_v1" as const;
export const AGENT_BRIDGE_RISK_POLICY_VERSION = "risk_manager_placeholder_blocks_execution_v1" as const;
export const AGENT_BRIDGE_ALIAS_MAPPING_VERSION = "twelve_data_alias_map_v1" as const;

export const marketScannerAgentChain = [
  "gotrader_market_data_service",
  "gotrader_agent_bridge",
  "market_scanner_agent",
  "strategy_agent_placeholder",
  "risk_manager_placeholder"
];

export const createAgentBridgeProvenance = ({
  marketSnapshotId,
  sentimentSnapshotId,
  agentChain = marketScannerAgentChain
}: {
  marketSnapshotId: string;
  sentimentSnapshotId?: string;
  agentChain?: string[];
}): AgentBridgeProvenance => ({
  decisionVersion: AGENT_BRIDGE_CONTRACT_VERSION,
  strategyVersion: AGENT_BRIDGE_STRATEGY_VERSION,
  marketSnapshotId,
  sentimentSnapshotId,
  riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
  agentChain
});

export const summarizeDataQuality = (candles: AgentBridgeCandle[], warnings: string[] = []): AgentBridgeDataQuality => ({
  status: candles.length > 0 && warnings.length === 0 ? "ok" : candles.length > 0 ? "warning" : "error",
  candleCount: candles.length,
  latestCandleAt: candles[candles.length - 1]?.datetime,
  hasQuote: false,
  missingVolumeCount: candles.filter((candle) => !Number.isFinite(candle.volume)).length,
  warnings,
  providerStatus: candles.length > 0 ? "ok" : "error"
});

export const scannerOutputFromSnapshot = (snapshot: MarketSnapshot, scanId: string): ScannerOutput => {
  const latest = snapshot.candles[snapshot.candles.length - 1];
  const previous = snapshot.candles[snapshot.candles.length - 2];
  const latestClose = latest?.close ?? snapshot.latestQuote?.price ?? 0;
  const change = previous?.close ? (latestClose - previous.close) / previous.close : 0;
  const trend = change > 0.001 ? "bullish" : change < -0.001 ? "bearish" : "neutral";

  return {
    ...createAgentBridgeProvenance({
      marketSnapshotId: snapshot.snapshotId,
      agentChain: [...marketScannerAgentChain, "scanner_contract_builder"]
    }),
    scanId,
    snapshotId: snapshot.snapshotId,
    symbol: snapshot.symbol,
    timeframe: snapshot.timeframe,
    latest_close: latestClose,
    trend,
    setup: "no_trade",
    confidence: 0,
    reason: "Market data loaded successfully. Strategy rules not yet enabled.",
    dataProvider: snapshot.provider,
    providerSymbol: snapshot.providerSymbol,
    generatedAt: new Date().toISOString()
  };
};

export const noTradeStrategyCandidateFromScan = (
  scan: ScannerOutput,
  signalId: string,
  evidence: StrategyEvidence[] = [],
  marketContext?: MarketContextSnapshot
): StrategyCandidate => ({
  ...createAgentBridgeProvenance({
    marketSnapshotId: scan.marketSnapshotId,
    sentimentSnapshotId: marketContext?.sentimentSnapshotId ?? scan.sentimentSnapshotId,
    agentChain: [...scan.agentChain, "strategy_agent_placeholder"]
  }),
  signalId,
  scanId: scan.scanId,
  symbol: scan.symbol,
  side: "flat",
  setup: marketContext ? "research_only" : "no_trade",
  entry: null,
  stop_loss: null,
  take_profit: null,
  confidence: scan.confidence,
  evidence: [
    ...evidence,
    ...(marketContext
      ? [
          {
            evidenceId: `${marketContext.sentimentSnapshotId}_bounded_context`,
            label: "Market context risk evidence",
            source: "market_context" as const,
            summary: marketContext.macroRiskFlags.some((flag) => flag.severity === "block")
              ? "High-impact macro context is inside a blocking window. Context can reject risk but cannot create direction."
              : "Market context attached as bounded advisory evidence. Context cannot create long/short direction.",
            confidence: marketContext.newsSentiment.confidence
          }
        ]
      : [])
  ],
  sentimentContextId: marketContext?.sentimentSnapshotId ?? scan.sentimentSnapshotId,
  macroRiskFlags: marketContext?.macroRiskFlags,
  generatedAt: new Date().toISOString()
});

export const openClawAdvisoryPacketFromBridge = ({
  packetId,
  riskDecision,
  scan,
  snapshot,
  marketContextSummary
}: {
  packetId: string;
  riskDecision: RiskDecision;
  scan: ScannerOutput;
  snapshot: MarketSnapshot;
  marketContextSummary?: OpenClawMarketContextAdvisoryPacket;
}): OpenClawAgentBridgeAdvisoryPacket => ({
  packetId,
  source: "gotrader_agent_bridge",
  mode: "advisory_only",
  generatedAt: new Date().toISOString(),
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  scanSummary: {
    scanId: scan.scanId,
    snapshotId: scan.snapshotId,
    symbol: scan.symbol,
    timeframe: scan.timeframe,
    latest_close: scan.latest_close,
    trend: scan.trend,
    setup: scan.setup,
    confidence: scan.confidence,
    reason: scan.reason
  },
  boundedNormalizedEvidence: {
    provider: snapshot.provider,
    providerSymbol: snapshot.providerSymbol,
    candleCount: snapshot.candles.length,
    latestCandles: snapshot.candles.slice(-5),
    dataQuality: snapshot.dataQuality
  },
  riskDecisionSummary: {
    riskDecisionId: riskDecision.riskDecisionId,
    signalId: riskDecision.signalId,
    approved: riskDecision.approved,
    rejectReasons: riskDecision.rejectReasons,
    mode: riskDecision.mode,
    executionAllowed: false
  },
  marketContextSummary,
  safetyLocks: {
    apiKeysIncluded: false,
    brokerCredentialsIncluded: false,
    rawProviderPayloadIncluded: false,
    executionPermissionGranted: false,
    riskManagerBypassIncluded: false
  },
  provenance: {
    decisionVersion: scan.decisionVersion,
    strategyVersion: scan.strategyVersion,
    marketSnapshotId: scan.marketSnapshotId,
    sentimentSnapshotId: scan.sentimentSnapshotId,
    riskPolicyVersion: riskDecision.riskPolicyVersion,
    agentChain: [...scan.agentChain, "openclaw_advisory_packet_builder"]
  }
});
