#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  authority,
  classifyIfvg,
  collectCandidates,
  costLevels,
  oosSummary,
  pct,
  rollingExpectancy,
  runClassifierUnitChecks,
  safety,
  summarizeExpectancy
} from "./test-ifvg-expectancy-classifier.mjs";

const projectRoot = process.cwd();
const reportPath = path.join(projectRoot, "docs", "ifvg-filter-variant-audit.md");

const variantGateSummary = {
  minimumCandidates: 20,
  minimumUniqueTradingDates: 3,
  minimumActiveRollingWindows: 2,
  maximumWeakRollingWindows: 0,
  minimumTargetFirstRate: 0.55,
  maximumInvalidationFirstRate: 0.35,
  minimumAverageRAtHalfCost: 0,
  minimumAverageRAtOneCost: 0,
  oosCannotDegradeOrFail: true,
  noMockOrSampleSource: true,
  authority: "none/none/none"
};

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);

const variantDefinitions = [
  {
    id: "medium_ifvg",
    label: "Medium IFVG",
    reason: "Preliminary filter with lower invalidation-first rate.",
    predicate: (candidate) => candidate.ifvgSizeBucket === "medium"
  },
  {
    id: "ny_open_only",
    label: "NY open only",
    reason: "New York open had the highest v1 target-first rate.",
    predicate: (candidate) => candidate.session === "new_york_open"
  },
  {
    id: "short_only",
    label: "Short only",
    reason: "Short IFVG had better v1 target-first rate than long.",
    predicate: (candidate) => candidate.side === "short"
  },
  {
    id: "long_only",
    label: "Long only",
    reason: "Long side check to ensure it is not hiding a separate edge.",
    predicate: (candidate) => candidate.side === "long"
  },
  {
    id: "five_minute_only",
    label: "5m only",
    reason: "Primary IFVG entry timeframe.",
    predicate: (candidate) => candidate.timeframe === "5m"
  },
  {
    id: "fifteen_minute_only",
    label: "15m only",
    reason: "Higher entry timeframe may reduce noise.",
    predicate: (candidate) => candidate.timeframe === "15m"
  },
  {
    id: "first_ifvg_use_only",
    label: "First IFVG use only",
    reason: "The detector already blocks reused zones; this verifies the condition.",
    predicate: (candidate) => candidate.firstIfvgUse
  },
  {
    id: "htf_aligned_only",
    label: "HTF aligned only",
    reason: "Tests whether HTF agreement reduces invalidation-first.",
    predicate: (candidate) => candidate.htfAlignment === "aligned"
  },
  {
    id: "premium_discount_aligned",
    label: "Premium/discount aligned",
    reason: "Longs in discount and shorts in premium may improve entry quality.",
    predicate: (candidate) => candidate.premiumDiscountAligned === "aligned"
  },
  {
    id: "external_liquidity_target_present",
    label: "External liquidity target present",
    reason: "Confirms target availability remains compact and deterministic.",
    predicate: (candidate) => candidate.hasExternalLiquidityTarget
  },
  {
    id: "small_ifvg",
    label: "Small IFVG",
    reason: "Small gap size bucket.",
    predicate: (candidate) => candidate.ifvgSizeBucket === "small"
  },
  {
    id: "large_ifvg",
    label: "Large IFVG",
    reason: "Large gap size bucket.",
    predicate: (candidate) => candidate.ifvgSizeBucket === "large"
  },
  {
    id: "rr_2_to_3",
    label: "RR 2R-3R",
    reason: "Lower RR may raise hit rate but compress expectancy.",
    predicate: (candidate) => candidate.rrDetailedBucket === "2_to_3"
  },
  {
    id: "rr_3_to_5",
    label: "RR 3R-5R",
    reason: "Balanced RR bucket.",
    predicate: (candidate) => candidate.rrDetailedBucket === "3_to_5"
  },
  {
    id: "rr_5_plus",
    label: "RR 5R+",
    reason: "Higher RR bucket tests whether positive expectancy depends on far targets.",
    predicate: (candidate) => candidate.rrDetailedBucket === "5_plus"
  },
  {
    id: "ny_open_shorts",
    label: "NY open shorts",
    reason: "Session plus side variant.",
    predicate: (candidate) => candidate.session === "new_york_open" && candidate.side === "short"
  },
  {
    id: "ny_open_longs",
    label: "NY open longs",
    reason: "Session plus side variant.",
    predicate: (candidate) => candidate.session === "new_york_open" && candidate.side === "long"
  },
  {
    id: "london_open_shorts",
    label: "London open shorts",
    reason: "Session plus side variant.",
    predicate: (candidate) => candidate.session === "london_open" && candidate.side === "short"
  },
  {
    id: "london_open_longs",
    label: "London open longs",
    reason: "Session plus side variant.",
    predicate: (candidate) => candidate.session === "london_open" && candidate.side === "long"
  },
  {
    id: "clean_retest_only",
    label: "Clean retest only",
    reason: "Retest touches the 50% IFVG level without fully violating the opposite boundary.",
    predicate: (candidate) => candidate.cleanRetest
  },
  {
    id: "displacement_confirmation",
    label: "Displacement confirmation",
    reason: "Inversion candle has strong body and post-inversion delivery confirms direction.",
    predicate: (candidate) => candidate.displacementConfirmed
  },
  {
    id: "medium_ifvg_htf_aligned",
    label: "Medium IFVG + HTF aligned",
    reason: "Compound discovery variant to reduce invalidations without broadening the detector.",
    predicate: (candidate) => candidate.ifvgSizeBucket === "medium" && candidate.htfAlignment === "aligned"
  },
  {
    id: "medium_ifvg_clean_retest",
    label: "Medium IFVG + clean retest",
    reason: "Compound discovery variant around the strongest preliminary filter.",
    predicate: (candidate) => candidate.ifvgSizeBucket === "medium" && candidate.cleanRetest
  },
  {
    id: "ny_open_htf_aligned",
    label: "NY open + HTF aligned",
    reason: "Combines the best session with direction agreement.",
    predicate: (candidate) => candidate.session === "new_york_open" && candidate.htfAlignment === "aligned"
  },
  {
    id: "short_htf_aligned",
    label: "Short + HTF aligned",
    reason: "Combines stronger side with HTF agreement.",
    predicate: (candidate) => candidate.side === "short" && candidate.htfAlignment === "aligned"
  },
  {
    id: "clean_retest_displacement",
    label: "Clean retest + displacement",
    reason: "Requires both entry respect and delivery confirmation.",
    predicate: (candidate) => candidate.cleanRetest && candidate.displacementConfirmed
  }
];

