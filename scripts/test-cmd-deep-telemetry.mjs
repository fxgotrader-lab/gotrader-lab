#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "cmd-deep-telemetry-test");
const reportPath = path.join(projectRoot, "docs", "cmd-deep-telemetry-audit.md");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const requestedLookbackDays = Number(process.env.ICT_CMD_TELEMETRY_DAYS || 90);
const chunkDays = Number(process.env.ICT_CMD_TELEMETRY_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_CMD_TELEMETRY_LIMIT || 5000)));
const maxReplayWindows = Math.max(1, Number(process.env.ICT_CMD_TELEMETRY_MAX_WINDOWS || 240));
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
  { root: sourceRoot, file: "ictCmdPaperTrackingTypes.ts" },
  { root: sourceRoot, file: "ictCmdPaperTracking.ts" },
  { root: sourceRoot, file: "ictCmdTelemetryTypes.ts" },
  { root: sourceRoot, file: "ictCmdTelemetry.ts" },
  { root: sourceRoot, file: "ictCmdIndependentDateGateTypes.ts" },
  { root: sourceRoot, file: "ictCmdIndependentDateGate.ts" },
  { root: sourceRoot, file: "ictSilverBulletTypes.ts" },
  { root: sourceRoot, file: "ictSilverBullet.ts" },
  { root: sourceRoot, file: "ictTurtleSoupTypes.ts" },
  { root: sourceRoot, file: "ictTurtleSoup.ts" },
  { root: sourceRoot, file: "ictCisdTypes.ts" },
  { root: sourceRoot, file: "ictCisd.ts" },
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
  { root: sourceRoot, file: "ictMarketAnalysisContextTypes.ts" },
  { root: sourceRoot, file: "ictMarketAnalysisContext.ts" },
  { root: sourceRoot, file: "ictOpportunityDetectionTypes.ts" },
  { root: sourceRoot, file: "ictOpportunityDetection.ts" },
  { root: sourceRoot, file: "ictUniversalRecognitionTypes.ts" },
  { root: sourceRoot, file: "ictUniversalRecognition.ts" },
  { root: sourceRoot, file: "ictSelfImprovementTypes.ts" },
  { root: sourceRoot, file: "ictSelfImprovement.ts" },
  { root: sourceRoot, file: "ictHypothesisValidationTypes.ts" },
  { root: sourceRoot, file: "ictHypothesisValidation.ts" },
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
  return globalThis.__ICT_CMD_TELEMETRY_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_CMD_TELEMETRY_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);

const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};

const topCounts = (values, selector, limit = 12) =>
  Object.entries(countBy(values, selector))
    .map(([key, count]) => ({ key, count }))
    .slice(0, limit);

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
      id: `mt5_cmd_telemetry_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
  const latest = await fetchWithTimeout(
    endpoint("candles", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe: primaryTimeframe,
      limit: Math.min(limitPerChunk, 5000)
    })
  );
  if (!latest.ok) throw new Error(`Latest MT5 candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 candles did not include a last timestamp.");

  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(lastTimestamp)) {
    const response = await fetchWithTimeout(
      endpoint("candles/range", {
        requestedSymbol,
        symbol: brokerSymbol,
        timeframe: primaryTimeframe,
        from: window.from,
        to: window.to,
        limit: limitPerChunk
      })
    );
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

const makeSource = (depth) => ({
  sourceId: `ict_cmd_telemetry:${requestedSymbol}:${brokerSymbol}:${primaryTimeframe}`,
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
    sourceLabel: "MT5 read-only CFD/proxy CMD telemetry source",
    providerSymbol: brokerSymbol,
    generatedAt: new Date().toISOString()
  },
  authority,
  fingerprint: `ict_cmd_telemetry|${brokerSymbol}|${primaryTimeframe}|${depth.candles.length}|${depth.firstTimestamp}|${depth.lastTimestamp}`,
  roles: ["research", "available"]
});

const statusWeight = (status) =>
  status === "approved_research_candidate"
    ? 5
    : status === "paper_watchlist_candidate"
      ? 4
      : status === "watchlist_candidate"
        ? 3
        : status === "rejected_candidate"
          ? 2
          : status === "no_trade"
            ? 1
            : 0;

const selectDecision = (decisions) =>
  decisions.slice().sort((left, right) => statusWeight(right.status) - statusWeight(left.status) || right.approvalScore - left.approvalScore)[0];

const decisionPairsFor = (suite, replayResults) =>
  replayResults.map((result) => {
    const decision = selectDecision(suite.evaluateApprovedSetupProfiles(result));
    return { result, decision };
  });

