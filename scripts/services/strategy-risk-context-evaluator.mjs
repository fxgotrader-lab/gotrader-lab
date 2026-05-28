import crypto from "node:crypto";

import {
  AGENT_BRIDGE_CONTRACT_VERSION,
  AGENT_BRIDGE_RISK_POLICY_VERSION,
  buildMarketSnapshot,
  buildScannerOutput
} from "./agent-bridge-adapter.mjs";
import {
  buildMarketContextSnapshot,
  buildOpenClawMarketContextPacket
} from "./fmp-market-context-service.mjs";
import {
  appendLocalJournalRecord,
  createLocalJournalRecord
} from "./local-journal-service.mjs";

export const STRATEGY_CONTEXT_EVALUATOR_VERSION = "strategy_risk_context_evaluator_v1";
export const STRATEGY_CONTEXT_STRATEGY_VERSION = "strategy_context_research_only_v1";
export const STRATEGY_CONTEXT_MIN_CANDLES = 2;
export const DEFAULT_STRATEGY_CONTEXT_MODE = "paper";

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function normalizeMode(mode = process.env.GOTRADER_MODE || DEFAULT_STRATEGY_CONTEXT_MODE) {
  return mode === "paper" ? "paper" : String(mode);
}

function createProvenance({ marketSnapshotId, sentimentSnapshotId, agentChain = [] }) {
  return {
    decisionVersion: AGENT_BRIDGE_CONTRACT_VERSION,
    strategyVersion: STRATEGY_CONTEXT_STRATEGY_VERSION,
    marketSnapshotId,
    sentimentSnapshotId,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    agentChain
  };
}

function fallbackDataQuality(warnings) {
  return {
    status: "error",
    candleCount: 0,
    hasQuote: false,
    missingVolumeCount: 0,
    warnings,
    providerStatus: "error"
  };
}

export function getStrategyRiskEvaluationIssues({ gotraderMode = "paper", marketContext, marketSnapshot, scannerOutput } = {}) {
  const issues = [];
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
  const highImpactFlags = marketContext?.macroRiskFlags?.filter((flag) => flag.severity === "block") ?? [];
  if (highImpactFlags.length > 0) {
    issues.push({
      code: "high_impact_macro_block",
      severity: "block",
      reason: `High-impact macro risk blocks execution window: ${highImpactFlags[0].reason}`
    });
  }
  const mediumImpactFlags = marketContext?.macroRiskFlags?.filter((flag) => flag.severity === "reduce_risk") ?? [];
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
}

function statusFor(issues) {
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
}

function buildEvidence({ issues, marketContext, marketSnapshot, scannerOutput }) {
  return [
    {
      evidenceId: uid("evidence"),
      label: "Scanner output",
      source: "scanner",
      summary: scannerOutput?.reason ?? "Scanner output unavailable.",
      confidence: scannerOutput?.confidence ?? 0
    },
    {
      evidenceId: uid("evidence"),
      label: "Market data quality",
      source: "market_snapshot",
      summary: marketSnapshot ? `${marketSnapshot.dataQuality.status} data quality with ${marketSnapshot.candles.length} normalized candles.` : "Market snapshot unavailable.",
      confidence: marketSnapshot && marketSnapshot.candles.length >= STRATEGY_CONTEXT_MIN_CANDLES ? 0.4 : 0
    },
    ...(marketContext
      ? [
          {
            evidenceId: uid("evidence"),
            label: "Market context",
            source: "market_context",
            summary: marketContext.macroRiskFlags.some((flag) => flag.severity === "block")
              ? "Bounded market context includes an active macro blocking flag."
              : "Bounded market context attached for warnings and provenance only.",
            confidence: marketContext.newsSentiment.confidence
          }
        ]
      : []),
    ...issues.map((issue) => ({
      evidenceId: uid("evidence"),
      label: issue.code,
      source: issue.severity === "info" ? "manual" : "risk",
      summary: issue.reason,
      confidence: issue.severity === "block" ? 1 : 0.5
    }))
  ];
}

function createStrategyCandidate({ issues, marketContext, marketSnapshot, scannerOutput, status }) {
  const marketSnapshotId = marketSnapshot?.snapshotId ?? scannerOutput?.marketSnapshotId ?? uid("missing_market_snapshot");
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
    signalId: uid("signal"),
    scanId: scannerOutput?.scanId ?? uid("missing_scan"),
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
    generatedAt: now()
  };
}

function createRiskDecision({ candidate, gotraderMode, issues }) {
  const blockingReasons = issues.filter((issue) => issue.severity === "block").map((issue) => issue.reason);
  const cautionReasons = issues.filter((issue) => issue.code === "medium_impact_macro_caution").map((issue) => issue.reason);
  return {
    ...createProvenance({
      marketSnapshotId: candidate.marketSnapshotId,
      sentimentSnapshotId: candidate.sentimentSnapshotId,
      agentChain: [...candidate.agentChain, "risk_manager_context_gate"]
    }),
    riskDecisionId: uid("risk_decision"),
    signalId: candidate.signalId,
    approved: false,
    rejectReasons: [...blockingReasons, ...cautionReasons, "Strategy remains research-only / no executable setup."],
    mode: gotraderMode === "paper" ? "paper" : "paper",
    maxLoss: null,
    executionAllowed: false,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    macroRiskFlags: candidate.macroRiskFlags,
    generatedAt: now()
  };
}