const costSensitivityFor = (candidates) =>
  Object.fromEntries(costLevels.map((cost) => [`${cost}R`, summarizeExpectancy(candidates, cost)]));

const gateStatus = ({ summary, rolling, oos, costSensitivity, classification }) => {
  const failed = [];
  if (summary.count < variantGateSummary.minimumCandidates) failed.push("candidate_count");
  if (summary.uniqueTradingDates < variantGateSummary.minimumUniqueTradingDates) failed.push("unique_trading_dates");
  if (rolling.activeRollingWindows < variantGateSummary.minimumActiveRollingWindows) failed.push("active_rolling_windows");
  if (rolling.weakWindows > variantGateSummary.maximumWeakRollingWindows) failed.push("rolling_window_stability");
  if (summary.targetFirstRate < variantGateSummary.minimumTargetFirstRate) failed.push("target_first_rate");
  if (summary.invalidationFirstRate > variantGateSummary.maximumInvalidationFirstRate) failed.push("invalidation_first_rate");
  if (oos.verdict === "degraded" || oos.verdict === "failed") failed.push("oos_verdict");
  if (costSensitivity["0.5R"].averageR <= variantGateSummary.minimumAverageRAtHalfCost) failed.push("half_r_cost_expectancy");
  if (costSensitivity["1R"].averageR <= variantGateSummary.minimumAverageRAtOneCost) failed.push("one_r_cost_expectancy");
  return {
    passed: failed.length === 0 && classification === "paper_watchlist_candidate",
    failed
  };
};

const evaluateVariant = ({ definition, candidates, firstTimestamp, lastTimestamp }) => {
  const scoped = candidates.filter(definition.predicate);
  const summary = summarizeExpectancy(scoped, 0);
  const costSensitivity = costSensitivityFor(scoped);
  const rolling = rollingExpectancy({ candidates: scoped, firstTimestamp, lastTimestamp, costR: 0 });
  const oos = oosSummary(scoped, 0);
  const classifier = classifyIfvg({ summary, rolling, oos, costSensitivity });
  const gates = gateStatus({ summary, rolling, oos, costSensitivity, classification: classifier.classification });
  return {
    id: definition.id,
    label: definition.label,
    reason: definition.reason,
    candidateCount: summary.count,
    uniqueTradingDates: summary.uniqueTradingDates,
    activeRollingWindows: rolling.activeRollingWindows,
    weakRollingWindowCount: rolling.weakWindows,
    targetFirstRate: summary.targetFirstRate,
    invalidationFirstRate: summary.invalidationFirstRate,
    stalledRate: summary.count ? round(summary.stalled / summary.count, 4) : 0,
    averageR: summary.averageR,
    medianR: summary.medianR,
    profitFactor: summary.profitFactor,
    averageRAtHalfCost: costSensitivity["0.5R"].averageR,
    averageRAtOneCost: costSensitivity["1R"].averageR,
    maxDrawdownEstimateR: summary.maxDrawdownR,
    oosVerdict: oos.verdict,
    classification: classifier.classification,
    failedGates: gates.failed,
    gatePassed: gates.passed,
    authority
  };
};

