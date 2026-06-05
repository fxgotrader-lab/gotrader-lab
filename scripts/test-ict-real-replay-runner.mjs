#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-real-replay-runner-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
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
  return globalThis.__ICT_REAL_REPLAY_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_REAL_REPLAY_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const timeframeMinutes = {
  "5m": 5,
  "15m": 15,
  "1h": 60
};

const candle = (id, timestamp, open, high, low, close, timeframe = "5m", symbol = "MNQ") => ({
  id,
  symbol,
  timeframe,
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1000
});

function fixtureCandles({ count = 180, timeframe = "5m", symbol = "MNQ" } = {}) {
  const minutes = timeframeMinutes[timeframe] ?? 5;
  const start = Date.parse("2026-06-01T07:00:00.000Z");
  let lastClose = symbol === "ES" ? 5600 : symbol === "YM" ? 39000 : symbol === "BTCUSD" ? 68000 : symbol === "XAUUSD" ? 2350 : 100;
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(start + index * minutes * 60_000).toISOString();
    const trend = Math.sin(index / 8) * 1.8 + index * 0.03;
    const open = lastClose;
    const close = open + trend / 4 + (index % 17 === 0 ? 2.2 : index % 19 === 0 ? -2 : 0);
    const high = Math.max(open, close) + 1.2 + (index % 11 === 0 ? 2.4 : 0);
    const low = Math.min(open, close) - 1.2 - (index % 13 === 0 ? 2.1 : 0);
    lastClose = close;
    return candle(`fixture_${timeframe}_${index}`, timestamp, open, high, low, close, timeframe, symbol);
  });
}

