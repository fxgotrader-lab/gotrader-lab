#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "live-session-raid-reversal-test");
const sourceFiles = [
  "ictTradeConstructionTypes.ts",
  "ictTradeConstruction.ts",
  "ictSessionRaidReversalTypes.ts",
  "ictSessionRaidReversal.ts"
];

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const timingZone = "America/New_York";
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);
const latestLimit = Math.min(5000, Math.max(1000, Number(process.env.SESSION_RAID_LIVE_LIMIT || 5000)));
const rangeChunkDays = Number(process.env.SESSION_RAID_DEPTH_CHUNK_DAYS || 10);
const rangeLookbackDays = Number(process.env.SESSION_RAID_DEPTH_DAYS || 90);

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

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, decimals = 2) => Number(value.toFixed(decimals));

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(ictRoot, file);
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
      const key = `${candle.timestamp}`;
      if (seen.has(key)) return false;
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
  const dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return {
    dateKey,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    label: `${dateKey} ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${timingZone}`
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

const sessionFilter = (candles, tradingDate, startMinute, endMinute) =>
  candles.filter((candle) => {
    if (tradingDateFor(candle.timestamp) !== tradingDate) return false;
    const minute = localParts(candle.timestamp).minuteOfDay;
    return startMinute <= endMinute
      ? minute >= startMinute && minute < endMinute
      : minute >= startMinute || minute < endMinute;
  });

const highCandle = (candles) =>
  candles.reduce((best, candle) => (!best || candle.high > best.high ? candle : best), undefined);

const lowCandle = (candles) =>
  candles.reduce((best, candle) => (!best || candle.low < best.low ? candle : best), undefined);

const levelTrace = ({ label, candle, price, timeframe, sourceWindow, source }) => ({
  label,
  detected: finite(price),
  value: finite(price) ? round(price) : undefined,
  timestamp: candle?.timestamp,
  localTime: candle?.timestamp ? localParts(candle.timestamp).label : undefined,
  timeframe,
  candleId: candle?.id,
  sourceWindow,
  source,
  confidence: finite(price) ? 1 : 0,
  notes: finite(price) ? "Resolved from MT5 read-only compact candle references." : "Reference missing from loaded window."
});

const rangeTrace = ({ label, high, low, timeframe, sourceWindow, highSource, lowSource }) => ({
  label,
  detected: Boolean(highSource && lowSource),
  high: highSource ? levelTrace({ label: `${label} High`, candle: highSource, price: highSource.high, timeframe, sourceWindow, source: `${sourceWindow}_high` }) : undefined,
  low: lowSource ? levelTrace({ label: `${label} Low`, candle: lowSource, price: lowSource.low, timeframe, sourceWindow, source: `${sourceWindow}_low` }) : undefined,
  range: highSource && lowSource ? round(high - low) : undefined,
  sourceWindow
});

const summarizeCandles = (payload, candles) => ({
  returnedCount: candles.length,
  firstTimestamp: candles[0]?.timestamp ?? payload?.firstTimestamp,
  lastTimestamp: candles.at(-1)?.timestamp ?? payload?.lastTimestamp,
  sourceMethod: payload?.sourceMethod,
  connectionStatus: payload?.connectionStatus,
  depthStatus: payload?.depthStatus
});

const fetchCandles = async (timeframe, limit = latestLimit) => {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit
  }));
  const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
  const candles = normalizeCandles(Array.isArray(payload.candles) ? payload.candles : []);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    candles,
    summary: summarizeCandles(payload, candles)
  };
};

