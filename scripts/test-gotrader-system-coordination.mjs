#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "gotrader-system-coordination-test");

const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictCurrentReadTypes.ts" },
  { root: sourceRoot, file: "ictCurrentRead.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizerTypes.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictMonteCarlo.ts" },
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
  { root: sourceRoot, file: "ictSignalContractTypes.ts" },
  { root: sourceRoot, file: "ictSignalContract.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
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
  return globalThis.__GOTRADER_SYSTEM_COORDINATION_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__GOTRADER_SYSTEM_COORDINATION_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const candle = (id, timestamp, open, high, low, close, symbol = "MNQ", timeframe = "5m") => ({
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

const primaryCandles = [
  candle("d1_0", "2026-06-01T19:00:00.000Z", 110, 113, 108, 112),
  candle("d1_1", "2026-06-01T20:00:00.000Z", 112, 120, 111, 118),
  candle("d1_2", "2026-06-01T21:00:00.000Z", 118, 119, 105, 108),
  candle("d1_3", "2026-06-01T22:00:00.000Z", 108, 116, 100, 112),
  candle("d2_0", "2026-06-02T08:00:00.000Z", 103, 105, 101, 102),
  candle("d2_1", "2026-06-02T08:05:00.000Z", 102, 103, 99, 101),
  candle("d2_2", "2026-06-02T08:10:00.000Z", 101, 103, 100.5, 102),
  candle("d2_3", "2026-06-02T08:15:00.000Z", 104, 111, 104, 110),
  candle("d2_4", "2026-06-02T08:20:00.000Z", 108, 112, 106, 107)
];

const sourceFor = (sourceId, timeframe, values, fingerprint = `${sourceId}:fingerprint`) => ({
  sourceId,
  provider: "mt5_read_only",
  symbol: "MNQ",
  normalizedSymbol: "MNQ",
  timeframe,
  candles: values,
  candleCount: values.length,
  firstTimestamp: values[0]?.timestamp,
  lastTimestamp: values.at(-1)?.timestamp,
  storageBackend: "memory",
  dataQuality: values.length ? "sufficient" : "insufficient",
  eligibility: {
    chartDisplay: values.length > 0,
    quickAnalysis: values.length > 0,
    researchCycle: values.length > 0,
    walkForward: values.length >= 9
  },
  eligibilityReasons: [],
  warnings: ["MT5 read-only USTECH is CFD/proxy data, not CME MNQ futures truth."],
  provenance: {
    sourceLabel: `MT5 read-only USTECH ${timeframe} coordination fixture`,
    providerSymbol: "USTECH",
    generatedAt: "2026-06-05T14:00:00.000Z"
  },
  authority,
  fingerprint,
  roles: ["chart_display", "research", "available"]
});

const htf15 = sourceFor(
  "mt5:MNQ:USTECH:15m",
  "15m",
  [
    candle("h15_0", "2026-06-02T08:00:00.000Z", 100, 106, 99, 104, "MNQ", "15m"),
    candle("h15_1", "2026-06-02T08:15:00.000Z", 104, 112, 102, 110, "MNQ", "15m")
  ],
  "coordination_15m_fp"
);

const htf1h = sourceFor(
  "mt5:MNQ:USTECH:1h",
  "1h",
  [
    candle("h1_0", "2026-06-02T07:00:00.000Z", 99, 106, 98, 104, "MNQ", "1h"),
    candle("h1_1", "2026-06-02T08:00:00.000Z", 104, 113, 103, 111, "MNQ", "1h")
  ],
  "coordination_1h_fp"
);

const runtimeSnapshot = (activeSource, higherTimeframeSources = []) => ({
  marketData: {
    symbol: "MNQ",
    contract: "MNQ",
    timeframe: "5m",
    activeChartSource: activeSource,
    activeResearchSource: activeSource
  },
  mt5ReadOnly: {
    brokerSymbol: "USTECH",
    higherTimeframeSources
  }
});

const htfRuntime = [
  {
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "15m",
    candleCount: htf15.candleCount,
    fingerprint: htf15.fingerprint,
    eligibilityState: "eligible_for_analysis"
  },
  {
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "1h",
    candleCount: htf1h.candleCount,
    fingerprint: htf1h.fingerprint,
    eligibilityState: "eligible_for_analysis"
  }
];

const compactSafetyRegex =
  /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i;

function assertCompact(value, label) {
  assert.doesNotMatch(JSON.stringify(value), compactSafetyRegex, `${label} must remain compact and omit unsafe data`);
}

function assertAuthorityNone(value, label) {
  assert.equal(value.authority?.executionAuthority, "none", `${label} execution authority must be none`);
  assert.equal(value.authority?.brokerAuthority, "none", `${label} broker authority must be none`);
  assert.equal(value.authority?.readinessOverrideAuthority, "none", `${label} readiness override authority must be none`);
}

const baseSignal = (overrides = {}) => ({
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
  summary: "Coordination fixture signal.",
  noTradeReasons: [],
  riskNotes: ["Research only."],
  provenance: {
    methodology: "ICT",
    phase: "phase_1",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T14:00:00.000Z"
  },
  ...overrides
});

const compactPacket = ({ signals, recommendedSignal, approvedProfileDecision }) => ({
  packetId: "coordination_packet",
  source: "gotrader_ict_strategy_suite",
  mode: "advisory_only",
  generatedAt: "2026-06-05T14:00:00.000Z",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  activeSource: {
    provider: "mt5_read_only",
    candleCount: primaryCandles.length,
    firstTimestamp: primaryCandles[0].timestamp,
    lastTimestamp: primaryCandles.at(-1).timestamp,
    sourceFingerprint: "coordination_primary_fp",
    sourceLabel: "MT5 read-only USTECH coordination fixture"
  },
  signals,
  recommendedSignal,
  compactSummary: {
    compositeBias: recommendedSignal.bias.composite,
    drawOnLiquidity: recommendedSignal.drawOnLiquidity?.type,
    setup: recommendedSignal.setup,
    decision: recommendedSignal.decision,
    side: recommendedSignal.side,
    confidence: recommendedSignal.confidence,
    approvedProfileStatus: approvedProfileDecision.status,
    approvalScore: approvedProfileDecision.approvalScore,
    noTradeReasonCount: recommendedSignal.noTradeReasons.length
  },
  approvedProfileDecision,
  journalEvents: [],
  indexSmtJournalEvents: [],
  newsSessionRiskJournalEvents: [],
  journalStatus: "memory_only",
  safetyLocks: {
    rawCandlesIncluded: false,
    rawSnapshotsIncluded: false,
    secretsIncluded: false,
    accountDataIncluded: false,
    orderDataIncluded: false,
    positionDataIncluded: false
  },
  authority
});

const makeSeries = ({ base = 100, brokerSymbol = "USTECH", direction = "up", sweep = "none" }) => {
  const previous = Array.from({ length: 6 }, (_, index) => {
    const open = base + index * 0.25;
    return candle(`${brokerSymbol}_p_${index}`, `2026-06-05T12:${String(index * 5).padStart(2, "0")}:00.000Z`, open, base + 4, base - 2, open + 0.2, brokerSymbol);
  });
  const recent = Array.from({ length: 6 }, (_, index) => {
    const trend = direction === "down" ? -index * 0.65 : index * 0.65;
    const open = base + 1 + trend;
    const high = sweep === "buy" && index === 1 ? base + 6 : base + 3 + Math.max(trend, 0);
    const low = sweep === "sell" && index === 1 ? base - 4 : base - 1 + Math.min(trend, 0);
    return candle(`${brokerSymbol}_r_${index}`, `2026-06-05T12:${String((index + 6) * 5).padStart(2, "0")}:00.000Z`, open, high, low, open + (direction === "down" ? -0.3 : 0.3), brokerSymbol);
  });
  return [...previous, ...recent];
};

const bullishSmtSources = () => ({
  USTECH: makeSeries({ base: 100, brokerSymbol: "USTECH", direction: "up", sweep: "sell" }),
  US500: makeSeries({ base: 50, brokerSymbol: "US500", direction: "up", sweep: "none" }),
  US30: makeSeries({ base: 200, brokerSymbol: "US30", direction: "up", sweep: "none" })
});

const bearishSmtSources = () => ({
  USTECH: makeSeries({ base: 100, brokerSymbol: "USTECH", direction: "down", sweep: "buy" }),
  US500: makeSeries({ base: 50, brokerSymbol: "US500", direction: "down", sweep: "none" }),
  US30: makeSeries({ base: 200, brokerSymbol: "US30", direction: "down", sweep: "none" })
});

const replayResult = ({
  approvedProfileStatus = "approved_research_candidate",
  confidence = 0.72,
  outcome = "target_first",
  rrAchieved = 2,
  rrEstimate = 2,
  setup = "fvg_retracement",
  side = "long",
  signalTime = "2026-06-05T13:00:00.000Z",
  strategyId = "ict-fvg-displacement"
} = {}) => ({
  strategyId,
  phase: "phase_1",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  side,
  setup,
  decision: outcome === "no_trade" ? "no_trade" : "research_only",
  confidence,
  approvedProfileStatus,
  rrEstimate,
  outcome,
  fvgStatus: "respected",
  htfAligned: true,
  smtDivergenceType: "bullish_smt",
  smtConfirmsCandidate: true,
  smtRejectsCandidate: false,
  newsRiskLevel: "none",
  sessionRiskState: "preferred",
  riskGovernorAction: "allow",
  tradePath: { signalTime, rrAchieved },
  noTradeReasons: [],
  riskNotes: ["Research only."],
  summary: "compact replay fixture",
  researchOnly: true,
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    replay: true,
    researchOnly: true,
    generatedAt: "2026-06-05T13:00:00.000Z"
  }
});

function assertStaticUiContracts() {
  const dashboard = fs.readFileSync(path.join(projectRoot, "src", "components", "dashboard", "MissionControlShell.tsx"), "utf8");
  const advisor = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  const advisorSummary = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "IctAdvisorSummaryPanel.tsx"), "utf8");
  const app = fs.readFileSync(path.join(projectRoot, "src", "App.tsx"), "utf8");

  assert.match(app, /path="\/advisor"/, "/advisor route should exist");
  assert.match(app, /path="\/research-advisor"/, "/research-advisor route should exist");
  assert.match(dashboard, /IctAdvisorSummaryPanel/, "Dashboard should include compact Research Advisor current read card");
  assert.match(advisorSummary, /data-testid="dashboard-research-advisor-card"/, "Dashboard card should have a stable test id");
  assert.match(advisorSummary, /Open Advisor/, "Dashboard card should link to the Advisor workspace");
  assert.match(advisor, /data-testid="ict-current-read-panel"/, "Research Advisor should show current read without manual drills");
  assert.match(advisor, /data-testid="advisor-manual-replay-section"/, "Research Advisor should expose manual replay panel");
  assert.match(advisor, /data-testid="ict-monte-carlo-robustness"/, "Research Advisor should expose Monte Carlo panel");
  assert.match(advisor, /Run Monte Carlo Robustness/, "Monte Carlo should be manually triggered");
  assert.doesNotMatch(advisor, /useEffect\([\s\S]{0,900}runMonteCarloRobustness/, "Monte Carlo must not auto-run on page load");
  assert.doesNotMatch(dashboard, /No Monte Carlo engine wired yet/, "Dashboard must not claim Monte Carlo is unwired after engine implementation");
  assert.doesNotMatch(`${dashboard}\n${advisor}\n${advisorSummary}`, /<Button[^>]*>\s*(Buy|Sell|Execute|Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i, "No actionable execution controls should appear");
}

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const mt5Settings = await import(pathToFileURL(path.join(outRoot, "mt5SymbolSettings.mjs")));
  const mt5Normalizer = await import(pathToFileURL(path.join(outRoot, "mt5ReadOnlyNormalizer.mjs")));

  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("MNQ").brokerSymbol, "USTECH");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("NQ").brokerSymbol, "USTECH");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("ES").brokerSymbol, "US500");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("YM").brokerSymbol, "US30");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("XAUUSD").brokerSymbol, "XAUUSD");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("EURUSD").brokerSymbol, "EURUSD.pro");
  assert.equal(mt5Settings.findDefaultMt5SymbolMapping("BTCUSD").brokerSymbol, "BTCUSD");

  const normalized = mt5Normalizer.normalizeMt5ReadOnlyResponseCandles({
    ok: true,
    symbol: "MNQ",
    timeframe: "5m",
    requestedLimit: 1,
    candles: [
      { time: "2026-06-05T13:00:00.000Z", open: "100", high: "102", low: "99", close: "101", volume: 25 }
    ]
  });
  assert.deepEqual(
    ["close", "high", "id", "low", "open", "source", "symbol", "time", "timeframe", "timestamp", "volume"].sort(),
    Object.keys(normalized[0]).filter((key) => normalized[0][key] !== undefined).sort()
  );
  assert.equal(normalized[0].symbol, "MNQ");
  assert.equal(normalized[0].timeframe, "5m");

  const primary = sourceFor("mt5:MNQ:USTECH:5m", "5m", primaryCandles, "coordination_primary_fp");
  globalThis.__GOTRADER_SYSTEM_COORDINATION_TEST_SOURCES = new Map([
    [primary.sourceId, primary],
    [htf15.sourceId, htf15],
    [htf1h.sourceId, htf1h]
  ]);

  const packet = await suite.buildIctAdvisorPacketFromRuntime(runtimeSnapshot(primary, htfRuntime));
  const read = suite.buildIctCurrentReadFromPacket(packet);
  assert.equal(read.packetSource, "live_mt5", "current read should use active MT5 canonical source");
  assert.equal(read.dataStatus, "ready", "primary + HTF context should be ready");
  assert.equal(read.requestedSymbol, "MNQ");
  assert.equal(read.brokerSymbol, "USTECH");
  assert.equal(read.primaryTimeframe, "5m");
  assert.deepEqual(read.htfTimeframes.sort(), ["15m", "1h"].sort());
  assert.equal(read.htfStatus["15m"], "ready");
  assert.equal(read.htfStatus["1h"], "ready");
  assert.ok(read.debug.phase1SignalCount >= 4, "Phase 1 signals should reach current read");
  assert.ok(read.debug.phase2SignalCount >= 4, "Phase 2 signals should reach current read");
  assert.ok(read.bestPhase1Setup, "Phase 1 best setup should be visible");
  assert.ok(read.bestPhase2Setup, "Phase 2 best setup should be visible");
  assert.ok(read.bestSetup, "overall best setup should be visible");
  assert.ok(read.smtStatus, "SMT status should be visible");
  assert.ok(read.riskStatus, "news/session risk status should be visible");
  assert.ok(read.topReasons.length > 0, "current read should preserve top reasons");
  assert.ok(read.nextAction, "current read should preserve next action");
  assert.equal(suite.assertIctCurrentReadIsCompact(read).ok, true);
  assertAuthorityNone(read, "current read");
  assertCompact(packet, "advisor packet");

  const missingHtfPacket = await suite.buildIctAdvisorPacketFromRuntime(runtimeSnapshot(primary, []));
  const missingHtfRead = suite.buildIctCurrentReadFromPacket(missingHtfPacket);
  assert.equal(missingHtfRead.htfTimeframes.length, 0, "missing HTF context should not be silently invented");
  assert.equal(missingHtfRead.htfStatus["15m"], "missing");
  assert.equal(missingHtfRead.htfStatus["1h"], "missing");
  assert.ok(missingHtfRead.topReasons.some((reason) => /higher-timeframe/i.test(reason)), "missing HTF reason should be operator-visible");
  assert.notEqual(missingHtfRead.approvedStatus, "approved_research_candidate", "missing HTF should not become an approved research candidate");
  assert.equal(suite.assertIctCurrentReadIsCompact(missingHtfRead).ok, true);

  const staleSource = { ...primary, fingerprint: "", sourceId: "mt5:MNQ:USTECH:5m:stale" };
  globalThis.__GOTRADER_SYSTEM_COORDINATION_TEST_SOURCES = new Map([[staleSource.sourceId, staleSource]]);
  const stalePacket = await suite.buildIctAdvisorPacketFromRuntime(runtimeSnapshot(staleSource, []));
  const staleRead = suite.buildIctCurrentReadFromPacket(stalePacket);
  assert.equal(staleRead.dataStatus, "stale", "missing fingerprint should be reported as stale");

  const strictProfile = suite.getDefaultApprovedSetupProfiles()[0];
  const phase1Decision = suite.evaluateApprovedSetupProfile(baseSignal(), strictProfile);
  assert.ok(["approved_research_candidate", "watchlist_candidate", "rejected_candidate", "no_trade"].includes(phase1Decision.status), "Phase 1 candidate should pass through approved profile evaluation");
  assert.equal(suite.assertIctApprovedSetupDecisionIsCompact(phase1Decision).ok, true);
  assertAuthorityNone(phase1Decision, "approved setup profile");

  const phase1Signal = {
    ...baseSignal({
      setup: "fvg_retracement",
      phase: "phase_1",
      confidence: 0.55,
      rrEstimate: 1.2,
      approvedProfileDecision: {
        ...phase1Decision,
        status: "watchlist_candidate",
        approvalScore: 52,
        watchlistReasons: ["Phase 1 fixture is watchlist only."]
      }
    })
  };
  const phase2Decision = {
    ...phase1Decision,
    status: "approved_research_candidate",
    approvalScore: 86,
    rejectionReasons: [],
    watchlistReasons: [],
    approvedReasons: ["Phase 2 fixture has stronger RR and profile evidence."]
  };
  const phase2Signal = {
    ...baseSignal({
      strategyId: "ict-bread-and-butter",
      phase: "phase_2",
      setup: "bread_and_butter_buy",
      confidence: 0.88,
      rrEstimate: 3.2,
      approvedProfileDecision: phase2Decision,
      provenance: {
        methodology: "ICT",
        phase: "phase_2",
        sourceSet: "ICT Mentorship Core Content",
        researchOnly: true,
        generatedAt: "2026-06-05T14:00:00.000Z"
      }
    })
  };
  const phase2Read = suite.buildIctCurrentReadFromPacket(compactPacket({
    signals: [phase1Signal, phase2Signal],
    recommendedSignal: phase2Signal,
    approvedProfileDecision: phase2Decision
  }));
  assert.equal(phase2Read.bestPhase2Setup, "bread_and_butter_buy");
  assert.equal(phase2Read.bestSetup, "bread_and_butter_buy", "stronger Phase 2 candidate should surface as best setup");
  assert.equal(phase2Read.approvedStatus, "approved_research_candidate");
  assert.equal(suite.assertIctCurrentReadIsCompact(phase2Read).ok, true);

  const bullishSmt = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: bullishSmtSources(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"]
  });
  assert.equal(bullishSmt.confirmsCandidate, true);
  assert.equal(bullishSmt.rejectsCandidate, false);
  assertCompact(bullishSmt, "SMT confirmation");
  const confirmedDecision = suite.evaluateApprovedSetupProfile({ ...baseSignal(), smt: bullishSmt }, strictProfile);
  assert.equal(confirmedDecision.smtConfirmsCandidate, true);
  assert.equal(confirmedDecision.smtDivergenceType, "bullish_smt");

  const bearishAgainstLong = suite.evaluateIndexSmt({
    candidateSide: "long",
    candlesByBrokerSymbol: bearishSmtSources(),
    primarySymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"]
  });
  assert.equal(bearishAgainstLong.rejectsCandidate, true);
  const rejectedBySmt = suite.evaluateApprovedSetupProfile({ ...baseSignal(), smt: bearishAgainstLong }, strictProfile);
  assert.equal(rejectedBySmt.status, "rejected_candidate");
  assert.equal(rejectedBySmt.smtRejectsCandidate, true);

  const highNewsRisk = suite.evaluateNewsSessionRisk(baseSignal(), {
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
  });
  assert.equal(highNewsRisk.riskGovernorAction, "reject_candidate");
  const newsBlockedSignal = suite.applyNewsSessionRiskToSignal(baseSignal(), highNewsRisk);
  const newsBlockedDecision = suite.evaluateApprovedSetupProfile(newsBlockedSignal, strictProfile);
  const newsBlockedRead = suite.buildIctCurrentReadFromPacket(compactPacket({
    signals: [{ ...newsBlockedSignal, approvedProfileDecision: newsBlockedDecision }],
    recommendedSignal: { ...newsBlockedSignal, approvedProfileDecision: newsBlockedDecision },
    approvedProfileDecision: newsBlockedDecision
  }));
  assert.ok(["rejected_candidate", "no_trade"].includes(newsBlockedRead.approvedStatus), "news/session risk should block or reject the current read");
  assert.match(newsBlockedRead.riskStatus, /reject_candidate|no_trade/);
  assert.ok(newsBlockedRead.topReasons.some((reason) => /news|event|risk|session/i.test(reason)), "news/session blocker should be visible");
  assertAuthorityNone(highNewsRisk, "news/session risk");
  assertCompact(highNewsRisk, "news/session risk");

  const replayReport = suite.runIctReplayValidation({
    symbol: "MNQ",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candles: [
      ...primaryCandles,
      candle("future_1", "2026-06-02T08:25:00.000Z", 107, 113, 106, 112),
      candle("future_2", "2026-06-02T08:30:00.000Z", 112, 116, 111, 115)
    ],
    htfCandles: { "15m": htf15.candles, "1h": htf1h.candles },
    replayWindowSize: 6,
    lookaheadCandles: 2,
    researchOnly: true
  });
  assert.equal(suite.assertIctReplayOutputIsCompact(replayReport).ok, true);
  const diagnostics = suite.buildReplayDiagnostics(replayReport.results);
  assert.ok(diagnostics.totalResults >= 0, "replay diagnostics should accept replay output");
  assert.equal(suite.assertIctReplayDiagnosticsOutputIsCompact({ diagnostics }).ok, true);

  const replayFixtures = [
    replayResult({ outcome: "target_first", rrAchieved: 2.2 }),
    replayResult({ outcome: "partial_target", rrAchieved: 0.6 }),
    replayResult({ outcome: "invalidation_first", rrAchieved: undefined }),
    replayResult({ outcome: "stalled", rrAchieved: undefined }),
    replayResult({ approvedProfileStatus: "watchlist_candidate", outcome: "target_first", rrAchieved: 1.4 })
  ];
  const mcOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(replayFixtures);
  assert.equal(mcOutcomes.length, 5, "Monte Carlo should consume compact replay outcomes");
  const insufficientMc = suite.runMonteCarloBatch(mcOutcomes, {
    source: "system_coordination_replay_fixture",
    simulationCount: 60,
    tradesPerSimulation: 12,
    randomSeed: 42,
    researchOnly: true
  });
  assert.equal(insufficientMc.recommendation.robustnessRating, "insufficient_data");
  assert.equal(insufficientMc.authority.executionAuthority, "none");
  assert.equal(insufficientMc.safety.rawCandlesExcluded, true);
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(insufficientMc).ok, true);
  const mcJournal = suite.buildIctMonteCarloJournalEvent(insufficientMc);
  assert.equal(mcJournal.researchOnly, true);
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(insufficientMc, mcJournal).ok, true);
  assertCompact({ insufficientMc, mcJournal }, "Monte Carlo summary and journal");

  const latestReplaySnapshot = suite.buildLatestReplaySnapshot({
    status: "completed",
    runId: "coordination_manual_replay",
    generatedAt: "2026-06-05T15:00:00.000Z",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    candleLimit: 1000,
    replayWindowSize: 80,
    lookaheadCandles: 12,
    totalWindows: replayReport.summary.totalWindows,
    totalSignals: replayReport.summary.totalSignals,
    totalNoTrades: replayReport.summary.totalNoTrades,
    targetFirstRate: replayReport.summary.targetFirstRate,
    invalidationFirstRate: replayReport.summary.invalidationFirstRate,
    averageRrAchieved: replayReport.summary.averageRrAchieved,
    approvedProfileCounts: { totalApproved: 3, totalWatchlist: 2, totalRejected: 1, totalNoTrade: 1 },
    approvedTargetFirstRate: 0.5,
    approvedAverageRr: 1.1,
    mostCommonNoTradeReasons: [],
    smtSummary: { divergenceTypes: [], confirmation: [], rejection: [] },
    newsSessionRiskSummary: { newsRiskLevels: [], sessionRiskStates: [], riskGovernorActions: [] },
    topCalibrationFilterImprovements: [],
    approvedProfileComparison: [],
    errors: [],
    warnings: [],
    researchOnly: true,
    authority,
    safety: {
      rawCandlesExcluded: true,
      rawSnapshotsExcluded: true,
      accountDataExcluded: true,
      orderDataExcluded: true,
      positionDataExcluded: true,
      secretsExcluded: true
    }
  });
  const latestMonteCarloSnapshot = suite.buildLatestMonteCarloSnapshot(insufficientMc);
  const latestScorecardSnapshot = suite.buildLatestScorecardSnapshot({
    runId: "coordination_scorecard",
    generatedAt: "2026-06-05T15:05:00.000Z",
    researchOnly: true,
    config: {
      requestedSymbols: ["MNQ", "ES", "YM"],
      primaryTimeframe: "5m",
      htfTimeframes: ["15m", "1h"],
      candleLimit: 1000,
      replayWindowSize: 80,
      lookaheadCandles: 12
    },
    symbols: [],
    summary: {
      completedSymbols: 3,
      unavailableSymbols: 0,
      researchPreferredSymbols: ["MNQ"],
      watchlistOnlySymbols: ["ES"],
      noisySymbols: ["YM"],
      bestApprovedTargetFirstSymbol: "MNQ",
      bestApprovedRrSymbol: "MNQ"
    },
    authority,
    safety: {
      rawCandlesExcluded: true,
      rawSnapshotsExcluded: true,
      accountDataExcluded: true,
      orderDataExcluded: true,
      positionDataExcluded: true,
      secretsExcluded: true
    }
  });
  suite.clearLatestResearchState();
  suite.saveLatestResearchStatePatch({ latestReplay: latestReplaySnapshot }, "manual_replay_review");
  suite.saveLatestResearchStatePatch({ latestMonteCarlo: latestMonteCarloSnapshot }, "monte_carlo");
  const latestState = suite.saveLatestResearchStatePatch({ latestScorecard: latestScorecardSnapshot }, "market_scorecard");
  assert.equal(suite.assertIctLatestResearchStateIsCompact(latestState).ok, true);
  const currentReadWithLatest = suite.buildIctCurrentReadFromPacket(packet, latestState);
  assert.equal(currentReadWithLatest.latestReplayStatus, "target-first 50%");
  assert.equal(currentReadWithLatest.latestMonteCarloRobustness, "insufficient_data");
  assert.equal(currentReadWithLatest.latestScorecardBestSymbol, "MNQ");
  assert.match(currentReadWithLatest.latestResearchStateNote, /manual research result/i);
  assert.equal(suite.assertIctCurrentReadIsCompact(currentReadWithLatest).ok, true);

  const advisorJournal = suite.buildIctAdvisorJournalEvent(packet.recommendedSignal, packet.approvedProfileDecision);
  assert.equal(advisorJournal.researchOnly, true);
  assertCompact(advisorJournal, "advisor journal event");

  assertStaticUiContracts();

  const auditSummary = {
    source: `${read.packetSource}:${read.brokerSymbol}->${read.requestedSymbol}`,
    currentReadStatus: read.dataStatus,
    phase1Signals: read.debug.phase1SignalCount,
    phase2Signals: read.debug.phase2SignalCount,
    missingHtfReason: missingHtfRead.topReasons.find((reason) => /higher-timeframe/i.test(reason)),
    phase2BestSetup: phase2Read.bestSetup,
    smtConfirm: confirmedDecision.smtDivergenceType,
    smtReject: rejectedBySmt.smtRejectsCandidate,
    newsRiskAction: highNewsRisk.riskGovernorAction,
    replayResults: replayReport.results.length,
    monteCarloRating: insufficientMc.recommendation.robustnessRating,
    latestReplay: currentReadWithLatest.latestReplayStatus,
    latestMonteCarlo: currentReadWithLatest.latestMonteCarloRobustness,
    latestScorecard: currentReadWithLatest.latestScorecardBestSymbol,
    authority: `${read.authority.executionAuthority}/${read.authority.brokerAuthority}/${read.authority.readinessOverrideAuthority}`
  };

  process.stdout.write("GoTrader system coordination audit test passed.\n");
  process.stdout.write(JSON.stringify(auditSummary, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`GoTrader system coordination audit test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
