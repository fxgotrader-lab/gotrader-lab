#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-activate-market-readiness-test");

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
  fs.writeFileSync(path.join(outRoot, "ictCurrentRead.mjs"), "export function buildIctCurrentReadFromPacket() { return globalThis.__ACTIVATE_MARKET_READINESS_READ; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictMarketAnalysisContext.mjs"), "export async function buildIctMarketAnalysisContextBundle() { return globalThis.__ACTIVATE_MARKET_READINESS_CONTEXT; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictSignalContract.mjs"), "export function buildIctResearchSignalFromCurrentRead() { return globalThis.__ACTIVATE_MARKET_READINESS_SIGNAL; }\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "ictCmdPaperTracking.mjs"), "export function evaluateCmdPaperTrackingEligibility() { return globalThis.__ACTIVATE_MARKET_READINESS_CMD; }\n", "utf8");
  fs.writeFileSync(
    path.join(outRoot, "ictSelfImprovement.mjs"),
    `export function queueIctResearchHypothesis() {
  return {
    ok: false,
    storage: "memory",
    reason: "No eligible research hypothesis to queue.",
    totalHypotheses: 0
  };
}
`,
    "utf8"
  );
}

const snapshot = () => ({
  marketData: {
    symbol: "MNQ",
    contract: "MNQ",
    timeframe: "5m",
    activeResearchSource: {
      provider: "mt5_read_only",
      symbol: "MNQ",
      timeframe: "5m",
      candleCount: 1000,
      fingerprint: "mt5_ustech_5m_readiness",
      provenance: { providerSymbol: "USTECH" },
      authority
    }
  },
  mt5ReadOnly: {
    brokerSymbol: "USTECH",
    higherTimeframeSources: [
      { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "15m", candleCount: 1000, fingerprint: "m15" },
      { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "1h", candleCount: 0, fingerprint: "h1_missing" }
    ]
  }
});

const partialContext = () => ({
  context: {
    researchOnly: true,
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    displayTimeframe: "5m",
    displayTimeframeRole: "chart_display_reference_only",
    analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
    analysisTimeframesLoaded: ["M15", "M5"],
    requiredTimeframesLoaded: true,
    analysisTimeframes: ["M15", "M5"].map((timeframe) => ({
      timeframe,
      requestedLookbackDays: 90,
      availableLookbackDays: 88.95,
      candleCount: timeframe === "M5" ? 17799 : 5960,
      dataDepthStatus: "sufficient",
      sourceMethod: `range_${timeframe}`,
      role: "analysis",
      firstTimestamp: "2026-03-01T00:00:00.000Z",
      lastTimestamp: "2026-06-07T00:00:00.000Z",
      chunkCount: 9
    })),
    chartDisplayCandleCount: 1000,
    analysisDepthStatus: "limited",
    multiTimeframeContextStatus: "partial",
    analysisTimeframesUsed: ["M15", "M5"],
    missingTimeframes: ["W1", "D1", "H4", "H1"],
    htfBiasSource: [],
    sessionModelSourceTimeframe: "M15",
    confirmationSourceTimeframe: "M5",
    weeklyBiasStatus: "unavailable",
    weeklyBiasDirection: "unknown",
    weeklyBiasReason: "W1 context unavailable from MT5 range endpoint.",
    warnings: ["Missing optional HTF frames: W1, D1, H4, H1."],
    generatedAt: "2026-06-07T12:00:00.000Z",
    authority,
    safety
  },
  displayCandles: [],
  analysisCandlesByTimeframe: {},
  depthSummariesByTimeframe: {}
});

