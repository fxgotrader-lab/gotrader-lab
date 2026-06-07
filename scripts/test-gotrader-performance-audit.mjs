import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const advisorRoot = path.join(projectRoot, "src", "components", "advisor");
const outRoot = path.join(projectRoot, ".gotrader", "gotrader-performance-audit-test");

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
  { root: sourceRoot, file: "ictBrowserResearchLimits.ts" },
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
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictResearchReport.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
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
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyDepth.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const unsafeRegex = /"candles"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i;

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
  return globalThis.__GOTRADER_PERFORMANCE_AUDIT_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__GOTRADER_PERFORMANCE_AUDIT_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

async function benchmark(name, thresholdMs, fn) {
  const startedAt = performance.now();
  const value = await fn();
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  assert.ok(durationMs <= thresholdMs, `${name} took ${durationMs}ms, above ${thresholdMs}ms`);
  const outputBytes = bytes(value);
  assert.doesNotMatch(JSON.stringify(value ?? null), unsafeRegex, `${name} output must remain compact and safe`);
  return { name, durationMs, outputBytes, value };
}

function buildCandles(symbol, timeframe, count, stepMinutes = timeframe === "1h" ? 60 : timeframe === "15m" ? 15 : 5) {
  const start = Date.parse("2026-06-01T00:00:00.000Z");
  const base = symbol === "US500" ? 5400 : symbol === "US30" ? 38800 : 30650;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 9) * 12 + Math.cos(index / 21) * 8;
    const drift = index * 0.42;
    const close = base + drift + wave;
    const open = index === 0 ? base : base + (index - 1) * 0.42 + Math.sin((index - 1) / 9) * 12;
    const high = Math.max(open, close) + 8 + (index % 5);
    const low = Math.min(open, close) - 8 - (index % 4);
    return {
      id: `${symbol}_${timeframe}_${index}`,
      symbol,
      timeframe,
      timestamp: new Date(start + index * stepMinutes * 60_000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000 + index
    };
  });
}

const fakeFetcher = async ({ brokerSymbol, limit, requestedSymbol, timeframe }) => {
  const capped = Math.min(limit, 240);
  return {
    requestedSymbol,
    brokerSymbol,
    timeframe,
    candles: buildCandles(brokerSymbol, timeframe, capped),
    candleCount: capped,
    connectionStatus: "connected",
    depthStatus: "limited_browser_fixture",
    firstTimestamp: "2026-06-01T00:00:00.000Z",
    lastTimestamp: new Date(Date.parse("2026-06-01T00:00:00.000Z") + (capped - 1) * 5 * 60_000).toISOString(),
    warnings: [],
    missingEvidence: []
  };
};