const isCmd = (result) =>
  result.sessionNarrativeProfile === "consolidation_manipulation_distribution" ||
  result.modelName === "consolidation_manipulation_distribution";

const safeTelemetrySample = (items, limit = 10) =>
  items.slice(0, limit).map((item) => ({
    candidateId: item.candidateId,
    tradingDate: item.tradingDate,
    session: item.session,
    side: item.side,
    lane: item.candidateLane,
    outcome: item.outcome,
    rr: item.rr,
    htfAlignment: item.htfAlignment,
    displacementScore: item.displacementScore,
    fvgRespected: item.fvgRespected,
    externalLiquidityTargetPresent: item.externalLiquidityTargetPresent,
    sweepQuality: item.sweepQuality,
    blockers: item.blockerReasons.slice(0, 3)
  }));

const targetFirstRate = (items) => (items.length ? round(items.filter((item) => item.outcome === "target_first").length / items.length, 4) : 0);
const invalidationFirstRate = (items) => (items.length ? round(items.filter((item) => item.outcome === "invalidation_first").length / items.length, 4) : 0);
const uniqueDates = (items) => new Set(items.map((item) => item.tradingDate).filter((value) => value !== "unknown")).size;

const similarSignatureToWinners = (item, winners) => {
  if (!winners.length) return false;
  const majoritySession = Object.entries(countBy(winners, (winner) => winner.session))[0]?.[0];
  const majorityRrBucket = Object.entries(countBy(winners, (winner) => winner.rrBucket))[0]?.[0];
  const majorityDisplacement = Object.entries(countBy(winners, (winner) => winner.displacementScoreBucket))[0]?.[0];
  return (
    item.side === "short" &&
    item.session === majoritySession &&
    item.rrBucket === majorityRrBucket &&
    item.displacementScoreBucket === majorityDisplacement &&
    item.externalLiquidityTargetPresent === true
  );
};

