#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-activate-market-pipeline-test");

const sourceFiles = [
  "ictActivateMarketPipelineTypes.ts",
  "ictActivateMarketPipeline.ts"
];

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
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
  fs.writeFileSync(path.join(outRoot, "ictAdvisorEngine.mjs"), "export async function buildIctAdvisorPacketFromRuntime() { return {}; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictCurrentRead.mjs"), "export function buildIctCurrentReadFromPacket() { return globalThis.__ACTIVATE_MARKET_TEST_READ; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictMarketAnalysisContext.mjs"), "export async function buildIctMarketAnalysisContextBundle() { return globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictSignalContract.mjs"), "export function buildIctResearchSignalFromCurrentRead() { return globalThis.__ACTIVATE_MARKET_TEST_SIGNAL; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictCmdPaperTracking.mjs"), "export function evaluateCmdPaperTrackingEligibility() { return globalThis.__ACTIVATE_MARKET_TEST_CMD_ELIGIBILITY; }\n", "utf8");
}

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  secretsExcluded: true
};

const activeSource = (overrides = {}) => ({
  provider: "mt5_read_only",
  symbol: "MNQ",
  timeframe: "5m",
  candleCount: 1000,
  fingerprint: "mt5_ustech_5m_1000_fp",
  authority,
  provenance: {
    providerSymbol: "USTECH"
  },
  ...overrides
});

const snapshot = (sourceOverrides = {}, htfSources = [
  { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "15m", candleCount: 1000, fingerprint: "htf_15m_fp" },
  { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "1h", candleCount: 1000, fingerprint: "htf_1h_fp" }
]) => ({
  marketData: {
    symbol: "MNQ",
    contract: "MNQ",
    timeframe: "5m",
    activeResearchSource: activeSource(sourceOverrides)
  },
  mt5ReadOnly: {
    brokerSymbol: "USTECH",
    higherTimeframeSources: htfSources
  }
});

const currentRead = (overrides = {}) => ({
  researchOnly: true,
  packetSource: "live_mt5",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  dataStatus: "ready",
  candleCount: 1000,
  side: "short",
  approvedStatus: "paper_watchlist_candidate",
  modelQualityLane: "paper_watchlist",
  paperWatchlistEligible: true,
  paperWatchlistModelName: "consolidation_manipulation_distribution",
  paperWatchlistReason: "CMD paper-watchlist - paper-test only.",
  paperWatchlistEvidenceSummary: "CMD strict evidence passed paper-only profile.",
  executionAllowed: false,
  smtStatus: "confirmed",
  riskStatus: "normal session caution",
  modelDetected: true,
  modelName: "consolidation_manipulation_distribution",
  modelState: "candidate",
  topReasons: ["CMD paper-watchlist candidate."],
  nextAction: "Track CMD Paper Candidate",
  debug: {
    candleCount: 1000,
    primaryTimeframeAvailable: true,
    htfTimeframesAvailable: ["15m", "1h"],
    phase1SignalCount: 4,
    phase2SignalCount: 3,
    approvedStatus: "paper_watchlist_candidate",
    rejectionReasonsCount: 0,
    noTradeReasonsCount: 0,
    lastEvaluationAt: "2026-06-07T12:00:00.000Z",
    packetSource: "live_mt5",
    sourceFingerprint: "mt5_ustech_5m_1000_fp"
  },
  authority,
  safety,
  ...overrides
});

const signalContract = (overrides = {}) => ({
  signalId: "ict_signal_test",
  generatedAt: "2026-06-07T12:00:00.000Z",
  researchOnly: true,
  status: "watchlist_signal",
  executionReadiness: "research_only",
  executionAllowed: false,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h"],
  side: "short",
  modelQualityLane: "paper_watchlist",
  paperWatchlistEligible: true,
  approvedProfileStatus: "paper_watchlist_candidate",
  modelName: "consolidation_manipulation_distribution",
  reasons: ["CMD paper-watchlist - paper-test only."],
  rejectionReasons: [],
  warnings: [],
  nextAction: "Track CMD Paper Candidate",
  authority,
  safety,
  provenance: {
    source: "ict_current_read",
    methodology: "ICT",
    researchOnly: true,
    generatedAt: "2026-06-07T12:00:00.000Z"
  },
  ...overrides
});