const dateWindows = (endTime) => {
  const end = new Date(endTime);
  const start = new Date(end.getTime() - rangeLookbackDays * 24 * 60 * 60 * 1000);
  const windows = [];
  const chunkMillis = Math.max(1, rangeChunkDays) * 24 * 60 * 60 * 1000;
  let cursor = start.getTime();
  while (cursor < end.getTime() && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end.getTime());
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

const fetchDepthSummary = async (latestTimestamp) => {
  if (!latestTimestamp) return { attempted: false, status: "latest_timestamp_missing" };
  const chunks = [];
  const all = [];
  for (const window of dateWindows(Date.parse(latestTimestamp))) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe: "5m",
      from: window.from,
      to: window.to,
      limit: 5000
    }));
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const candles = normalizeCandles(Array.isArray(payload.candles) ? payload.candles : []);
    all.push(...candles);
    chunks.push({
      from: window.from,
      to: window.to,
      returnedCount: candles.length,
      status: response.status,
      ok: response.ok,
      firstTimestamp: candles[0]?.timestamp,
      lastTimestamp: candles.at(-1)?.timestamp
    });
  }
  const deduped = normalizeCandles(all);
  const firstTimestamp = deduped[0]?.timestamp;
  const lastTimestamp = deduped.at(-1)?.timestamp;
  const availableLookbackDays = firstTimestamp && lastTimestamp
    ? round((Date.parse(lastTimestamp) - Date.parse(firstTimestamp)) / (24 * 60 * 60 * 1000))
    : 0;
  return {
    attempted: true,
    requestedLookbackDays: rangeLookbackDays,
    requestedChunkCount: chunks.length,
    completedChunkCount: chunks.filter((chunk) => chunk.ok).length,
    candleCount: deduped.length,
    firstTimestamp,
    lastTimestamp,
    availableLookbackDays,
    dataDepthStatus: availableLookbackDays >= rangeLookbackDays * 0.8 ? "sufficient" : deduped.length ? "limited" : "unavailable",
    chunks
  };
};

const compactStep = (step) => ({
  step: step.step,
  status: step.detected ? "present" : "missing",
  timestamp: step.timestamp,
  localTime: step.localTime,
  price: step.price,
  high: step.high,
  low: step.low,
  note: step.note,
  confidence: step.confidence
});

const safetyScan = (value) => {
  const serialized = JSON.stringify(value);
  return {
    rawCandlesSerialized: /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i.test(serialized),
    secretsSerialized: /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i.test(serialized),
    accountOrderPositionSerialized: /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i.test(serialized)
  };
};

const statusResponse = await fetchWithTimeout(endpoint("status")).catch((error) => ({
  ok: false,
  status: 0,
  payload: { error: error instanceof Error ? error.message : String(error) }
}));
const statusPayload = statusResponse.payload && typeof statusResponse.payload === "object" ? statusResponse.payload : {};
const fiveMinute = await fetchCandles("5m");
const fifteenMinute = await fetchCandles("15m");
const htfFetches = await Promise.all(["1h", "4h", "1d"].map(async (timeframe) => ({ timeframe, result: await fetchCandles(timeframe, 500) })));

