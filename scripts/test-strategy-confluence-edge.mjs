#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  secretsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  brokerMutation: false,
  realOrderPlaced: false,
  readinessOverride: false,
  autoApply: false
};

const gates = {
  minimumCandidates: 20,
  minimumUniqueTradingDates: 3,
  minimumActiveRollingWindows: 2,
  minimumAverageRr: 2,
  noMockOrSampleSource: true,
  oosCannotDegradeOrFail: true,
  noSingleDayClusterPromotion: true
};

const docsToRead = [
  "docs/gotrader-profitability-failure-audit.md",
  "docs/strategy-detector-blocker-audit.md",
  "docs/silver-bullet-performance-audit.md",
  "docs/silver-bullet-v2-refinement-audit.md",
  "docs/turtle-soup-performance-audit.md",
  "docs/cisd-performance-audit.md"
];

const readDoc = (relativePath) => {
  const absolutePath = path.join(projectRoot, relativePath);
  assert.equal(fs.existsSync(absolutePath), true, `${relativePath} must exist before running confluence audit.`);
  return fs.readFileSync(absolutePath, "utf8");
};

const docs = Object.fromEntries(docsToRead.map((relativePath) => [relativePath, readDoc(relativePath)]));

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const pct = (value) => `${round(value * 100, 2)}%`;

const baseline = {
  cmdStrictPaperWatchlist: {
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    label: "CMD strict paper-watchlist",
    candidateCount: 8,
    targetFirstRate: 0.875,
    invalidationFirstRate: 0.125,
    averageRr: 3.3612,
    medianRr: 2.635,
    uniqueTradingDates: 1,
    activeRollingWindows: 1,
    oosVerdict: "overfit_risk",
    source: "docs/strategy-detector-blocker-audit.md",
    blocker:
      "CMD lane is promising but date-concentrated; needs independent-date validation."
  },
  silverBulletV1: {
    strategyId: "silver_bullet_v1",
    label: "Silver Bullet v1",
    candidateCount: 152,
    targetFirstRate: 0.1053,
    invalidationFirstRate: 0.8684,
    averageRr: undefined,
    medianRr: undefined,
    uniqueTradingDates: 63,
    activeRollingWindows: 4,
    oosVerdict: "degraded",
    source: "docs/silver-bullet-v2-refinement-audit.md",
    blocker: "Broad sweep/FVG/return population has weak target-first rate and OOS degradation."
  },
  silverBulletV1NyAm: {
    strategyId: "silver_bullet_v1",
    label: "Silver Bullet v1 NY AM",
    candidateCount: 50,
    targetFirstRate: 0.16,
    invalidationFirstRate: 0.84,
    averageRr: undefined,
    medianRr: undefined,
    uniqueTradingDates: 0,
    activeRollingWindows: 0,
    oosVerdict: "degraded",
    source: "docs/silver-bullet-v2-refinement-audit.md",
    blocker: "NY AM improves v1 only slightly and remains no-edge."
  },
  silverBulletV2: {
    strategyId: "silver_bullet_v2_refined_research",
    label: "Silver Bullet v2 refined",
    candidateCount: 3,
    targetFirstRate: 0.3333,
    invalidationFirstRate: 0.6667,
    averageRr: 2.1095,
    medianRr: 2.1018,
    uniqueTradingDates: 3,
    activeRollingWindows: 3,
    oosVerdict: "insufficient_data",
    source: "docs/silver-bullet-v2-refinement-audit.md",
    blocker: "Refined filter removes weak setups, but only three valid candidates remain."
  },
  silverBulletV2NyAm: {
    strategyId: "silver_bullet_v2_refined_research",
    label: "Silver Bullet v2 NY AM",
    candidateCount: 2,
    targetFirstRate: 0.5,
    invalidationFirstRate: 0.5,
    averageRr: undefined,
    medianRr: undefined,
    uniqueTradingDates: 2,
    activeRollingWindows: 2,
    oosVerdict: "insufficient_data",
    source: "docs/silver-bullet-v2-refinement-audit.md",
    blocker: "NY AM is the only plausible v2 sub-variant, but two samples cannot validate edge."
  },
  cisdAll: {
    strategyId: "cisd_v1",
    label: "CISD v1",
    candidateCount: 109,
    targetFirstRate: 0.2569,
    invalidationFirstRate: 0.7248,
    averageRr: 10.2322,
    medianRr: 8.3357,
    uniqueTradingDates: 0,
    activeRollingWindows: 4,
    oosVerdict: "degraded",
    source: "docs/cisd-performance-audit.md",
    blocker: "CISD finds enough samples, but invalidation-first dominates and OOS degrades."
  },
  cisdRthOpen: {
    strategyId: "cisd_v1",
    label: "CISD RTH open",
    candidateCount: 3,
    targetFirstRate: 0.3333,
    invalidationFirstRate: 0.6667,
    averageRr: 8.6624,
    medianRr: 6.3147,
    uniqueTradingDates: 0,
    activeRollingWindows: 0,
    oosVerdict: "insufficient_data",
    source: "docs/cisd-performance-audit.md",
    blocker: "Session-open CISD is too small and still invalidation-heavy."
  },
  turtleSoup: {
    strategyId: "turtle_soup_v1",
    label: "Turtle Soup v1",
    candidateCount: 0,
    targetFirstRate: 0,
    invalidationFirstRate: 0,
    averageRr: 0,
    medianRr: 0,
    uniqueTradingDates: 0,
    activeRollingWindows: 0,
    oosVerdict: "insufficient_data",
    source: "docs/turtle-soup-performance-audit.md",
    blocker: "No valid candidates; setup-range sweep gate blocks almost every window."
  }
};

