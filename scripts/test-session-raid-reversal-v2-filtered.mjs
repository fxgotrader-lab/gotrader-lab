#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "session-raid-reversal-v2-filtered");

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const lookbackDays = Number(process.env.SESSION_RAID_EVIDENCE_DAYS || process.env.MT5_READONLY_DEPTH_DAYS || 90);
const chunkDays = Number(process.env.SESSION_RAID_EVIDENCE_CHUNK_DAYS || process.env.MT5_READONLY_DEPTH_CHUNK_DAYS || 10);
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 15000);
const timingZone = "America/New_York";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

const sourceFiles = [
  { root: ictRoot, file: "ictTradeConstructionTypes.ts" },
  { root: ictRoot, file: "ictTradeConstruction.ts" },
  { root: ictRoot, file: "ictSessionRaidReversalTypes.ts" },
  { root: ictRoot, file: "ictSessionRaidReversal.ts" },
  { root: ictRoot, file: "ictSessionRaidReversalV2Types.ts" },
  { root: ictRoot, file: "ictSessionRaidReversalV2.ts" }
];

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, decimals = 4) => finite(value) ? Number(value.toFixed(decimals)) : undefined;

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
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
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const endpoint = (route, params = {}) => {
  const url = new URL(`${bridgeUrl}/${route.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
};

const parseTime = (bar) => {
  const parsed = Date.parse(bar?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(bar?.time) ? bar.time * 1000 : 0;
};

const normalizeBars = (items = []) => {
  const seen = new Set();
  return items
    .filter((bar) =>
      bar &&
      typeof bar === "object" &&
      Boolean(bar.timestamp) &&
      Number.isFinite(Number(bar.open)) &&
      Number.isFinite(Number(bar.high)) &&
      Number.isFinite(Number(bar.low)) &&
      Number.isFinite(Number(bar.close))
    )
    .sort((left, right) => parseTime(left) - parseTime(right))
    .filter((bar) => {
      const key = parseTime(bar);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((bar) => ({
      timestamp: bar.timestamp,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.tickVolume ?? bar.volume ?? 0)
    }));
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: timingZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const localParts = (timestamp) => {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { dateKey, minuteOfDay: hour * 60 + minute };
};

const addDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp) => {
  const parts = localParts(timestamp);
  return parts.minuteOfDay >= 20 * 60 ? addDays(parts.dateKey, 1) : parts.dateKey;
};

const daysBetween = (first, last) => {
  if (!first || !last) return 0;
  const span = Date.parse(last) - Date.parse(first);
  return Number.isFinite(span) ? round(Math.max(0, span) / 86400000, 2) : 0;
};

const dateWindows = (endTimestamp) => {
  const end = endTimestamp ? new Date(endTimestamp) : new Date();
  const start = new Date(end.getTime() - lookbackDays * 86400000);
  const chunkMillis = Math.max(1, chunkDays) * 86400000;
  const windows = [];
  let cursor = start.getTime();
  while (cursor < end.getTime() && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end.getTime());
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchLatestBars(timeframe, limit = 5000) {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit
  }));
  const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
  return normalizeBars(Array.isArray(payload.candles) ? payload.candles : []);
}

async function fetchRangeBars(timeframe, endTimestamp) {
  const windows = dateWindows(endTimestamp);
  const chunkResults = await Promise.all(
    windows.map(async (window) => {
      try {
        const response = await fetchWithTimeout(endpoint("candles/range", {
          requestedSymbol,
          symbol: brokerSymbol,
          timeframe,
          from: window.from,
          to: window.to,
          limit: 5000
        }));
        const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
        return {
          ok: response.ok,
          status: response.status,
          missingEvidence: payload.missingEvidence ?? [],
          bars: normalizeBars(Array.isArray(payload.candles) ? payload.candles : [])
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          missingEvidence: [error instanceof Error ? error.message : String(error)],
          bars: []
        };
      }
    })
  );
  const bars = normalizeBars(chunkResults.flatMap((chunk) => chunk.bars));
  return {
    timeframe,
    bars,
    summary: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedLookbackDays: lookbackDays,
      requestedChunkDays: chunkDays,
      requestedChunkCount: windows.length,
      completedChunkCount: chunkResults.filter((chunk) => chunk.ok).length,
      compactBarCount: bars.length,
      firstTimestamp: bars[0]?.timestamp,
      lastTimestamp: bars.at(-1)?.timestamp,
      availableLookbackDays: daysBetween(bars[0]?.timestamp, bars.at(-1)?.timestamp),
      dataDepthStatus: daysBetween(bars[0]?.timestamp, bars.at(-1)?.timestamp) >= lookbackDays * 0.8
        ? "sufficient"
        : bars.length ? "limited" : "unavailable",
      rangeEndpointAvailable: chunkResults.some((chunk) => chunk.ok),
      limitationReason: bars.length
        ? undefined
        : chunkResults.find((chunk) => chunk.missingEvidence.length)?.missingEvidence[0] ?? "MT5 range history returned no compact bars."
    }
  };
}

const countBy = (items, selector) => {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
};

const average = (values) => {
  const nums = values.filter(finite);
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length) : undefined;
};

const groupByTradingDate = (bars) => {
  const groups = new Map();
  for (const bar of bars) {
    const key = tradingDateFor(bar.timestamp);
    const group = groups.get(key) ?? [];
    group.push(bar);
    groups.set(key, group);
  }
  return groups;
};

const dateWindowFor = (dateKey, lookbackTradingDays = 8) => {
  const dates = [];
  for (let offset = lookbackTradingDays; offset >= 0; offset -= 1) {
    dates.push(addDays(dateKey, -offset));
  }
  return dates;
};

const barsForDateWindow = (groups, dateKey) =>
  normalizeBars(dateWindowFor(dateKey).flatMap((key) => groups.get(key) ?? []));

const compactBase = (narrative) => ({
  status: narrative.status,
  side: narrative.side,
  tradingDate: narrative.tradingDate,
  entry: narrative.entry,
  invalidation: narrative.invalidation,
  target: narrative.target,
  rr: narrative.rr,
  canCreateValidationChainEntry: narrative.canCreateValidationChainEntry,
  missingConditions: narrative.missingConditions,
  tradeConstructionBlockers: narrative.tradeConstructionBlockers
});

const sameCompactBase = (left, right) => JSON.stringify(compactBase(left)) === JSON.stringify(compactBase(right));

const outcomeSummary = (items) => {
  const outcomeCounts = countBy(items, (item) => item.telemetry.outcome);
  const targetFirst = Number(outcomeCounts.target_first ?? 0);
  const invalidationFirst = Number(outcomeCounts.invalidation_first ?? 0);
  return {
    candidates: items.length,
    targetFirst,
    invalidationFirst,
    partial: Number(outcomeCounts.partial ?? 0),
    stalled: Number(outcomeCounts.stalled ?? 0),
    targetFirstRate: items.length ? round(targetFirst / items.length) : 0,
    uniqueDates: new Set(items.map((item) => item.telemetry.tradingDate).filter(Boolean)).size,
    averageRr: average(items.map((item) => item.telemetry.rr))
  };
};

const safetyScan = (value) => {
  const serialized = JSON.stringify(value);
  return {
    rawCandlesSerialized: /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i.test(serialized),
    secretsSerialized: /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i.test(serialized),
    accountOrderPositionSerialized: /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i.test(serialized),
    authorityNone:
      value.authority?.executionAuthority === "none" &&
      value.authority?.brokerAuthority === "none" &&
      value.authority?.readinessOverrideAuthority === "none"
  };
};

async function main() {
  compileForNode();
  const v1Module = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversal.mjs")).href);
  const v2Module = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversalV2.mjs")).href);

  const statusResponse = await fetchWithTimeout(endpoint("status")).catch((error) => ({
    ok: false,
    status: 0,
    payload: { error: error instanceof Error ? error.message : String(error) }
  }));
  const statusPayload = statusResponse.payload && typeof statusResponse.payload === "object" ? statusResponse.payload : {};
  const latest5m = await fetchLatestBars("5m", 5000);
  const latestEnd = latest5m.at(-1)?.timestamp;
  const depth5m = await fetchRangeBars("5m", latestEnd);
  const depth15m = await fetchRangeBars("15m", latestEnd);
  const bars5m = depth5m.bars.length ? depth5m.bars : latest5m;
  const bars15m = depth15m.bars;
  const sourceFingerprint = [
    "mt5_read_only",
    brokerSymbol,
    requestedSymbol,
    "session_raid_reversal_v2_filtered_90d",
    bars5m.length,
    bars5m[0]?.timestamp,
    bars5m.at(-1)?.timestamp
  ].join("|");

  if (!bars5m.length) {
    const output = {
      passed: true,
      status: "blocked_source_unavailable",
      sourceSummary: {
        bridgeUrl,
        requestedSymbol,
        brokerSymbol,
        sourceProvider: "mt5_read_only",
        wrapperResponded: statusResponse.ok,
        bridgeMode: statusPayload.bridgeMode,
        connectionStatus: statusPayload.connectionStatus,
        latestEndpointAvailable: statusPayload.latestEndpointAvailable,
        rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
        blocker: "No MT5 5m compact bars available for v2 filtered session raid reversal audit."
      },
      authority,
      safety
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const bars5mByDate = groupByTradingDate(bars5m);
  const bars15mByDate = groupByTradingDate(bars15m);
  const dates = Array.from(new Set(bars5m.map((bar) => tradingDateFor(bar.timestamp)))).sort();
  const evaluableDates = dates.filter((dateKey) => (bars5mByDate.get(dateKey) ?? []).length >= 48);
  const evaluations = evaluableDates.map((tradingDate) => {
    const window5m = barsForDateWindow(bars5mByDate, tradingDate);
    const window15m = barsForDateWindow(bars15mByDate, tradingDate);
    const input = {
      candles5m: window5m,
      candles15m: window15m,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      sourceFingerprint,
      primaryTimeframe: "5m",
      entryTimeframe: "15m",
      htfContext: { M15: [{}], M5: [{}] },
      timingZone,
      tradingDate
    };
    const baseBefore = v1Module.evaluateIctSessionRaidReversal(input);
    const v2 = v2Module.evaluateIctSessionRaidReversalV2Filtered(input);
    const baseAfter = v1Module.evaluateIctSessionRaidReversal(input);
    return {
      tradingDate,
      baseUnchanged: sameCompactBase(baseBefore, baseAfter),
      baseStatus: baseBefore.status,
      v2
    };
  });

  const baseCandidates = evaluations.filter((item) => item.baseStatus === "complete_bearish_reversal_candidate");
  const retained = evaluations.filter((item) => item.v2.telemetry.passedV2);
  const filteredOut = evaluations.filter((item) => item.baseStatus === "complete_bearish_reversal_candidate" && !item.v2.telemetry.passedV2);
  const failedFilterDistribution = countBy(
    filteredOut.flatMap((item) => item.v2.telemetry.failedFilters),
    (item) => item
  );
  const thresholdSet = evaluations[0]?.v2.telemetry.thresholdSet ?? v2Module.DEFAULT_ICT_SESSION_RAID_REVERSAL_V2_THRESHOLDS;
  const compactTelemetrySamples = evaluations
    .filter((item) => item.baseStatus === "complete_bearish_reversal_candidate")
    .slice(0, 12)
    .map((item) => ({
      tradingDate: item.tradingDate,
      baseCandidateId: item.v2.telemetry.baseCandidateId,
      passedV2: item.v2.telemetry.passedV2,
      failedFilters: item.v2.telemetry.failedFilters,
      displacementBodySize: item.v2.telemetry.displacementBodySize,
      fvgSize: item.v2.telemetry.fvgSize,
      retraceDepthPercent: item.v2.telemetry.retraceDepthPercent,
      raidDistanceAboveLondonHigh: item.v2.telemetry.raidDistanceAboveLondonHigh,
      stopDistance: item.v2.telemetry.stopDistance,
      targetDistance: item.v2.telemetry.targetDistance,
      targetFeasibilityScore: item.v2.telemetry.targetFeasibilityScore,
      rr: item.v2.telemetry.rr,
      selectedTargetType: item.v2.telemetry.selectedTargetType,
      outcome: item.v2.telemetry.outcome
    }));

  const baseline = outcomeSummary(baseCandidates.map((item) => item.v2));
  const v2Summary = outcomeSummary(retained.map((item) => item.v2));
  const walkForwardPreflight =
    retained.length < 20 || v2Summary.targetFirst < 20
      ? {
          verdict: "blocked",
          blockers: [
            retained.length < 20 ? "filtered_candidate_count_below_20" : undefined,
            v2Summary.targetFirst < 20 ? "target_first_count_below_20" : undefined
          ].filter(Boolean),
          nextAction: "Collect more independent v2-filtered candidates before walk-forward."
        }
      : {
          verdict: "ready_for_walk_forward_preflight",
          blockers: [],
          nextAction: "Run walk-forward/OOS preflight on retained v2 candidates."
        };

  const output = {
    passed: true,
    status: "completed",
    sourceSummary: {
      bridgeUrl,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      timeframe5m: depth5m.summary,
      timeframe15m: depth15m.summary
    },
    thresholdSet,
    thresholdRationale: {
      minDisplacementBodySize: "Winner median bearish displacement body from 90-day v1 audit.",
      minFvgSize: "Winner minimum FVG size from 90-day v1 audit.",
      maxFvgSize: "Winner maximum FVG size from 90-day v1 audit.",
      maxRetraceDepthPercent: "Avoids deep FVG chop-through using winner/loser retrace separation.",
      maxRaidDistanceAboveLondonHigh: "Loser median raid extension cap.",
      maxStopDistance: "Winner stop distance with tolerance.",
      targetFeasibilityScore: "Rejects targets too far relative to current session range and stop geometry."
    },
    evaluatedTradingDates: evaluableDates.length,
    baselineV1: baseline,
    v2Filtered: v2Summary,
    filteredOut: {
      count: filteredOut.length,
      failedFilterDistribution
    },
    compactTelemetrySamples,
    tests: {
      baseV1Unchanged: evaluations.every((item) => item.baseUnchanged),
      retainedOnlyPassingFilters: retained.every((item) => item.v2.telemetry.failedFilters.length === 0),
      failedFilterTelemetryPresent: filteredOut.length === 0 || filteredOut.every((item) => item.v2.telemetry.failedFilters.length > 0),
      targetFeasibilityReported: baseCandidates.length === 0 || baseCandidates.every((item) => finite(item.v2.telemetry.targetFeasibilityScore)),
      paperDemoPromotionBlocked: evaluations.every((item) => item.v2.paperDemoEligible === false && item.v2.walkForwardReady === false),
      authorityNone: evaluations.every((item) =>
        item.v2.authority.executionAuthority === "none" &&
        item.v2.authority.brokerAuthority === "none" &&
        item.v2.authority.readinessOverrideAuthority === "none"
      )
    },
    walkForwardPreflight,
    promotionDecision: "no_promotion_research_only",
    recommendation:
      retained.length >= 20 && v2Summary.uniqueDates >= 3
        ? "Run walk-forward/OOS preflight. Do not promote without deterministic evidence, maturity, and Paper-Demo checklist gates."
        : "Keep v2 research-only. Current filtered sample is too small for Paper-Demo or walk-forward progression.",
    scannerIntegration: {
      status: "deferred",
      reason: "Opportunity scanner does not safely carry full candle-window telemetry required for v2 filters; v2 remains explicit audit/replay path only."
    },
    authority,
    safety
  };

  const scan = safetyScan(output);
  output.safetyScan = scan;
  output.passed = Object.values(output.tests).every(Boolean) &&
    !scan.rawCandlesSerialized &&
    !scan.secretsSerialized &&
    !scan.accountOrderPositionSerialized &&
    scan.authorityNone;
  console.log(JSON.stringify(output, null, 2));
  if (!output.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    passed: false,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    authority,
    safety
  }, null, 2));
  process.exitCode = 1;
});
