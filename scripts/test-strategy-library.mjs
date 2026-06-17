#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "strategyLibrary");
const outRoot = path.join(projectRoot, ".gotrader", "strategy-library-test");
const sourceFiles = [
  "strategyLibraryTypes.ts",
  "strategyRegistry.ts",
  "strategyIntake.ts",
  "strategyEligibility.ts",
  "strategyEvidence.ts"
];

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
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
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const mt5Source = {
  sourceProvider: "mt5_read_only",
  sourceStatus: "mt5_research_active",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  displayLabel: "USTECH -> MNQ",
  primaryTimeframe: "5m",
  higherTimeframes: ["15m:5000", "1h:1400", "4h:400", "1d:90", "1w:13"],
  candleCount: 17799,
  sourceFingerprint: "mt5|MNQ|USTECH|5m|17799|88.95d",
  isResearchActive: true,
  isMockOrSample: false,
  isProxyInstrument: true,
  warningLabel: "CFD/proxy research data",
  authority: authorityNone
};

const mockSource = {
  ...mt5Source,
  sourceProvider: "mock",
  sourceStatus: "mock_sample",
  sourceFingerprint: "mock|sample",
  candleCount: 48,
  isResearchActive: false,
  isMockOrSample: true
};

const passedChain = {
  researchOnly: true,
  recognitionId: "chain_cmd_1",
  recognitionType: "full_model",
  setupLabel: "consolidation_manipulation_distribution",
  candidateFamily: "known_model",
  requiredValidation: "Replay, walk-forward, evidence, maturity.",
  symbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "5m",
  htfContext: ["15m", "1h", "4h", "1d", "1w"],
  sourceFingerprint: mt5Source.sourceFingerprint,
  sourceStatus: {
    sourceProvider: "mt5_read_only",
    isMockOrSample: false,
    isResearchActive: true,
    statusLabel: "MT5 read-only research active"
  },
  hypothesisStatus: "evidence_updated",
  replayResult: {
    generatedAt: "2026-06-13T00:00:00.000Z",
    verdict: "passed",
    totalSignals: 32,
    targetFirstRate: 0.72,
    averageRr: 2.1,
    reason: "compact replay passed"
  },
  walkForwardResult: {
    generatedAt: "2026-06-13T00:00:00.000Z",
    verdict: "passed",
    oosVerdict: "promising",
    tradeCount: 24,
    windowsTested: 3,
    oosWindowsPassed: 2,
    warningFlags: [],
    reason: "compact OOS passed"
  },
  evidenceQuality: {
    generatedAt: "2026-06-13T00:00:00.000Z",
    evidenceQualityScore: 72,
    maturityScore: 68,
    detail: "compact evidence only"
  },
  paperDemoChecklistImpact: "Paper-Demo remains gated by checklist.",
  nextAction: "Continue paper-only tracking.",
  blockers: [],
  createdAt: "2026-06-13T00:00:00.000Z",
  updatedAt: "2026-06-13T00:00:00.000Z",
  executionIntent: "none",
  authority: authorityNone,
  safety: {
    rawCandlesExcluded: true,
    rawSnapshotsExcluded: true,
    accountDataExcluded: true,
    orderDataExcluded: true,
    positionDataExcluded: true,
    secretsExcluded: true
  }
};

const cmdConditions = [
  "consolidation_manipulation_distribution",
  "short_side_only",
  "clear_consolidation_range",
  "manipulation_or_liquidity_sweep_event",
  "distribution_or_expansion_away",
  "external_liquidity_target",
  "valid_structural_invalidation",
  "independent_date_gate"
];