const classifyBundle = (bundle) => {
  if (bundle.measurementStatus !== "measured" && bundle.measurementStatus !== "partially_measured") {
    return "insufficient_data";
  }
  if (bundle.candidateCount < gates.minimumCandidates) return "insufficient_data";
  if (bundle.uniqueTradingDates < gates.minimumUniqueTradingDates || bundle.activeRollingWindows < gates.minimumActiveRollingWindows) {
    return "overfit_risk";
  }
  if (/degrad|fail|reject/i.test(bundle.oosVerdict ?? "")) return "no_edge";
  if (bundle.averageRr !== undefined && bundle.averageRr < gates.minimumAverageRr) return "no_edge";
  if (bundle.targetFirstRate >= 0.55 && bundle.invalidationFirstRate <= 0.35) return "ready_for_more_validation";
  if (bundle.targetFirstRate >= 0.45 && bundle.invalidationFirstRate <= 0.45) return "promising_but_unstable";
  return "no_edge";
};

const gateBundle = (bundle) => {
  const blockers = [];
  if (bundle.measurementStatus === "not_measurable") blockers.push("candidate-level confluence overlap is not available in compact diagnostics");
  if (bundle.measurementStatus === "not_available") blockers.push("required feature detector or filter is not available yet");
  if (bundle.candidateCount < gates.minimumCandidates) blockers.push(`candidate count ${bundle.candidateCount}/${gates.minimumCandidates}`);
  if (bundle.uniqueTradingDates < gates.minimumUniqueTradingDates) blockers.push(`unique dates ${bundle.uniqueTradingDates}/${gates.minimumUniqueTradingDates}`);
  if (bundle.activeRollingWindows < gates.minimumActiveRollingWindows) blockers.push(`active rolling windows ${bundle.activeRollingWindows}/${gates.minimumActiveRollingWindows}`);
  if (/degrad|fail|reject/i.test(bundle.oosVerdict ?? "")) blockers.push(`OOS verdict ${bundle.oosVerdict}`);
  if (bundle.averageRr !== undefined && bundle.averageRr < gates.minimumAverageRr) blockers.push(`average RR ${bundle.averageRr}/${gates.minimumAverageRr}`);
  if (bundle.singleDayCluster === true) blockers.push("single-date cluster cannot promote");
  return {
    passed: blockers.length === 0,
    blockers,
    promotionAllowed: false,
    paperDemoEligible: false
  };
};

