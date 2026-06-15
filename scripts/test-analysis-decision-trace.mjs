#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const currentOpportunityRoot = path.join(projectRoot, "src", "lib", "currentOpportunity");
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "analysis-decision-trace-test");

const sourceFiles = [
  { root: currentOpportunityRoot, file: "currentOpportunityTypes.ts" },
  { root: currentOpportunityRoot, file: "buildCurrentOpportunityContext.ts" },
  { root: ictRoot, file: "ictTradeConstructionTypes.ts" },
  { root: ictRoot, file: "ictTradeConstruction.ts" },
  { root: currentOpportunityRoot, file: "detectCurrentOpportunities.ts" }
];

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  secretsExcluded: true
};

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { root, file } of sourceFiles) {
    const sourcePath = path.join(root, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        verbatimModuleSyntax: false
      },
      fileName: sourcePath
    }).outputText;
    const rewritten = transpiled
      .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
      .replace(/from\s+"..\/ict-strategy-suite\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'..\/ict-strategy-suite\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol =
  process.env.MT5_READONLY_BROKER_SYMBOL ||
  process.env.MT5_READONLY_DEFAULT_SYMBOL ||
  "USTECH";
const timeframe = process.env.MT5_READONLY_TEST_TIMEFRAME || "5m";
const limit = Number(process.env.MT5_READONLY_TEST_LIMIT || 1000);
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 3000);

