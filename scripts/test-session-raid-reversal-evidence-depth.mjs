#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const walkForwardRoot = path.join(projectRoot, "src", "lib", "walkForward");
const outRoot = path.join(projectRoot, ".gotrader", "session-raid-reversal-evidence-depth");

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
  { root: walkForwardRoot, file: "walkForwardPreflight.ts" }
];

const round = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals));
const finite = (value) => typeof value === "number" && Number.isFinite(value);

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
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
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

const parseTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeCandles = (candles = []) => {
  const seen = new Set();
  return candles
    .filter((candle) =>
      candle &&
      typeof candle === "object" &&
      Boolean(candle.timestamp) &&
      Number.isFinite(Number(candle.open)) &&
      Number.isFinite(Number(candle.high)) &&
      Number.isFinite(Number(candle.low)) &&
      Number.isFinite(Number(candle.close))
    )
    .sort((left, right) => parseTime(left) - parseTime(right))
    .filter((candle) => {
      const key = parseTime(candle);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candle) => ({
      id: candle.id,
      timestamp: candle.timestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.tickVolume ?? candle.volume ?? 0)
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
  return {
    dateKey,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    label: `${dateKey} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${timingZone}`
  };
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
  return Number.isFinite(span) ? round(Math.max(0, span) / 86400000) : 0;
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

async function fetchLatestCandles(timeframe, limit = 5000) {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit
  }));
  const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
  return {
    ok: response.ok,
    status: response.status,
    payload,
    candles: normalizeCandles(Array.isArray(payload.candles) ? payload.candles : [])
  };
}

