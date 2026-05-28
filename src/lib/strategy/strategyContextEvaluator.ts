import type {
  AgentBridgeDataQuality,
  JournalEvent,
  MarketSnapshot,
  OpenClawAgentBridgeAdvisoryPacket,
  RiskDecision,
  ScannerOutput,
  StrategyCandidate,
  StrategyEvidence
} from "@/lib/agentBridge";
import {
  AGENT_BRIDGE_CONTRACT_VERSION,
  AGENT_BRIDGE_RISK_POLICY_VERSION
} from "@/lib/agentBridge/marketScannerContracts";
import type { MarketContextSnapshot, OpenClawMarketContextAdvisoryPacket } from "@/lib/marketContext";
import { createOpenClawMarketContextPacket } from "@/lib/marketContext";
import type {
  StrategyRiskContextEvaluation,
  StrategyRiskContextEvaluationInput,
  StrategyRiskEvaluationIssue,
  StrategyRiskEvaluationStatus
} from "@/lib/strategy/strategyContextTypes";

export const STRATEGY_CONTEXT_EVALUATOR_VERSION = "strategy_risk_context_evaluator_v1" as const;
export const STRATEGY_CONTEXT_STRATEGY_VERSION = "strategy_context_research_only_v1" as const;
export const STRATEGY_CONTEXT_MIN_CANDLES = 2;

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const fallbackDataQuality = (warnings: string[]): AgentBridgeDataQuality => ({
  status: "error",
  candleCount: 0,
  hasQuote: false,
  missingVolumeCount: 0,
  warnings,
  providerStatus: "error"
});

const createProvenance = ({
  marketSnapshotId,
  sentimentSnapshotId,
  agentChain = []
}: {
  marketSnapshotId: string;
  sentimentSnapshotId?: string;
  agentChain?: string[];
}) => ({
  decisionVersion: AGENT_BRIDGE_CONTRACT_VERSION,
  strategyVersion: STRATEGY_CONTEXT_STRATEGY_VERSION,
  marketSnapshotId,
  sentimentSnapshotId,
  riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
  agentChain
});

export const getStrategyRiskEvaluationIssues = ({
  gotraderMode = "paper",
  marketContext,
  marketSnapshot,
  scannerOutput
}: StrategyRiskContextEvaluationInput): StrategyRiskEvaluationIssue[] => {
  const issues: StrategyRiskEvaluationIssue[] = [];
  if (!marketSnapshot) {
    issues.push({
      code: "missing_market_snapshot",
      severity: "block",
      reason: "MarketSnapshot is missing. Strategy remains no-trade."
    });
  }
  if (!scannerOutput) {
    issues.push({
      code: "missing_scanner_output",
      severity: "block",
      reason: "ScannerOutput is missing. Strategy remains no-trade."
    });
  }
  if (marketSnapshot && marketSnapshot.candles.length < STRATEGY_CONTEXT_MIN_CANDLES) {
    issues.push({
      code: "candle_count_too_low",
      severity: "block",
      reason: `MarketSnapshot has ${marketSnapshot.candles.length} candles; at least ${STRATEGY_CONTEXT_MIN_CANDLES} are required for research context.`
    });
  }
  const latestClose = scannerOutput?.latest_close ?? marketSnapshot?.latestQuote?.price ?? marketSnapshot?.candles.at(-1)?.close ?? 0;
  if (!Number.isFinite(latestClose) || latestClose <= 0) {
    issues.push({
      code: "latest_close_missing",
      severity: "block",
      reason: "Latest close is missing or zero. Strategy remains no-trade."
    });
  }
  if (marketContext && marketContext.providerPayloadIncluded !== false) {
    issues.push({
      code: "raw_provider_payload_included",
      severity: "block",
      reason: "MarketContextSnapshot indicates raw provider payload inclusion. It cannot be used."
    });
  }
  const highImpactFlags = marketContext?.macroRiskFlags.filter((flag) => flag.severity === "block") ?? [];
  if (highImpactFlags.length > 0) {
    issues.push({
      code: "high_impact_macro_block",
      severity: "block",
      reason: `High-impact macro risk blocks execution window: ${highImpactFlags[0].reason}`
    });
  }
  const mediumImpactFlags = marketContext?.macroRiskFlags.filter((flag) => flag.severity === "reduce_risk") ?? [];
  if (mediumImpactFlags.length > 0) {
    issues.push({
      code: "medium_impact_macro_caution",
      severity: "caution",
      reason: `Medium-impact macro context requires caution: ${mediumImpactFlags[0].reason}`
    });
  }
  if (gotraderMode !== "paper") {
    issues.push({
      code: "mode_not_paper",
      severity: "block",
      reason: `GOTRADER_MODE is ${gotraderMode}; this evaluator only allows paper-mode research outputs.`
    });
  }
  issues.push({
    code: "no_executable_setup",
    severity: "info",
    reason: "Strategy remains research-only. No executable long/short setup is enabled in this phase."
  });
  return issues;
};

