import crypto from "node:crypto";

import {
  get_candles,
  get_quote,
  getTwelveDataEnvironmentStatus,
  scan_symbol,
  validate_symbol
} from "./twelve-data-service.mjs";
import {
  buildMarketContextSnapshot,
  buildOpenClawMarketContextPacket
} from "./fmp-market-context-service.mjs";

export const AGENT_BRIDGE_CONTRACT_VERSION = "gotrader_agent_bridge_v1";
export const AGENT_BRIDGE_STRATEGY_VERSION = "market_scanner_no_trade_v1";
export const AGENT_BRIDGE_RISK_POLICY_VERSION = "risk_manager_placeholder_blocks_execution_v1";
export const AGENT_BRIDGE_ALIAS_MAPPING_VERSION = "twelve_data_alias_map_v1";
export const DEFAULT_AGENT_BRIDGE_MODE = "paper";

export const marketScannerAgentChain = [
  "gotrader_market_data_service",
  "gotrader_agent_bridge",
  "market_scanner_agent",
  "strategy_agent_placeholder",
  "risk_manager_placeholder"
];

const now = () => new Date().toISOString();

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function createProvenance({ marketSnapshotId, sentimentSnapshotId, agentChain = marketScannerAgentChain }) {
  return {
    decisionVersion: AGENT_BRIDGE_CONTRACT_VERSION,
    strategyVersion: AGENT_BRIDGE_STRATEGY_VERSION,
    marketSnapshotId,
    sentimentSnapshotId,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    agentChain
  };
}

function normalizeMode() {
  const mode = process.env.GOTRADER_MODE || DEFAULT_AGENT_BRIDGE_MODE;
  return mode === "paper" ? "paper" : DEFAULT_AGENT_BRIDGE_MODE;
}

function makeMockCandles(symbol, interval, count = 12) {
  const base = symbol.includes("BTC") ? 68000 : symbol.includes("XAU") ? 2350 : symbol.includes("JPY") ? 157 : 100;
  const start = Date.now() - count * 5 * 60_000;
  return Array.from({ length: count }, (_, index) => {
    const open = Number((base + index * 0.25).toFixed(5));
    const close = Number((open + (index % 3 === 0 ? -0.08 : 0.12)).toFixed(5));
    return {
      datetime: new Date(start + index * 5 * 60_000).toISOString(),
      open,
      high: Number((Math.max(open, close) + 0.2).toFixed(5)),
      low: Number((Math.min(open, close) - 0.2).toFixed(5)),
      close,
      volume: 0,
      _interval: interval
    };
  }).map(({ _interval, ...candle }) => candle);
}

function inferTrend(candles) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return "neutral";
  }
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  if (!previous.close) {
    return "neutral";
  }
  const change = (latest.close - previous.close) / previous.close;
  if (change > 0.001) {
    return "bullish";
  }
  if (change < -0.001) {
    return "bearish";
  }
  return "neutral";
}

function dataQualityFor({ candles, hasQuote, providerStatus = "ok", warnings = [] }) {
  const missingVolumeCount = candles.filter((candle) => candle.volume === undefined || candle.volume === null || !Number.isFinite(candle.volume)).length;
  return {
    status: candles.length > 0 && warnings.length === 0 ? "ok" : candles.length > 0 ? "warning" : "error",
    candleCount: candles.length,
    latestCandleAt: candles.at(-1)?.datetime,
    hasQuote,
    missingVolumeCount,
    warnings,
    providerStatus
  };
}

function quoteFromCandle(symbol, providerSymbol, latestCandle) {
  return {
    symbol,
    providerSymbol,
    price: latestCandle?.close ?? null,
    datetime: latestCandle?.datetime,
    open: latestCandle?.open ?? null,
    high: latestCandle?.high ?? null,
    low: latestCandle?.low ?? null,
    close: latestCandle?.close ?? null,
    volume: latestCandle?.volume ?? null
  };
}

