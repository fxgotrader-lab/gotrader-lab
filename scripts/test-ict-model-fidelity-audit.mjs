#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-model-fidelity-audit-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_MODEL_FIDELITY_DAYS || 90);
const chunkDays = Number(process.env.ICT_MODEL_FIDELITY_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_MODEL_FIDELITY_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_MODEL_FIDELITY_MAX_WINDOWS || 100));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);

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
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictSessionNarrativeTypes.ts" },
  { root: sourceRoot, file: "ictGrinchModelTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizerTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
  { root: sourceRoot, file: "ictSignalContractTypes.ts" },
  { root: sourceRoot, file: "ictSignalContract.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulatorTypes.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulator.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictBrowserResearchLimits.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictSessionNarrative.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictCurrentReadTypes.ts" },
  { root: sourceRoot, file: "ictCurrentRead.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: sourceRoot, file: "ictMonteCarlo.ts" },
  { root: sourceRoot, file: "ictResearchReport.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyDepth.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { file, root } of sourceFiles) {
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
      .replace(/from\s+"..\/integrations\/mt5\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'..\/integrations\/mt5\/([^']+)'/g, "from './$1.mjs'")
      .replace(/from\s+"@\/lib\/integrations\/mt5\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'@\/lib\/integrations\/mt5\/([^']+)'/g, "from './$1.mjs'")
      .replace(/from\s+"..\/candleSources"/g, 'from "./candleSourcesStub.mjs"')
      .replace(/from\s+'..\/candleSources'/g, "from './candleSourcesStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(
    path.join(outRoot, "candleSourcesStub.mjs"),
    `export async function loadCanonicalCandleSource(sourceId) {
  return globalThis.__ICT_MODEL_FIDELITY_AUDIT_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_MODEL_FIDELITY_AUDIT_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};
const topCounts = (values, selector, limit = 10) =>
  Object.entries(countBy(values, selector)).map(([key, count]) => ({ key, count })).slice(0, limit);

const endpoint = (pathName, params = {}) => {
  const url = new URL(`${bridgeUrl}/${pathName.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
};

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const parseCandleTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeMt5Candles = ({ candles = [], requestedSymbol, brokerSymbol, timeframe }) => {
  const seen = new Set();
  return candles
    .filter(
      (candle) =>
        candle &&
        typeof candle === "object" &&
        Boolean(candle.timestamp) &&
        Number.isFinite(Number(candle.open)) &&
        Number.isFinite(Number(candle.high)) &&
        Number.isFinite(Number(candle.low)) &&
        Number.isFinite(Number(candle.close))
    )
    .sort((left, right) => parseCandleTime(left) - parseCandleTime(right))
    .filter((candle) => {
      const key = parseCandleTime(candle);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candle, index) => ({
      id: `mt5_model_fidelity_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
      symbol: requestedSymbol,
      timeframe,
      timestamp: candle.timestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? candle.tickVolume ?? candle.tick_volume ?? 0)
    }));
};

const dateWindows = (endTimestamp) => {
  const end = Date.parse(endTimestamp);
  const start = end - requestedLookbackDays * 86_400_000;
  const chunkMillis = Math.max(1, chunkDays) * 86_400_000;
  const windows = [];
  let cursor = start;
  while (cursor < end && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchChunkedCandles() {
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe: primaryTimeframe,
    limit: Math.min(limitPerChunk, 5000)
  }));
  if (!latest.ok) throw new Error(`Latest MT5 candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");

  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe: primaryTimeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) throw new Error(`Range MT5 candles returned HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunks.push({
      from: window.from,
      to: window.to,
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? chunkCandles.at(-1)?.timestamp
    });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, requestedSymbol, brokerSymbol, timeframe: primaryTimeframe });
  return {
    candles,
    chunks,
    candleCount: candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp,
    availableLookbackDays:
      candles[0]?.timestamp && candles.at(-1)?.timestamp
        ? round((Date.parse(candles.at(-1).timestamp) - Date.parse(candles[0].timestamp)) / 86_400_000, 2)
        : 0
  };
}

const isoNy = (localDate, hhmm) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0)).toISOString();
};

const fixtureCandle = (id, localDate, hhmm, open, high, low, close) => ({
  id,
  symbol: "MNQ",
  timeframe: "15m",
  timestamp: isoNy(localDate, hhmm),
  open,
  high,
  low,
  close,
  volume: 1000
});

const modelAFixture = [
  fixtureCandle("a_asia_0", "2026-06-04", "20:00", 100, 103, 96, 101),
  fixtureCandle("a_asia_1", "2026-06-04", "20:15", 101, 104, 94, 98),
  fixtureCandle("a_asia_2", "2026-06-04", "20:30", 98, 102, 92, 95),
  fixtureCandle("a_asia_3", "2026-06-04", "21:00", 95, 101, 90, 97),
  fixtureCandle("a_asia_4", "2026-06-04", "22:00", 97, 105, 91, 104),
  fixtureCandle("a_asia_5", "2026-06-04", "23:45", 104, 106, 95, 99),
  fixtureCandle("a_midnight", "2026-06-05", "00:00", 100, 101, 98, 99),
  fixtureCandle("a_london_0", "2026-06-05", "02:00", 99, 101, 91, 95),
  fixtureCandle("a_london_1", "2026-06-05", "02:15", 95, 100, 90.8, 96),
  fixtureCandle("a_london_2", "2026-06-05", "02:30", 96, 102, 91.2, 101),
  fixtureCandle("a_london_3", "2026-06-05", "03:00", 101, 104, 94, 103),
  fixtureCandle("a_manip_0", "2026-06-05", "04:15", 103, 107, 98, 106),
  fixtureCandle("a_manip_1", "2026-06-05", "04:30", 106, 109, 99, 101),
  fixtureCandle("a_pre_ny", "2026-06-05", "08:45", 105, 106, 99, 100),
  fixtureCandle("a_ny_0", "2026-06-05", "09:30", 100, 105, 96, 98),
  fixtureCandle("a_ny_1", "2026-06-05", "09:45", 98, 101, 88, 90),
  fixtureCandle("a_ny_2", "2026-06-05", "10:00", 90, 92, 82, 85),
  fixtureCandle("a_ny_3", "2026-06-05", "10:15", 85, 87, 78, 80)
];

const modelBFixture = [
  fixtureCandle("b_prior_range_low", "2026-06-02", "09:30", 125, 130, 90, 112),
  fixtureCandle("b_prior_fvg_left", "2026-06-03", "06:00", 150, 154, 148, 152),
  fixtureCandle("b_prior_fvg_mid", "2026-06-03", "06:15", 152, 158, 151, 156),
  fixtureCandle("b_prior_fvg_right", "2026-06-03", "06:30", 170, 190, 170, 184),
  fixtureCandle("b_asia_0", "2026-06-03", "20:00", 128, 132, 122, 130),
  fixtureCandle("b_asia_1", "2026-06-03", "20:15", 130, 134, 121, 126),
  fixtureCandle("b_asia_2", "2026-06-03", "21:00", 126, 135, 120, 132),
  fixtureCandle("b_asia_3", "2026-06-03", "23:45", 132, 134, 123, 129),
  fixtureCandle("b_midnight", "2026-06-04", "00:00", 130, 131, 126, 128),
  fixtureCandle("b_london_sweep", "2026-06-04", "02:00", 128, 139, 126, 137),
  fixtureCandle("b_london_reject", "2026-06-04", "02:15", 137, 138, 124, 126),
  fixtureCandle("b_london_drive_0", "2026-06-04", "03:00", 126, 128, 118, 120),
  fixtureCandle("b_london_drive_1", "2026-06-04", "04:15", 120, 121, 112, 115),
  fixtureCandle("b_preopen_0", "2026-06-04", "08:00", 115, 120, 113, 118),
  fixtureCandle("b_preopen_1", "2026-06-04", "08:30", 118, 121, 114, 117),
  fixtureCandle("b_preopen_2", "2026-06-04", "09:00", 117, 120, 114, 116),
  fixtureCandle("b_ny_sweep", "2026-06-04", "09:30", 116, 122, 108, 119),
  fixtureCandle("b_ny_drive_0", "2026-06-04", "09:45", 119, 136, 118, 134),
  fixtureCandle("b_ny_drive_1", "2026-06-04", "10:00", 134, 156, 132, 150)
];

const conceptInventory = [
  ["Asia range", "implemented_and_wired", "ictSessionNarrative.calculateIctSessionRanges"],
  ["London sweep", "implemented_and_wired", "ictSessionNarrative.detectLondonSweepOfAsia"],
  ["12AM open reclaim/rejection", "implemented_and_wired", "ictSessionNarrative.detectMidnightReclaim/Rejection"],
  ["3AM London behavior", "partially_implemented", "London window is 2AM-5AM; no dedicated 3AM behavior state"],
  ["NY 9:30 open sweep", "implemented_and_wired", "ictSessionNarrative.detectNyOpenConsolidationSweep"],
  ["NY reversal", "implemented_and_wired", "ictSessionNarrative ny_reversal_higher/lower"],
  ["NY continuation/distribution", "partially_implemented", "CMD and AME profiles exist; trend_continuation type is label-only"],
  ["premium/discount", "implemented_and_wired", "activeDealingRange.currentLocation"],
  ["dealing range", "implemented_and_wired", "calculateActiveDealingRange"],
  ["fair value gap as target", "implemented_and_wired", "ictSessionNarrative.detectFvgTarget"],
  ["fair value gap as entry", "implemented_and_wired", "ictAdvisorEngine / phase setups"],
  ["liquidity sweep", "implemented_and_wired", "buyside/sellside sweep events"],
  ["equal highs/equal lows", "implemented_and_wired", "eventForEqualLiquidity"],
  ["sell-side liquidity", "implemented_and_wired", "sellside_sweep"],
  ["buy-side liquidity", "implemented_and_wired", "buyside_sweep"],
  ["mitigation block", "partially_implemented", "phase2/order-block plus NY mitigation tap; not a full named session model"],
  ["order block", "implemented_and_wired", "ictPhase2OrderBlocks"],
  ["breaker", "implemented_and_wired", "breaker_block variant and breaker_retest setup"],
  ["displacement", "implemented_and_wired", "advisor displacement/FVG and session expansion events"],
  ["market structure shift", "partially_implemented", "Grinch/agent context references; not first-class in ICT Strategy Suite session narrative"],
  ["low resistance liquidity run", "missing", "No dedicated LRLR model contract found"],
  ["consolidation profile", "implemented_and_wired", "consolidation_manipulation_distribution and range_liquidity_sweep"],
  ["expansion profile", "implemented_and_wired", "AME / bullish and bearish expansion events"],
  ["reversal profile", "implemented_and_wired", "ny_session_reversal_to_premium_fvg"],
  ["seek and destroy profile", "missing", "No first-class seek-and-destroy model contract found"],
  ["Grinch Model 1", "partially_implemented", "strategyLibrary Grinch Phase 1 exists; ICT Strategy Suite now reports generic session model detection"],
  ["Grinch reversal", "partially_implemented", "strategyLibrary Grinch reversal profile exists; not fully merged into ICT Strategy Suite model detection"],
  ["Grinch consolidation", "partially_implemented", "strategyLibrary Grinch consolidation profile exists; not fully merged into ICT Strategy Suite model detection"],
  ["ICT 2022 mentorship model logic", "partially_implemented", "Core concepts exist; no complete named 2022 model contract"]
].map(([concept, status, evidence]) => ({ concept, status, evidence }));

const statusWeight = (status) =>
  status === "approved_research_candidate" ? 5 : status === "paper_watchlist_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const selectDecision = (decisions) =>
  decisions.slice().sort((left, right) => statusWeight(right.status) - statusWeight(left.status) || right.approvalScore - left.approvalScore)[0];

const decisionPairsFor = (suite, replayResults) =>
  replayResults.map((result) => {
    const decision = selectDecision(suite.evaluateApprovedSetupProfiles(result));
    return {
      result: { ...result, approvedProfileStatus: decision?.status },
      decision
    };
  });

const metadataMissing = (result) => [
  typeof result.tradePath?.target === "number" ? undefined : "target",
  typeof result.tradePath?.invalidation === "number" ? undefined : "invalidation",
  typeof (result.rrEstimate ?? result.tradePath?.rrAchieved) === "number" ? undefined : "rr",
  typeof result.confidence === "number" ? undefined : "confidence"
].filter(Boolean);

const compactModelSummary = (narrative) => ({
  profile: narrative.profile,
  primaryModel: narrative.primaryModelDetection
    ? {
        modelDetected: narrative.primaryModelDetection.modelDetected,
        modelName: narrative.primaryModelDetection.modelName,
        modelState: narrative.primaryModelDetection.modelState,
        modelDirection: narrative.primaryModelDetection.modelDirection,
        modelConfidence: narrative.primaryModelDetection.modelConfidence,
        missingEvidence: narrative.primaryModelDetection.missingEvidence
      }
    : undefined,
  modelDetections: narrative.modelDetections.map((detection) => ({
    modelName: detection.modelName,
    modelState: detection.modelState,
    modelDirection: detection.modelDirection,
    modelConfidence: detection.modelConfidence,
    missingEvidence: detection.missingEvidence
  })),
  eventTypes: narrative.events.map((event) => event.eventType),
  topReasons: narrative.topReasons.slice(0, 5)
});

const makeSource = (candles, depth) => ({
  sourceId: `ict_model_fidelity:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
  provider: "mt5_read_only",
  symbol: requestedSymbol,
  normalizedSymbol: requestedSymbol,
  timeframe: primaryTimeframe,
  candles,
  candleCount: candles.length,
  firstTimestamp: candles[0]?.timestamp,
  lastTimestamp: candles.at(-1)?.timestamp,
  storageBackend: "memory",
  dataQuality: candles.length ? "sufficient" : "insufficient",
  eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: candles.length >= 1000 },
  eligibilityReasons: [],
  warnings: ["MT5 read-only USTECH is CFD/proxy data, not CME MNQ futures truth."],
  provenance: {
    sourceLabel: "MT5 read-only CFD/proxy model fidelity source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_model_fidelity|${brokerSymbol}|${primaryTimeframe}|${candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
  roles: ["research", "chart_display", "available"]
});

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const modelA = suite.buildIctSessionNarrative(modelAFixture, {
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe: "15m",
    requestedLookbackDays
  });
  const modelB = suite.buildIctSessionNarrative(modelBFixture, {
    requestedSymbol,
    brokerSymbol,
    primaryTimeframe: "15m",
    requestedLookbackDays,
    tradingDate: "2026-06-04"
  });
  assert.equal(modelA.primaryModelDetection?.modelName, "consolidation_manipulation_distribution");
  assert.equal(modelA.primaryModelDetection?.modelState, "confirmed");
  assert.equal(modelB.primaryModelDetection?.modelName, "ny_session_reversal_to_premium_fvg");
  assert.equal(modelB.primaryModelDetection?.modelState, "confirmed");
  assert.equal(suite.assertIctSessionNarrativeIsCompact(modelA).ok, true);
  assert.equal(suite.assertIctSessionNarrativeIsCompact(modelB).ok, true);

  const depth = await fetchChunkedCandles();
  const source = makeSource(depth.candles, depth);
  globalThis.__ICT_MODEL_FIDELITY_AUDIT_SOURCES = new Map([[source.sourceId, source]]);
  const replay = await suite.runIctRealReplay(
    {
      requestedSymbols: [requestedSymbol],
      brokerSymbols: [brokerSymbol],
      primaryTimeframes: [primaryTimeframe],
      htfTimeframes: [],
      candleLimit: depth.candles.length,
      replayWindowSize: 80,
      lookaheadCandles: 24,
      requestedLookbackDays,
      appendJournal: false
    },
    {
      includeReplayResults: true,
      maxReplayWindows,
      fetchCandles: async () => ({
        requestedSymbol,
        brokerSymbol,
        timeframe: primaryTimeframe,
        candles: depth.candles,
        candleCount: depth.candles.length,
        connectionStatus: depth.candles.length ? "connected" : "disconnected",
        depthStatus: depth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "full" : "partial",
        firstTimestamp: depth.firstTimestamp,
        lastTimestamp: depth.lastTimestamp,
        warnings: ["Model fidelity audit used explicit read-only MT5 90-day chunks; raw candles stayed internal."],
        missingEvidence: depth.candles.length ? [] : ["No MT5 candles were available."]
      }),
      newsSessionRiskContext: { syntheticNoRisk: true }
    }
  );
  const replayResults = replay.replayResults ?? [];
  const pairs = decisionPairsFor(suite, replayResults);
  const detectedPairs = pairs.filter(({ result }) => result.modelDetected);
  const confirmedPairs = detectedPairs.filter(({ result }) => result.modelState === "confirmed");
  const formingTriggeredPairs = detectedPairs.filter(({ result }) => ["forming", "triggered"].includes(result.modelState ?? ""));
  const approvedPairs = pairs.filter(({ decision }) => decision?.status === "approved_research_candidate");
  const paperWatchlistPairs = pairs.filter(({ decision }) => decision?.status === "paper_watchlist_candidate");
  const watchlistPairs = pairs.filter(({ decision }) => decision?.status === "watchlist_candidate");
  const rejectedPairs = pairs.filter(({ decision }) => decision?.status === "rejected_candidate");
  const noTradePairs = pairs.filter(({ decision, result }) => decision?.status === "no_trade" || result.decision === "no_trade");
  const detectedButNotApproved = detectedPairs.filter(({ decision }) => decision?.status !== "approved_research_candidate");
  const detectedResearchCandidates = detectedPairs.filter(({ result }) => result.decision === "research_only");
  const metadataMissingRows = detectedResearchCandidates.flatMap(({ result }) => metadataMissing(result));

  const report = {
    diagnostic: "ict_model_fidelity_audit",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      requestedLookbackDays,
      availableLookbackDays: depth.availableLookbackDays,
      candleCount: depth.candleCount,
      chunkCount: depth.chunks.length,
      firstTimestamp: depth.firstTimestamp,
      lastTimestamp: depth.lastTimestamp,
      dataDepthStatus: depth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited",
      replayWindowBudget: maxReplayWindows,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    modelInventory: conceptInventory,
    fixtureVerification: {
      modelA: compactModelSummary(modelA),
      modelB: compactModelSummary(modelB)
    },
    replayModelDetection: {
      totalReplayResults: replayResults.length,
      totalModelDetections: detectedPairs.length,
      totalConfirmedModels: confirmedPairs.length,
      totalFormingOrTriggeredModels: formingTriggeredPairs.length,
      totalApprovedTradeCandidates: approvedPairs.length,
      totalPaperWatchlistTradeCandidates: paperWatchlistPairs.length,
      totalWatchlistTradeCandidates: watchlistPairs.length,
      totalRejectedTradeCandidates: rejectedPairs.length,
      totalNoTradeCandidates: noTradePairs.length,
      byModelName: countBy(detectedPairs, ({ result }) => result.modelName),
      byModelState: countBy(detectedPairs, ({ result }) => result.modelState),
      byModelAndCandidateStatus: countBy(detectedPairs, ({ result, decision }) => `${result.modelName ?? "unknown"}:${decision?.status ?? "unknown"}`),
      bySessionNarrativeProfile: countBy(pairs, ({ result }) => result.sessionNarrativeProfile),
      modelDetectionRate: replayResults.length ? round(detectedPairs.length / replayResults.length) : 0,
      approvedGivenModelDetectedRate: detectedPairs.length ? round(approvedPairs.filter(({ result }) => result.modelDetected).length / detectedPairs.length) : 0
    },
    modelToSignalFailureAnalysis: {
      topReasonsModelsFailedToBecomeApproved: topCounts(detectedButNotApproved, ({ decision, result }) =>
        decision?.rejectionReasons?.[0] ?? decision?.watchlistReasons?.[0] ?? result.noTradeReasons?.[0] ?? "reason unavailable"
      ),
      topMissingMetadataFields: topCounts(metadataMissingRows, (field) => field),
      metadataScope: "detected research-only candidates after compact target/invalidation/RR construction",
      rejectedWithDetectedModelCount: detectedButNotApproved.filter(({ decision }) => decision?.status === "rejected_candidate").length,
      paperWatchlistWithDetectedModelCount: detectedButNotApproved.filter(({ decision }) => decision?.status === "paper_watchlist_candidate").length,
      watchlistWithDetectedModelCount: detectedButNotApproved.filter(({ decision }) => decision?.status === "watchlist_candidate").length,
      noTradeWithDetectedModelCount: detectedButNotApproved.filter(({ decision }) => decision?.status === "no_trade").length,
      conclusion:
        detectedPairs.length > approvedPairs.length
          ? "Model detection is now observable separately from approved trade selection; remaining low approval is mostly approval metadata/gate quality, not zero model recognition."
          : "Model detections are still sparse; inspect fixture and session-window model definitions before loosening approval."
    },
    grinchAudit: {
      summary:
        "Grinch models are implemented in strategyLibrary as Model 1, reversal, consolidation, SMT, timing, PD-array, and score modules, but the ICT Strategy Suite primarily uses generic ICT session narrative models. Full Grinch model contracts are not yet first-class in ICT Strategy Suite modelDetections.",
      missingFirstClassSuiteContracts: [
        "grinch_model_1_power_of_three_sequence",
        "grinch_reversal_profile_sequence",
        "grinch_consolidation_profile_sequence",
        "grinch_smt_profile_confirmation",
        "seek_and_destroy_profile",
        "ict_2022_named_model_contract"
      ],
      neededTeachingContext: [
        "Precise ordered steps for each named Grinch model.",
        "Required timing windows by New York session time.",
        "Hard versus soft evidence for each model state: forming, triggered, confirmed, invalidated.",
        "Required target, invalidation, and RR derivation rules for each model."
      ]
    },
    recommendations: [
      "Keep approval gates strict; do not treat model detection as an approved trade.",
      "Use modelDetections/modelState in UI and diagnostics so not-approved does not read as not-detected.",
      "Audit target/invalidation/RR generation for rejected confirmed/triggered models.",
      "Promote Grinch Model 1, reversal, and consolidation contracts into ICT Strategy Suite modelDetections only after precise model contracts are encoded."
    ],
    safety,
    authority
  };

  assert.ok(report.replayModelDetection.totalModelDetections > 0, "90-day scan should surface model detections separately from approved candidates.");
  assert.ok(report.fixtureVerification.modelA.primaryModel?.modelDetected, "Model A fixture must produce model detection.");
  assert.ok(report.fixtureVerification.modelB.primaryModel?.modelDetected, "Model B fixture must produce model detection.");
  assert.equal(report.safety.rawCandlesIncluded, false);
  assertSafeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT model fidelity audit failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