const getStatus = (issues: StrategyRiskEvaluationIssue[]): StrategyRiskEvaluationStatus => {
  if (issues.some((issue) => issue.code === "mode_not_paper")) {
    return "environment_blocked";
  }
  if (issues.some((issue) => ["missing_market_snapshot", "missing_scanner_output", "candle_count_too_low", "latest_close_missing", "raw_provider_payload_included"].includes(issue.code))) {
    return "failed_data_quality";
  }
  if (issues.some((issue) => issue.code === "high_impact_macro_block")) {
    return "macro_blocked";
  }
  return "research_only";
};

const buildEvidence = ({
  issues,
  marketContext,
  marketSnapshot,
  scannerOutput
}: {
  issues: StrategyRiskEvaluationIssue[];
  marketContext?: MarketContextSnapshot | null;
  marketSnapshot?: MarketSnapshot | null;
  scannerOutput?: ScannerOutput | null;
}): StrategyEvidence[] => [
  {
    evidenceId: createId("evidence"),
    label: "Scanner output",
    source: "scanner",
    summary: scannerOutput?.reason ?? "Scanner output unavailable.",
    confidence: scannerOutput?.confidence ?? 0
  },
  {
    evidenceId: createId("evidence"),
    label: "Market data quality",
    source: "market_snapshot",
    summary: marketSnapshot
      ? `${marketSnapshot.dataQuality.status} data quality with ${marketSnapshot.candles.length} normalized candles.`
      : "Market snapshot unavailable.",
    confidence: marketSnapshot && marketSnapshot.candles.length >= STRATEGY_CONTEXT_MIN_CANDLES ? 0.4 : 0
  },
  ...(marketContext
    ? [
        {
          evidenceId: createId("evidence"),
          label: "Market context",
          source: "market_context" as const,
          summary: marketContext.macroRiskFlags.some((flag) => flag.severity === "block")
            ? "Bounded market context includes an active macro blocking flag."
            : "Bounded market context attached for warnings and provenance only.",
          confidence: marketContext.newsSentiment.confidence
        }
      ]
    : []),
  ...issues.map((issue) => ({
    evidenceId: createId("evidence"),
    label: issue.code,
    source: issue.severity === "info" ? ("manual" as const) : ("risk" as const),
    summary: issue.reason,
    confidence: issue.severity === "block" ? 1 : 0.5
  }))
];