export async function buildMarketSnapshot({
  dryRun,
  interval = "5min",
  outputsize = 20,
  symbol = "EUR/USD"
} = {}) {
  const validation = validate_symbol(symbol);
  if (!validation.ok) {
    const snapshotId = uid("market_snapshot");
    return {
      ok: false,
      error: validation.error,
      snapshot: {
        ...createProvenance({ marketSnapshotId: snapshotId }),
        snapshotId,
        provider: "twelve_data",
        symbol,
        providerSymbol: symbol,
        brokerSymbolCandidates: [],
        timeframe: interval,
        candles: [],
        latestQuote: null,
        dataQuality: dataQualityFor({ candles: [], hasQuote: false, providerStatus: "error", warnings: [validation.error.message] }),
        generatedAt: now(),
        sourceFingerprint: hashPayload({ symbol, interval, error: validation.error.code }),
        aliasMappingVersion: AGENT_BRIDGE_ALIAS_MAPPING_VERSION
      }
    };
  }

  const env = getTwelveDataEnvironmentStatus();
  const shouldUseDryRun = dryRun ?? !env.hasApiKey;
  const mapping = validation.data;
  const snapshotId = uid("market_snapshot");
  let candles;
  let quote = null;
  let providerSymbol = mapping.primaryTwelveDataSymbol;
  const warnings = [];
  let providerStatus = shouldUseDryRun ? "dry_run" : "ok";

  if (shouldUseDryRun) {
    candles = makeMockCandles(mapping.gotraderSymbol, interval, Math.min(Math.max(outputsize, 6), 20));
    quote = quoteFromCandle(mapping.gotraderSymbol, providerSymbol, candles.at(-1));
    warnings.push("Dry-run mock candles used because live provider access was not requested or no API key was present.");
  } else {
    const candleResult = await get_candles(symbol, interval, outputsize);
    if (!candleResult.ok) {
      candles = [];
      providerStatus = "error";
      warnings.push(candleResult.error.message);
    } else {
      candles = candleResult.data;
      providerSymbol = candleResult.symbolMapping?.resolvedTwelveDataSymbol ?? providerSymbol;
    }

    const quoteResult = await get_quote(symbol);
    if (quoteResult.ok) {
      quote = {
        symbol: quoteResult.data.symbol,
        providerSymbol: quoteResult.data.twelveDataSymbol,
        price: quoteResult.data.price,
        datetime: quoteResult.data.datetime,
        open: quoteResult.data.open,
        high: quoteResult.data.high,
        low: quoteResult.data.low,
        close: quoteResult.data.close,
        volume: quoteResult.data.volume
      };
    } else if (candles.length > 0) {
      quote = quoteFromCandle(mapping.gotraderSymbol, providerSymbol, candles.at(-1));
      warnings.push(`Quote unavailable; latest candle close used instead. ${quoteResult.error.message}`);
    } else {
      warnings.push(`Quote unavailable. ${quoteResult.error.message}`);
    }
  }

  const sourceFingerprint = hashPayload({
    provider: "twelve_data",
    symbol: mapping.gotraderSymbol,
    providerSymbol,
    interval,
    candleCount: candles.length,
    latestCandle: candles.at(-1),
    aliasMappingVersion: AGENT_BRIDGE_ALIAS_MAPPING_VERSION
  });
  const dataQuality = dataQualityFor({
    candles,
    hasQuote: Boolean(quote),
    providerStatus,
    warnings
  });

  return {
    ok: dataQuality.status !== "error",
    snapshot: {
      ...createProvenance({ marketSnapshotId: snapshotId }),
      snapshotId,
      provider: "twelve_data",
      symbol: mapping.gotraderSymbol,
      providerSymbol,
      brokerSymbolCandidates: mapping.futureMt5Candidates,
      timeframe: interval,
      candles,
      latestQuote: quote,
      dataQuality,
      generatedAt: now(),
      sourceFingerprint,
      aliasMappingVersion: AGENT_BRIDGE_ALIAS_MAPPING_VERSION
    },
    error: dataQuality.status === "error" ? { code: "market_data_unavailable", message: warnings.join("; ") } : undefined
  };
}

export async function buildScannerOutput({ dryRun, interval = "5min", outputsize = 20, snapshot, symbol = "EUR/USD" } = {}) {
  const marketSnapshotResult = snapshot ? { ok: true, snapshot } : await buildMarketSnapshot({ dryRun, interval, outputsize, symbol });
  const marketSnapshot = marketSnapshotResult.snapshot;
  const scanId = uid("scan");

  if (!dryRun && marketSnapshotResult.ok) {
    await scan_symbol(symbol, interval, { outputsize }).catch(() => undefined);
  }

  const latestClose = marketSnapshot.latestQuote?.price ?? marketSnapshot.candles.at(-1)?.close ?? 0;
  return {
    ...createProvenance({
      marketSnapshotId: marketSnapshot.snapshotId,
      agentChain: [...marketScannerAgentChain, "scanner_contract_adapter"]
    }),
    scanId,
    snapshotId: marketSnapshot.snapshotId,
    symbol: marketSnapshot.symbol,
    timeframe: marketSnapshot.timeframe,
    latest_close: latestClose,
    trend: inferTrend(marketSnapshot.candles),
    setup: "no_trade",
    confidence: 0,
    reason:
      marketSnapshot.dataQuality.status === "error"
        ? "Market data failed quality checks. Strategy rules not enabled."
        : "Market data loaded successfully. Strategy rules not yet enabled.",
    dataProvider: marketSnapshot.provider,
    providerSymbol: marketSnapshot.providerSymbol,
    generatedAt: now()
  };
}