const currentRead = (overrides = {}) => ({
  researchOnly: true,
  packetSource: "live_mt5",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  displayTimeframe: "5m",
  displayTimeframeRole: "chart_display_reference_only",
  analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
  analysisTimeframesLoaded: ["M15", "M5"],
  requiredTimeframesLoaded: true,
  analysisTimeframesUsed: ["M15", "M5"],
  analysisDepthStatus: "limited",
  multiTimeframeContextStatus: "partial",
  missingTimeframes: ["W1", "D1", "H4", "H1"],
  weeklyBiasStatus: "unavailable",
  weeklyBiasDirection: "unknown",
  weeklyBiasReason: "W1 context unavailable from MT5 range endpoint.",
  htfTimeframes: ["15m"],
  dataStatus: "ready",
  candleCount: 1000,
  side: "flat",
  approvedStatus: "watchlist",
  modelQualityLane: "watchlist",
  paperWatchlistEligible: false,
  paperWatchlistReason: "Ordinary watchlist only - not paper-ready.",
  paperWatchlistEvidenceSummary: "No CMD strict paper-watchlist candidate.",
  paperSimEligibilityStatus: "not_eligible",
  paperSimEligibilityReason: "Only approved research signals or explicit paper-watchlist candidates are eligible.",
  paperSimAllowed: false,
  paperOnly: false,
  readinessSummary: {
    researchReadiness: "partial",
    paperReadiness: "not_eligible",
    executionReadiness: "disabled",
    reasons: [
      "Multi-timeframe context is partial.",
      "Only approved research signals or explicit paper-watchlist candidates are eligible.",
      "Execution readiness is disabled by design."
    ]
  },
  executionAllowed: false,
  smtStatus: "not available",
  riskStatus: "normal session caution",
  modelDetected: true,
  modelName: "accumulation_manipulation_expansion",
  modelState: "watchlist",
  topReasons: ["AME watchlist only - not paper-ready."],
  nextAction: "Collect more evidence",
  latestMonteCarloStatus: "missing",
  latestMonteCarloReason: "No saved Monte Carlo - run replay then Monte Carlo.",
  recommendedMaxRiskStatus: "unavailable",
  recommendedMaxRiskReason: "Recommended max risk unavailable - no saved Monte Carlo.",
  debug: {
    candleCount: 1000,
    primaryTimeframeAvailable: true,
    htfTimeframesAvailable: ["15m"],
    phase1SignalCount: 4,
    phase2SignalCount: 4,
    approvedStatus: "watchlist",
    rejectionReasonsCount: 0,
    noTradeReasonsCount: 0,
    packetSource: "live_mt5",
    sourceFingerprint: "mt5_ustech_5m_readiness"
  },
  authority,
  safety,
  ...overrides
});