function compactCheck(label, result, maxBytes) {
  const outputBytes = bytes(result);
  assert.ok(outputBytes <= maxBytes, `${label} output ${outputBytes} bytes exceeded ${maxBytes}`);
  assert.doesNotMatch(JSON.stringify(result), unsafeRegex, `${label} must not expose raw candles or unsafe fields`);
  return outputBytes;
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const limits = {
    maxSymbolsPerScorecard: 2,
    maxCandlesPerSymbol: 240,
    maxReplayWindows: 45,
    maxOptimizerCandidates: 8,
    maxDiagnosticsRows: 30,
    maxRuntimeMs: 8_000,
    maxStoredResultBytes: 180_000,
    yieldEveryIterations: 3
  };
  const primaryCandles = buildCandles("USTECH", "5m", 260);
  const htfCandles = {
    "15m": buildCandles("USTECH", "15m", 120, 15),
    "1h": buildCandles("USTECH", "1h", 80, 60)
  };
  const indexComparisonCandles = {
    USTECH: primaryCandles,
    US500: buildCandles("US500", "5m", 260),
    US30: buildCandles("US30", "5m", 260)
  };
  const audit = [];

  const currentRead = await benchmark("current read build", 500, () =>
    suite.buildUnavailableIctCurrentRead("Performance fixture unavailable state.")
  );
  assert.equal(suite.assertIctCurrentReadIsCompact(currentRead.value).ok, true, "current read must stay compact");
  audit.push({ name: currentRead.name, durationMs: currentRead.durationMs, outputBytes: currentRead.outputBytes });

  const narrative = await benchmark("session narrative current window", 500, () =>
    suite.buildIctSessionNarrative(primaryCandles, {
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      requestedLookbackDays: 90,
      availableLookbackDays: 3,
      depthSource: "current_window"
    })
  );
  assert.equal(suite.assertIctSessionNarrativeIsCompact(narrative.value).ok, true, "session narrative must stay compact");
  audit.push({ name: narrative.name, durationMs: narrative.durationMs, outputBytes: narrative.outputBytes });

  const replay = await benchmark("browser-safe replay validation", 8_000, () =>
    suite.runIctReplayValidation({
      symbol: "MNQ",
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candles: primaryCandles,
      htfCandles,
      indexComparisonCandles,
      replayWindowSize: 80,
      lookaheadCandles: 12,
      maxReplayWindows: limits.maxReplayWindows,
      appendJournal: false,
      researchOnly: true
    })
  );
  assert.ok(replay.value.summary.totalWindows <= limits.maxReplayWindows, "replay validation must honor maxReplayWindows");
  assert.equal(suite.assertIctReplayOutputIsCompact(replay.value).ok, true, "replay output must stay compact");
  audit.push({
    name: replay.name,
    durationMs: replay.durationMs,
    outputBytes: replay.outputBytes,
    windows: replay.value.summary.totalWindows,
    signals: replay.value.summary.totalSignals
  });

  const diagnostics = await benchmark("replay diagnostics", 1_500, () => {
    const nextDiagnostics = suite.buildReplayDiagnostics(replay.value.results);
    const calibrationResults = suite.runReplayCalibrationSuite(replay.value.results);
    return { diagnostics: nextDiagnostics, calibrationResults };
  });
  assert.equal(
    suite.assertIctReplayDiagnosticsOutputIsCompact({
      diagnostics: diagnostics.value.diagnostics,
      calibrationResults: diagnostics.value.calibrationResults
    }).ok,
    true,
    "diagnostics output must stay compact"
  );
  audit.push({ name: diagnostics.name, durationMs: diagnostics.durationMs, outputBytes: diagnostics.outputBytes });

  const scorecard = await benchmark("market scorecard browser-safe mode", 12_000, () =>
    suite.buildIctMarketScorecardBrowserSafe(
      {
        requestedSymbols: ["MNQ", "ES", "YM", "BTCUSD"],
        primaryTimeframe: "5m",
        htfTimeframes: ["15m", "1h"],
        candleLimit: 1000,
        replayWindowSize: 70,
        lookaheadCandles: 12
      },
      { fetchCandles: fakeFetcher, limits }
    )
  );
  assert.ok(scorecard.value.config.requestedSymbols.length <= limits.maxSymbolsPerScorecard, "scorecard must cap symbol count");
  assert.ok(scorecard.value.config.candleLimit <= limits.maxCandlesPerSymbol, "scorecard must cap candles per symbol");
  assert.equal(suite.assertIctMarketScorecardOutputIsCompact({ scorecard: scorecard.value }).ok, true, "scorecard must stay compact");
  audit.push({ name: scorecard.name, durationMs: scorecard.durationMs, outputBytes: scorecard.outputBytes });

  const optimizer = await benchmark("optimizer browser-safe mode", 5_000, () =>
    suite.optimizeApprovedProfileFromReplayResultsBrowserSafe(replay.value.results, "balanced_quality", { limits })
  );
  assert.ok(optimizer.value.evaluatedCandidateCount <= limits.maxOptimizerCandidates, "optimizer must cap candidate count");
  assert.equal(
    suite.assertIctApprovedProfileOptimizationOutputIsCompact({ result: optimizer.value }).ok,
    true,
    "optimizer must stay compact"
  );
  audit.push({ name: optimizer.name, durationMs: optimizer.durationMs, outputBytes: optimizer.outputBytes });

  const outcomes = suite.extractMonteCarloOutcomesFromReplayResults(replay.value.results);
  const monteCarlo = await benchmark("Monte Carlo browser-safe mode", 5_000, () =>
    suite.runMonteCarloBatch(outcomes, {
      source: "manual_replay_review",
      simulationCount: 300,
      tradesPerSimulation: 60,
      randomSeed: 20260606,
      researchOnly: true
    })
  );
  assert.ok(monteCarlo.value.input.simulationCount <= 300, "Monte Carlo browser run should cap simulation count");
  assert.ok(monteCarlo.value.pathsSample.length <= 10, "Monte Carlo must cap paths sample");
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(monteCarlo.value).ok, true, "Monte Carlo summary must stay compact");
  audit.push({ name: monteCarlo.name, durationMs: monteCarlo.durationMs, outputBytes: monteCarlo.outputBytes });

  const realReplayRun = await benchmark("real replay runner compact result", 8_000, () =>
    suite.runIctRealReplay(
      {
        requestedSymbols: ["MNQ"],
        primaryTimeframes: ["5m"],
        htfTimeframes: ["15m", "1h"],
        candleLimit: 240,
        replayWindowSize: 80,
        lookaheadCandles: 12,
        researchOnly: true
      },
      {
        fetchCandles: fakeFetcher,
        appendJournal: false,
        includeDiagnostics: true,
        includeReplayResults: true,
        maxReplayWindows: limits.maxReplayWindows
      }
    )
  );
  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(realReplayRun.value).ok, true, "real replay output must stay compact");
  audit.push({ name: realReplayRun.name, durationMs: realReplayRun.durationMs, outputBytes: realReplayRun.outputBytes });

  const manualReview = suite.buildIctManualReplayReviewResult(realReplayRun.value, {
    requestedSymbol: "MNQ",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candleLimit: 240,
    replayWindowSize: 80,
    lookaheadCandles: 12
  });
  compactCheck("manual replay review", manualReview, limits.maxStoredResultBytes);
  assert.equal(suite.assertIctManualReplayReviewOutputIsCompact({ result: manualReview }).ok, true, "manual review must stay compact");

  const latestState = suite.saveLatestResearchStatePatch(
    {
      latestReplay: suite.buildLatestReplaySnapshot(manualReview),
      latestMonteCarlo: suite.buildLatestMonteCarloSnapshot(monteCarlo.value),
      latestScorecard: suite.buildLatestScorecardSnapshot(scorecard.value)
    },
    "manual_replay_review"
  );
  const latestBytes = compactCheck("latest research state", latestState, 250_000);
  assert.equal(suite.assertIctLatestResearchStateIsCompact(latestState).ok, true, "latest research state must stay compact");

  const report = suite.buildManualReplayResearchReport(manualReview);
  const reportBytes = compactCheck("research report", report, 250_000);
  assert.equal(suite.assertIctResearchReportOutputIsCompact({ report }).ok, true, "research report must stay compact");

  const researchSignal = suite.buildIctResearchSignalFromCurrentRead(currentRead.value, latestState);
  const paperSignal = suite.createPaperSignalFromResearchSignal(researchSignal);
  const paperBytes = compactCheck("paper simulation", paperSignal, 120_000);
  assert.equal(suite.assertIctResearchSignalIsCompact(researchSignal).ok, true, "research signal must stay compact");

  const advisorSource = fs.readFileSync(path.join(advisorRoot, "ResearchAdvisorView.tsx"), "utf8");
  const summarySource = fs.readFileSync(path.join(advisorRoot, "IctAdvisorSummaryPanel.tsx"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "dashboard", "MissionControlShell.tsx"), "utf8");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,1200}runManualReplayReview/, "Research Advisor must not auto-run manual replay");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,1200}runMarketScorecard/, "Research Advisor must not auto-run scorecard");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,1200}runMonteCarloBatch/, "Research Advisor must not auto-run Monte Carlo");
  assert.doesNotMatch(summarySource, /buildIctReplayValidationFromRuntime/, "ICT summary panel must not auto-run replay validation");
  assert.doesNotMatch(dashboardSource, /useEffect\([\s\S]{0,1200}runIctRealReplay/, "Dashboard must not auto-run deep replay work");
  assert.match(advisorSource, /disabled=\{deepResearchActionRunning/, "Advisor deep action buttons must be disabled while another action runs");
  assert.match(advisorSource, /DEFAULT_ICT_BROWSER_RESEARCH_LIMITS\.maxReplayWindows/, "Advisor manual replay should use browser-safe replay window cap");
  assert.match(advisorSource, /browserSafeMonteCarloSimulationCount/, "Advisor Monte Carlo should use browser-safe simulation cap");

  const summary = {
    status: "passed",
    limits,
    workloads: audit,
    compactPayloads: {
      latestStateBytes: latestBytes,
      reportBytes,
      paperSignalBytes: paperBytes
    },
    rootCausesChecked: [
      "hidden replay auto-run",
      "manual replay journal spam",
      "uncapped browser Monte Carlo",
      "scorecard yield cadence",
      "large localStorage payloads",
      "unsafe/raw candle fields"
    ],
    authority
  };

  process.stdout.write("GoTrader performance audit passed.\n");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`GoTrader performance audit failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