async function fetchRangeCandles(timeframe, endTimestamp) {
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
        const candles = normalizeCandles(Array.isArray(payload.candles) ? payload.candles : []);
        return {
          window,
          response,
          payload,
          candles
        };
      } catch (error) {
        return {
          window,
          response: { ok: false, status: 0 },
          payload: {
            connectionStatus: "disconnected",
            missingEvidence: [error instanceof Error ? error.message : String(error)]
          },
          candles: []
        };
      }
    })
  );
  const chunks = chunkResults.map(({ window, response, payload, candles }) => ({
    from: window.from,
    to: window.to,
    ok: response.ok,
    status: response.status,
    returnedCount: candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp,
    sourceMethod: payload.sourceMethod,
    connectionStatus: payload.connectionStatus,
    missingEvidence: payload.missingEvidence ?? []
  }));
  const all = chunkResults.flatMap((chunk) => chunk.candles);
  const candles = normalizeCandles(all);
  return {
    timeframe,
    candles,
    chunks,
    summary: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedLookbackDays: lookbackDays,
      requestedChunkDays: chunkDays,
      requestedChunkCount: windows.length,
      completedChunkCount: chunks.filter((chunk) => chunk.ok).length,
      candleCount: candles.length,
      firstTimestamp: candles[0]?.timestamp,
      lastTimestamp: candles.at(-1)?.timestamp,
      availableLookbackDays: daysBetween(candles[0]?.timestamp, candles.at(-1)?.timestamp),
      dataDepthStatus: daysBetween(candles[0]?.timestamp, candles.at(-1)?.timestamp) >= lookbackDays * 0.8
        ? "sufficient"
        : candles.length ? "limited" : "unavailable",
      rangeEndpointAvailable: chunks.some((chunk) => chunk.ok),
      limitationReason: candles.length
        ? undefined
        : chunks.find((chunk) => chunk.missingEvidence.length)?.missingEvidence[0] ?? "MT5 range history returned no candles."
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

const groupByTradingDate = (candles) => {
  const groups = new Map();
  for (const candle of candles) {
    const key = tradingDateFor(candle.timestamp);
    const group = groups.get(key) ?? [];
    group.push(candle);
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

const candlesForDateWindow = (groups, dateKey) =>
  normalizeCandles(dateWindowFor(dateKey).flatMap((key) => groups.get(key) ?? []));

const stepsFor = (narrative) => Array.isArray(narrative?.steps) ? narrative.steps : [];
const stepStatus = (narrative, stepName) => Boolean(stepsFor(narrative).find((step) => step.step === stepName)?.detected);
const stepTimestamp = (narrative, stepName) => stepsFor(narrative).find((step) => step.step === stepName)?.timestamp;

const compactNarrative = (narrative) => ({
  tradingDate: narrative.tradingDate,
  status: narrative.status,
  confidence: narrative.confidence,
  side: narrative.side,
  entry: narrative.entry,
  invalidation: narrative.invalidation,
  target: narrative.target,
  rr: narrative.rr,
  missingConditions: narrative.missingConditions,
  blockers: narrative.blockers,
  tradeConstructionBlockers: narrative.tradeConstructionBlockers,
  nextAction: narrative.nextAction,
  canCreateValidationChainEntry: narrative.canCreateValidationChainEntry,
  stepFlags: {
    asia_consolidation_present: stepStatus(narrative, "asia_consolidation"),
    london_expansion_present: stepStatus(narrative, "london_expansion"),
    asia_high_sweep_present: stepStatus(narrative, "asia_high_sweep"),
    prior_day_high_sweep_present: stepStatus(narrative, "prior_day_high_sweep"),
    london_high_created: stepStatus(narrative, "london_high_created"),
    ny_london_high_raid_present: stepStatus(narrative, "ny_london_high_raid"),
    bearish_mss_present: stepStatus(narrative, "bearish_mss"),
    breaker_present: stepStatus(narrative, "breaker_detected"),
    fvg_present: stepStatus(narrative, "fvg_detected"),
    fvg_retrace_present: stepStatus(narrative, "fvg_retrace"),
    sell_side_delivery_present: stepStatus(narrative, "sell_side_delivery"),
    sunday_open_resolved: finite(narrative.referenceLevels?.sundayOpen?.price),
    premium_to_sunday_open: narrative.referenceLevels?.currentPremiumDiscount === "premium",
    valid_rr_present: finite(narrative.rr) && narrative.rr >= 2
  },
  qualityFlags: {
    hasNyRaid: stepStatus(narrative, "ny_london_high_raid"),
    hasBearishMss: stepStatus(narrative, "bearish_mss"),
    hasBreaker: stepStatus(narrative, "breaker_detected"),
    hasFvg: stepStatus(narrative, "fvg_detected"),
    hasFvgRetrace: stepStatus(narrative, "fvg_retrace"),
    hasSellSideTarget: finite(narrative.target) || Boolean(narrative.referenceLevels?.sellSideLiquidityTargets?.length),
    hasRrGte2: finite(narrative.rr) && narrative.rr >= 2,
    hasRrGte3: finite(narrative.rr) && narrative.rr >= 3
  },
  compactTimeAnchors: {
    nyRaidAt: stepTimestamp(narrative, "ny_london_high_raid"),
    bearishMssAt: stepTimestamp(narrative, "bearish_mss"),
    fvgAt: stepTimestamp(narrative, "fvg_detected"),
    retraceAt: stepTimestamp(narrative, "fvg_retrace"),
    deliveryAt: stepTimestamp(narrative, "sell_side_delivery")
  }
});

const replayOutcomeForShort = (narrative, candles) => {
  const start =
    narrative.compactTimeAnchors?.retraceAt ??
    narrative.compactTimeAnchors?.fvgAt ??
    stepTimestamp(narrative, "fvg_retrace") ??
    stepTimestamp(narrative, "fvg_detected");
  if (!start || !finite(narrative.entry) || !finite(narrative.invalidation) || !finite(narrative.target)) {
    return { outcome: "not_replay_ready", reason: "missing_entry_invalidation_target_or_start" };
  }
  const future = candles.filter((candle) =>
    Date.parse(candle.timestamp) > Date.parse(start) &&
    tradingDateFor(candle.timestamp) === narrative.tradingDate
  );
  if (!future.length) {
    return { outcome: "insufficient_future_candles", reason: "no_future_candles_after_entry_reference" };
  }
  for (const candle of future) {
    const targetHit = candle.low <= narrative.target;
    const invalidationHit = candle.high >= narrative.invalidation;
    if (targetHit && invalidationHit) {
      return { outcome: "partial", reason: "target_and_invalidation_touched_same_candle", timestamp: candle.timestamp };
    }
    if (targetHit) return { outcome: "target_first", timestamp: candle.timestamp };
    if (invalidationHit) return { outcome: "invalidation_first", timestamp: candle.timestamp };
  }
  return { outcome: "stalled", reason: "neither_target_nor_invalidation_hit_same_trading_date" };
};

const buildRollingWindows = (firstTimestamp, lastTimestamp, windowDays = 30, stepDays = 15) => {
  if (!firstTimestamp || !lastTimestamp) return [];
  const first = Date.parse(firstTimestamp);
  const last = Date.parse(lastTimestamp);
  const windowMs = windowDays * 86400000;
  const stepMs = stepDays * 86400000;
  const windows = [];
  let cursor = first;
  while (cursor + windowMs <= last && windows.length < 12) {
    windows.push({
      splits: [
        { label: "in_sample", processedCandleCount: 1 },
        { label: "validation", processedCandleCount: 1 },
        { label: "out_of_sample", processedCandleCount: 1 }
      ],
      start: new Date(cursor).toISOString(),
      end: new Date(cursor + windowMs).toISOString()
    });
    cursor += stepMs;
  }
  return windows;
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
  const detector = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversal.mjs")).href);
  const { buildWalkForwardPreflight } = await import(pathToFileURL(path.join(outRoot, "walkForwardPreflight.mjs")).href);

  const statusResponse = await fetchWithTimeout(endpoint("status")).catch((error) => ({
    ok: false,
    status: 0,
    payload: { error: error instanceof Error ? error.message : String(error) }
  }));
  const statusPayload = statusResponse.payload && typeof statusResponse.payload === "object" ? statusResponse.payload : {};

  const latest5m = await fetchLatestCandles("5m", 5000);
  const latestEnd = latest5m.candles.at(-1)?.timestamp;
  const depth5m = await fetchRangeCandles("5m", latestEnd);
  const depth15m = await fetchRangeCandles("15m", latestEnd);
  const candles5m = depth5m.candles.length ? depth5m.candles : latest5m.candles;
  const candles15m = depth15m.candles;

  const sourceFingerprint = [
    "mt5_read_only",
    brokerSymbol,
    requestedSymbol,
    "session_raid_reversal_90d",
    candles5m.length,
    candles5m[0]?.timestamp,
    candles5m.at(-1)?.timestamp
  ].join("|");

  if (!candles5m.length) {
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
        blocker: "No MT5 5m candles available for session raid reversal evidence-depth audit."
      },
      evidenceSummary: {
        totalDaysScanned: 0,
        totalCandidates: 0,
        completeCandidateCount: 0,
        replayPassedCount: 0,
        uniqueCandidateDates: 0
      },
      authority,
      safety
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const tradingDates = Array.from(new Set(candles5m.map((candle) => tradingDateFor(candle.timestamp)))).sort();
  const evaluableDates = tradingDates.filter((dateKey) => candles5m.filter((candle) => tradingDateFor(candle.timestamp) === dateKey).length >= 48);
  const candles5mByDate = groupByTradingDate(candles5m);
  const candles15mByDate = groupByTradingDate(candles15m);

  const narratives = evaluableDates.map((tradingDate) => {
    const window5m = candlesForDateWindow(candles5mByDate, tradingDate);
    const window15m = candlesForDateWindow(candles15mByDate, tradingDate);
    return detector.evaluateIctSessionRaidReversal({
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
    });
  });
  const compact = narratives.map(compactNarrative);
  const candidateStatuses = new Set(["complete_bearish_reversal_candidate", "forming", "near_miss"]);
  const candidateLike = compact.filter((item) => candidateStatuses.has(item.status));
  const complete = compact.filter((item) => item.status === "complete_bearish_reversal_candidate");
  const replayOutcomes = complete.map((item) => ({
    tradingDate: item.tradingDate,
    status: item.status,
    rr: item.rr,
    ...replayOutcomeForShort(item, candles5m)
  }));
  const replayOutcomeCounts = countBy(replayOutcomes, (item) => item.outcome);
  const replayPassedCount = Number(replayOutcomeCounts.target_first ?? 0);
  const replayReadyCount = replayOutcomes.filter((item) => item.outcome !== "not_replay_ready").length;
  const uniqueCandidateDates = new Set(candidateLike.map((item) => item.tradingDate)).size;
  const uniqueCompleteDates = new Set(complete.map((item) => item.tradingDate)).size;

  const missingStepCounts = countBy(
    compact.flatMap((item) => item.missingConditions ?? []),
    (item) => item
  );
  const strictnessTelemetry = {
    asia_consolidation_present: compact.filter((item) => item.stepFlags.asia_consolidation_present).length,
    london_expansion_present: compact.filter((item) => item.stepFlags.london_expansion_present).length,
    asia_high_sweep_present: compact.filter((item) => item.stepFlags.asia_high_sweep_present).length,
    prior_day_high_sweep_present: compact.filter((item) => item.stepFlags.prior_day_high_sweep_present).length,
    london_high_created: compact.filter((item) => item.stepFlags.london_high_created).length,
    ny_london_high_raid_present: compact.filter((item) => item.stepFlags.ny_london_high_raid_present).length,
    bearish_mss_present: compact.filter((item) => item.stepFlags.bearish_mss_present).length,
    breaker_present: compact.filter((item) => item.stepFlags.breaker_present).length,
    fvg_present: compact.filter((item) => item.stepFlags.fvg_present).length,
    fvg_retrace_present: compact.filter((item) => item.stepFlags.fvg_retrace_present).length,
    sell_side_delivery_present: compact.filter((item) => item.stepFlags.sell_side_delivery_present).length,
    sunday_open_resolved: compact.filter((item) => item.stepFlags.sunday_open_resolved).length,
    premium_to_sunday_open: compact.filter((item) => item.stepFlags.premium_to_sunday_open).length,
    valid_rr_present: compact.filter((item) => item.stepFlags.valid_rr_present).length
  };
  const qualityBreakdown = {
    hasNyRaid: compact.filter((item) => item.qualityFlags.hasNyRaid).length,
    hasBearishMss: compact.filter((item) => item.qualityFlags.hasBearishMss).length,
    hasBreaker: compact.filter((item) => item.qualityFlags.hasBreaker).length,
    hasFvg: compact.filter((item) => item.qualityFlags.hasFvg).length,
    hasFvgRetrace: compact.filter((item) => item.qualityFlags.hasFvgRetrace).length,
    hasSellSideTarget: compact.filter((item) => item.qualityFlags.hasSellSideTarget).length,
    hasRrGte2: compact.filter((item) => item.qualityFlags.hasRrGte2).length,
    hasRrGte3: compact.filter((item) => item.qualityFlags.hasRrGte3).length
  };

  const rollingWindows = buildRollingWindows(candles5m[0]?.timestamp, candles5m.at(-1)?.timestamp);
  const preflight = buildWalkForwardPreflight({
    source: {
      provider: "mt5_read_only",
      mode: "mt5_read_only",
      brokerSymbol,
      candles: candles5m.map((candle) => ({ ...candle, symbol: requestedSymbol, timeframe: "5m" })),
      dataQuality: depth5m.summary.dataDepthStatus,
      sourceFingerprint,
      walkForwardEligible: true,
      walkForwardEligibilityReasons: [],
      appliedSettings: { targetTimeframe: "5m" },
      metadata: { symbol: requestedSymbol },
      rawCandleCount: candles5m.length,
      processedCandleCount: candles5m.length
    },
    windows: rollingWindows,
    validationChainEntry: {
      recognitionId: "nasdaq_london_raid_ny_reversal_v1_90d_audit",
      setupLabel: "NASDAQ London Raid -> NY Reversal",
      symbol: requestedSymbol,
      brokerSymbol,
      timeframe: "5m",
      sourceFingerprint,
      replayResult: {
        verdict: replayPassedCount > 0 ? "passed" : "failed",
        totalSignals: replayPassedCount,
        reason: replayPassedCount > 0
          ? "Compact audit found target-first replay outcomes."
          : "Compact audit found no target-first replay outcomes."
      }
    },
    requireReplayHandoff: true,
    minimumCandidates: 20,
    minimumReplayPassedCandidates: 20,
    minimumUniqueTradingDates: 3,
    minimumWindows: 3,
    minimumOosTrades: 20
  });

  const topCandidates = candidateLike
    .slice()
    .sort((left, right) => {
      const statusRank = { complete_bearish_reversal_candidate: 0, near_miss: 1, forming: 2 };
      return (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9) || (right.confidence ?? 0) - (left.confidence ?? 0);
    })
    .slice(0, 10)
    .map((item) => ({
      tradingDate: item.tradingDate,
      status: item.status,
      confidence: item.confidence,
      rr: item.rr,
      missingConditions: item.missingConditions.slice(0, 6),
      blockers: item.blockers,
      nextAction: item.nextAction,
      anchors: item.compactTimeAnchors
    }));

  const mostCommonMissing = Object.entries(missingStepCounts).slice(0, 8).map(([condition, count]) => ({ condition, count }));
  const detectorStrictness =
    complete.length >= 20 && uniqueCompleteDates >= 3
      ? "selective_with_enough_evidence"
      : qualityBreakdown.hasNyRaid >= 20 && qualityBreakdown.hasBearishMss >= 10 && qualityBreakdown.hasFvgRetrace < 5
        ? "likely_strict_at_fvg_retrace_or_trade_construction"
        : qualityBreakdown.hasNyRaid < Math.max(3, evaluableDates.length * 0.05)
          ? "market_condition_sparse_or_session_raid_rare"
          : "properly_selective_until_more_replay_evidence";

  const recommendation =
    preflight.status === "ready"
      ? "Walk-forward preflight is ready, but keep model research-only until deterministic OOS results are attached."
      : complete.length === 0
        ? "Keep strict and gather more occurrences; do not loosen until NY raid/MSS/FVG sequence appears in more MT5 dates."
        : uniqueCompleteDates < 3
          ? "Do not promote; collect independent dates or test a relaxed research variant separately."
          : "Run replay extension first; walk-forward remains blocked by replay-passed count.";

  const output = {
    passed: true,
    status: "completed",
    sourceSummary: {
      bridgeUrl,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      sourceType: "MT5 CFD/proxy",
      wrapperResponded: statusResponse.ok,
      bridgeMode: statusPayload.bridgeMode,
      connectionStatus: statusPayload.connectionStatus,
      latestEndpointAvailable: statusPayload.latestEndpointAvailable,
      rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
      sourceFingerprint
    },
    rangeDepthSummary: {
      primary5m: depth5m.summary,
      entry15m: depth15m.summary
    },
    evidenceSummary: {
      totalTradingDatesAvailable: tradingDates.length,
      totalDaysScanned: evaluableDates.length,
      totalCandidates: candidateLike.length,
      statusCounts: countBy(compact, (item) => item.status),
      uniqueCandidateDates,
      completedCandidateCount: complete.length,
      completedCandidateDates: Array.from(new Set(complete.map((item) => item.tradingDate))).sort(),
      replayReadyCount,
      replayPassedCount,
      replayOutcomeCounts,
      candidateQualityBreakdown: qualityBreakdown,
      strictnessTelemetry,
      mostCommonMissingSteps: mostCommonMissing,
      detectorStrictness,
      recommendation
    },
    walkForwardPreflight: {
      status: preflight.status,
      availableCandidateCount: preflight.availableCandidateCount,
      replayPassedCandidateCount: preflight.replayPassedCandidateCount,
      uniqueTradingDates: preflight.uniqueTradingDates,
      activeRollingWindowsPossible: preflight.activeRollingWindowsPossible,
      estimatedOosTrades: preflight.estimatedOosTrades,
      requiredCandidates: preflight.requiredCandidates,
      requiredReplayPassedCandidates: preflight.requiredReplayPassedCandidates,
      requiredUniqueTradingDates: preflight.requiredUniqueTradingDates,
      requiredWindows: preflight.requiredWindows,
      requiredOosTrades: preflight.requiredOosTrades,
      blockers: preflight.blockers,
      warnings: preflight.warnings,
      nextAction: preflight.nextAction,
      authority: preflight.authority,
      safety: preflight.safety
    },
    top10CandidateSummaries: topCandidates,
    replayOutcomeSamples: replayOutcomes.slice(0, 10),
    authority,
    safety
  };

  const scan = safetyScan(output);
  output.safetyChecks = scan;
  output.passed = !scan.rawCandlesSerialized && !scan.secretsSerialized && !scan.accountOrderPositionSerialized && scan.authorityNone;
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.passed ? 0 : 1;
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