const createStrategyCandidate = ({
  issues,
  marketContext,
  marketSnapshot,
  scannerOutput,
  status
}: {
  issues: StrategyRiskEvaluationIssue[];
  marketContext?: MarketContextSnapshot | null;
  marketSnapshot?: MarketSnapshot | null;
  scannerOutput?: ScannerOutput | null;
  status: StrategyRiskEvaluationStatus;
}): StrategyCandidate => {
  const marketSnapshotId = marketSnapshot?.snapshotId ?? scannerOutput?.marketSnapshotId ?? createId("missing_market_snapshot");
  const sentimentSnapshotId = marketContext?.sentimentSnapshotId ?? scannerOutput?.sentimentSnapshotId;
  return {
    ...createProvenance({
      marketSnapshotId,
      sentimentSnapshotId,
      agentChain: [
        ...(scannerOutput?.agentChain ?? ["gotrader_market_data_service", "market_scanner_agent"]),
        "strategy_risk_context_evaluator",
        "strategy_context_research_only"
      ]
    }),
    signalId: createId("signal"),
    scanId: scannerOutput?.scanId ?? createId("missing_scan"),
    symbol: marketSnapshot?.symbol ?? scannerOutput?.symbol ?? marketContext?.symbol ?? "UNKNOWN",
    side: "flat",
    setup: status === "research_only" ? "research_only" : "no_trade",
    entry: null,
    stop_loss: null,
    take_profit: null,
    confidence: 0,
    evidence: buildEvidence({ issues, marketContext, marketSnapshot, scannerOutput }),
    sentimentContextId: sentimentSnapshotId,
    macroRiskFlags: marketContext?.macroRiskFlags ?? [],
    generatedAt: new Date().toISOString()
  };
};

const createRiskDecision = ({
  candidate,
  gotraderMode,
  issues
}: {
  candidate: StrategyCandidate;
  gotraderMode: string;
  issues: StrategyRiskEvaluationIssue[];
}): RiskDecision => {
  const blockingReasons = issues.filter((issue) => issue.severity === "block").map((issue) => issue.reason);
  const cautionReasons = issues.filter((issue) => issue.code === "medium_impact_macro_caution").map((issue) => issue.reason);
  const rejectReasons = [
    ...blockingReasons,
    ...cautionReasons,
    "Strategy remains research-only / no executable setup."
  ];
  return {
    ...createProvenance({
      marketSnapshotId: candidate.marketSnapshotId,
      sentimentSnapshotId: candidate.sentimentSnapshotId,
      agentChain: [...candidate.agentChain, "risk_manager_context_gate"]
    }),
    riskDecisionId: createId("risk_decision"),
    signalId: candidate.signalId,
    approved: false,
    rejectReasons,
    mode: gotraderMode === "paper" ? "paper" : "paper",
    maxLoss: null,
    executionAllowed: false,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    macroRiskFlags: candidate.macroRiskFlags,
    generatedAt: new Date().toISOString()
  };
};

const createJournalEvent = ({
  candidate,
  riskDecision,
  status
}: {
  candidate: StrategyCandidate;
  riskDecision: RiskDecision;
  status: StrategyRiskEvaluationStatus;
}): JournalEvent => ({
  journalEntryId: createId("journal"),
  signalId: candidate.signalId,
  riskDecisionId: riskDecision.riskDecisionId,
  status: status === "failed_data_quality" ? "failed" : "rejected",
  reason: riskDecision.rejectReasons[0] ?? "Strategy/Risk context evaluation recorded.",
  timestamp: new Date().toISOString(),
  decisionVersion: candidate.decisionVersion,
  strategyVersion: candidate.strategyVersion,
  marketSnapshotId: candidate.marketSnapshotId,
  sentimentSnapshotId: candidate.sentimentSnapshotId,
  riskPolicyVersion: riskDecision.riskPolicyVersion,
  macroRiskFlags: riskDecision.macroRiskFlags ?? candidate.macroRiskFlags ?? [],
  agentChain: [...candidate.agentChain, "local_journal_event_builder"]
});