export function buildNoTradeStrategyCandidate(scan, marketContext) {
  const signalId = uid("signal");
  const contextHasBlock = marketContext?.macroRiskFlags?.some((flag) => flag.severity === "block") ?? false;
  return {
    ...createProvenance({
      marketSnapshotId: scan.marketSnapshotId,
      sentimentSnapshotId: marketContext?.sentimentSnapshotId ?? scan.sentimentSnapshotId,
      agentChain: [...scan.agentChain, ...(marketContext ? ["gotrader_market_context_service"] : []), "strategy_agent_placeholder"]
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
      {
        evidenceId: uid("evidence"),
        label: "Market scanner output",
        source: "scanner",
        summary: scan.reason,
        confidence: scan.confidence
      },
      ...(marketContext
        ? [
            {
              evidenceId: uid("evidence"),
              label: "Market context risk evidence",
              source: "market_context",
              summary: contextHasBlock
                ? "High-impact macro context is inside a blocking window. Context can reject risk but cannot create trade direction."
                : "Market context attached as bounded advisory evidence. It cannot create long/short direction.",
              confidence: marketContext.newsSentiment.confidence
            }
          ]
        : [])
    ],
    sentimentContextId: marketContext?.sentimentSnapshotId ?? scan.sentimentSnapshotId,
    macroRiskFlags: marketContext?.macroRiskFlags ?? [],
    generatedAt: now()
  };
}

export function buildPlaceholderRiskDecision(candidate, rejectReasons) {
  const macroRejectReasons = (candidate.macroRiskFlags ?? [])
    .filter((flag) => flag.severity === "block")
    .map((flag) => `High-impact macro risk flag blocks execution window: ${flag.reason}`);
  const reasons =
    rejectReasons ??
    (candidate.side === "flat"
      ? ["No trade setup. Risk Manager rejects flat/no_trade candidate."]
      : ["Risk Manager placeholder blocks execution until MT5 paper execution is explicitly implemented."]);
  return {
    ...createProvenance({
      marketSnapshotId: candidate.marketSnapshotId,
      sentimentSnapshotId: candidate.sentimentSnapshotId,
      agentChain: [...candidate.agentChain, "risk_manager_placeholder"]
    }),
    riskDecisionId: uid("risk_decision"),
    signalId: candidate.signalId,
    approved: false,
    rejectReasons: [...macroRejectReasons, ...reasons],
    mode: normalizeMode(),
    maxLoss: null,
    executionAllowed: false,
    riskPolicyVersion: AGENT_BRIDGE_RISK_POLICY_VERSION,
    macroRiskFlags: candidate.macroRiskFlags ?? [],
    generatedAt: now()
  };
}

export function buildJournalEvent({ candidate, reason, riskDecision, status }) {
  const eventStatus = status ?? (riskDecision.approved ? "approved" : "rejected");
  return {
    journalEntryId: uid("journal"),
    signalId: candidate.signalId,
    riskDecisionId: riskDecision.riskDecisionId,
    status: eventStatus,
    reason: reason ?? riskDecision.rejectReasons[0] ?? "Risk decision recorded.",
    timestamp: now(),
    decisionVersion: candidate.decisionVersion,
    strategyVersion: candidate.strategyVersion,
    marketSnapshotId: candidate.marketSnapshotId,
    sentimentSnapshotId: candidate.sentimentSnapshotId,
    riskPolicyVersion: riskDecision.riskPolicyVersion,
    macroRiskFlags: riskDecision.macroRiskFlags ?? candidate.macroRiskFlags ?? [],
    agentChain: [...candidate.agentChain, "trade_journal_event_builder"]
  };
}

export function buildOpenClawAdvisoryPacket({ marketContextSummary, riskDecision, scan, snapshot }) {
  return {
    packetId: uid("openclaw_agent_bridge_packet"),
    source: "gotrader_agent_bridge",
    mode: "advisory_only",
    generatedAt: now(),
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
  };
}

export async function runMarketScannerBridgeFlow({ dryRun, interval = "5min", outputsize = 20, symbol = "EUR/USD" } = {}) {
  const snapshotResult = await buildMarketSnapshot({ dryRun, interval, outputsize, symbol });
  const marketContextResult = await buildMarketContextSnapshot({ dryRun, symbol });
  const marketContext = marketContextResult.ok ? marketContextResult.data : undefined;
  const scan = await buildScannerOutput({ dryRun, interval, outputsize, snapshot: snapshotResult.snapshot, symbol });
  const enrichedScan = marketContext
    ? {
        ...scan,
        sentimentSnapshotId: marketContext.sentimentSnapshotId,
        agentChain: [...scan.agentChain, "gotrader_market_context_service"]
      }
    : scan;
  const candidate = buildNoTradeStrategyCandidate(enrichedScan, marketContext);
  const riskDecision = buildPlaceholderRiskDecision(candidate);
  const journalEvent = buildJournalEvent({
    candidate,
    riskDecision,
    reason: candidate.side === "flat" ? "No trade setup from scanner; rejected before execution." : undefined
  });
  const marketContextOpenClawPacket = marketContext ? buildOpenClawMarketContextPacket(marketContext) : undefined;
  const openClawPacket = buildOpenClawAdvisoryPacket({
    marketContextSummary: marketContextOpenClawPacket,
    riskDecision,
    scan: enrichedScan,
    snapshot: snapshotResult.snapshot
  });

  return {
    ok: snapshotResult.ok,
    mode: normalizeMode(),
    provider: "twelve_data",
    snapshot: snapshotResult.snapshot,
    marketContext,
    marketContextOpenClawPacket,
    scan: enrichedScan,
    candidate,
    riskDecision,
    journalEvent,
    openClawPacket,
    error: snapshotResult.error
  };
}