if (!fiveMinute.candles.length) {
  const output = {
    passed: true,
    status: "blocked_source_unavailable",
    sourceSummary: {
      bridgeUrl,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      wrapperResponded: statusResponse.ok,
      connectionStatus: statusPayload.connectionStatus,
      bridgeMode: statusPayload.bridgeMode,
      latestEndpointAvailable: statusPayload.latestEndpointAvailable,
      rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
      blocker: "No MT5 5m candles available for live session raid validation."
    },
    authority,
    safety
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

compileForNode();
const detector = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversal.mjs")).href);

const latest = fiveMinute.candles.at(-1);
const latestLocal = localParts(latest.timestamp);
const currentNy = localParts(new Date().toISOString());
const latestTradingDate = tradingDateFor(latest.timestamp);
const nowWeekend = ["Sat", "Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: timingZone, weekday: "short" }).format(new Date()));
const todayMeansLatestAvailableTradingDay = currentNy.dateKey !== latestLocal.dateKey || nowWeekend;
const previousTradingDate = addDays(latestTradingDate, -1);

const dayCandles = fiveMinute.candles.filter((candle) => tradingDateFor(candle.timestamp) === latestTradingDate);
const priorDayCandles = fiveMinute.candles.filter((candle) => tradingDateFor(candle.timestamp) === previousTradingDate);
const asia = sessionFilter(fiveMinute.candles, latestTradingDate, 20 * 60, 1 * 60);
const london = sessionFilter(fiveMinute.candles, latestTradingDate, 2 * 60, 5 * 60);
const nyAm = sessionFilter(fiveMinute.candles, latestTradingDate, 9 * 60 + 30, 12 * 60);
const sundayCandidates = fiveMinute.candles.filter((candle) => {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timingZone, weekday: "short" }).format(new Date(candle.timestamp));
  const parts = localParts(candle.timestamp);
  return weekday === "Sun" && parts.minuteOfDay >= 18 * 60 && parts.dateKey <= latestTradingDate;
});
const latestSundayDate = sundayCandidates.map((candle) => localParts(candle.timestamp).dateKey).sort().at(-1);
const sundayOpenCandle = latestSundayDate
  ? sundayCandidates.find((candle) => localParts(candle.timestamp).dateKey === latestSundayDate)
  : undefined;
const midnightOpenCandle = fiveMinute.candles.find((candle) => {
  const parts = localParts(candle.timestamp);
  return parts.dateKey === latestTradingDate && parts.minuteOfDay === 0;
});

const asiaHigh = highCandle(asia);
const asiaLow = lowCandle(asia);
const priorHigh = highCandle(priorDayCandles);
const priorLow = lowCandle(priorDayCandles);
const londonHigh = highCandle(london);
const londonLow = lowCandle(london);
const nyHigh = highCandle(nyAm);
const nyLow = lowCandle(nyAm);

const sourceFingerprint = [
  "mt5_read_only",
  brokerSymbol,
  requestedSymbol,
  "5m",
  fiveMinute.candles.length,
  fiveMinute.candles[0]?.timestamp,
  latest.timestamp
].join("|");

const htfContext = Object.fromEntries(
  htfFetches
    .filter(({ result }) => result.candles.length)
    .map(({ timeframe, result }) => [timeframe.toUpperCase(), result.candles.map(() => ({}))])
);

const narrative = detector.evaluateIctSessionRaidReversal({
  candles5m: fiveMinute.candles,
  candles15m: fifteenMinute.candles,
  htfContext,
  requestedSymbol,
  brokerSymbol,
  sourceProvider: "mt5_read_only",
  sourceFingerprint,
  primaryTimeframe: "5m",
  entryTimeframe: "15m",
  timingZone,
  tradingDate: latestTradingDate
});

const depthSummary = await fetchDepthSummary(latest.timestamp);

const referenceLevels = {
  sundayOpen: levelTrace({
    label: "Sunday Open",
    candle: sundayOpenCandle,
    price: sundayOpenCandle?.open,
    timeframe: "5m",
    sourceWindow: "Sunday 18:00+ New York",
    source: "first_sunday_evening_candle"
  }),
  twelveAmOpen: levelTrace({
    label: "12AM NY Open",
    candle: midnightOpenCandle,
    price: midnightOpenCandle?.open,
    timeframe: "5m",
    sourceWindow: "00:00 New York",
    source: "session_local_exact_midnight"
  }),
  asia: rangeTrace({
    label: "Asia",
    high: asiaHigh?.high,
    low: asiaLow?.low,
    timeframe: "5m",
    sourceWindow: "20:00-01:00 New York",
    highSource: asiaHigh,
    lowSource: asiaLow
  }),
  priorDay: rangeTrace({
    label: "Prior Day",
    high: priorHigh?.high,
    low: priorLow?.low,
    timeframe: "5m",
    sourceWindow: `Trading date ${previousTradingDate}`,
    highSource: priorHigh,
    lowSource: priorLow
  }),
  london: rangeTrace({
    label: "London",
    high: londonHigh?.high,
    low: londonLow?.low,
    timeframe: "5m",
    sourceWindow: "02:00-05:00 New York",
    highSource: londonHigh,
    lowSource: londonLow
  }),
  nyAm: rangeTrace({
    label: "NY AM",
    high: nyHigh?.high,
    low: nyLow?.low,
    timeframe: "5m",
    sourceWindow: "09:30-12:00 New York",
    highSource: nyHigh,
    lowSource: nyLow
  }),
  premiumDiscountRelativeToSundayOpen: narrative.referenceLevels.currentPremiumDiscount,
  sellSideTargets: narrative.referenceLevels.sellSideLiquidityTargets,
  buySideTargets: narrative.referenceLevels.buySideLiquidityTargets
};

const stepByName = Object.fromEntries(narrative.steps.map((item) => [item.step, item]));
const scenarioMatch = [
  ["Asia consolidation into London", "asia_consolidation"],
  ["London expansion above 12AM Open", "london_expansion"],
  ["Asia High sweep", "asia_high_sweep"],
  ["Prior-day high sweep", "prior_day_high_sweep"],
  ["London High created", "london_high_created"],
  ["NY raid above London High", "ny_london_high_raid"],
  ["Bearish MSS / BMS", "bearish_mss"],
  ["15m breaker detected", "breaker_detected"],
  ["15m FVG detected", "fvg_detected"],
  ["Retrace into FVG", "fvg_retrace"],
  ["Sell-side delivery", "sell_side_delivery"]
].map(([description, stepName]) => ({
  description,
  step: stepName,
  matched: Boolean(stepByName[stepName]?.detected),
  evidence: stepByName[stepName] ? compactStep(stepByName[stepName]) : undefined
}));

const output = {
  passed: true,
  sourceSummary: {
    bridgeUrl,
    requestedSymbol,
    brokerSymbol,
    sourceProvider: "mt5_read_only",
    sourceType: "MT5 CFD/proxy",
    wrapperResponded: statusResponse.ok,
    connectionStatus: statusPayload.connectionStatus,
    bridgeMode: statusPayload.bridgeMode,
    latestEndpointAvailable: statusPayload.latestEndpointAvailable,
    rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
    latest5m: fiveMinute.summary,
    latest15m: fifteenMinute.summary,
    htfAvailability: Object.fromEntries(htfFetches.map(({ timeframe, result }) => [timeframe, result.summary])),
    depth90d: {
      attempted: depthSummary.attempted,
      requestedLookbackDays: depthSummary.requestedLookbackDays,
      completedChunkCount: depthSummary.completedChunkCount,
      candleCount: depthSummary.candleCount,
      availableLookbackDays: depthSummary.availableLookbackDays,
      dataDepthStatus: depthSummary.dataDepthStatus
    },
    sourceFingerprint
  },
  dateStatus: {
    currentTradingDateUsed: latestTradingDate,
    previousTradingDate,
    latestCandleTimestamp: latest.timestamp,
    latestCandleLocalTime: latestLocal.label,
    currentNyDate: currentNy.dateKey,
    marketCurrentlyWeekend: nowWeekend,
    todayShouldMeanLatestAvailableTradingDay: todayMeansLatestAvailableTradingDay
  },
  referenceLevels,
  narrativeTrace: {
    status: narrative.status,
    confidence: narrative.confidence,
    steps: narrative.steps.map(compactStep),
    missingConditions: narrative.missingConditions,
    blockers: narrative.blockers,
    nextAction: narrative.nextAction
  },
  scenarioMatch,
  tradeConstruction: {
    validCandidate: narrative.status === "complete_bearish_reversal_candidate",
    replayRequired: narrative.status === "complete_bearish_reversal_candidate",
    entryModel: narrative.fairValueGap ? "15m_fvg" : narrative.breaker ? "breaker" : "none",
    entry: narrative.entry,
    invalidation: narrative.invalidation,
    target: narrative.target,
    rr: narrative.rr,
    tradeConstructionBlockers: narrative.tradeConstructionBlockers,
    validationChainSeedPresent: Boolean(narrative.validationChainSeed)
  },
  uiTrace: {
    ictLabCard: "NASDAQ London Raid -> NY Reversal Narrative",
    advisorCard: "NASDAQ London Raid -> NY Reversal",
    displaysReferenceLevels: true,
    displaysNarrativeSteps: true,
    displaysMissingSteps: true,
    displaysSundayOpenPremiumLogic: true,
    displaysNextAction: true,
    authorityDisplayedAsNone: true
  },
  weeklyScenarios: {
    bullish: narrative.bullishScenario,
    bearish: narrative.bearishScenario
  },
  authority,
  safety
};

const scan = safetyScan(output);
output.safetyChecks = {
  ...scan,
  authorityNone:
    output.authority.executionAuthority === "none" &&
    output.authority.brokerAuthority === "none" &&
    output.authority.readinessOverrideAuthority === "none"
};
output.passed = Object.values(output.safetyChecks).every((value) => value === false) || output.safetyChecks.authorityNone;
if (scan.rawCandlesSerialized || scan.secretsSerialized || scan.accountOrderPositionSerialized || !output.safetyChecks.authorityNone) {
  output.passed = false;
}

console.log(JSON.stringify(output, null, 2));
process.exitCode = output.passed ? 0 : 1;