const signal = (overrides = {}) => ({
  signalId: "readiness_signal",
  generatedAt: "2026-06-07T12:00:00.000Z",
  researchOnly: true,
  status: "watchlist_signal",
  executionReadiness: "research_only",
  executionAllowed: false,
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  displayTimeframe: "5m",
  displayTimeframeRole: "chart_display_reference_only",
  analysisTimeframesRequested: ["W1", "D1", "H4", "H1", "M15", "M5"],
  analysisTimeframesLoaded: ["M15", "M5"],
  requiredTimeframesLoaded: true,
  analysisTimeframesUsed: ["M15", "M5"],
  analysisDepthStatus: "limited",
  multiTimeframeContextStatus: "partial",
  missingTimeframes: ["W1", "D1", "H4", "H1"],
  weeklyBiasStatus: "unavailable",
  weeklyBiasDirection: "unknown",
  weeklyBiasReason: "W1 context unavailable from MT5 range endpoint.",
  htfTimeframes: ["15m"],
  side: "flat",
  modelQualityLane: "watchlist",
  paperWatchlistEligible: false,
  paperSimEligibilityStatus: "not_eligible",
  paperSimEligibilityReason: "Only approved research signals or explicit paper-watchlist candidates are eligible.",
  paperSimAllowed: false,
  paperOnly: false,
  readinessSummary: {
    researchReadiness: "partial",
    paperReadiness: "not_eligible",
    executionReadiness: "disabled",
    reasons: ["Multi-timeframe context is partial.", "Execution readiness is disabled by design."]
  },
  approvedProfileStatus: "watchlist",
  modelName: "accumulation_manipulation_expansion",
  reasons: ["AME watchlist only - not paper-ready."],
  rejectionReasons: [],
  warnings: ["Partial MTF context."],
  nextAction: "Collect more evidence",
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

const savedLatestState = {
  updatedAt: "2026-06-07T12:02:00.000Z",
  researchOnly: true,
  latestMonteCarlo: {
    generatedAt: "2026-06-07T12:00:30.000Z",
    source: "manual_replay_review",
    usableOutcomes: 55,
    robustnessRating: "strong",
    medianEndingR: 18.2,
    fifthPercentileEndingR: 4.4,
    medianMaxDrawdownPct: 3.7,
    worstMaxDrawdownPct: 7.9,
    riskOfRuinPct: 1.1,
    recommendedMaxRiskPerTradePct: 0.5,
    warnings: [],
    researchOnly: true
  },
  authority,
  safety
};

const assertSafeResult = (result) => {
  const serialized = JSON.stringify(result);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.summary.executionAllowed, false);
  assert.equal(result.summary.readinessSummary.executionReadiness, "disabled");
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
};

async function runActivation(suite, overrides = {}) {
  globalThis.__ACTIVATE_MARKET_READINESS_CONTEXT = overrides.context ?? partialContext();
  globalThis.__ACTIVATE_MARKET_READINESS_READ = overrides.read ?? currentRead();
  globalThis.__ACTIVATE_MARKET_READINESS_SIGNAL = overrides.signal ?? signal();
  globalThis.__ACTIVATE_MARKET_READINESS_CMD = overrides.cmd ?? {
    eligible: false,
    reasons: ["Not eligible - no CMD paper-watchlist candidate."]
  };
  return suite.runIctActivateMarketPipeline(
    {
      snapshot: snapshot(),
      latestResearchState: overrides.latestResearchState,
      saveLatestSummary: false
    },
    undefined,
    { saveLatestSummary: () => undefined }
  );
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictActivateMarketPipeline.mjs")));

  const missingMonteCarlo = await runActivation(suite);
  const weeklyStep = missingMonteCarlo.steps.find((step) => step.id === "load_weekly_bias");
  assert.equal(weeklyStep.status, "skipped", "weekly bias may skip only with an explicit reason");
  assert.match(weeklyStep.warning ?? weeklyStep.message, /W1 context unavailable from MT5 range endpoint/i);

  const mtfStep = missingMonteCarlo.steps.find((step) => step.id === "build_multi_timeframe_context");
  assert.equal(mtfStep.status, "completed", "partial MTF context should complete with a warning instead of silently skipping");
  assert.match(mtfStep.warning, /missing analysis timeframes: W1, D1, H4, H1|partial/i);

  const cmdStep = missingMonteCarlo.steps.find((step) => step.id === "check_cmd_paper_eligibility");
  assert.equal(cmdStep.status, "completed", "CMD eligibility should complete with a reason even when not eligible");
  assert.match(cmdStep.warning ?? cmdStep.message, /no CMD paper-watchlist candidate/i);

  assert.equal(missingMonteCarlo.latestMonteCarlo.status, "missing");
  assert.match(missingMonteCarlo.latestMonteCarlo.reason, /No saved Monte Carlo/i);
  assert.equal(missingMonteCarlo.summary.recommendedMaxRiskStatus, "unavailable");
  assert.match(missingMonteCarlo.summary.recommendedMaxRiskReason, /no saved Monte Carlo/i);
  assert.equal(missingMonteCarlo.summary.paperSimEligibilityStatus, "not_eligible");
  assert.match(missingMonteCarlo.summary.paperSimEligibilityReason, /approved research signals|paper-watchlist/i);
  assert.equal(missingMonteCarlo.summary.paperSimAllowed, false);
  assert.equal(missingMonteCarlo.summary.readinessSummary.researchReadiness, "partial");
  assert.equal(missingMonteCarlo.summary.readinessSummary.paperReadiness, "not_eligible");
  assert.equal(missingMonteCarlo.summary.readinessSummary.executionReadiness, "disabled");
  assertSafeResult(missingMonteCarlo);

  const savedMonteCarlo = await runActivation(suite, {
    latestResearchState: savedLatestState,
    read: currentRead({
      latestMonteCarloGeneratedAt: savedLatestState.latestMonteCarlo.generatedAt,
      latestMonteCarloUsableOutcomes: savedLatestState.latestMonteCarlo.usableOutcomes,
      latestMonteCarloStatus: "saved",
      latestMonteCarloReason: "Saved Monte Carlo strong; 55 usable outcomes.",
      recommendedMaxRiskStatus: "available",
      recommendedMaxRiskReason: "Recommended max risk from latest Monte Carlo."
    })
  });
  const monteCarloStep = savedMonteCarlo.steps.find((step) => step.id === "load_latest_monte_carlo_summary");
  assert.equal(monteCarloStep.status, "completed");
  assert.match(monteCarloStep.message, /Saved Monte Carlo strong; 55 usable outcomes/i);
  assert.equal(savedMonteCarlo.latestMonteCarlo.status, "saved");
  assert.equal(savedMonteCarlo.summary.recommendedMaxRiskPerTradePct, 0.5);
  assert.match(savedMonteCarlo.summary.recommendedMaxRiskReason, /latest saved Monte Carlo/i);
  assertSafeResult(savedMonteCarlo);

  const eligiblePaper = await runActivation(suite, {
    latestResearchState: savedLatestState,
    read: currentRead({
      side: "short",
      approvedStatus: "paper_watchlist_candidate",
      modelQualityLane: "paper_watchlist",
      paperWatchlistEligible: true,
      paperWatchlistReason: "CMD paper-watchlist - paper-test only.",
      paperSimEligibilityStatus: "eligible",
      paperSimEligibilityReason: "Paper-only eligible from explicit paper-watchlist candidate.",
      paperSimAllowed: true,
      paperOnly: true,
      readinessSummary: {
        researchReadiness: "partial",
        paperReadiness: "eligible",
        executionReadiness: "disabled",
        reasons: ["Paper-only candidate; execution readiness is disabled by design."]
      }
    }),
    signal: signal({
      side: "short",
      modelQualityLane: "paper_watchlist",
      paperWatchlistEligible: true,
      paperSimEligibilityStatus: "eligible",
      paperSimEligibilityReason: "Paper-only eligible from explicit paper-watchlist candidate.",
      paperSimAllowed: true,
      paperOnly: true,
      approvedProfileStatus: "paper_watchlist_candidate"
    }),
    cmd: {
      eligible: true,
      reasons: ["CMD strict paper-watchlist candidate is eligible for paper-only tracking."]
    }
  });
  assert.equal(eligiblePaper.summary.paperSimAllowed, true);
  assert.equal(eligiblePaper.summary.paperOnly, true);
  assert.equal(eligiblePaper.summary.readinessSummary.paperReadiness, "eligible");
  assert.equal(eligiblePaper.summary.readinessSummary.executionReadiness, "disabled");
  assert.equal(eligiblePaper.cmdPaperEligibility.eligible, true);
  assertSafeResult(eligiblePaper);

  console.log(JSON.stringify({
    status: "passed",
    tested: [
      "weekly_bias_explicit_reason",
      "partial_mtf_completes_with_warning",
      "cmd_paper_eligibility_reason",
      "missing_monte_carlo_reason",
      "saved_monte_carlo_risk",
      "paper_sim_eligibility_reason",
      "split_readiness",
      "execution_disabled",
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
