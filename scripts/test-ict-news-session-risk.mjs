#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-news-session-risk-test");
const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
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
  return globalThis.__ICT_NEWS_SESSION_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_NEWS_SESSION_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const candle = (id, timestamp, open, high, low, close, timeframe = "5m") => ({
  id,
  symbol: "MNQ",
  timeframe,
  timestamp,
  open,
  high,
  low,
  close,
  volume: 1000
});

const signal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_1",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  side: "long",
  decision: "research_only",
  confidence: 0.76,
  bias: {
    primary: "bullish",
    htf: { "15m": "bullish", "1h": "bullish" },
    composite: "bullish"
  },
  dealingRange: {
    high: 110,
    low: 90,
    midpoint: 100,
    currentLocation: "discount",
    sourceTimeframe: "5m"
  },
  liquiditySwept: {
    type: "old_swing_low",
    price: 95,
    timeframe: "5m",
    swept: true,
    distanceFromCurrent: -5
  },
  drawOnLiquidity: {
    type: "previous_day_high",
    price: 112,
    timeframe: "daily",
    swept: false,
    distanceFromCurrent: 12
  },
  displacement: {
    direction: "bullish",
    candleTime: "2026-06-05T14:00:00.000Z",
    impulseHigh: 105,
    impulseLow: 98,
    bodySize: 4,
    createdFvg: true
  },
  fairValueGap: {
    direction: "bullish",
    high: 101,
    low: 99,
    midpoint: 100,
    timeframe: "5m",
    mitigated: false,
    createdAt: "2026-06-05T14:00:00.000Z"
  },
  entryZone: { type: "fair_value_gap", high: 101, low: 99, midpoint: 100 },
  invalidation: 96,
  target: 112,
  rrEstimate: 2.4,
  setup: "fvg_retracement",
  summary: "Risk governor fixture signal.",
  noTradeReasons: [],
  riskNotes: ["Research only."],
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T14:00:00.000Z"
  },
  ...overrides
});

function fixtureCandles() {
  return [
    candle("r_0", "2026-06-05T13:30:00.000Z", 100, 102, 99, 101),
    candle("r_1", "2026-06-05T13:35:00.000Z", 101, 103, 100, 102),
    candle("r_2", "2026-06-05T13:40:00.000Z", 102, 104, 101, 103),
    candle("r_3", "2026-06-05T13:45:00.000Z", 103, 105, 98, 99),
    candle("r_4", "2026-06-05T13:50:00.000Z", 99, 101, 97, 100),
    candle("r_5", "2026-06-05T13:55:00.000Z", 100, 106, 100, 105),
    candle("r_6", "2026-06-05T14:00:00.000Z", 105, 110, 104, 109),
    candle("r_7", "2026-06-05T14:05:00.000Z", 109, 112, 108, 111),
    candle("r_8", "2026-06-05T14:10:00.000Z", 111, 114, 110, 113),
    candle("r_9", "2026-06-05T14:15:00.000Z", 113, 116, 112, 115)
  ];
}