const measuredBundle = ({
  id,
  label,
  ingredients,
  base,
  measurementStatus = "measured",
  notes = [],
  blockers = [],
  singleDayCluster = false
}) => {
  const bundle = {
    id,
    label,
    ingredients,
    measurementStatus,
    candidateCount: base.candidateCount,
    targetFirstRate: base.targetFirstRate,
    invalidationFirstRate: base.invalidationFirstRate,
    averageRr: base.averageRr,
    medianRr: base.medianRr,
    uniqueTradingDates: base.uniqueTradingDates,
    activeRollingWindows: base.activeRollingWindows,
    oosVerdict: base.oosVerdict,
    blockerReasons: [base.blocker, ...blockers].filter(Boolean),
    sourceDiagnostics: [base.source],
    singleDayCluster,
    notes,
    authority
  };
  const classification = classifyBundle(bundle);
  const gate = gateBundle(bundle);
  return {
    ...bundle,
    robustnessClassification: classification,
    gate,
    compactSummary:
      `${label}: ${bundle.candidateCount} candidates, ${pct(bundle.targetFirstRate)} target-first, ` +
      `${pct(bundle.invalidationFirstRate)} invalidation-first, ${classification}; ` +
      (gate.blockers.length ? `blocked by ${gate.blockers.join("; ")}.` : "passes research gates.")
  };
};

const unmeasuredBundle = ({ id, label, ingredients, candidatePool, blockers, notes = [], measurementStatus = "not_measurable" }) =>
  measuredBundle({
    id,
    label,
    ingredients,
    base: {
      strategyId: id,
      label,
      candidateCount: 0,
      targetFirstRate: 0,
      invalidationFirstRate: 0,
      averageRr: undefined,
      medianRr: undefined,
      uniqueTradingDates: 0,
      activeRollingWindows: 0,
      oosVerdict: "not_measured",
      source: "compact diagnostic overlap unavailable",
      blocker: blockers[0]
    },
    measurementStatus,
    blockers: blockers.slice(1),
    notes: [`Candidate pool before confluence: ${candidatePool}.`, ...notes]
  });