const createOpenClawPacket = ({
  journalEvent,
  marketContextSummary,
  marketSnapshot,
  riskDecision,
  scannerOutput
}: {
  journalEvent: JournalEvent;
  marketContextSummary?: OpenClawMarketContextAdvisoryPacket;
  marketSnapshot?: MarketSnapshot | null;
  riskDecision: RiskDecision;
  scannerOutput?: ScannerOutput | null;
}): OpenClawAgentBridgeAdvisoryPacket => {
  const fallbackSnapshotId = riskDecision.marketSnapshotId;
  const dataQuality = marketSnapshot?.dataQuality ?? fallbackDataQuality(["Market snapshot unavailable."]);
  return {
    packetId: createId("openclaw_strategy_risk_packet"),
    source: "gotrader_agent_bridge",
    mode: "advisory_only",
    generatedAt: new Date().toISOString(),
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    scanSummary: {
      scanId: scannerOutput?.scanId ?? createId("missing_scan"),
      snapshotId: scannerOutput?.snapshotId ?? fallbackSnapshotId,
      symbol: scannerOutput?.symbol ?? marketSnapshot?.symbol ?? "UNKNOWN",
      timeframe: scannerOutput?.timeframe ?? marketSnapshot?.timeframe ?? "unknown",
      latest_close: scannerOutput?.latest_close ?? marketSnapshot?.latestQuote?.price ?? marketSnapshot?.candles.at(-1)?.close ?? 0,
      trend: scannerOutput?.trend ?? "neutral",
      setup: "no_trade",
      confidence: 0,
      reason: scannerOutput?.reason ?? "Scanner output unavailable. Strategy remains no-trade."
    },
    boundedNormalizedEvidence: {
      provider: marketSnapshot?.provider ?? "twelve_data",
      providerSymbol: marketSnapshot?.providerSymbol ?? "UNKNOWN",
      candleCount: marketSnapshot?.candles.length ?? 0,
      latestCandles: marketSnapshot?.candles.slice(-5) ?? [],
      dataQuality
    },
    riskDecisionSummary: {
      riskDecisionId: riskDecision.riskDecisionId,
      signalId: riskDecision.signalId,
      approved: false,
      rejectReasons: riskDecision.rejectReasons,
      mode: "paper",
      executionAllowed: false
    },
    marketContextSummary,
    journalSummary: {
      journalEntryId: journalEvent.journalEntryId,
      status: journalEvent.status,
      reason: journalEvent.reason,
      marketSnapshotId: journalEvent.marketSnapshotId,
      sentimentSnapshotId: journalEvent.sentimentSnapshotId,
      riskPolicyVersion: journalEvent.riskPolicyVersion
    },
    safetyLocks: {
      apiKeysIncluded: false,
      brokerCredentialsIncluded: false,
      rawProviderPayloadIncluded: false,
      executionPermissionGranted: false,
      riskManagerBypassIncluded: false
    },
    provenance: {
      decisionVersion: AGENT_BRIDGE_CONTRACT_VERSION,
      strategyVersion: STRATEGY_CONTEXT_STRATEGY_VERSION,
      marketSnapshotId: fallbackSnapshotId,
      sentimentSnapshotId: riskDecision.sentimentSnapshotId,
      riskPolicyVersion: riskDecision.riskPolicyVersion,
      agentChain: [...riskDecision.agentChain, "openclaw_strategy_risk_advisory_packet_builder"]
    }
  };
};

export const evaluateStrategyRiskContext = (input: StrategyRiskContextEvaluationInput): StrategyRiskContextEvaluation => {
  const gotraderMode = input.gotraderMode ?? "paper";
  const issues = getStrategyRiskEvaluationIssues({ ...input, gotraderMode });
  const status = getStatus(issues);
  const candidate = createStrategyCandidate({
    issues,
    marketContext: input.marketContext,
    marketSnapshot: input.marketSnapshot,
    scannerOutput: input.scannerOutput,
    status
  });
  const riskDecision = createRiskDecision({ candidate, gotraderMode, issues });
  const journalEvent = createJournalEvent({ candidate, riskDecision, status });
  const marketContextSummary = input.marketContext
    ? createOpenClawMarketContextPacket({
        packetId: createId("openclaw_market_context_packet"),
        snapshot: input.marketContext
      })
    : undefined;
  return {
    evaluationId: createId("strategy_risk_eval"),
    status,
    issues,
    candidate,
    riskDecision,
    journalEvent,
    openClawPacket: createOpenClawPacket({
      journalEvent,
      marketContextSummary,
      marketSnapshot: input.marketSnapshot,
      riskDecision,
      scannerOutput: input.scannerOutput
    }),
    generatedAt: input.generatedAt ?? new Date().toISOString()
  };
};