function assertCompact(suite, value, label) {
  const check = suite.assertIctNewsSessionRiskOutputIsCompact(value);
  assert.equal(check.ok, true, `${label} should exclude raw candles/secrets/account/order/position data`);
  assert.doesNotMatch(JSON.stringify(value), /"candles"\s*:/i, `${label} must not include raw candle arrays`);
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));

  const clear = suite.evaluateNewsSessionRisk(signal(), { syntheticNoRisk: true });
  assert.equal(clear.newsRiskLevel, "none");
  assert.equal(clear.session.sessionName, "new_york_am");
  assert.equal(clear.sessionRiskState, "preferred");
  assert.equal(clear.riskGovernorAction, "allow");
  assert.equal(clear.authority.executionAuthority, "none");
  assertCompact(suite, clear, "clear risk decision");

  const highNews = suite.evaluateNewsSessionRisk(signal(), {
    provider: "fmp_mock",
    economicEvents: [
      {
        eventId: "cpi",
        currency: "USD",
        eventName: "CPI inflation",
        impact: "high",
        scheduledAt: "2026-06-05T14:00:00.000Z"
      }
    ]
  });
  assert.equal(highNews.newsRiskLevel, "blocked");
  assert.equal(highNews.riskGovernorAction, "reject_candidate");
  assert.equal(highNews.blockingEventsCount, 1);

  const governed = suite.applyNewsSessionRiskToSignal(signal(), highNews);
  assert.equal(governed.decision, "no_trade");
  assert.equal(governed.side, "flat");
  assert.ok(governed.confidence < signal().confidence);
  assert.ok(governed.newsSessionRisk);

  const strict = suite.getDefaultApprovedSetupProfiles()[0];
  const approvedDecision = suite.evaluateApprovedSetupProfile(governed, strict);
  assert.equal(approvedDecision.newsRiskLevel, "blocked");
  assert.ok(["no_trade", "rejected_candidate"].includes(approvedDecision.status));
  assert.equal(approvedDecision.authority.executionAuthority, "none");
  assert.equal(suite.assertIctApprovedSetupDecisionIsCompact(approvedDecision).ok, true);

  const mediumNews = suite.evaluateNewsSessionRisk(signal(), {
    provider: "fmp_mock",
    economicEvents: [
      {
        eventId: "pmi",
        currency: "USD",
        eventName: "ISM PMI",
        impact: "medium",
        scheduledAt: "2026-06-05T14:05:00.000Z"
      }
    ]
  });
  assert.equal(mediumNews.newsRiskLevel, "medium");
  assert.equal(mediumNews.riskGovernorAction, "downgrade_to_watchlist");
  assert.ok(mediumNews.riskGovernorConfidenceAdjustment < 0);

  const lunch = suite.evaluateNewsSessionRisk(
    signal({
      displacement: { ...signal().displacement, candleTime: "2026-06-05T16:00:00.000Z" },
      fairValueGap: { ...signal().fairValueGap, createdAt: "2026-06-05T16:00:00.000Z" }
    }),
    { syntheticNoRisk: true }
  );
  assert.equal(lunch.session.sessionName, "new_york_lunch");
  assert.equal(lunch.sessionRiskState, "caution");
  assert.equal(lunch.riskGovernorAction, "downgrade_to_watchlist");

  const afterHours = suite.evaluateNewsSessionRisk(
    signal({
      displacement: { ...signal().displacement, candleTime: "2026-06-05T12:00:00.000Z" },
      fairValueGap: { ...signal().fairValueGap, createdAt: "2026-06-05T12:00:00.000Z" }
    }),
    { syntheticNoRisk: true }
  );
  assert.equal(afterHours.session.sessionName, "after_hours");
  assert.equal(afterHours.riskGovernorAction, "no_trade");

  const flagRisk = suite.evaluateNewsSessionRisk(signal(), {
    macroRiskFlags: [
      {
        flagId: "macro_block",
        severity: "block",
        reason: "FMP macro risk block window.",
        windowStart: "2026-06-05T13:45:00.000Z",
        windowEnd: "2026-06-05T14:15:00.000Z"
      }
    ]
  });
  assert.equal(flagRisk.riskGovernorAction, "reject_candidate");

  const journalEvent = suite.buildIctNewsSessionRiskJournalEvent(highNews, signal());
  assert.equal(journalEvent.eventType, "ict_news_session_risk_summary");
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(journalEvent.authority.executionAuthority, "none");
  assert.equal(journalEvent.safety.rawCandlesExcluded, true);
  assertCompact(suite, journalEvent, "news/session journal event");
  assert.equal(suite.appendIctNewsSessionRiskJournalEvents([journalEvent]).ok, true);

  const sourceSummary = {
    sourceId: "ict_news_session:MNQ:USTECH:5m",
    provider: "mt5_read_only",
    symbol: "MNQ",
    normalizedSymbol: "MNQ",
    timeframe: "5m",
    candleCount: fixtureCandles().length,
    storageBackend: "memory",
    dataQuality: "sufficient",
    eligibility: { chartDisplay: true, quickAnalysis: true, researchCycle: true, walkForward: false },
    eligibilityReasons: [],
    warnings: [],
    provenance: { sourceLabel: "USTECH risk fixture", providerSymbol: "USTECH", generatedAt: "2026-06-05T14:00:00.000Z" },
    authority: { executionAuthority: "none", brokerAuthority: "none", readinessOverrideAuthority: "none" },
    fingerprint: "ict_news_session_fixture",
    roles: ["available", "research"]
  };
  const advisorSignals = suite.buildIctAdvisorSignals({
    brokerSymbol: "USTECH",
    candles: fixtureCandles(),
    htfCandles: { "15m": fixtureCandles(), "1h": fixtureCandles() },
    newsSessionRiskContext: {
      provider: "fmp_mock",
      economicEvents: [
        {
          eventId: "cpi",
          currency: "USD",
          eventName: "CPI inflation",
          impact: "high",
          scheduledAt: "2026-06-05T14:00:00.000Z"
        }
      ]
    },
    primaryTimeframe: "5m",
    requestedSymbol: "MNQ",
    sourceSummary,
    symbol: "MNQ"
  });
  assert.ok(advisorSignals.every((item) => item.newsSessionRisk?.researchOnly === true));
  assert.ok(advisorSignals.some((item) => item.newsSessionRisk?.riskGovernorAction === "reject_candidate"));
  assertCompact(suite, advisorSignals, "advisor signals with risk metadata");

  const report = suite.runIctReplayValidation({
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candles: fixtureCandles(),
    htfCandles: { "15m": fixtureCandles(), "1h": fixtureCandles() },
    newsSessionRiskContext: {
      provider: "fmp_mock",
      economicEvents: [
        {
          eventId: "nfp",
          currency: "USD",
          eventName: "Nonfarm Payrolls",
          impact: "high",
          scheduledAt: "2026-06-05T14:00:00.000Z"
        }
      ]
    },
    replayWindowSize: 4,
    lookaheadCandles: 2,
    researchOnly: true
  });
  assert.equal(report.input.newsSessionRiskContextStatus, "provided");
  assert.ok(report.results.some((item) => item.newsRiskLevel === "blocked"));
  assert.equal(suite.assertIctReplayOutputIsCompact(report).ok, true);

  const diagnostics = suite.buildReplayDiagnostics(report.results);
  assert.ok(diagnostics.byNewsRiskLevel.blocked, "diagnostics should group blocked news risk");
  assert.ok(diagnostics.bySessionRiskState.preferred || diagnostics.bySessionRiskState.caution, "diagnostics should group session state");
  assert.ok(diagnostics.byRiskGovernorAction.reject_candidate || diagnostics.byRiskGovernorAction.no_trade, "diagnostics should group governor action");
  const filters = suite.getDefaultReplayCalibrationFilters();
  assert.ok(filters.some((filter) => filter.id === "reject_high_news_risk"));
  assert.ok(filters.some((filter) => filter.id === "preferred_sessions_only"));
  const highNewsFilter = suite.runReplayCalibrationSuite(report.results, filters.filter((filter) => filter.id === "reject_high_news_risk"))[0];
  assert.ok(highNewsFilter.after.totalSignals <= highNewsFilter.before.totalSignals);
  assert.equal(suite.assertIctReplayDiagnosticsOutputIsCompact({ diagnostics }).ok, true);

  process.stdout.write("GoTrader ICT News/Session Risk Governor smoke test passed.\n");
  process.stdout.write(`Clear action: ${clear.riskGovernorAction}\n`);
  process.stdout.write(`High-news action: ${highNews.riskGovernorAction}\n`);
  process.stdout.write(`Replay results: ${report.results.length}\n`);
  process.stdout.write(`Authority: ${highNews.authority.executionAuthority}/${highNews.authority.brokerAuthority}/${highNews.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT News/Session Risk Governor smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