function assertCompactRun(suite, result, label) {
  assert.equal(result.researchOnly, true, `${label}: run must be research-only`);
  assert.equal(result.authority.executionAuthority, "none", `${label}: execution authority must be none`);
  assert.equal(result.authority.brokerAuthority, "none", `${label}: broker authority must be none`);
  assert.equal(result.authority.readinessOverrideAuthority, "none", `${label}: readiness override authority must be none`);
  assert.equal(result.safety.rawCandlesExcluded, true, `${label}: raw candles must be excluded`);
  assert.equal(result.safety.rawSnapshotsExcluded, true, `${label}: raw snapshots must be excluded`);
  assert.equal(result.safety.accountDataExcluded, true, `${label}: account data must be excluded`);
  assert.equal(result.safety.orderDataExcluded, true, `${label}: order data must be excluded`);
  assert.equal(result.safety.positionDataExcluded, true, `${label}: position data must be excluded`);
  assert.equal(result.safety.secretsExcluded, true, `${label}: secrets must be excluded`);
  assert.equal(suite.assertIctRealReplayRunOutputIsCompact(result).ok, true, `${label}: compact assertion failed`);
  assert.doesNotMatch(JSON.stringify(result), /"candles"\s*:/i, `${label}: raw candle arrays must not appear`);
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  assert.equal(suite.resolveIctRealReplaySymbolMapping("MNQ").brokerSymbol, "USTECH");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("NQ").brokerSymbol, "USTECH");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("ES").brokerSymbol, "US500");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("YM").brokerSymbol, "US30");
  assert.equal(suite.resolveIctRealReplaySymbolMapping("EURUSD.pro").brokerSymbol, "EURUSD.pro");

  const unavailable = await suite.runIctRealReplay(
    {
      requestedSymbols: ["MNQ"],
      primaryTimeframes: ["5m"],
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 60,
      lookaheadCandles: 12,
      minRequiredCandles: 120,
      researchOnly: true
    },
    {
      appendJournal: false,
      fetchCandles: async ({ brokerSymbol, requestedSymbol, timeframe }) => ({
        requestedSymbol,
        brokerSymbol,
        timeframe,
        candles: [],
        candleCount: 0,
        connectionStatus: "disconnected",
        depthStatus: "disconnected",
        warnings: ["Injected unavailable MT5 fixture."],
        missingEvidence: ["mt5_unavailable"]
      })
    }
  );
  assertCompactRun(suite, unavailable, "unavailable fixture");
  assert.equal(unavailable.symbols[0].status, "skipped", "unavailable MT5 should skip, not fail unsafely");

  const requestedTimeframes = [];
  const deterministic = await suite.runIctRealReplay(
    {
      requestedSymbols: ["MNQ"],
      primaryTimeframes: ["5m"],
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 60,
      lookaheadCandles: 12,
      minRequiredCandles: 120,
      researchOnly: true
    },
    {
      appendJournal: false,
      fetchCandles: async ({ brokerSymbol, limit, requestedSymbol, timeframe }) => {
        requestedTimeframes.push(timeframe);
        const candles = fixtureCandles({
          count: timeframe === "5m" ? Math.min(180, limit) : Math.min(90, limit),
          timeframe,
          symbol: requestedSymbol
        });
        return {
          requestedSymbol,
          brokerSymbol,
          timeframe,
          candles,
          candleCount: candles.length,
          connectionStatus: "connected",
          depthStatus: "full",
          firstTimestamp: candles[0]?.timestamp,
          lastTimestamp: candles.at(-1)?.timestamp,
          warnings: ["Deterministic fixture only; no execution authority."],
          missingEvidence: []
        };
      }
    }
  );
  assertCompactRun(suite, deterministic, "deterministic fixture");
  assert.equal(deterministic.symbols[0].status, "completed", "deterministic fixture should complete");
  assert.ok(deterministic.aggregateSummary.totalSignals > 0, "deterministic replay should produce compact signal metrics");
  assert.ok(deterministic.diagnostics?.byStrategyId, "real replay runner should include compact diagnostics by strategy");
  assert.ok(deterministic.diagnostics?.bySession, "real replay runner should include compact diagnostics by session");
  assert.ok(deterministic.calibrationResults?.some((item) => item.filterId === "min_confidence_70"), "real replay runner should include calibration summaries");
  assert.ok(deterministic.approvedProfileResults?.some((item) => item.profileId === "gotrader_ict_phase1_strict"), "real replay runner should include approved setup profile summaries");
  assert.ok(
    deterministic.approvedProfileResults?.every((item) => item.researchOnly === true && !("decisions" in item)),
    "approved setup profile summaries should stay compact"
  );
  assert.deepEqual([...new Set(requestedTimeframes)].sort(), ["15m", "1h", "5m"].sort(), "runner should fetch primary 5m separately from HTF 15m/1h context");
  const journalEvent = suite.buildIctRealReplayRunJournalEvent(deterministic);
  assert.equal(journalEvent.eventType, "ict_real_replay_run_summary");
  assert.equal(journalEvent.researchOnly, true);
  assert.doesNotMatch(JSON.stringify(journalEvent), /"candles"\s*:/i, "real replay journal summary must not contain raw candles");

  let liveStatus = "not_run";
  let liveResult;
  if (process.env.ICT_REAL_REPLAY_SKIP_LIVE !== "true") {
    liveResult = await suite.runIctRealReplay(
      {
        requestedSymbols: [process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ"],
        primaryTimeframes: [process.env.MT5_READONLY_TIMEFRAME || "5m"],
        htfTimeframes: ["15m", "1h"],
        candleLimit: Number(process.env.MT5_READONLY_CANDLE_LIMIT || 1000),
        replayWindowSize: 80,
        lookaheadCandles: 12,
        minRequiredCandles: 120,
        researchOnly: true
      },
      { appendJournal: false }
    );
    assertCompactRun(suite, liveResult, "live MT5");
    liveStatus = liveResult.aggregateSummary.completedSymbols > 0 ? "completed" : "mt5_unavailable";
  }

  process.stdout.write("GoTrader ICT Real Replay Runner smoke test passed.\n");
  process.stdout.write(`Deterministic fixture signals: ${deterministic.aggregateSummary.totalSignals}\n`);
  process.stdout.write(`Deterministic target-first rate: ${Math.round(deterministic.aggregateSummary.targetFirstRate * 100)}%\n`);
  process.stdout.write(`Live MT5 status: ${liveStatus}\n`);
  if (liveResult) {
    process.stdout.write(
      JSON.stringify(
        {
          status: liveStatus,
          symbols: liveResult.symbols.map((symbol) => ({
            requestedSymbol: symbol.requestedSymbol,
            brokerSymbol: symbol.brokerSymbol,
            primaryTimeframe: symbol.primaryTimeframe,
            status: symbol.status,
            reason: symbol.reason,
            totalSignals: symbol.summary?.totalSignals ?? 0,
            targetFirstRate: symbol.summary?.targetFirstRate ?? 0,
            averageRrAchieved: symbol.summary?.averageRrAchieved ?? 0
          })),
          authority: liveResult.authority,
          safety: liveResult.safety
        },
        null,
        2
      ) + "\n"
    );
  }
}

main().catch((error) => {
  process.stderr.write(`ICT Real Replay Runner smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