function createJournalEvent({ candidate, riskDecision, status }) {
  return {
    journalEntryId: uid("journal"),
    signalId: candidate.signalId,
    riskDecisionId: riskDecision.riskDecisionId,
    status: status === "failed_data_quality" ? "failed" : "rejected",
    reason: riskDecision.rejectReasons[0] ?? "Strategy/Risk context evaluation recorded.",
    timestamp: now(),
    decisionVersion: candidate.decisionVersion,
    strategyVersion: candidate.strategyVersion,
    marketSnapshotId: candidate.marketSnapshotId,
    sentimentSnapshotId: candidate.sentimentSnapshotId,
    riskPolicyVersion: riskDecision.riskPolicyVersion,
    macroRiskFlags: riskDecision.macroRiskFlags ?? candidate.macroRiskFlags ?? [],
    agentChain: [...candidate.agentChain, "local_journal_event_builder"]
  };
}

function createOpenClawPacket({ journalEvent, marketContextSummary, marketSnapshot, riskDecision, scannerOutput }) {
  const fallbackSnapshotId = riskDecision.marketSnapshotId;
  return {
    packetId: uid("openclaw_strategy_risk_packet"),
    source: "gotrader_agent_bridge",
    mode: "advisory_only",
    generatedAt: now(),
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    scanSummary: {
      scanId: scannerOutput?.scanId ?? uid("missing_scan"),
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
      dataQuality: marketSnapshot?.dataQuality ?? fallbackDataQuality(["Market snapshot unavailable."])
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
}

export function evaluateStrategyRiskContext({ gotraderMode = normalizeMode(), marketContext, marketSnapshot, scannerOutput } = {}) {
  const mode = normalizeMode(gotraderMode);
  const issues = getStrategyRiskEvaluationIssues({ gotraderMode: mode, marketContext, marketSnapshot, scannerOutput });
  const status = statusFor(issues);
  const candidate = createStrategyCandidate({
    issues,
    marketContext,
    marketSnapshot,
    scannerOutput,
    status
  });
  const riskDecision = createRiskDecision({ candidate, gotraderMode: mode, issues });
  const journalEvent = createJournalEvent({ candidate, riskDecision, status });
  const marketContextSummary = marketContext ? buildOpenClawMarketContextPacket(marketContext) : undefined;
  return {
    evaluationId: uid("strategy_risk_eval"),
    evaluatorVersion: STRATEGY_CONTEXT_EVALUATOR_VERSION,
    status,
    issues,
    candidate,
    riskDecision,
    journalEvent,
    openClawPacket: createOpenClawPacket({
      journalEvent,
      marketContextSummary,
      marketSnapshot,
      riskDecision,
      scannerOutput
    }),
    sourceFingerprint: hashPayload({
      marketSnapshotId: marketSnapshot?.snapshotId,
      scanId: scannerOutput?.scanId,
      sentimentSnapshotId: marketContext?.sentimentSnapshotId,
      status,
      issues: issues.map((issue) => issue.code)
    }),
    generatedAt: now()
  };
}

export async function runStrategyRiskContextFlow({ dryRun, interval = "5min", outputsize = 8, persistLocalJournal = false, symbol = "EUR/USD" } = {}) {
  const marketSnapshotResult = await buildMarketSnapshot({ dryRun, interval, outputsize, symbol });
  const marketContextResult = await buildMarketContextSnapshot({ dryRun, symbol });
  const scannerOutput = await buildScannerOutput({
    dryRun,
    interval,
    outputsize,
    snapshot: marketSnapshotResult.snapshot,
    symbol
  });
  const evaluation = evaluateStrategyRiskContext({
    gotraderMode: normalizeMode(),
    marketContext: marketContextResult.ok ? marketContextResult.data : undefined,
    marketSnapshot: marketSnapshotResult.snapshot,
    scannerOutput
  });
  const localJournalWrite = persistLocalJournal
    ? appendLocalJournalRecord(
        createLocalJournalRecord(evaluation.journalEvent, {
          riskDecision: evaluation.riskDecision
        })
      )
    : undefined;
  return {
    ok: marketSnapshotResult.ok && marketContextResult.ok,
    mode: normalizeMode(),
    marketSnapshot: marketSnapshotResult.snapshot,
    scannerOutput,
    marketContext: marketContextResult.ok ? marketContextResult.data : undefined,
    evaluation,
    localJournalWrite,
    error: marketSnapshotResult.error ?? marketContextResult.error
  };
}
