#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-monte-carlo-test");
const sourceFiles = [
  "ictReplayValidationTypes.ts",
  "ictManualReplayReviewTypes.ts",
  "ictMarketScorecardTypes.ts",
  "ictMonteCarloTypes.ts",
  "ictMonteCarlo.ts"
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

async function main() {
  compileForNode();
  const mc = await import(pathToFileURL(path.join(outRoot, "ictMonteCarlo.mjs")));

  const replayResults = [
    replayResult({ outcome: "target_first", rrAchieved: 2.4 }),
    replayResult({ outcome: "target_first", rrAchieved: 1.8 }),
    replayResult({ outcome: "partial_target", rrAchieved: 0.7 }),
    replayResult({ outcome: "invalidation_first", rrAchieved: undefined }),
    replayResult({ outcome: "stalled", rrAchieved: undefined }),
    replayResult({ approvedProfileStatus: "watchlist_candidate", outcome: "target_first", rrAchieved: 1.5 }),
    replayResult({ approvedProfileStatus: "rejected_candidate", outcome: "target_first", rrAchieved: 3 }),
    replayResult({ approvedProfileStatus: "no_trade", outcome: "no_trade", rrAchieved: undefined }),
    replayResult({ outcome: "insufficient_future_candles", rrAchieved: undefined })
  ];
  const outcomes = mc.extractMonteCarloOutcomesFromReplayResults(replayResults);
  assert.equal(outcomes.length, 7, "no_trade and insufficient future candles should not become trade outcomes");
  assert.equal(outcomes.filter((item) => item.approvedStatus === "approved_research_candidate").length, 5);
  assert.equal(outcomes.find((item) => item.outcome === "invalidation_first").rMultiple, -1);
  assert.equal(outcomes.find((item) => item.outcome === "partial_target").rMultiple, 0.7);

  const approvedOnly = mc.runMonteCarloBatch(outcomes, {
    source: "synthetic_test",
    simulationCount: 100,
    tradesPerSimulation: 20,
    randomSeed: 7,
    researchOnly: true
  });
  assert.equal(approvedOnly.input.usableOutcomes, 5, "rejected, no_trade, and watchlist should be excluded by default");
  assert.equal(approvedOnly.input.watchlistIncluded, false);
  assert.equal(approvedOnly.recommendation.robustnessRating, "insufficient_data");

  const withWatchlist = mc.runMonteCarloBatch(outcomes, {
    source: "synthetic_test",
    simulationCount: 100,
    tradesPerSimulation: 20,
    includeWatchlist: true,
    randomSeed: 7,
    researchOnly: true
  });
  assert.equal(withWatchlist.input.usableOutcomes, 6, "watchlist should be optional");

  const strongOutcomes = Array.from({ length: 36 }, (_, index) => ({
    id: `strong_${index}`,
    outcome: "target_first",
    rMultiple: index % 5 === 0 ? 0.8 : 1.4,
    approvedStatus: "approved_research_candidate",
    researchOnly: true
  }));
  const strong = mc.runMonteCarloBatch(strongOutcomes, {
    source: "synthetic_test",
    simulationCount: 150,
    tradesPerSimulation: 30,
    randomSeed: 11,
    researchOnly: true
  });
  assert.equal(strong.recommendation.robustnessRating, "strong", "mostly positive approved outcomes should rate strong");
  assert.equal(strong.pathsSample.length <= 10, true, "path sample should stay compact");

  const moderateOutcomes = Array.from({ length: 30 }, (_, index) => ({
    id: `moderate_${index}`,
    outcome: index % 3 === 0 ? "invalidation_first" : "target_first",
    rMultiple: index % 3 === 0 ? -1 : 0.8,
    approvedStatus: "approved_research_candidate",
    researchOnly: true
  }));
  const moderate = mc.runMonteCarloBatch(moderateOutcomes, {
    source: "synthetic_test",
    simulationCount: 150,
    tradesPerSimulation: 30,
    randomSeed: 12,
    researchOnly: true
  });
  assert.equal(moderate.recommendation.robustnessRating, "moderate", "mixed positive outcomes should rate moderate");

  const weakOutcomes = Array.from({ length: 30 }, (_, index) => ({
    id: `weak_${index}`,
    outcome: index % 5 === 0 ? "target_first" : "invalidation_first",
    rMultiple: index % 5 === 0 ? 0.6 : -1,
    approvedStatus: "approved_research_candidate",
    researchOnly: true
  }));
  const weak = mc.runMonteCarloBatch(weakOutcomes, {
    source: "synthetic_test",
    simulationCount: 150,
    tradesPerSimulation: 30,
    randomSeed: 13,
    researchOnly: true
  });
  assert.equal(weak.recommendation.robustnessRating, "weak", "loss-heavy outcomes should rate weak");

  const pathSample = mc.runMonteCarloSimulation(strongOutcomes, mc.defaultIctMonteCarloConfig("synthetic_test", strongOutcomes.length, {
    tradesPerSimulation: 10,
    randomSeed: 14,
    researchOnly: true
  }), 0, () => 0.2);
  assert.equal(typeof pathSample.maxDrawdownR, "number");
  assert.equal(mc.calculateMaxDrawdown([0, 3, 2, 4, 1]), 3);
  assert.equal(mc.calculateLongestLosingStreak([1, -1, -0.5, 0.5, -1, -1, -1]), 3);
  assert.equal(mc.calculateRiskOfRuin([{ ruinHit: true }, { ruinHit: false }]), 50);
  assert.equal(mc.calculateDrawdownProbability([{ maxDrawdownPct: 11 }, { maxDrawdownPct: 5 }], 10), 50);

  const journalEvent = mc.buildIctMonteCarloJournalEvent(strong);
  assert.equal(journalEvent.eventType, "ict_monte_carlo_summary");
  assert.equal(journalEvent.researchOnly, true);
  assert.equal(strong.authority.executionAuthority, "none");
  assert.equal(strong.authority.brokerAuthority, "none");
  assert.equal(strong.authority.readinessOverrideAuthority, "none");
  assert.equal(strong.safety.rawCandlesExcluded, true);
  assert.equal(strong.safety.rawSnapshotsExcluded, true);
  assert.equal(strong.safety.secretsExcluded, true);
  assert.equal(strong.safety.accountDataExcluded, true);
  assert.equal(strong.safety.orderDataExcluded, true);
  assert.equal(strong.safety.positionDataExcluded, true);
  assert.equal(mc.assertIctMonteCarloSummaryIsCompact(strong, journalEvent).ok, true);
  assert.doesNotMatch(JSON.stringify({ strong, journalEvent }), /"candles"\s*:|"snapshot"\s*:|"secret"\s*:|"account(Data)?"\s*:|"order(Data|s)?"\s*:|"position(Data|s)?"/i);

  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  assert.match(advisorSource, /data-testid="ict-monte-carlo-robustness"/, "Advisor UI should render Monte Carlo section");
  assert.match(advisorSource, /Run Monte Carlo Robustness/, "Advisor UI should include explicit Monte Carlo button");
  assert.match(advisorSource, /Run Replay Review first\./, "Advisor UI should guide users to replay first");
  assert.doesNotMatch(advisorSource, /useEffect\([\s\S]{0,800}runMonteCarloRobustness/, "Monte Carlo must not auto-run on page load");

  process.stdout.write("GoTrader ICT Monte Carlo smoke test passed.\n");
  process.stdout.write(`Approved usable outcomes: ${approvedOnly.input.usableOutcomes}\n`);
  process.stdout.write(`Strong rating: ${strong.recommendation.robustnessRating}\n`);
  process.stdout.write(`Moderate rating: ${moderate.recommendation.robustnessRating}\n`);
  process.stdout.write(`Weak rating: ${weak.recommendation.robustnessRating}\n`);
  process.stdout.write(`Authority: ${strong.authority.executionAuthority}/${strong.authority.brokerAuthority}/${strong.authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`ICT Monte Carlo smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