const writeReport = ({ depth, report }) => {
  const variantRows = report.variantDiscovery
    .map(
      (variant) =>
        `| \`${variant.variantId}\` | ${variant.candidateCount} | ${(variant.targetFirstRate * 100).toFixed(2)}% | ${(variant.invalidationFirstRate * 100).toFixed(2)}% | ${variant.uniqueTradingDates} | ${variant.activeRollingWindows} | ${variant.overfitRisk ? "blocked" : "research"} |`
    )
    .join("\n");
  const differentiatorRows = report.featureComparison.differentiators
    .map(
      (item) =>
        `| ${item.feature} | ${item.winnerValue} | ${item.loserValue} | ${item.note} |`
    )
    .join("\n");
  const bestVariant = report.variantDiscovery[0];
  const lines = [
    "# CMD Deep Telemetry Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "Scope: research telemetry and variant discovery only. No broker execution, live trading, order placement, MT5 mutation, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.",
    "",
    "Authority remains:",
    "",
    "- `executionAuthority: none`",
    "- `brokerAuthority: none`",
    "- `readinessOverrideAuthority: none`",
    "",
    "Raw candles remain internal to the replay harness and are not written to this report.",
    "",
    "## Data Depth",
    "",
    `- Provider: \`mt5_read_only\``,
    `- Requested symbol: \`${requestedSymbol}\``,
    `- Broker symbol: \`${brokerSymbol}\``,
    `- Timeframe: \`${primaryTimeframe}\``,
    `- Compact candles evaluated internally: ${depth.candleCount}`,
    `- Available lookback: ${depth.availableLookbackDays} days`,
    `- Completed chunks: ${depth.chunks.length}`,
    "",
    "## Winning CMD Cluster Summary",
    "",
    `- Paper-watchlist candidates: ${report.counts.cmdPaperWatchlistCandidates}`,
    `- Winners: ${report.counts.winningPaperWatchlistCandidates}`,
    `- Target-first: ${(report.paperWatchlistMetrics.targetFirstRate * 100).toFixed(2)}%`,
    `- Invalidation-first: ${(report.paperWatchlistMetrics.invalidationFirstRate * 100).toFixed(2)}%`,
    `- Unique dates: ${report.paperWatchlistMetrics.uniqueTradingDates}`,
    `- Active rolling windows: ${report.paperWatchlistMetrics.activeRollingWindows}`,
    `- Top sessions: \`${JSON.stringify(report.paperWatchlistSummary.countBySession)}\``,
    `- HTF alignment: \`${JSON.stringify(report.paperWatchlistSummary.countByHtfAlignment)}\``,
    `- FVG respected: \`${JSON.stringify(report.paperWatchlistSummary.countByFvgRespected)}\``,
    `- Sweep quality: \`${JSON.stringify(report.paperWatchlistSummary.countBySweepQuality)}\``,
    "",
    "## Losing CMD Comparison",
    "",
    `- Losing/filtered CMD telemetry rows: ${report.counts.losingOrFilteredCmdTelemetry}`,
    `- Loser target-first: ${(report.losingMetrics.targetFirstRate * 100).toFixed(2)}%`,
    `- Loser invalidation-first: ${(report.losingMetrics.invalidationFirstRate * 100).toFixed(2)}%`,
    "",
    "| Feature | Winners | Losers | Note |",
    "| --- | ---: | ---: | --- |",
    differentiatorRows,
    "",
    "## Variant Discovery",
    "",
    "| Variant | Candidates | Target-first | Invalidation-first | Dates | Windows | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    variantRows,
    "",
    "## Independent-Date Availability",
    "",
    `Similar-feature candidates found on ${report.independentDateSearch.uniqueDates} independent date(s).`,
    "",
    report.independentDateSearch.uniqueDates < 3
      ? "CMD remains blocked because the strongest feature signature is still date-concentrated."
      : "The signature appears on enough dates for a future executable variant test, but it still needs normal replay/OOS gates.",
    "",
    "## Recommendation",
    "",
    bestVariant?.deservesFutureExecutableVariantTest
      ? `Best next variant candidate: \`${bestVariant.variantId}\`. Keep it research-only and run a dedicated executable-variant diagnostic with independent-date gates.`
      : "No CMD variant should be promoted. Keep CMD blocked and collect more independent dates before adding a narrower executable family.",
    "",
    "Do not promote CMD to Paper-Demo or approved status from this audit."
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
};

const writeUnavailableReport = (report) => {
  const lines = [
    "# CMD Deep Telemetry Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "Scope: research telemetry and variant discovery only. No broker execution, live trading, order placement, MT5 mutation, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.",
    "",
    "## Source Status",
    "",
    "The diagnostic harness is implemented, but the local MT5 read-only wrapper was unavailable for this run.",
    "",
    `- Bridge URL: \`${bridgeUrl}\``,
    `- Requested symbol: \`${requestedSymbol}\``,
    `- Broker symbol: \`${brokerSymbol}\``,
    `- Timeframe: \`${primaryTimeframe}\``,
    `- Status: \`${report.status}\``,
    `- Error: \`${report.sourceUnavailable.reason}\``,
    "",
    "Run `npm.cmd run test:cmd-deep-telemetry` again after starting the MT5 upstream service and GoTrader read-only wrapper.",
    "",
    "## Safety Result",
    "",
    "- No raw candles were written.",
    "- No account/order/position data was accessed.",
    "- Authority remained `none/none/none`.",
    "- No CMD promotion occurred."
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
};

const assertSafeReport = (payload) => {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"base64"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(payload.authority.executionAuthority, "none");
  assert.equal(payload.authority.brokerAuthority, "none");
  assert.equal(payload.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")).href);
  let depth;
  try {
    depth = await fetchChunkedCandles();
  } catch (error) {
    const report = {
      status: "blocked_source_unavailable",
      generatedAt: new Date().toISOString(),
      diagnostic: "cmd_deep_telemetry",
      sourceUnavailable: {
        bridgeUrl,
        reason: error?.message ?? String(error),
        nextAction: "Start MT5 upstream and GoTrader MT5 read-only wrapper, then rerun test:cmd-deep-telemetry."
      },
      recommendation:
        "CMD remains blocked. Deep telemetry requires explicit 90-day MT5 range chunks and cannot be inferred from a disconnected source.",
      authority,
      safety,
      researchOnly: true
    };
    assertSafeReport(report);
    writeUnavailableReport(report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const source = makeSource(depth);
  globalThis.__ICT_CMD_TELEMETRY_SOURCES = new Map([[source.sourceId, source]]);

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
        warnings: ["CMD telemetry diagnostic used explicit read-only MT5 range chunks; raw candles stayed internal."],
        missingEvidence: depth.candles.length ? [] : ["No MT5 candles were available."]
      }),
      newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" }
    }
  );

  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(replay).ok, true, "real replay output must stay compact");
  const pairs = decisionPairsFor(suite, replay.replayResults ?? []);
  const cmdPairs = pairs.filter(({ result }) => isCmd(result));
  const cmdTelemetry = cmdPairs.map(({ result, decision }) =>
    suite.buildIctCmdCandidateTelemetry({
      result,
      decision,
      sourceFingerprint: source.fingerprint
    })
  );
  const cmdResearchTelemetry = cmdTelemetry.filter((item) => item.candidateLane !== "no_trade");
  const paperTelemetry = cmdTelemetry.filter((item) => item.candidateLane === "paper_watchlist_candidate");
  const winningPaperTelemetry = paperTelemetry.filter((item) => item.outcome === "target_first");
  const losingPaperTelemetry = paperTelemetry.filter((item) => item.outcome === "invalidation_first");
  const losingOrFiltered = cmdTelemetry.filter((item) => item.candidateLane !== "paper_watchlist_candidate" || item.outcome === "invalidation_first");
  const similarSignature = cmdTelemetry.filter((item) => similarSignatureToWinners(item, winningPaperTelemetry));
  const variants = suite.discoverIctCmdVariantCandidates(cmdTelemetry);
  const paperSummary = suite.summarizeIctCmdTelemetry(paperTelemetry);
  const allSummary = suite.summarizeIctCmdTelemetry(cmdTelemetry);
  const featureComparison = suite.compareIctCmdTelemetryFeatures(winningPaperTelemetry, losingOrFiltered);

  const paperMetrics = {
    candidateCount: paperTelemetry.length,
    targetFirstRate: targetFirstRate(paperTelemetry),
    invalidationFirstRate: invalidationFirstRate(paperTelemetry),
    uniqueTradingDates: uniqueDates(paperTelemetry),
    activeRollingWindows: suite.countActiveRollingWindows(paperTelemetry),
    averageRr: average(paperTelemetry.map((item) => item.rr).filter(Number.isFinite))
  };
  const losingMetrics = {
    candidateCount: losingOrFiltered.length,
    targetFirstRate: targetFirstRate(losingOrFiltered),
    invalidationFirstRate: invalidationFirstRate(losingOrFiltered),
    uniqueTradingDates: uniqueDates(losingOrFiltered),
    activeRollingWindows: suite.countActiveRollingWindows(losingOrFiltered)
  };

  const report = {
    status: "passed",
    generatedAt: new Date().toISOString(),
    diagnostic: "cmd_deep_telemetry",
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe: primaryTimeframe,
      sourceFingerprint: source.fingerprint,
      candleCount: depth.candleCount,
      availableLookbackDays: depth.availableLookbackDays,
      chunkCount: depth.chunks.length,
      cfdProxyWarning: "USTECH is MT5 CFD/proxy research data for requested MNQ, not CME futures truth."
    },
    counts: {
      allReplayResults: pairs.length,
      allCmdCandidates: cmdTelemetry.length,
      cmdResearchCandidates: cmdResearchTelemetry.length,
      cmdPaperWatchlistCandidates: paperTelemetry.length,
      winningPaperWatchlistCandidates: winningPaperTelemetry.length,
      losingPaperWatchlistCandidates: losingPaperTelemetry.length,
      losingOrFilteredCmdTelemetry: losingOrFiltered.length
    },
    allCmdSummary: allSummary,
    paperWatchlistSummary: paperSummary,
    paperWatchlistMetrics: paperMetrics,
    losingMetrics,
    featureComparison,
    independentDateSearch: {
      similarFeatureCandidateCount: similarSignature.length,
      uniqueDates: uniqueDates(similarSignature),
      countByTradingDate: countBy(similarSignature, (item) => item.tradingDate),
      sample: safeTelemetrySample(similarSignature, 12)
    },
    variantDiscovery: variants,
    telemetrySamples: {
      winningCluster: safeTelemetrySample(winningPaperTelemetry, 12),
      losingPaperWatchlist: safeTelemetrySample(losingPaperTelemetry, 12),
      filteredOrLosingCmd: safeTelemetrySample(losingOrFiltered, 12)
    },
    gateConclusion:
      paperMetrics.uniqueTradingDates < 3 || paperMetrics.activeRollingWindows < 2 || paperMetrics.candidateCount < 20
        ? "blocked_overfit_risk"
        : "ready_for_future_dedicated_variant_test",
    recommendation:
      "Keep CMD blocked from Paper-Demo. Use the best telemetry variant only as a future executable diagnostic candidate after independent-date validation.",
    authority,
    safety,
    researchOnly: true
  };

  assert.equal(suite.assertIctCmdTelemetryIsCompact(report).ok, true, "CMD telemetry report must stay compact and authority-none.");
  assertSafeReport(report);
  assert.equal(report.gateConclusion, "blocked_overfit_risk", "one-date/small-sample CMD must remain blocked");
  writeReport({ depth, report });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`CMD deep telemetry diagnostic failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