const assertSafeRecord = (value) => {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
  assert.equal(value.authority.executionAuthority, "none");
  assert.equal(value.authority.brokerAuthority, "none");
  assert.equal(value.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileForNode();
  const registry = await import(pathToFileURL(path.join(outRoot, "strategyRegistry.mjs")).href);
  const intake = await import(pathToFileURL(path.join(outRoot, "strategyIntake.mjs")).href);
  const eligibility = await import(pathToFileURL(path.join(outRoot, "strategyEligibility.mjs")).href);
  const evidence = await import(pathToFileURL(path.join(outRoot, "strategyEvidence.mjs")).href);

  const definitions = registry.listStrategyDefinitions();
  assert.equal(definitions.length, 19);
  const newStrategyIds = [
    "silver_bullet_v1",
    "silver_bullet_v2_refined_research",
    "nasdaq_london_raid_ny_reversal_v1",
    "nasdaq_london_raid_ny_reversal_v2_filtered_research",
    "camerons_model_research_v1",
    "ifvg_v1",
    "ifvg_filtered_v2_research",
    "turtle_soup_v1",
    "crt_research_v1",
    "ote_research_v1",
    "cisd_v1",
    "amd_power_of_three_research_v1"
  ];
  for (const strategyId of newStrategyIds) {
    assert.ok(registry.getStrategyDefinition(strategyId), `${strategyId} should be registered`);
  }
  assert.equal(registry.getStrategyDefinition("silver_bullet_v1").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("silver_bullet_v1").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("silver_bullet_v2_refined_research").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("silver_bullet_v2_refined_research").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("nasdaq_london_raid_ny_reversal_v1").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("nasdaq_london_raid_ny_reversal_v1").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("nasdaq_london_raid_ny_reversal_v2_filtered_research").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("nasdaq_london_raid_ny_reversal_v2_filtered_research").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("turtle_soup_v1").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("turtle_soup_v1").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("cisd_v1").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("cisd_v1").status, "replay_required");
  assert.equal(
    registry.suggestStrategyIdForRecognition({ modelName: "CISD state shift" }),
    "cisd_v1"
  );
  assert.equal(registry.getStrategyDefinition("ifvg_v1").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("ifvg_v1").status, "replay_required");
  assert.equal(registry.getStrategyDefinition("ifvg_filtered_v2_research").detectorStatus, "executable_research");
  assert.equal(registry.getStrategyDefinition("ifvg_filtered_v2_research").status, "paper_watchlist_candidate");
  assert.deepEqual(
    registry.getStrategyDefinition("ifvg_filtered_v2_research").validationRequirements.map((item) => item.id),
    ["replay_required", "walk_forward_required", "evidence_required", "paper_demo_gate_required"]
  );
  for (const reason of [
    "validation_missing",
    "rolling_stability_weak",
    "invalidation_first_too_high",
    "source_mock_sample",
    "raw_ifvg_v1_unfiltered"
  ]) {
    assert.ok(
      registry.getStrategyDefinition("ifvg_filtered_v2_research").forbiddenPromotionReasons.includes(reason),
      `ifvg filtered v2 should forbid promotion reason ${reason}`
    );
  }
  for (const strategyId of newStrategyIds.filter((id) => !["silver_bullet_v1", "silver_bullet_v2_refined_research", "nasdaq_london_raid_ny_reversal_v1", "nasdaq_london_raid_ny_reversal_v2_filtered_research", "turtle_soup_v1", "cisd_v1", "ifvg_v1", "ifvg_filtered_v2_research"].includes(id))) {
    assert.equal(registry.getStrategyDefinition(strategyId).detectorStatus, "research_only_placeholder");
  }
  assert.ok(registry.getStrategyDefinition("ict_cmd_short_paper_watchlist_v1"));
  assert.ok(registry.getStrategyDefinition("market_map_only_diagnostic_v1"));
  assert.equal(
    registry.suggestStrategyIdForRecognition({ modelName: "Silver Bullet" }),
    "silver_bullet_v1"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ modelName: "Silver Bullet v2 refined" }),
    "silver_bullet_v2_refined_research"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ modelName: "NASDAQ London raid NY reversal" }),
    "nasdaq_london_raid_ny_reversal_v1"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ setupName: "Turtle Soup false breakout" }),
    "turtle_soup_v1"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ candidateFamilies: ["clean_retest_displacement"] }),
    "ifvg_filtered_v2_research"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ setupName: "filtered IFVG v2" }),
    "ifvg_filtered_v2_research"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ candidateFamilies: ["optimal_trade_entry"] }),
    "ote_research_v1"
  );
  assert.equal(
    registry.suggestStrategyIdForRecognition({ candidateFamilies: ["reversal_expansion_confirmation"] }),
    "grinch_reversal_expansion_confirmation_v1"
  );

  const oneDateCmd = intake.createStrategyIntakeRecord({
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    sourceStatus: mt5Source,
    validationChainEntry: passedChain,
    recognition: {
      modelName: "consolidation_manipulation_distribution",
      family: "ict_cmd",
      side: "short",
      presentConditions: cmdConditions
    },
    evidenceSummary: {
      sampleCount: 8,
      uniqueTradingDates: 1,
      activeRollingWindows: 1,
      targetFirstRate: 0.875,
      invalidationFirstRate: 0.037,
      averageRr: 2.74,
      evidenceScore: 72,
      maturityScore: 68,
      oosVerdict: "promising",
      robustnessClassification: "overfit_risk",
      sourceFingerprint: mt5Source.sourceFingerprint
    }
  });
  const oneDateEligibility = eligibility.evaluateStrategyEligibility(oneDateCmd);
  assert.equal(oneDateEligibility.eligible, false);
  assert.equal(oneDateEligibility.status, "paper_demo_blocked");
  assert.match(oneDateEligibility.blockers.join(" "), /date-concentrated|independent-date/i);
  assert.equal(oneDateEligibility.nextAction, "Run independent-date CMD validation over 90-day history.");
  assertSafeRecord(oneDateCmd);
  assertSafeRecord(oneDateEligibility);

  const threeDateCmd = intake.createStrategyIntakeRecord({
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    sourceStatus: mt5Source,
    validationChainEntry: passedChain,
    recognition: {
      modelName: "consolidation_manipulation_distribution",
      family: "ict_cmd",
      side: "short",
      presentConditions: cmdConditions
    },
    evidenceSummary: {
      sampleCount: 24,
      uniqueTradingDates: 3,
      activeRollingWindows: 2,
      targetFirstRate: 0.68,
      invalidationFirstRate: 0.12,
      averageRr: 2.1,
      evidenceScore: 72,
      maturityScore: 68,
      oosVerdict: "promising",
      robustnessClassification: "promising_but_small_sample",
      sourceFingerprint: mt5Source.sourceFingerprint
    }
  });
  const threeDateEligibility = eligibility.evaluateStrategyEligibility(threeDateCmd);
  assert.equal(threeDateEligibility.eligible, true);
  assert.equal(threeDateEligibility.status, "paper_watchlist_candidate");
  assertSafeRecord(threeDateCmd);
  assertSafeRecord(threeDateEligibility);

  const mockCmd = intake.createStrategyIntakeRecord({
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    sourceStatus: mockSource,
    validationChainEntry: { ...passedChain, sourceFingerprint: mockSource.sourceFingerprint, sourceStatus: { ...passedChain.sourceStatus, sourceProvider: "mock", isMockOrSample: true, isResearchActive: false } },
    recognition: { modelName: "consolidation_manipulation_distribution", family: "ict_cmd", side: "short", presentConditions: cmdConditions },
    evidenceSummary: threeDateCmd.evidenceSummary
  });
  const mockEligibility = eligibility.evaluateStrategyEligibility(mockCmd);
  assert.equal(mockEligibility.eligible, false);
  assert.match(mockEligibility.blockers.join(" "), /Mock\/sample/i);

  const missingFingerprint = intake.createStrategyIntakeRecord({
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    sourceStatus: { ...mt5Source, sourceFingerprint: "no fingerprint" },
    validationChainEntry: { ...passedChain, sourceFingerprint: "no fingerprint" },
    recognition: { modelName: "consolidation_manipulation_distribution", family: "ict_cmd", side: "short", presentConditions: cmdConditions },
    evidenceSummary: threeDateCmd.evidenceSummary
  });
  assert.match(eligibility.evaluateStrategyEligibility(missingFingerprint).blockers.join(" "), /fingerprint/i);

  const unknown = intake.createStrategyIntakeRecord({
    strategyId: "operator_new_strategy_v1",
    sourceStatus: mt5Source,
    payload: { compactSummary: "human proposal only" }
  });
  assert.equal(eligibility.evaluateStrategyEligibility(unknown).status, "draft");

  const marketMap = intake.createStrategyIntakeRecord({
    strategyId: "market_map_only_diagnostic_v1",
    sourceStatus: mt5Source,
    validationChainEntry: passedChain,
    recognition: { modelName: "market map", family: "market_map", side: "both", presentConditions: ["market_map_context"] }
  });
  const marketMapEligibility = eligibility.evaluateStrategyEligibility(marketMap);
  assert.equal(marketMapEligibility.eligible, false);
  assert.equal(marketMapEligibility.status, "paper_demo_blocked");
  assert.match(marketMapEligibility.blockers.join(" "), /diagnostic/i);

  const ifvgDefinition = registry.getStrategyDefinition("ifvg_v1");
  const ifvgRecord = intake.createStrategyIntakeRecord({
    strategyId: "ifvg_v1",
    sourceStatus: mt5Source,
    validationChainEntry: passedChain,
    recognition: {
      modelName: "IFVG",
      family: "ifvg",
      side: "both",
      presentConditions: ifvgDefinition.requiredConditions.map((condition) => condition.id)
    },
    evidenceSummary: threeDateCmd.evidenceSummary
  });
  const ifvgEligibility = eligibility.evaluateStrategyEligibility(ifvgRecord);
  assert.equal(ifvgEligibility.eligible, true);
  assert.equal(ifvgEligibility.status, "evidence_building");
  assertSafeRecord(ifvgRecord);
  assertSafeRecord(ifvgEligibility);

  const ifvgFilteredDefinition = registry.getStrategyDefinition("ifvg_filtered_v2_research");
  const ifvgFilteredRecord = intake.createStrategyIntakeRecord({
    strategyId: "ifvg_filtered_v2_research",
    sourceStatus: mt5Source,
    validationChainEntry: passedChain,
    recognition: {
      modelName: "IFVG filtered v2",
      family: "ifvg",
      side: "both",
      presentConditions: ifvgFilteredDefinition.requiredConditions.map((condition) => condition.id)
    },
    evidenceSummary: {
      sampleCount: 27,
      uniqueTradingDates: 20,
      activeRollingWindows: 5,
      targetFirstRate: 0.8148,
      invalidationFirstRate: 0.1852,
      averageRr: 5.866,
      evidenceScore: 72,
      maturityScore: 68,
      oosVerdict: "passed",
      robustnessClassification: "paper_watchlist_candidate",
      sourceFingerprint: mt5Source.sourceFingerprint
    }
  });
  const ifvgFilteredEligibility = eligibility.evaluateStrategyEligibility(ifvgFilteredRecord);
  assert.equal(ifvgFilteredEligibility.eligible, true);
  assert.equal(ifvgFilteredEligibility.status, "paper_watchlist_candidate");
  assertSafeRecord(ifvgFilteredRecord);
  assertSafeRecord(ifvgFilteredEligibility);

  const unsafe = intake.createStrategyIntakeRecord({
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    sourceStatus: mt5Source,
    payload: {
      rawCandles: [{ close: 1 }],
      comment: "please place order",
      apiKey: "should-not-pass"
    },
    authority: { executionAuthority: "broker" }
  });
  assert.ok(unsafe.blockedFields.length >= 3);
  assert.equal(eligibility.evaluateStrategyEligibility(unsafe).eligible, false);

  const openClawExplicit = intake.createStrategyIntakeRecord({
    openClawDraft: {
      id: "draft_1",
      timestamp: "2026-06-13T00:00:00.000Z",
      programVersion: "1",
      dryRunAuditId: "audit_1",
      proposalTitle: "CMD refinement",
      targetSubsystem: "Strategy Library",
      candidateFamilies: ["cmd_independent_date_validation"],
      strategyId: "ict_cmd_short_paper_watchlist_v1",
      strategyFamily: "ict_cmd",
      requiresReplay: true,
      requiresWalkForward: true,
      autoApplyAllowed: false,
      authority: authorityNone,
      validationStatus: "safe_draft",
      blockedFields: [],
      requiredValidationGates: ["Replay", "Walk-forward"],
      nextAction: "Queue deterministic validation.",
      compactSummary: "compact only"
    }
  });
  assert.equal(openClawExplicit.strategyId, "ict_cmd_short_paper_watchlist_v1");

  assert.equal(evidence.strategyEvidenceStatus(registry.getStrategyDefinition("ict_cmd_short_paper_watchlist_v1"), threeDateCmd), "evidence_ready_for_review");
  assert.equal(evidence.assertStrategyEvidenceIsCompact(threeDateCmd.evidenceSummary).ok, true);
  assert.equal(intake.assertStrategyIntakeRecordIsCompact(threeDateCmd).ok, true);

  const report = {
    status: "passed",
    registeredStrategies: definitions.map((definition) => definition.id),
    cmdOneDateStatus: oneDateEligibility.status,
    cmdThreeDateStatus: threeDateEligibility.status,
    mockBlocked: mockEligibility.blockers[0],
    marketMapStatus: marketMapEligibility.status,
    ifvgStatus: ifvgEligibility.status,
    ifvgFilteredStatus: ifvgFilteredEligibility.status,
    unknownStatus: eligibility.evaluateStrategyEligibility(unknown).status,
    openClawStrategyId: openClawExplicit.strategyId,
    authority: authorityNone,
    safety: {
      rawCandlesPresent: false,
      accountOrderPositionPresent: false,
      secretsPresent: false
    }
  };
  assertSafeRecord(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`Strategy Library tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
