#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "research-advisor-heavy-actions-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictSessionNarrativeTypes.ts" },
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
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
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
  return globalThis.__ICT_RESEARCH_ADVISOR_HEAVY_ACTIONS_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_RESEARCH_ADVISOR_HEAVY_ACTIONS_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

function buildCandles(symbol, timeframe, count) {
  const start = Date.parse("2026-06-05T12:00:00.000Z");
  let price = symbol === "US30" ? 38800 : symbol === "US500" ? 5400 : 30650;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 8) * 7 + Math.cos(index / 13) * 5;
    const drift = index * 0.65;
    const close = price + drift + wave;
    const open = index === 0 ? price : price + (index - 1) * 0.65 + Math.sin((index - 1) / 8) * 7;
    const high = Math.max(open, close) + 6 + (index % 4);
    const low = Math.min(open, close) - 6 - (index % 3);
    return {
      id: `${symbol}_${timeframe}_${index}`,
      symbol,
      timeframe,
      timestamp: new Date(start + index * 5 * 60_000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1000 + index
    };
  });
}

const fakeFetcher = async ({ brokerSymbol, limit, requestedSymbol, timeframe }) => {
  const capped = Math.min(limit, 220);
  return {
    requestedSymbol,
    brokerSymbol,
    timeframe,
    candles: buildCandles(brokerSymbol, timeframe, capped),
    candleCount: capped,
    connectionStatus: "connected",
    depthStatus: "full",
    firstTimestamp: "2026-06-05T12:00:00.000Z",
    lastTimestamp: new Date(Date.parse("2026-06-05T12:00:00.000Z") + (capped - 1) * 5 * 60_000).toISOString(),
    warnings: [],
    missingEvidence: []
  };
};

function replayResult(index) {
  return {
    strategyId: "ict-fvg-displacement",
    phase: "phase_1",
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    side: index % 5 === 0 ? "short" : "long",
    setup: "silver_bullet",
    decision: "research_only",
    confidence: index % 4 === 0 ? 0.58 : 0.76,
    htfAligned: index % 3 !== 0,
    dealingRangeLocation: index % 3 === 0 ? "equilibrium" : "discount",
    liquidityTargetType: index % 2 === 0 ? "previous_day_high" : undefined,
    fvgStatus: index % 6 === 0 ? "not_applicable" : "respected",
    smtConfirmsCandidate: index % 4 !== 0,
    smtRejectsCandidate: index % 9 === 0,
    newsRiskLevel: index % 10 === 0 ? "medium" : "low",
    sessionRiskState: index % 7 === 0 ? "caution" : "preferred",
    riskGovernorAction: index % 7 === 0 ? "downgrade_to_watchlist" : "allow",
    rrEstimate: index % 4 === 0 ? 1.4 : 2.3,
    outcome: index % 3 === 0 ? "invalidation_first" : "target_first",
    tradePath: {
      signalTime: `2026-06-05T13:${String(index % 60).padStart(2, "0")}:00.000Z`,
      entryReference: 100,
      invalidation: 98,
      target: 104.5,
      rrAchieved: index % 3 === 0 ? -1 : 2.25
    },
    noTradeReasons: [],
    riskNotes: ["Research only."],
    summary: "fixture",
    researchOnly: true,
    provenance: {
      methodology: "ICT",
      sourceSet: "ICT Mentorship Core Content",
      replay: true,
      researchOnly: true,
      generatedAt: "2026-06-05T13:00:00.000Z"
    }
  };
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const limits = {
    maxSymbolsPerScorecard: 2,
    maxCandlesPerSymbol: 180,
    maxReplayWindows: 40,
    maxOptimizerCandidates: 7,
    maxDiagnosticsRows: 20,
    maxRuntimeMs: 8_000,
    maxStoredResultBytes: 120_000,
    yieldEveryIterations: 2
  };

  const optimization = await suite.optimizeApprovedProfileFromReplayResultsBrowserSafe(
    Array.from({ length: 80 }, (_, index) => replayResult(index)),
    "balanced_quality",
    { limits }
  );
  assert.equal(optimization.researchOnly, true, "optimizer result must remain research-only");
  assert.equal(optimization.browserSafe, true, "optimizer should identify browser-safe mode");
  assert.ok(optimization.evaluatedCandidateCount <= limits.maxOptimizerCandidates, "optimizer must cap evaluated candidates");
  assert.ok(optimization.candidates.length <= 10, "optimizer must keep compact candidate list");
  assert.ok(optimization.serializedBytes <= limits.maxStoredResultBytes, "optimizer payload should stay compact");
  assert.equal(optimization.authority.executionAuthority, "none", "optimizer execution authority must remain none");
  assert.equal(suite.assertIctApprovedProfileOptimizationOutputIsCompact({ result: optimization }).ok, true, "optimizer output must be compact");

  const scorecard = await suite.buildIctMarketScorecardBrowserSafe(
    {
      requestedSymbols: ["MNQ", "ES", "YM", "BTCUSD"],
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 60,
      lookaheadCandles: 10
    },
    {
      fetchCandles: fakeFetcher,
      limits
    }
  );
  assert.equal(scorecard.researchOnly, true, "scorecard result must remain research-only");
  assert.equal(scorecard.browserSafe, true, "scorecard should identify browser-safe mode");
  assert.ok(scorecard.config.requestedSymbols.length <= limits.maxSymbolsPerScorecard, "scorecard must cap symbols");
  assert.ok(scorecard.config.candleLimit <= limits.maxCandlesPerSymbol, "scorecard must cap candle limit");
  assert.ok(scorecard.symbols.length <= limits.maxSymbolsPerScorecard, "scorecard must keep compact symbol summaries");
  assert.equal(scorecard.authority.executionAuthority, "none", "scorecard execution authority must remain none");
  assert.equal(suite.assertIctMarketScorecardOutputIsCompact({ scorecard }).ok, true, "scorecard output must be compact");

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(advisorSource, /buildIctMarketScorecardBrowserSafe/, "Advisor UI must route scorecard through browser-safe helper");
  assert.match(advisorSource, /optimizeApprovedProfileFromReplayResultsBrowserSafe/, "Advisor UI must route optimizer through browser-safe helper");
  assert.match(advisorSource, /deepActionRunIdRef/, "Advisor UI must protect against stale heavy-action results");
  assert.match(advisorSource, /ictBrowserSafeNotice/, "Advisor UI must display browser-safe limits");

  const serialized = JSON.stringify({ optimization, scorecard });
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "heavy action outputs must omit raw candles");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "heavy action outputs must omit unsafe fields"
  );

  process.stdout.write("Research Advisor heavy-action stability test passed.\n");
  process.stdout.write(
    JSON.stringify(
      {
        optimizer: {
          status: optimization.status,
          evaluatedCandidateCount: optimization.evaluatedCandidateCount,
          totalCandidateCount: optimization.totalCandidateCount,
          serializedBytes: optimization.serializedBytes
        },
        scorecard: {
          status: scorecard.status,
          requestedSymbols: scorecard.config.requestedSymbols,
          candleLimit: scorecard.config.candleLimit,
          completedSymbols: scorecard.summary.completedSymbols,
          serializedBytes: scorecard.serializedBytes
        },
        authority: scorecard.authority
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`Research Advisor heavy-action stability test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
