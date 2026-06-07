#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-self-improvement-test");

const sourceFiles = [
  "ictSelfImprovementTypes.ts",
  "ictSelfImprovement.ts"
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

const opportunity = (overrides = {}) => ({
  researchOnly: true,
  opportunityId: "ict_opportunity_self_improvement_test",
  generatedAt: "2026-06-07T14:00:00.000Z",
  type: "unknown_structured_opportunity",
  stage: "forming",
  quality: "medium",
  modelName: "consolidation_manipulation_distribution",
  modelFamily: "ICT",
  direction: "bearish",
  marketCycleStage: "manipulation",
  tradeIdea: {
    side: "short",
    entryReference: 30420,
    target: 30240,
    invalidation: 30520,
    rrEstimate: 1.8,
    confidence: 0.62
  },
  confirmationNeeded: ["Displacement confirmation missing."],
  missingEvidence: ["Replay validation missing."],
  blockers: ["Approval evidence is incomplete."],
  laneRecommendation: "watchlist_candidate",
  nextAction: "Replay validate the missing confirmation.",
  authority,
  safety,
  ...overrides
});

const input = (overrides = {}) => ({
  opportunity: opportunity(),
  approvedStatus: "watchlist_candidate",
  modelQualityLane: "watchlist",
  dataStatus: "ready",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  sourceFingerprint: "mt5_ustech_5m_self_improvement_fp",
  candleCount: 1000,
  topReasons: ["Opportunity detected, approval evidence incomplete."],
  generatedAt: "2026-06-07T14:01:00.000Z",
  ...overrides
});

function assertSafe(suite, hypothesis, journalEvent) {
  const compact = suite.assertIctResearchHypothesisIsCompact(hypothesis, journalEvent);
  assert.equal(compact.ok, true, "self-improvement output must stay compact and safe");
  const serialized = JSON.stringify({ hypothesis, journalEvent });
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
  if (hypothesis) {
    assert.equal(hypothesis.researchOnly, true);
    assert.equal(hypothesis.autoPromoteAllowed, false);
    assert.equal(hypothesis.executionAllowed, false);
    assert.equal(hypothesis.authority.executionAuthority, "none");
    assert.equal(hypothesis.authority.brokerAuthority, "none");
    assert.equal(hypothesis.authority.readinessOverrideAuthority, "none");
  }
  if (journalEvent) {
    assert.equal(journalEvent.eventType, "ict_research_hypothesis_created");
    assert.equal(journalEvent.researchOnly, true);
    assert.equal(journalEvent.autoPromoteAllowed, false);
    assert.equal(journalEvent.executionAllowed, false);
    assert.equal(journalEvent.authority.executionAuthority, "none");
  }
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictSelfImprovement.mjs")));

  const structured = suite.buildIctResearchHypothesisFromOpportunity(input());
  assert.equal(structured.ok, true, "structured watchlist opportunity should create a hypothesis");
  assert.equal(structured.hypothesis.status, "queued_for_replay");
  assert.match(structured.hypothesis.nextAction, /needs replay validation/i);
  assert.equal(structured.hypothesis.autoPromoteAllowed, false);
  assert.equal(structured.hypothesis.executionAllowed, false);
  assert.ok(structured.hypothesis.missingConfirmation.some((item) => /Replay validation|Displacement/i.test(item)));
  assert.ok(structured.hypothesis.proposedValidationRules.some((item) => /manual replay validation/i.test(item)));
  assertSafe(suite, structured.hypothesis);

  const queued = suite.queueIctResearchHypothesis(structured.hypothesis);
  assert.equal(queued.ok, true, "eligible hypothesis should queue");
  assert.equal(queued.journalEvent.eventType, "ict_research_hypothesis_created");
  assert.equal(queued.journalEvent.status, "queued_for_replay");
  assertSafe(suite, queued.hypothesis, queued.journalEvent);

  const insufficient = suite.buildIctResearchHypothesisFromOpportunity(input({
    opportunity: opportunity({
      type: "none",
      stage: "insufficient_data",
      quality: "unknown",
      modelName: undefined,
      marketCycleStage: "unknown",
      laneRecommendation: "no_trade",
      confirmationNeeded: [],
      missingEvidence: ["Missing candle data."],
      blockers: ["Source unavailable."],
      nextAction: "Activate MT5 read-only market data."
    }),
    dataStatus: "missing",
    candleCount: 0
  }));
  assert.equal(insufficient.ok, false, "insufficient data should not create a hypothesis");
  assert.match(insufficient.reason, /insufficient/i);
  assertSafe(suite);

  const noisyRangeBound = suite.buildIctResearchHypothesisFromOpportunity(input({
    opportunity: opportunity({
      type: "range_liquidity_sweep",
      quality: "low",
      modelName: undefined,
      modelFamily: undefined,
      direction: "neutral",
      marketCycleStage: "consolidation",
      tradeIdea: undefined,
      confirmationNeeded: ["Needs stronger reversal or expansion evidence."],
      missingEvidence: ["No directional displacement."],
      blockers: ["Random/noisy range-bound action."],
      laneRecommendation: "no_trade"
    })
  }));
  assert.equal(noisyRangeBound.ok, false, "noisy range-bound action should not create a hypothesis");
  assert.match(noisyRangeBound.reason, /Range-bound|noisy/i);

  const paperLane = suite.buildIctResearchHypothesisFromOpportunity(input({
    approvedStatus: "paper_watchlist_candidate",
    modelQualityLane: "paper_watchlist",
    opportunity: opportunity({ laneRecommendation: "paper_watchlist_candidate" })
  }));
  assert.equal(paperLane.ok, false, "paper-watchlist candidate should not create a self-improvement hypothesis");
  assert.match(paperLane.reason, /already approved or paper-watchlist/i);

  const approved = suite.buildIctResearchHypothesisFromOpportunity(input({
    approvedStatus: "approved_research_candidate",
    modelQualityLane: "approved",
    opportunity: opportunity({ laneRecommendation: "approved_candidate" })
  }));
  assert.equal(approved.ok, false, "approved candidate should not create a self-improvement hypothesis");
  assert.match(approved.reason, /already approved or paper-watchlist/i);

  const queue = suite.readIctSelfImprovementQueue();
  assert.equal(queue.researchOnly, true);
  assert.equal(queue.authority.executionAuthority, "none");
  assert.ok(queue.hypotheses.some((item) => item.hypothesisId === structured.hypothesis.hypothesisId));

  process.stdout.write("ICT self-improvement queue test passed.\n");
  process.stdout.write(JSON.stringify({
    createdHypothesis: structured.hypothesis.hypothesisId,
    queuedStatus: structured.hypothesis.status,
    blockedCases: ["insufficient_data", "noisy_range_bound", "paper_watchlist", "approved"],
    authority,
    rawCandlesExposed: false,
    autoPromoteAllowed: false
  }, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`ICT self-improvement queue test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