const sortVariants = (variants) =>
  variants.slice().sort((left, right) => {
    const leftPass = left.gatePassed ? 1 : 0;
    const rightPass = right.gatePassed ? 1 : 0;
    return (
      rightPass - leftPass ||
      right.targetFirstRate - left.targetFirstRate ||
      left.invalidationFirstRate - right.invalidationFirstRate ||
      right.averageRAtHalfCost - left.averageRAtHalfCost ||
      right.candidateCount - left.candidateCount
    );
  });

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.equal(report.safety.realOrderPlaced, false);
  assert.equal(report.safety.brokerMutation, false);
};

function runVariantUnitChecks() {
  runClassifierUnitChecks();
  const passedOos = { verdict: "passed" };
  const positiveCosts = {
    "0R": { averageR: 1.2, profitFactor: 2.2 },
    "0.25R": { averageR: 0.95, profitFactor: 1.8 },
    "0.5R": { averageR: 0.7, profitFactor: 1.5 },
    "1R": { averageR: 0.2, profitFactor: 1.1 }
  };
  const buildFixture = ({ summary = {}, rolling = {}, oos = passedOos, costSensitivity = positiveCosts }) => {
    const resolvedSummary = {
      count: 40,
      uniqueTradingDates: 8,
      targetFirstRate: 0.62,
      invalidationFirstRate: 0.3,
      stalled: 0,
      averageR: 1.2,
      medianR: 1.1,
      medianRR: 2.4,
      profitFactor: 2.2,
      maxDrawdownR: 2,
      ...summary
    };
    const resolvedRolling = { activeRollingWindows: 3, weakWindows: 0, ...rolling };
    const classifier = classifyIfvg({
      summary: resolvedSummary,
      rolling: resolvedRolling,
      oos,
      costSensitivity
    });
    const gates = gateStatus({
      summary: resolvedSummary,
      rolling: resolvedRolling,
      oos,
      costSensitivity,
      classification: classifier.classification
    });
    return { classification: classifier.classification, failedGates: gates.failed, gatePassed: gates.passed, authority };
  };

  const highHitWeakRolling = buildFixture({
    summary: { targetFirstRate: 0.7, invalidationFirstRate: 0.2 },
    rolling: { weakWindows: 1 }
  });
  assert.notEqual(highHitWeakRolling.classification, "paper_watchlist_candidate");
  assert.equal(highHitWeakRolling.failedGates.includes("rolling_window_stability"), true);

  const highInvalidation = buildFixture({
    summary: { targetFirstRate: 0.6, invalidationFirstRate: 0.4 }
  });
  assert.notEqual(highInvalidation.classification, "paper_watchlist_candidate");
  assert.equal(highInvalidation.failedGates.includes("invalidation_first_rate"), true);

  const lowDates = buildFixture({
    summary: { uniqueTradingDates: 2, targetFirstRate: 0.7, invalidationFirstRate: 0.2 }
  });
  assert.notEqual(lowDates.classification, "paper_watchlist_candidate");
  assert.equal(lowDates.failedGates.includes("unique_trading_dates"), true);

  const passing = buildFixture({});
  assert.equal(passing.classification, "paper_watchlist_candidate");
  assert.equal(passing.gatePassed, true);
  assert.equal(passing.authority.executionAuthority, "none");
}