const assertSafe = (result) => {
  const serialized = JSON.stringify(result);
  assert.equal(result.researchOnly, true);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.safety.rawCandlesExcluded, true);
  assert.equal(result.safety.rawSnapshotsExcluded, true);
  assert.equal(result.safety.accountDataExcluded, true);
  assert.equal(result.safety.orderDataExcluded, true);
  assert.equal(result.safety.positionDataExcluded, true);
  assert.equal(result.safety.secretsExcluded, true);
  assert.equal(result.summary.executionAllowed, false);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
};

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictActivateMarketPipeline.mjs")));
  const initialSteps = suite.createActivateMarketInitialSteps();
  assert.deepEqual(
    initialSteps.map((step) => step.id),
    [
    "resolve_symbol",
    "check_mt5_readonly",
      "load_display_candles",
      "load_analysis_m5",
      "load_analysis_m15",
      "load_analysis_h1",
      "load_analysis_h4",
      "load_analysis_daily",
      "load_analysis_weekly",
      "build_multi_timeframe_context",
      "build_current_read",
      "detect_session_model",
      "run_phase_one",
      "run_phase_two",
      "run_smt",
      "run_news_session_risk",
      "apply_approved_profile",
      "build_signal_contract",
      "build_operator_workflow",
      "check_cmd_paper_eligibility",
      "save_latest_state",
      "complete"
    ],
    "Activate Market steps should stay in the requested order"
  );
  assert.ok(initialSteps.every((step) => step.status === "pending"), "initial steps should be pending");

  globalThis.__ACTIVATE_MARKET_TEST_READ = currentRead();
  globalThis.__ACTIVATE_MARKET_TEST_SIGNAL = signalContract();
  globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT = {
    context: {
      researchOnly: true,
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      displayTimeframe: "5m",
      displayTimeframeRole: "chart_display_reference_only",
      analysisTimeframes: ["W1", "D1", "H4", "H1", "M15", "M5"].map((timeframe) => ({
        timeframe,
        requestedLookbackDays: 90,
        availableLookbackDays: 88.95,
        candleCount: timeframe === "M5" ? 17799 : timeframe === "M15" ? 5960 : 600,
        dataDepthStatus: "sufficient",
        sourceMethod: `test_chunked_${timeframe}`,
        role: "test_role",
        firstTimestamp: "2026-03-01T00:00:00.000Z",
        lastTimestamp: "2026-06-07T00:00:00.000Z",
        chunkCount: 9
      })),
      chartDisplayCandleCount: 1000,
      analysisDepthStatus: "sufficient",
      analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
      missingTimeframes: [],
      htfBiasSource: ["W1", "D1", "H4", "H1"],
      sessionModelSourceTimeframe: "M15",
      confirmationSourceTimeframe: "M5",
      warnings: ["test compact context"],
      generatedAt: "2026-06-07T12:00:00.000Z",
      authority,
      safety
    },
    displayCandles: [],
    analysisCandlesByTimeframe: {},
    depthSummariesByTimeframe: {}
  };
  globalThis.__ACTIVATE_MARKET_TEST_CMD_ELIGIBILITY = {
    eligible: true,
    reasons: ["CMD strict paper-watchlist candidate is eligible for paper-only tracking."]
  };
  const updates = [];
  const savedSummaries = [];
  const success = await suite.runIctActivateMarketPipeline(
    { snapshot: snapshot(), saveLatestSummary: true },
    { onStepUpdate: (step, allSteps) => updates.push({ step, allSteps }) },
    { saveLatestSummary: (summary) => savedSummaries.push(summary) }
  );
  assert.equal(success.status, "completed", "successful pipeline should complete");
  assert.ok(success.steps.every((step) => step.status === "completed"), "successful pipeline should mark all steps completed");
  assert.ok(updates.length >= success.steps.length, "progress updates should be emitted");
  assert.ok(success.currentRead, "result should include compact current read");
  assert.ok(success.marketAnalysisContext, "result should include compact multi-timeframe context");
  assert.ok(success.signalContract, "result should include research signal contract");
  assert.deepEqual(success.summary.analysisTimeframesUsed, ["W1", "D1", "H4", "H1", "M15", "M5"]);
  assert.equal(success.summary.displayTimeframe, "5m");
  assert.equal(success.summary.analysisDepthStatus, "sufficient");
  assert.equal(success.operatorWorkflow.recommendedAction, "Track CMD Paper Candidate");
  assert.equal(success.cmdPaperEligibility.eligible, true);
  assert.equal(success.summary.modelLane, "paper_watchlist");
  assert.equal(savedSummaries.length, 1, "compact activation summary should be saved once");
  assert.equal(savedSummaries[0].executionAllowed, false);
  assertSafe(success);
  assert.match(suite.summarizeActivateMarketResult(success), /execution disabled/i);

  const unavailable = await suite.runIctActivateMarketPipeline(
    { snapshot: snapshot({ provider: "mock", candleCount: 48, fingerprint: "mock_fp" }), saveLatestSummary: false },
    undefined,
    { saveLatestSummary: () => assert.fail("unavailable activation should not save summary") }
  );
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.steps.find((step) => step.id === "check_mt5_readonly").status, "failed");
  assert.match(unavailable.errors.join(" "), /MT5 read-only is required/i);
  assertSafe(unavailable);

  globalThis.__ACTIVATE_MARKET_TEST_READ = currentRead({ htfTimeframes: [], smtStatus: "confirmed" });
  globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT = {
    ...globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT,
    context: {
      ...globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT.context,
      analysisTimeframes: globalThis.__ACTIVATE_MARKET_TEST_MARKET_CONTEXT.context.analysisTimeframes.map((context) =>
        context.timeframe === "H1" ? { ...context, candleCount: 0, dataDepthStatus: "unavailable" } : context
      ),
      analysisDepthStatus: "limited",
      analysisTimeframesUsed: ["W1", "D1", "H4", "M15", "M5"],
      missingTimeframes: ["H1"],
      htfBiasSource: ["W1", "D1", "H4"]
    }
  };
  const missingHtf = await suite.runIctActivateMarketPipeline(
    { snapshot: snapshot({}, []), saveLatestSummary: false },
    undefined,
    { saveLatestSummary: () => undefined }
  );
  assert.equal(missingHtf.status, "partial");
  assert.equal(missingHtf.steps.find((step) => step.id === "load_analysis_h1").status, "skipped");
  assert.match(missingHtf.warnings.join(" "), /H1 analysis context is missing|missing H1/i);
  assertSafe(missingHtf);

  globalThis.__ACTIVATE_MARKET_TEST_READ = currentRead({ smtStatus: "not available" });
  const missingSmt = await suite.runIctActivateMarketPipeline(
    { snapshot: snapshot(), saveLatestSummary: false },
    undefined,
    { saveLatestSummary: () => undefined }
  );
  assert.equal(missingSmt.status, "partial");
  assert.equal(missingSmt.steps.find((step) => step.id === "run_smt").status, "skipped");
  assert.match(missingSmt.warnings.join(" "), /SMT comparison data unavailable/i);
  assertSafe(missingSmt);

  globalThis.__ACTIVATE_MARKET_TEST_READ = currentRead({
    modelDetected: false,
    modelName: undefined,
    modelQualityLane: "no_trade",
    approvedStatus: "no_trade",
    paperWatchlistEligible: false,
    topReasons: ["No current session model detected."],
    nextAction: "Wait / Check MT5 Depth"
  });
  globalThis.__ACTIVATE_MARKET_TEST_SIGNAL = signalContract({
    status: "no_signal",
    modelQualityLane: "no_trade",
    paperWatchlistEligible: false,
    approvedProfileStatus: "no_trade",
    modelName: undefined,
    nextAction: "Wait / Check MT5 Depth"
  });
  globalThis.__ACTIVATE_MARKET_TEST_CMD_ELIGIBILITY = {
    eligible: false,
    reasons: ["Only CMD paper-watchlist candidates can create CMD paper tracking."]
  };
  const noTrade = await suite.runIctActivateMarketPipeline(
    { snapshot: snapshot(), saveLatestSummary: false },
    undefined,
    { saveLatestSummary: () => undefined }
  );
  assert.equal(noTrade.operatorWorkflow.recommendedAction, "Wait / Check MT5 Depth");
  assert.equal(noTrade.cmdPaperEligibility.eligible, false);
  assertSafe(noTrade);

  console.log(JSON.stringify({
    status: "passed",
    tested: [
      "initial_step_order",
      "successful_pipeline",
      "mt5_unavailable",
      "missing_htf_partial",
      "missing_smt_skipped",
      "progress_updates",
      "operator_workflow",
      "safety_contract"
    ],
    authority,
    rawCandlesExposed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