const bundles = [
  measuredBundle({
    id: "cmd_only",
    label: "CMD only",
    ingredients: ["CMD paper-watchlist"],
    base: baseline.cmdStrictPaperWatchlist,
    singleDayCluster: true,
    notes: ["Best standalone paper-only lane, but all current evidence is date-concentrated."]
  }),
  measuredBundle({
    id: "cmd_htf_alignment",
    label: "CMD + HTF alignment",
    ingredients: ["CMD paper-watchlist", "HTF alignment"],
    base: baseline.cmdStrictPaperWatchlist,
    measurementStatus: "partially_measured",
    singleDayCluster: true,
    blockers: ["Current CMD report does not expose per-candidate W1/D1/H4/H1/M15 alignment tags."],
    notes: ["Scored from strict CMD pool only; HTF overlap still needs candidate-level telemetry."]
  }),
  measuredBundle({
    id: "cmd_displacement",
    label: "CMD + displacement",
    ingredients: ["CMD paper-watchlist", "distribution/expansion away"],
    base: baseline.cmdStrictPaperWatchlist,
    measurementStatus: "partially_measured",
    singleDayCluster: true,
    notes: ["Strict CMD profile already requires distribution/expansion away from consolidation/manipulation."]
  }),
  measuredBundle({
    id: "cmd_external_liquidity_target",
    label: "CMD + external liquidity target",
    ingredients: ["CMD paper-watchlist", "external liquidity target"],
    base: baseline.cmdStrictPaperWatchlist,
    measurementStatus: "partially_measured",
    singleDayCluster: true,
    notes: ["Strict CMD profile requires target/invalidation/RR, but target taxonomy should be carried per candidate before deeper promotion."]
  }),
  unmeasuredBundle({
    id: "cmd_cisd_direction",
    label: "CMD + CISD direction",
    ingredients: ["CMD paper-watchlist", "CISD direction"],
    candidatePool: `${baseline.cmdStrictPaperWatchlist.candidateCount} CMD / ${baseline.cisdAll.candidateCount} CISD`,
    blockers: [
      "CMD and CISD reports do not share compact per-candidate timestamps for overlap scoring.",
      "Standalone CISD is invalidation-heavy and cannot be assumed to improve CMD."
    ]
  }),
  unmeasuredBundle({
    id: "cmd_cisd_fvg",
    label: "CMD + CISD + FVG",
    ingredients: ["CMD paper-watchlist", "CISD direction", "FVG return"],
    candidatePool: `${baseline.cmdStrictPaperWatchlist.candidateCount} CMD / ${baseline.cisdAll.candidateCount} CISD`,
    blockers: [
      "Candidate-level CMD/CISD/FVG overlap tags are not available.",
      "Cannot infer a positive confluence edge from independent summaries."
    ]
  }),
  unmeasuredBundle({
    id: "cmd_smt_confirmation",
    label: "CMD + SMT confirmation",
    ingredients: ["CMD paper-watchlist", "SMT confirmation"],
    candidatePool: baseline.cmdStrictPaperWatchlist.candidateCount,
    measurementStatus: "not_available",
    blockers: [
      "SMT confirmation is not available as a candidate-level confluence feature in the current compact CMD diagnostic.",
      "SMT should be added as telemetry before it can become a scoring filter."
    ]
  }),
  measuredBundle({
    id: "silver_bullet_v2_htf_alignment",
    label: "Silver Bullet v2 + HTF alignment",
    ingredients: ["Silver Bullet v2", "5m/15m context alignment"],
    base: baseline.silverBulletV2,
    notes: ["V2 already includes the HTF/context-alignment filter."]
  }),
  unmeasuredBundle({
    id: "silver_bullet_v2_cisd",
    label: "Silver Bullet v2 + CISD",
    ingredients: ["Silver Bullet v2", "CISD direction"],
    candidatePool: `${baseline.silverBulletV2.candidateCount} Silver Bullet v2 / ${baseline.cisdAll.candidateCount} CISD`,
    blockers: [
      "Silver Bullet v2 candidate sample is only three.",
      "No compact shared timestamp overlap exists between v2 and CISD diagnostics."
    ]
  }),
  measuredBundle({
    id: "liquidity_sweep_displacement_fvg_return",
    label: "Liquidity sweep + displacement + FVG return",
    ingredients: ["liquidity sweep", "directional FVG/displacement", "return to FVG"],
    base: baseline.silverBulletV1,
    notes: ["Silver Bullet v1 is the broad measured proxy for this confluence stack."]
  }),
  measuredBundle({
    id: "fvg_return_session_context",
    label: "FVG return + session context",
    ingredients: ["FVG return", "Silver Bullet session window"],
    base: baseline.silverBulletV1,
    notes: ["Measured through Silver Bullet v1 session-window candidate population."]
  }),
  measuredBundle({
    id: "ny_am_silver_bullet_v1",
    label: "NY AM Silver Bullet v1",
    ingredients: ["Silver Bullet v1", "NY AM session"],
    base: baseline.silverBulletV1NyAm,
    notes: ["NY AM v1 improves slightly versus all v1 but still remains no-edge."]
  }),
  measuredBundle({
    id: "ny_am_silver_bullet_v2",
    label: "NY AM Silver Bullet v2",
    ingredients: ["Silver Bullet v2", "NY AM session"],
    base: baseline.silverBulletV2NyAm,
    notes: ["Only plausible v2 sub-variant, but current sample is two candidates."]
  }),
  measuredBundle({
    id: "cisd_only",
    label: "CISD only",
    ingredients: ["CISD direction", "body-zone retest", "opposing liquidity target"],
    base: baseline.cisdAll,
    notes: ["Included as a baseline because several confluence bundles use CISD as a filter."]
  }),
  measuredBundle({
    id: "cisd_session_open",
    label: "CISD session-open only",
    ingredients: ["CISD direction", "RTH open"],
    base: baseline.cisdRthOpen,
    notes: ["Session-open CISD is too small to rescue broad CISD v1."]
  }),
  measuredBundle({
    id: "turtle_soup_only",
    label: "Turtle Soup only",
    ingredients: ["setup range", "sweep", "rejection", "MSS"],
    base: baseline.turtleSoup,
    notes: ["Included to show no current confluence can be built from Turtle Soup v1 candidates."]
  })
];

const rankScore = (bundle) => {
  const measuredWeight = bundle.measurementStatus === "measured" ? 1 : bundle.measurementStatus === "partially_measured" ? 0.8 : 0;
  const samplePenalty = bundle.candidateCount >= 20 ? 1 : bundle.candidateCount > 0 ? 0.35 : 0;
  const oosPenalty = /degrad|fail|reject/i.test(bundle.oosVerdict ?? "") ? 0.25 : 1;
  const concentrationPenalty = bundle.singleDayCluster ? 0.2 : 1;
  return round(bundle.targetFirstRate * measuredWeight * samplePenalty * oosPenalty * concentrationPenalty, 4);
};