function endpoint(route, params = {}) {
  const url = new URL(`${bridgeUrl}/${route.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseCandleTime(candle) {
  const timestamp = candle?.timestamp ?? candle?.time;
  if (typeof timestamp === "number") return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const parsed = Date.parse(String(timestamp));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCandles(candles = []) {
  return candles
    .filter((candle) =>
      candle &&
      Number.isFinite(Number(candle.open)) &&
      Number.isFinite(Number(candle.high)) &&
      Number.isFinite(Number(candle.low)) &&
      Number.isFinite(Number(candle.close)) &&
      parseCandleTime(candle) > 0
    )
    .map((candle) => ({
      timestamp: new Date(parseCandleTime(candle)).toISOString(),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? candle.tick_volume ?? 0)
    }))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function localParts(timestamp, timeZone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(new Date(timestamp));
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    dateKey: `${value("year")}-${value("month")}-${value("day")}`
  };
}

function previousLocalDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value, decimals = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
}

function findSessionOpen(candles, targetDateKey, hour, minute = 0) {
  return (
    candles.find((candle) => {
      const parts = localParts(candle.timestamp);
      return parts.dateKey === targetDateKey && parts.hour === hour && parts.minute === minute;
    }) ??
    candles.find((candle) => {
      const parts = localParts(candle.timestamp);
      return parts.dateKey === targetDateKey && (parts.hour > hour || (parts.hour === hour && parts.minute >= minute));
    })
  );
}

function latestSwing(candles, type, strength = 2) {
  for (let index = candles.length - strength - 1; index >= strength; index -= 1) {
    const candle = candles[index];
    const neighbors = candles.slice(index - strength, index + strength + 1).filter((_, inner) => inner !== strength);
    const isSwing =
      type === "high"
        ? neighbors.every((item) => candle.high >= item.high)
        : neighbors.every((item) => candle.low <= item.low);
    if (isSwing) {
      return {
        timestamp: candle.timestamp,
        price: numberOrNull(type === "high" ? candle.high : candle.low)
      };
    }
  }
  return undefined;
}

function countFvgs(candles) {
  const recent = candles.slice(-240);
  let bullish = 0;
  let bearish = 0;
  for (let index = 2; index < recent.length; index += 1) {
    const first = recent[index - 2];
    const third = recent[index];
    if (third.low > first.high) bullish += 1;
    if (third.high < first.low) bearish += 1;
  }
  return { bullish, bearish, total: bullish + bearish };
}

function buildReferenceSummary(candles) {
  if (!candles.length) {
    return {
      status: "unavailable",
      reason: "No active compact candles were returned by the MT5 read-only wrapper."
    };
  }

  const latestDateKey = localParts(candles.at(-1).timestamp).dateKey;
  const previousDateKey = previousLocalDateKey(latestDateKey);
  const midnightOpen = findSessionOpen(candles, latestDateKey, 0, 0);
  const sundayOpen = [...candles].reverse().find((candle) => {
    const parts = localParts(candle.timestamp);
    return parts.weekday === "Sun" && parts.hour >= 18;
  });
  const previousDayCandles = candles.filter((candle) => localParts(candle.timestamp).dateKey === previousDateKey);
  const recent = candles.slice(-80);
  const recentHigh = recent.length ? Math.max(...recent.map((candle) => candle.high)) : undefined;
  const recentLow = recent.length ? Math.min(...recent.map((candle) => candle.low)) : undefined;
  const equilibrium =
    Number.isFinite(recentHigh) && Number.isFinite(recentLow)
      ? (recentHigh + recentLow) / 2
      : undefined;

  return {
    status: "compact",
    timeZone: "America/New_York",
    latestLocalDate: latestDateKey,
    twelveAmOpen: midnightOpen
      ? {
          timestamp: midnightOpen.timestamp,
          price: numberOrNull(midnightOpen.open),
          sourceMethod: "session_local_midnight_or_first_after"
        }
      : { status: "missing" },
    sundayOpen: sundayOpen
      ? {
          timestamp: sundayOpen.timestamp,
          price: numberOrNull(sundayOpen.open),
          sourceMethod: "session_local_sunday_after_18"
        }
      : { status: "missing" },
    previousDay: previousDayCandles.length
      ? {
          date: previousDateKey,
          high: numberOrNull(Math.max(...previousDayCandles.map((candle) => candle.high))),
          low: numberOrNull(Math.min(...previousDayCandles.map((candle) => candle.low)))
        }
      : { date: previousDateKey, status: "missing" },
    latestSwingHigh: latestSwing(candles, "high"),
    latestSwingLow: latestSwing(candles, "low"),
    recentConsolidationRange: {
      high: numberOrNull(recentHigh),
      low: numberOrNull(recentLow),
      equilibrium: numberOrNull(equilibrium),
      sampleCandles: recent.length
    },
    fvgCounts: countFvgs(candles)
  };
}

function sourceFingerprint(candles, statusPayload) {
  if (!candles.length) return statusPayload?.sourceFingerprint ?? undefined;
  return `mt5:${brokerSymbol}:${timeframe}:${candles.length}:${candles[0].timestamp}:${candles.at(-1).timestamp}`;
}

function compactOpportunity(item) {
  return {
    strategyId: item.strategyId,
    model: item.model,
    status: item.status,
    side: item.side,
    setupName: item.setupName,
    blockers: item.blockers,
    missingConditions: item.missingConditions,
    requiredValidation: item.requiredValidation,
    nextAction: item.nextAction,
    rrEstimate: item.rrEstimate,
    confidence: item.confidence,
    authority: item.authority
  };
}

function assertNoForbiddenPayload(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(
    serialized,
    /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"rawRuntimeSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:/i,
    "trace output must not expose forbidden raw or sensitive fields"
  );
}

function assertDiagnosticRowsStayContextOnly(scan) {
  const tradeCandidateOnlyBlockers = new Set([
    "entry_missing",
    "target_missing",
    "invalidation_missing",
    "rr_unavailable",
    "invalid_price_order",
    "target_too_close",
    "rr_below_minimum"
  ]);
  const diagnosticRows = scan.opportunities.filter((item) => item.strategyId === "market_map_only_diagnostic_v1" || item.classification === "diagnostic");
  assert.ok(diagnosticRows.length >= 1, "trace should include at least one compact context diagnostic row");
  for (const row of diagnosticRows) {
    assert.equal(row.classification, "diagnostic");
    assert.equal(row.requiredValidation.length, 0);
    const labels = [...row.blockers, ...row.missingConditions];
    for (const blocker of tradeCandidateOnlyBlockers) {
      assert.equal(labels.includes(blocker), false, `diagnostic trace row must not show ${blocker}`);
    }
    assert.match(row.nextAction, /context only|registered trade setup|bias\/context/i);
  }
}

function buildPacket({ candles, statusPayload, referenceSummary, fingerprint }) {
  const candleCount = candles.length;
  const isAvailable = candleCount > 0;
  const sourceStatus = {
    isMockOrSample: false,
    isResearchActive: isAvailable,
    isProxyInstrument: brokerSymbol !== requestedSymbol,
    statusLabel: isAvailable ? "MT5 read-only research active" : "MT5 read-only unavailable"
  };

  return {
    generatedAt: new Date().toISOString(),
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe: timeframe,
    htfTimeframes: ["15m", "1h", "4h", "1d", "1w"],
    activeSource: {
      provider: isAvailable ? "mt5_read_only" : "unavailable",
      candleCount,
      sourceFingerprint: fingerprint,
      sourceLabel: isAvailable ? `MT5 read-only ${brokerSymbol}` : "MT5 read-only unavailable",
      sourceStatus
    },
    marketAnalysisContext: {
      analysisDepthStatus: isAvailable ? "tactical" : "unavailable",
      analysisTimeframesUsed: isAvailable ? ["M5"] : [],
      missingTimeframes: ["M15", "H1", "H4", "D1", "W1"],
      analysisTimeframes: isAvailable
        ? [{ timeframe: "M5", candleCount, availableLookbackDays: 0 }]
        : []
    },
    compactSummary: {
      referenceLevelSummary: referenceSummary,
      wrapperStatus: {
        bridgeMode: statusPayload?.bridgeMode,
        upstreamConfigured: statusPayload?.upstreamConfigured,
        rangeEndpointAvailable: statusPayload?.rangeEndpointAvailable
      }
    },
    recommendedSignal: {
      setup: "no_trade",
      side: "flat",
      confidence: 0,
      summary: isAvailable
        ? "Trace mode does not infer a trade from source data alone."
        : "MT5 read-only source unavailable for trace mode.",
      noTradeReasons: isAvailable
        ? ["No strategy should be promoted from reference extraction alone."]
        : ["Start the MT5 upstream service and GoTrader read-only wrapper."]
    },
    approvedProfileDecision: { status: "no_trade" }
  };
}

function buildCurrentRead({ candles, referenceSummary, fingerprint }) {
  const isAvailable = candles.length > 0;
  return {
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe: timeframe,
    packetSource: isAvailable ? "live_mt5" : "unavailable",
    dataStatus: isAvailable ? "ready" : "unavailable",
    candleCount: candles.length,
    side: "flat",
    bestSetup: "no_trade",
    modelQualityLane: "no_trade",
    modelName: "none_detected_by_trace",
    opportunityDetected: false,
    opportunityType: undefined,
    opportunityStage: isAvailable ? "reference_scan_only" : "source_unavailable",
    opportunityQuality: "none",
    opportunityDirection: "flat",
    opportunityNextAction: isAvailable
      ? "Use Activate Market/current read for model recognition, then queue replay only for compact candidates."
      : "Start MT5 upstream and GoTrader read-only wrapper, then rerun trace.",
    opportunityMissingEvidence: isAvailable ? ["strategy_recognition", "entry", "target", "invalidation", "rr"] : ["source_data"],
    opportunityBlockers: isAvailable ? [] : ["Active MT5 source unavailable."],
    topReasons: isAvailable
      ? ["Reference levels are diagnostic; recognition and validation gates remain separate."]
      : ["No compact candles available from local wrapper."],
    analysisTimeframesUsed: isAvailable ? ["M5"] : [],
    missingTimeframes: ["M15", "H1", "H4", "D1", "W1"],
    analysisDepthStatus: isAvailable ? "tactical" : "unavailable",
    availableLookbackDays: 0,
    fvgStatus: referenceSummary?.fvgCounts?.total ? "present_in_reference_scan" : "unknown",
    displacementStatus: "not_evaluated_by_trace",
    liquiditySwept: "not_evaluated_by_trace",
    debug: {
      lastEvaluationAt: new Date().toISOString(),
      sourceFingerprint: fingerprint
    }
  };
}

async function main() {
  compileForNode();
  const contextSuite = await import(pathToFileURL(path.join(outRoot, "buildCurrentOpportunityContext.mjs")));
  const scannerSuite = await import(pathToFileURL(path.join(outRoot, "detectCurrentOpportunities.mjs")));
  const suite = { ...contextSuite, ...scannerSuite };
  const [statusResult, candlesResult] = await Promise.all([
    fetchWithTimeout(endpoint("status")),
    fetchWithTimeout(endpoint("candles", { requestedSymbol, symbol: brokerSymbol, timeframe, limit }))
  ]);

  const candlePayload = candlesResult.payload && typeof candlesResult.payload === "object" ? candlesResult.payload : {};
  const candles = normalizeCandles(Array.isArray(candlePayload.candles) ? candlePayload.candles : []);
  const statusPayload = statusResult.payload && typeof statusResult.payload === "object" ? statusResult.payload : {};
  const fingerprint = sourceFingerprint(candles, statusPayload);
  const referenceSummary = buildReferenceSummary(candles);
  const packet = buildPacket({ candles, statusPayload, referenceSummary, fingerprint });
  const currentRead = buildCurrentRead({ candles, referenceSummary, fingerprint });
  const context = suite.buildCurrentOpportunityContext({ packet, currentRead });
  const scan = suite.detectCurrentOpportunities(context);
  const compactCheck = suite.assertCurrentOpportunityScanIsCompact(scan);
  assert.equal(compactCheck.ok, true, "current opportunity scan must remain compact");
  assert.deepEqual(scan.authority, authority);
  assertDiagnosticRowsStayContextOnly(scan);

  const output = {
    ok: true,
    diagnostic: "gotrader_analysis_decision_trace",
    generatedAt: new Date().toISOString(),
    source: {
      provider: packet.activeSource.provider,
      requestedSymbol,
      brokerSymbol,
      timeframe,
      candleCount: candles.length,
      firstTimestamp: candles[0]?.timestamp,
      lastTimestamp: candles.at(-1)?.timestamp,
      sourceFingerprint: fingerprint,
      proxyInstrument: brokerSymbol !== requestedSymbol,
      bridgeMode: statusPayload.bridgeMode,
      connectionStatus: statusPayload.connectionStatus ?? (candles.length ? "connected" : "unavailable"),
      rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
      note: candles.length
        ? "Trace used compact latest candles only. Run test:mt5-readonly-depth for explicit 90-day validation context."
        : "No compact candles returned. Start MT5 upstream and the GoTrader read-only wrapper for live trace output."
    },
    timeframeRoles: scan.context.timeframeRoleSummary,
    referenceLevels: referenceSummary,
    topOpportunities: scan.opportunities.slice(0, 6).map(compactOpportunity),
    topBlockers: [
      scan.summary.topBlocker,
      ...scan.opportunities.flatMap((item) => item.blockers)
    ].filter(Boolean).slice(0, 8),
    validationChainState: {
      recognitionIsEvidence: false,
      nextRequiredGates: ["replay", "walk_forward_oos", "evidence", "maturity", "paper_demo_checklist"],
      currentScanDepthStatus: scan.summary.depthStatus,
      rangeHistoryAvailable: scan.summary.rangeHistoryAvailable,
      validationLookbackDays: scan.summary.validationLookbackDays
    },
    nextAction: scan.summary.nextAction,
    authority,
    safety
  };

  assertNoForbiddenPayload(output);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
