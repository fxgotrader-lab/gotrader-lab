#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-hypothesis-validation-test");

const sourceFiles = [
  "ictMonteCarloTypes.ts",
  "ictMonteCarlo.ts",
  "ictSelfImprovementTypes.ts",
  "ictSelfImprovement.ts",
  "ictHypothesisValidationTypes.ts",
  "ictHypothesisValidation.ts"
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

const hypothesis = (overrides = {}) => ({
  researchOnly: true,
  hypothesisId: "ict_hypothesis_validation_fixture",
  generatedAt: "2026-06-07T15:00:00.000Z",
  status: "queued_for_replay",
  title: "session reversal hypothesis",
  sourceOpportunity: {
    opportunityId: "ict_opportunity_fixture",
    type: "session_reversal",
    stage: "forming",
    quality: "medium",
    direction: "bearish",
    modelName: "ny_session_reversal_to_premium_fvg",
    modelFamily: "ICT",
    marketCycleStage: "reversal",
    laneRecommendation: "watchlist_candidate",
    nextAction: "Replay validate reversal confirmation."
  },
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  sourceFingerprint: "mt5_ustech_90d_fixture",
  candleCount: 17799,
  missingConfirmation: ["Replay validation missing.", "FVG draw confirmation missing."],
  proposedValidationRules: ["Run manual replay validation.", "Require target-first evidence."],
  blockers: ["Not approved or paper-ready."],
  nextAction: "Research hypothesis queued - needs replay validation.",
  autoPromoteAllowed: false,
  executionAllowed: false,
  authority,
  safety,
  ...overrides
});

const outcome = (index, outcomeName, rMultiple, overrides = {}) => ({
  id: `hypothesis_outcome_${index}`,
  strategyId: "ict_reversal_fixture",
  setup: "phase_2_reversal",
  symbol: "MNQ",
  side: "short",
  outcome: outcomeName,
  rMultiple,
  approvedStatus: "watchlist_candidate",
  confidence: 0.62,
  sourceTime: `2026-05-${String((index % 20) + 1).padStart(2, "0")}T14:00:00.000Z`,
  researchOnly: true,
  ...overrides
});

const makeOutcomes = ({ invalidation = 0, partial = 0, stalled = 0, target = 0, targetR = 2 }) => {
  const values = [];
  for (let index = 0; index < target; index += 1) values.push(outcome(values.length, "target_first", targetR));
  for (let index = 0; index < invalidation; index += 1) values.push(outcome(values.length, "invalidation_first", -1));
  for (let index = 0; index < partial; index += 1) values.push(outcome(values.length, "partial_target", 0.5));
  for (let index = 0; index < stalled; index += 1) values.push(outcome(values.length, "stalled", 0));
  return values;
};

function assertSafe(suite, result, journalEvent) {
  const compact = suite.assertIctHypothesisValidationIsCompact(result, journalEvent);
  assert.equal(compact.ok, true, "hypothesis validation must stay compact and safe");
  const serialized = JSON.stringify({ result, journalEvent });
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
  assert.equal(result.researchOnly, true);
  assert.equal(result.autoPromoteAllowed, false);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.approvedProfileMutated, false);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.safety.rawCandlesExcluded, true);
  if (journalEvent) {
    assert.equal(journalEvent.eventType, "ict_research_hypothesis_validated");
    assert.equal(journalEvent.researchOnly, true);
    assert.equal(journalEvent.autoPromoteAllowed, false);
    assert.equal(journalEvent.executionAllowed, false);
    assert.equal(journalEvent.approvedProfileMutated, false);
  }
}

async function main() {
  compileForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "ictHypothesisValidation.mjs")));

  const strong = suite.validateIctResearchHypothesis({
    hypothesis: hypothesis({ hypothesisId: "hypothesis_strong_paper_watchlist" }),
    source: "synthetic_fixture",
    replayOutcomes: makeOutcomes({ target: 17, invalidation: 5, partial: 3, targetR: 2.5 }),
    testedWindows: 25
  });
  assert.equal(strong.status, "paper_watchlist_recommended");
  assert.equal(strong.totalOccurrences, 25);
  assert.ok(strong.targetFirstRate >= 0.6);
  assert.equal(strong.approvedProfileMutated, false);
  assertSafe(suite, strong, suite.buildIctResearchHypothesisValidationJournalEvent(strong));

  const promising = suite.validateIctResearchHypothesis({
    hypothesis: hypothesis({ hypothesisId: "hypothesis_promising" }),
    source: "synthetic_fixture",
    replayOutcomes: makeOutcomes({ target: 13, invalidation: 6, partial: 4, targetR: 3 }),
    testedWindows: 23
  });
  assert.equal(promising.status, "promising");
  assert.match(promising.recommendation, /more replay|researching/i);
  assertSafe(suite, promising);

  const weak = suite.validateIctResearchHypothesis({
    hypothesis: hypothesis({ hypothesisId: "hypothesis_weak" }),
    source: "synthetic_fixture",
    replayOutcomes: makeOutcomes({ target: 11, invalidation: 8, stalled: 6, targetR: 3 }),
    testedWindows: 25
  });
  assert.equal(weak.status, "weak");
  assert.match(weak.recommendation, /research context|do not paper-track/i);
  assertSafe(suite, weak);

  const insufficient = suite.validateIctResearchHypothesis({
    hypothesis: hypothesis({ hypothesisId: "hypothesis_insufficient" }),
    source: "synthetic_fixture",
    replayOutcomes: makeOutcomes({ target: 3, invalidation: 1, partial: 1, targetR: 2.5 }),
    testedWindows: 5
  });
  assert.equal(insufficient.status, "needs_more_data");
  assert.match(insufficient.classificationReason, /minimum/i);
  assertSafe(suite, insufficient);

  const discarded = suite.validateIctResearchHypothesis({
    hypothesis: hypothesis({ hypothesisId: "hypothesis_discarded" }),
    source: "synthetic_fixture",
    replayOutcomes: makeOutcomes({ target: 4, invalidation: 14, stalled: 7, targetR: 1.5 }),
    testedWindows: 25
  });
  assert.equal(discarded.status, "discarded");
  assertSafe(suite, discarded);

  const criteria = suite.extractHypothesisReplayCriteria(hypothesis());
  assert.equal(criteria.requestedSymbol, "MNQ");
  assert.equal(criteria.brokerSymbol, "USTECH");
  assert.equal(criteria.opportunityModelName, "ny_session_reversal_to_premium_fvg");

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(advisorSource, /data-testid="ict-hypothesis-validation-panel"/, "Advisor should render the hypothesis validation section");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,900}validateIctResearchHypothesis/, "Advisor must not auto-run hypothesis validation in an effect");

  process.stdout.write("ICT hypothesis validation test passed.\n");
  process.stdout.write(JSON.stringify({
    strongStatus: strong.status,
    promisingStatus: promising.status,
    weakStatus: weak.status,
    insufficientStatus: insufficient.status,
    discardedStatus: discarded.status,
    monteCarlo: strong.monteCarlo,
    autoPromoteAllowed: false,
    approvedProfileMutated: false,
    authority,
    rawCandlesExposed: false
  }, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`ICT hypothesis validation test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