const rankedBundles = bundles
  .map((bundle) => ({ ...bundle, rankScore: rankScore(bundle) }))
  .sort((left, right) => right.rankScore - left.rankScore || right.targetFirstRate - left.targetFirstRate);

const bestConservativeRankedBundle = rankedBundles[0];
const bestTargetFirstBundle = bundles
  .filter((bundle) => bundle.candidateCount > 0)
  .sort((left, right) => right.targetFirstRate - left.targetFirstRate || right.candidateCount - left.candidateCount)[0];
const gatePassingBundles = rankedBundles.filter((bundle) => bundle.gate.passed);
const measurableBundles = rankedBundles.filter((bundle) => bundle.measurementStatus === "measured" || bundle.measurementStatus === "partially_measured");

const report = {
  status: "passed",
  diagnostic: "strategy_confluence_edge_audit",
  generatedAt: new Date().toISOString(),
  source: {
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    lookback: "explicit 90-day compact diagnostic reports",
    cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy research data for requested MNQ, not CME futures truth.",
    documentsRead: docsToRead
  },
  gates,
  bundleCount: bundles.length,
  measurableBundleCount: measurableBundles.length,
  bundles: rankedBundles,
  bestBundle: {
    id: bestTargetFirstBundle.id,
    label: bestTargetFirstBundle.label,
    candidateCount: bestTargetFirstBundle.candidateCount,
    targetFirstRate: bestTargetFirstBundle.targetFirstRate,
    invalidationFirstRate: bestTargetFirstBundle.invalidationFirstRate,
    robustnessClassification: bestTargetFirstBundle.robustnessClassification,
    gateBlockers: bestTargetFirstBundle.gate.blockers,
    compactSummary: bestTargetFirstBundle.compactSummary
  },
  conservativeRankedBestBundle: {
    id: bestConservativeRankedBundle.id,
    label: bestConservativeRankedBundle.label,
    candidateCount: bestConservativeRankedBundle.candidateCount,
    targetFirstRate: bestConservativeRankedBundle.targetFirstRate,
    invalidationFirstRate: bestConservativeRankedBundle.invalidationFirstRate,
    robustnessClassification: bestConservativeRankedBundle.robustnessClassification,
    gateBlockers: bestConservativeRankedBundle.gate.blockers,
    compactSummary: bestConservativeRankedBundle.compactSummary
  },
  result: {
    anyBundlePassedGates: gatePassingBundles.length > 0,
    promotionDecision:
      gatePassingBundles.length > 0
        ? "A confluence bundle passed research gates, but Paper-Demo still depends on existing deterministic checklist gates."
        : "No confluence bundle passes independent-date, sample, rolling-window, and OOS gates. Do not promote.",
    registeredResearchProfile: false,
    reasonNoProfileRegistered:
      "The best bundle is still date-concentrated or not measurable with current compact candidate telemetry.",
    recommendedNextStrategy:
      "Build a deeper CMD variant with candidate-level HTF/CISD/FVG/SMT telemetry first; then implement IFVG as the next standalone detector because FVG inversion can be scored directly against the current liquidity/FVG evidence stack.",
    telemetryNeeded: [
      "per-candidate signal timestamp",
      "per-candidate HTF alignment directions",
      "per-candidate CISD direction overlap",
      "per-candidate FVG/IFVG return tag",
      "per-candidate SMT confirmation tag",
      "per-candidate target taxonomy"
    ]
  },
  docsSafetyChecks: {
    allDocsMentionAuthorityNone: docsToRead.every((relativePath) => /authority|executionAuthority|execution authority/i.test(docs[relativePath])),
    compactReportsOnly: true
  },
  safety,
  authority
};

const serialized = JSON.stringify(report);
assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
assert.equal(report.authority.executionAuthority, "none");
assert.equal(report.authority.brokerAuthority, "none");
assert.equal(report.authority.readinessOverrideAuthority, "none");
assert.equal(report.safety.realOrderPlaced, false);
assert.equal(report.safety.brokerMutation, false);
assert.equal(report.safety.readinessOverride, false);
assert.equal(report.safety.autoApply, false);
assert.equal(report.result.anyBundlePassedGates, false, "Current confluence audit should not promote any bundle.");
assert.equal(report.result.registeredResearchProfile, false, "No research profile should be registered unless gates pass.");

console.log(JSON.stringify(report, null, 2));
