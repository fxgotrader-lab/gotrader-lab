#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-manual-replay-review-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
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
  return globalThis.__ICT_MANUAL_REPLAY_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_MANUAL_REPLAY_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
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
  let lastClose = symbol === "ES" ? 5600 : symbol === "YM" ? 39000 : symbol === "US500" ? 5600 : symbol === "US30" ? 39000 : 100;
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(start + index * minutes * 60_000).toISOString();
    const trend = Math.sin(index / 8) * 1.8 + index * 0.03;
    const open = lastClose;
    const close = open + trend / 4 + (index % 17 === 0 ? 2.2 : index % 19 === 0 ? -2 : 0);
    const high = Math.max(open, close) + 1.2 + (index % 11 === 0 ? 2.4 : 0);
    const low = Math.min(open, close) - 1.2 - (index % 13 === 0 ? 2.1 : 0);
    lastClose = close;
    return candle(`manual_fixture_${symbol}_${timeframe}_${index}`, timestamp, open, high, low, close, timeframe, symbol);
  });
}

function assertCompactReview(suite, result, label) {
  assert.equal(result.researchOnly, true, `${label}: result must be research-only`);
  assert.equal(result.authority.executionAuthority, "none", `${label}: execution authority must be none`);
  assert.equal(result.authority.brokerAuthority, "none", `${label}: broker authority must be none`);
  assert.equal(result.authority.readinessOverrideAuthority, "none", `${label}: readiness authority must be none`);
  assert.equal(result.safety.rawCandlesExcluded, true, `${label}: raw candles must be excluded`);
  assert.equal(result.safety.rawSnapshotsExcluded, true, `${label}: raw snapshots must be excluded`);
  assert.equal(result.safety.secretsExcluded, true, `${label}: secrets must be excluded`);
  assert.equal(result.safety.accountDataExcluded, true, `${label}: account data must be excluded`);
  assert.equal(result.safety.orderDataExcluded, true, `${label}: order data must be excluded`);
  assert.equal(result.safety.positionDataExcluded, true, `${label}: position data must be excluded`);
  assert.equal(suite.assertIctManualReplayReviewOutputIsCompact({ result }).ok, true, `${label}: compact assertion failed`);
  assert.doesNotMatch(JSON.stringify({ ...result, safety: undefined }), /"candles"\s*:/i, `${label}: raw candle arrays must not appear`);
  assert.doesNotMatch(
    JSON.stringify({ ...result, safety: undefined }),
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    `${label}: unsafe fields must not appear`
  );
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const defaults = suite.defaultIctManualReplayReviewRequest();
  assert.equal(defaults.requestedSymbol, "MNQ", "manual replay default requested symbol mismatch");
  assert.equal(defaults.primaryTimeframe, "5m", "manual replay default timeframe mismatch");

  const unavailable = await suite.runManualIctReplayReview(
    {
      requestedSymbol: "MNQ",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
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
  assert.equal(unavailable.status, "unavailable", "unavailable MT5 should produce unavailable state");
  assert.match(unavailable.unavailableReason ?? "", /mt5_unavailable|Injected unavailable/i, "unavailable state should carry a friendly reason");
  assertCompactReview(suite, unavailable, "unavailable manual review");

  const requestedTimeframes = [];
  const deterministic = await suite.runManualIctReplayReview(
    {
      requestedSymbol: "MNQ",
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 60,
      lookaheadCandles: 12
    },
    {
      appendJournal: false,
      fetchCandles: async ({ brokerSymbol, limit, requestedSymbol, timeframe }) => {
        requestedTimeframes.push(timeframe);
        const candles = fixtureCandles({
          count: timeframe === "5m" ? Math.min(180, limit) : Math.min(90, limit),
          timeframe,
          symbol: brokerSymbol || requestedSymbol
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
  assert.equal(deterministic.status, "completed", "deterministic manual replay should complete");
  assert.ok(deterministic.totalSignals > 0, "manual replay review should expose compact signal count");
  assert.ok(deterministic.approvedProfileComparison.length > 0, "manual replay review should expose approved-profile comparison");
  assert.ok(deterministic.topCalibrationFilterImprovements.length > 0, "manual replay review should expose compact calibration improvements");
  assert.ok(deterministic.smtSummary.divergenceTypes.length > 0, "manual replay review should expose SMT summary");
  assert.ok(deterministic.newsSessionRiskSummary.riskGovernorActions.length > 0, "manual replay review should expose news/session risk summary");
  assert.deepEqual([...new Set(requestedTimeframes)].sort(), ["15m", "1h", "5m"].sort(), "manual replay should fetch primary and HTF contexts");
  assertCompactReview(suite, deterministic, "deterministic manual review");

  const journalEvent = suite.buildIctManualReplayReviewJournalEvent(deterministic);
  assert.equal(journalEvent.eventType, "ict_manual_replay_review", "manual review journal event type mismatch");
  assert.equal(journalEvent.researchOnly, true, "manual review journal event must be research-only");
  assert.equal(journalEvent.authority.executionAuthority, "none", "journal execution authority must be none");
  assert.equal(suite.assertIctManualReplayReviewOutputIsCompact({ result: deterministic, journalEvent }).ok, true, "journal compact assertion failed");
  assert.doesNotMatch(JSON.stringify({ ...journalEvent, safety: undefined }), /"candles"\s*:/i, "journal must not contain raw candles");

  const failed = suite.buildFailedIctManualReplayReviewResult({ requestedSymbol: "MNQ", primaryTimeframe: "5m" }, new Error("manual failure"));
  assert.equal(failed.status, "failed", "failed helper should produce failed state");
  assertCompactReview(suite, failed, "failed manual review");

  process.stdout.write("GoTrader ICT Manual Replay Review smoke test passed.\n");
  process.stdout.write(`Deterministic status: ${deterministic.status}\n`);
  process.stdout.write(`Deterministic total signals: ${deterministic.totalSignals}\n`);
  process.stdout.write(`Deterministic approved count: ${deterministic.approvedProfileCounts.totalApproved}\n`);
  process.stdout.write(`Unavailable status: ${unavailable.status}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        status: deterministic.status,
        requestedSymbol: deterministic.requestedSymbol,
        brokerSymbol: deterministic.brokerSymbol,
        primaryTimeframe: deterministic.primaryTimeframe,
        htfTimeframes: deterministic.htfTimeframes,
        totalSignals: deterministic.totalSignals,
        approvedProfileCounts: deterministic.approvedProfileCounts,
        authority: deterministic.authority,
        safety: deterministic.safety
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`ICT Manual Replay Review smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
