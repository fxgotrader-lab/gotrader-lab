#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-target-invalidation-rr-audit-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_TARGET_RR_AUDIT_DAYS || 90);
const chunkDays = Number(process.env.ICT_TARGET_RR_AUDIT_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_TARGET_RR_AUDIT_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_TARGET_RR_AUDIT_MAX_WINDOWS || 120));
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
  "ictStrategySuiteTypes.ts",
  "ictAdvisorTypes.ts",
  "ictSessionNarrativeTypes.ts",
  "ictGrinchModelTypes.ts",
  "ictPhase2Types.ts",
  "ictReplayValidationTypes.ts",
  "ictReplayDiagnosticsTypes.ts",
  "ictApprovedSetupProfileTypes.ts",
  "ictApprovedProfileOptimizerTypes.ts",
  "ictIndexSmtTypes.ts",
  "ictNewsSessionRiskTypes.ts",
  "ictNewsSessionRisk.ts",
  "ictRealReplayRunnerTypes.ts",
  "ictManualReplayReviewTypes.ts",
  "ictMarketScorecardTypes.ts",
  "ictMonteCarloTypes.ts",
  "ictLatestResearchStateTypes.ts",
  "ictLatestResearchState.ts",
  "ictSignalContractTypes.ts",
  "ictSignalContract.ts",
  "ictPaperSignalSimulatorTypes.ts",
  "ictPaperSignalSimulator.ts",
  "ictCmdPaperTrackingTypes.ts",
  "ictCmdPaperTracking.ts",
  "ictResearchReportTypes.ts",
  "ictStrategySuiteJournal.ts",
  "ictBrowserResearchLimits.ts",
  "ictAdvisorJournal.ts",
  "ictStrategySuiteHelpers.ts",
  "ictSessionNarrative.ts",
  "ictStrategySuiteEngines.ts",
  "ictPhase2OrderBlocks.ts",
  "ictPhase2BreadAndButter.ts",
  "ictPhase2OneShotOneKill.ts",
  "ictMarketAnalysisContextTypes.ts",
  "ictMarketAnalysisContext.ts",
  "ictOpportunityDetectionTypes.ts",
  "ictOpportunityDetection.ts",
  "ictUniversalRecognitionTypes.ts",
  "ictUniversalRecognition.ts",
  "ictSelfImprovementTypes.ts",
  "ictSelfImprovement.ts",
  "ictHypothesisValidationTypes.ts",
  "ictHypothesisValidation.ts",
  "ictAdvisorEngine.ts",
  "ictCurrentReadTypes.ts",
  "ictCurrentRead.ts",
  "ictReplayValidation.ts",
  "ictReplayDiagnostics.ts",
  "ictApprovedSetupProfile.ts",
  "ictApprovedProfileOptimizer.ts",
  "ictIndexSmt.ts",
  "ictRealReplayRunner.ts",
  "ictManualReplayReview.ts",
  "ictMarketScorecard.ts",
  "ictMonteCarlo.ts",
  "ictResearchReport.ts",
  "index.ts"
];

const mt5Files = [
  "mt5ReadOnlyTypes.ts",
  "mt5SymbolSettings.ts",
  "mt5ReadOnlyNormalizer.ts",
  "mt5ReadOnlyDepth.ts",
  "mt5ReadOnlyClient.ts"
];

function compileSuiteForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) writeTranspiled(path.join(sourceRoot, file), file);
  for (const file of mt5Files) writeTranspiled(path.join(mt5Root, file), file);
  fs.writeFileSync(
    path.join(outRoot, "candleSourcesStub.mjs"),
    `export async function loadCanonicalCandleSource(sourceId) {
  return globalThis.__ICT_TARGET_RR_AUDIT_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_TARGET_RR_AUDIT_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

function writeTranspiled(sourcePath, file) {
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

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};

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
      id: `mt5_target_rr_audit_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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

const makeSource = (depth) => ({
  sourceId: `ict_target_rr:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
  provider: "mt5_read_only",
  symbol: requestedSymbol,
  normalizedSymbol: requestedSymbol,
  timeframe: primaryTimeframe,
  candles: depth.candles,
  candleCount: depth.candles.length,
  firstTimestamp: depth.firstTimestamp,
  lastTimestamp: depth.lastTimestamp,
  storageBackend: "memory",
  dataQuality: depth.candles.length ? "sufficient" : "insufficient",
  eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: depth.candles.length >= 1000 },
  eligibilityReasons: [],
  warnings: ["MT5 read-only USTECH is CFD/proxy data, not CME MNQ futures truth."],
  provenance: {
    sourceLabel: "MT5 read-only CFD/proxy target/invalidation/RR audit source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_target_rr|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
  roles: ["research", "chart_display", "available"]
});

const statusWeight = (status) =>
  status === "approved_research_candidate" ? 5 : status === "paper_watchlist_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const selectDecision = (decisions) =>
  decisions.slice().sort((left, right) => statusWeight(right.status) - statusWeight(left.status) || right.approvalScore - left.approvalScore)[0];

const hasTarget = (result) => typeof result.tradePath?.target === "number";
const hasInvalidation = (result) => typeof result.tradePath?.invalidation === "number";
const hasRr = (result) => typeof (result.rrEstimate ?? result.tradePath?.rrAchieved) === "number";
const missingFields = (result) => [
  hasTarget(result) ? undefined : "target",
  hasInvalidation(result) ? undefined : "invalidation",
  hasRr(result) ? undefined : "RR"
].filter(Boolean);

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
  const depth = await fetchChunkedCandles();
  globalThis.__ICT_TARGET_RR_AUDIT_SOURCES = new Map([[makeSource(depth).sourceId, makeSource(depth)]]);
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
        warnings: ["Target/RR audit used explicit read-only MT5 range chunks; raw candles stayed internal."],
        missingEvidence: depth.candles.length ? [] : ["No MT5 candles were available."]
      }),
      newsSessionRiskContext: { syntheticNoRisk: true }
    }
  );

  const replayResults = replay.replayResults ?? [];
  const pairs = replayResults.map((result) => ({
    result,
    decision: selectDecision(suite.evaluateApprovedSetupProfiles(result))
  }));
  const detected = pairs.filter(({ result }) => result.modelDetected);
  const researchCandidates = pairs.filter(({ result }) => result.decision === "research_only");
  const detectedCandidates = detected.filter(({ result }) => result.decision === "research_only");
  const missingRows = detectedCandidates.flatMap(({ result }) =>
    missingFields(result).map((field) => ({
      field,
      model: result.modelName ?? "unknown",
      setup: result.setup,
      profile: result.sessionNarrativeProfile ?? "unknown"
    }))
  );
  const decisionsWithFalseResearchOnlyBlocker = pairs.filter(({ decision }) =>
    [...(decision?.rejectionReasons ?? []), ...(decision?.watchlistReasons ?? [])].some((reason) => /Original signal is not research-only/i.test(reason))
  );
  const completeDetectedCandidates = detectedCandidates.filter(({ result }) => hasTarget(result) && hasInvalidation(result) && hasRr(result));

  const report = {
    diagnostic: "ict_target_invalidation_rr_audit",
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
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    counts: {
      replayResults: replayResults.length,
      detectedModels: detected.length,
      researchCandidates: researchCandidates.length,
      detectedResearchCandidates: detectedCandidates.length,
      candidatesMissingTarget: detectedCandidates.filter(({ result }) => !hasTarget(result)).length,
      candidatesMissingInvalidation: detectedCandidates.filter(({ result }) => !hasInvalidation(result)).length,
      candidatesMissingRr: detectedCandidates.filter(({ result }) => !hasRr(result)).length,
      completeDetectedCandidates: completeDetectedCandidates.length,
      approvedCandidates: pairs.filter(({ decision }) => decision?.status === "approved_research_candidate").length,
      paperWatchlistCandidates: pairs.filter(({ decision }) => decision?.status === "paper_watchlist_candidate").length,
      watchlistCandidates: pairs.filter(({ decision }) => decision?.status === "watchlist_candidate").length,
      falseResearchOnlyBlockers: decisionsWithFalseResearchOnlyBlocker.length
    },
    missingFieldsByModel: countBy(missingRows, (row) => `${row.model}:${row.field}`),
    missingFieldsBySetup: countBy(missingRows, (row) => `${row.setup}:${row.field}`),
    missingFieldsBySessionNarrative: countBy(missingRows, (row) => `${row.profile}:${row.field}`),
    safeFallbackAvailability: {
      detectedCandidatesWithCompleteStructure: completeDetectedCandidates.length,
      detectedCandidatesStillMissingStructure: detectedCandidates.length - completeDetectedCandidates.length,
      note: "Fallback is counted only when target, invalidation, and RR are present after compact session-structure completion."
    },
    grinchInventory: suite.summarizeIctGrinchModelInventory(),
    researchOnlyPreservation: {
      replayResultsResearchOnly: replayResults.every((result) => result.researchOnly === true),
      falseResearchOnlyBlockerRemoved: decisionsWithFalseResearchOnlyBlocker.length === 0
    },
    safety,
    authority
  };

  assert.ok(replayResults.every((result) => result.researchOnly === true), "Replay results must preserve researchOnly.");
  assert.equal(report.counts.falseResearchOnlyBlockers, 0, "Transformed candidates must not emit the old researchOnly blocker.");
  assert.equal(report.researchOnlyPreservation.falseResearchOnlyBlockerRemoved, true);
  assert.equal(report.safety.rawCandlesIncluded, false);
  assertSafeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT target/invalidation/RR audit failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