function writeMarkdownReport(report) {
  const variantRows = report.variants
    .map(
      (variant) =>
        `| ${variant.id} | ${variant.candidateCount} | ${variant.uniqueTradingDates} | ${variant.activeRollingWindows} | ${variant.weakRollingWindowCount} | ${pct(variant.targetFirstRate)} | ${pct(variant.invalidationFirstRate)} | ${variant.averageR} | ${variant.averageRAtHalfCost} | ${variant.averageRAtOneCost} | ${variant.profitFactor} | ${variant.maxDrawdownEstimateR} | ${variant.oosVerdict} | ${variant.classification} | ${variant.failedGates.join(", ") || "none"} |`
    )
    .join("\n");
  const bestRows = report.bestVariants
    .map((variant) => `- \`${variant.id}\`: ${pct(variant.targetFirstRate)} target-first, ${pct(variant.invalidationFirstRate)} invalidation-first, ${variant.candidateCount} candidates, failed gates: ${variant.failedGates.join(", ") || "none"}`)
    .join("\n");
  const passingRows = report.passingVariants.length
    ? report.passingVariants.map((variant) => `- \`${variant.id}\`: ${variant.candidateCount} candidates, ${pct(variant.targetFirstRate)} target-first, ${variant.uniqueTradingDates} dates.`).join("\n")
    : "- None.";

  const markdown = `# IFVG Filter Variant Audit

Generated from \`npm.cmd run test:ifvg-filter-variants\` on explicit MT5 read-only history.

## Scope

- Base strategy: \`ifvg_v1\`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: \`${report.source.requestedSymbol}\`
- Broker symbol: \`${report.source.brokerSymbol}\`
- Authority: \`executionAuthority none\`, \`brokerAuthority none\`, \`readinessOverrideAuthority none\`
- Data policy: raw candles stayed internal to the CLI diagnostic; this report stores compact metrics only.

## Gate Summary

| Gate | Required |
|---|---|
| Candidates | >= ${variantGateSummary.minimumCandidates} |
| Unique dates | >= ${variantGateSummary.minimumUniqueTradingDates} |
| Active rolling windows | >= ${variantGateSummary.minimumActiveRollingWindows} |
| Weak rolling windows | ${variantGateSummary.maximumWeakRollingWindows} |
| Target-first | >= ${pct(variantGateSummary.minimumTargetFirstRate)} |
| Invalidation-first | <= ${pct(variantGateSummary.maximumInvalidationFirstRate)} |
| OOS | cannot degrade/fail |
| Cost sensitivity | average R positive after 0.5R and 1.0R cost |
| Source | no mock/sample source |
| Authority | none/none/none |

## Variant Results

| Variant | Candidates | Dates | Windows | Weak Windows | Target-first | Invalidation-first | Avg R | Avg R @ 0.5R | Avg R @ 1R | Profit Factor | Max DD R | OOS | Classification | Failed Gates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
${variantRows}

## Passing Variants

${passingRows}

## Best Blocked Variants

${bestRows}

## Promotion Decision

${report.promotionDecision}

## Advisor / OpenClaw Status

${report.advisorOpenClawStatus}

## Recommendation

${report.recommendation}

## Safety Result

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no order placement
- no readiness override
- authority \`none/none/none\`
`;

  fs.writeFileSync(reportPath, markdown, "utf8");
}

async function main() {
  runVariantUnitChecks();
  const { candidates, firstTimestamp, lastTimestamp, sourceDepth, detectorFunnel } = await collectCandidates();
  const variants = sortVariants(variantDefinitions.map((definition) => evaluateVariant({ definition, candidates, firstTimestamp, lastTimestamp })));
  const passingVariants = variants.filter((variant) => variant.gatePassed);
  const bestVariants = variants.filter((variant) => !variant.gatePassed).slice(0, 2);
  const bestVariant = passingVariants[0] ?? bestVariants[0] ?? null;
  const promotionDecision = passingVariants.length
    ? "One or more IFVG filters qualify for research-only paper-watchlist consideration. Paper-Demo remains blocked unless the existing deterministic Paper-Demo checklist passes."
    : "No IFVG v2 filter passes all gates. Keep IFVG v1 as needs_filtering and do not register a filtered v2 paper-watchlist strategy yet.";
  const advisorOpenClawStatus = passingVariants.length
    ? "Advisor may reference ifvg_filtered_v2_research as a draft research-only candidate family; OpenClaw may propose validation but cannot auto-apply or approve readiness."
    : "Advisor should say: positive expectancy but invalidation-first too high; filtering required. OpenClaw intents should reference ifvg_v1 with needs_filtering status.";
  const recommendation = passingVariants.length
    ? `Validate \`${passingVariants[0].id}\` through replay, walk-forward, evidence, maturity, and Paper-Demo checklist gates before any progression.`
    : bestVariant
      ? `Best blocked variant is \`${bestVariant.id}\`; fix ${bestVariant.failedGates.join(", ")} before considering a filtered executable variant.`
      : "No usable IFVG variant was found; keep v1 diagnostic-only for filtering research.";

  const report = {
    status: "passed",
    diagnostic: "ifvg_filter_variant_audit",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol: process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ",
      brokerSymbol: process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH",
      timeframes: sourceDepth,
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    detectorFunnel,
    gateSummary: variantGateSummary,
    variants,
    passingVariants,
    bestVariant,
    bestVariants,
    strategyRegistrationRecommendation: passingVariants.length ? "register_ifvg_filtered_v2_research" : "do_not_register_filtered_v2_yet",
    promotionDecision,
    advisorOpenClawStatus,
    recommendation,
    safety,
    authority
  };

  assert.equal(report.passingVariants.every((variant) => variant.classification === "paper_watchlist_candidate"), true);
  assertSafeReport(report);
  writeMarkdownReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    status: "failed",
    diagnostic: "ifvg_filter_variant_audit",
    error: error instanceof Error ? error.message : String(error),
    promotionDecision: "Do not promote IFVG; variant diagnostic did not complete.",
    safety,
    authority
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
