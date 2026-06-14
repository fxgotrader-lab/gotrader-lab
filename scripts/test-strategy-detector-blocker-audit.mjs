#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExposed: false,
  rawSnapshotsExposed: false,
  secretsExposed: false,
  accountDataExposed: false,
  orderDataExposed: false,
  positionDataExposed: false,
  realOrderPlaced: false,
  brokerMutation: false
};

const allowedStatuses = new Set([
  "no_edge",
  "too_broad",
  "too_strict",
  "insufficient_data",
  "promising_but_unstable",
  "ready_for_more_validation"
]);

const runJsonScript = (scriptName, timeoutMs = 240_000) => {
  const scriptPath = path.join(projectRoot, "scripts", scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FORCE_COLOR: "0"
    },
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.error) {
    throw new Error(`${scriptName} failed to run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${scriptName} exited ${result.status}:\n${output}`);
  }

  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`${scriptName} did not print a JSON object.`);
  }
  return JSON.parse(output.slice(firstBrace, lastBrace + 1));
};

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);

const topBlockers = (items = [], limit = 8) =>
  items
    .map((item) => ({
      reason: String(item.reason ?? item.key ?? item.blocker ?? "unknown"),
      count: Number(item.count ?? 0)
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, limit);

const blockerCount = (items = []) => items.reduce((total, item) => total + Number(item.count ?? 0), 0);

const asPercent = (value) => round(Number(value ?? 0), 4);

const compactSource = (source = {}) => ({
  provider: source.provider ?? "mt5_read_only",
  requestedSymbol: source.requestedSymbol ?? "MNQ",
  brokerSymbol: source.brokerSymbol ?? "USTECH",
  timeframe: source.primaryTimeframe ?? source.entryTimeframe ?? source.timeframe ?? "n/a",
  contextTimeframes: source.contextTimeframes ?? [source.setupTimeframe].filter(Boolean),
  requestedLookbackDays: source.requestedLookbackDays,
  candleCount: source.primary?.candleCount ?? source.entry?.candleCount ?? source.candleCount,
  availableLookbackDays: source.primary?.availableLookbackDays ?? source.entry?.availableLookbackDays ?? source.availableLookbackDays,
  dataDepthStatus: source.primary?.dataDepthStatus ?? source.entry?.dataDepthStatus ?? "unknown",
  cfdProxyWarning: source.cfdProxyWarning
});

const silverV1Audit = (report) => {
  const performance = report.performance ?? {};
  const funnel = report.detectorFunnel ?? {};
  const blockers = topBlockers(funnel.topBlockers);
  const validCandidates = Number(performance.validCandidates ?? performance.count ?? 0);
  const blockedCandidates = Number(funnel.noTrade ?? blockerCount(blockers));
  return {
    strategyId: "silver_bullet_v1",
    source: compactSource(report.source),
    totalEvaluatedWindows: Number(funnel.totalSessionEvaluations ?? 0),
    setupConditionHits: {
      sweeps: Number(funnel.totalDetectedSweeps ?? 0),
      fvgAfterSweep: Number(funnel.totalFvgAfterSweepCases ?? 0),
      returnToFvgEntries: Number(funnel.totalReturnToFvgEntries ?? 0)
    },
    blockedCandidates,
    blockerDistribution: blockers,
    validCandidates,
    targetFirstRate: asPercent(performance.targetFirstRate),
    invalidationFirstRate: asPercent(performance.invalidationFirstRate),
    uniqueTradingDates: Number(performance.uniqueTradingDates ?? 0),
    activeRollingWindows: Number(report.rollingOos?.activeRollingWindows ?? 0),
    oosVerdict: report.rollingOos?.oosVerdict ?? "unknown",
    status: "no_edge",
    diagnosis:
      "V1 detects many setups but the replay edge is poor: target-first is too low, invalidation-first is too high, and OOS degrades. Keep as rejected baseline.",
    issueCategory: "poor_edge",
    nextAction: "Do not refine v1 directly; use it only as a baseline for stricter variants."
  };
};

const silverV2Audit = (report) => {
  const v1 = report.comparison?.v1 ?? {};
  const v2 = report.comparison?.v2 ?? {};
  const v2Perf = v2.performance ?? {};
  const blockers = topBlockers(v2.diagnostics?.topBlockers);
  const validCandidates = Number(v2Perf.count ?? 0);
  return {
    strategyId: "silver_bullet_v2_refined_research",
    source: compactSource(report.source),
    totalEvaluatedWindows: Number(v2.diagnostics?.totalSessionEvaluations ?? 0),
    setupConditionHits: {
      v1Candidates: Number(v1.performance?.count ?? 0),
      v2Candidates: validCandidates,
      candidateReduction: asPercent(report.comparison?.candidateReduction),
      nyAmCandidates: Number(v2Perf.bySession?.new_york_am?.count ?? 0)
    },
    blockedCandidates: blockerCount(blockers),
    blockerDistribution: blockers,
    validCandidates,
    targetFirstRate: asPercent(v2Perf.targetFirstRate),
    invalidationFirstRate: asPercent(v2Perf.invalidationFirstRate),
    uniqueTradingDates: Number(v2Perf.uniqueTradingDates ?? 0),
    activeRollingWindows: Number(v2.rolling?.activeRollingWindows ?? 0),
    oosVerdict: v2.oos?.verdict ?? "unknown",
    status: "insufficient_data",
    diagnosis:
      "V2 removed almost all weak v1 candidates. The largest removals are low-quality sweeps, no 5m/15m context alignment, weak/tardy FVG displacement, and no timely FVG return. That looks mostly correct, but the sample is too small.",
    issueCategory: "strict_quality_filter_with_low_sample",
    nextAction: "Research a narrower NY AM-only variant only after keeping the v2 gates intact and collecting more independent dates."
  };
};

const turtleSoupAudit = (report) => {
  const performance = report.performance ?? {};
  const funnel = report.detectorFunnel ?? {};
  const blockers = topBlockers(funnel.topBlockers);
  const noSweep = blockers.find((item) => /fresh sweep|setup range/i.test(item.reason));
  const validCandidates = Number(performance.count ?? 0);
  return {
    strategyId: "turtle_soup_v1",
    source: compactSource(report.source),
    totalEvaluatedWindows: Number(funnel.totalSessionEvaluations ?? 0),
    setupConditionHits: {
      validCandidates,
      sweepFailures: Number(noSweep?.count ?? 0),
      rejectionOrMssFailures: blockers
        .filter((item) => /rejection|MSS|market structure/i.test(item.reason))
        .reduce((total, item) => total + item.count, 0)
    },
    blockedCandidates: blockerCount(blockers),
    blockerDistribution: blockers,
    validCandidates,
    targetFirstRate: asPercent(performance.targetFirstRate),
    invalidationFirstRate: asPercent(performance.invalidationFirstRate),
    uniqueTradingDates: Number(performance.uniqueTradingDates ?? 0),
    activeRollingWindows: Number(report.rollingOos?.activeRollingWindows ?? 0),
    oosVerdict: report.rollingOos?.oosVerdict ?? "insufficient_data",
    status: "too_strict",
    diagnosis:
      "Turtle Soup found zero valid candidates. The blocker is overwhelmingly no fresh sweep of the setup range, not RR, stale sweep, news, or target/invalidation construction.",
    issueCategory: "setup_range_definition_or_source_timeframe_mismatch",
    nextAction:
      "Do not loosen entries first. Review the 15m setup-range definition against USTECH CFD/proxy sessions and add a diagnostic-only alternate range definition before changing gates."
  };
};

const cmdAudit = (report) => {
  const paper = report.overallPaperWatchlist ?? {};
  const gate = report.independentDateGate ?? {};
  return {
    strategyId: "ict_cmd_short_paper_watchlist_v1",
    source: compactSource(report.source),
    totalEvaluatedWindows: Number(report.counts?.totalReplaySignals ?? 0),
    setupConditionHits: {
      cmdDetectedModels: Number(report.counts?.cmdDetectedModels ?? 0),
      cmdResearchCandidates: Number(report.counts?.cmdResearchCandidates ?? 0),
      cmdPaperWatchlistCandidates: Number(report.counts?.cmdPaperWatchlistCandidates ?? 0)
    },
    blockedCandidates: Number(report.counts?.cmdRejectedCandidates ?? 0) + Number(report.counts?.cmdNoTradeCandidates ?? 0),
    blockerDistribution: [
      { reason: "CMD rejected/no-trade candidates did not pass strict paper-watchlist gates", count: Number(report.counts?.cmdRejectedCandidates ?? 0) + Number(report.counts?.cmdNoTradeCandidates ?? 0) },
      { reason: gate.blockerReason ?? "Independent-date validation not passed", count: Number(paper.count ?? 0) }
    ],
    validCandidates: Number(paper.count ?? 0),
    targetFirstRate: asPercent(paper.targetFirstRate),
    invalidationFirstRate: asPercent(paper.invalidationFirstRate),
    uniqueTradingDates: Number(gate.metrics?.uniqueTradingDates ?? report.robustness?.concentration?.uniqueTradingDates ?? 0),
    activeRollingWindows: Number(gate.metrics?.activeRollingWindowCount ?? report.robustness?.concentration?.activeRollingWindowCount ?? 0),
    oosVerdict: report.robustness?.classification ?? "unknown",
    status: "promising_but_unstable",
    diagnosis:
      "CMD is the strongest positive lane, but every strict paper-watchlist candidate is concentrated on one trading date/window. Independent-date and active-window gates block promotion.",
    issueCategory: "overfit_date_concentration",
    nextAction: gate.nextAction ?? "Run independent-date CMD validation over 90-day history."
  };
};

const placeholderAudit = ({ strategyId, source, reason, status = "insufficient_data", issueCategory, nextAction }) => ({
  strategyId,
  source,
  totalEvaluatedWindows: 0,
  setupConditionHits: {},
  blockedCandidates: 0,
  blockerDistribution: [{ reason, count: 1 }],
  validCandidates: 0,
  targetFirstRate: 0,
  invalidationFirstRate: 0,
  uniqueTradingDates: 0,
  activeRollingWindows: 0,
  oosVerdict: "not_available",
  status,
  diagnosis: reason,
  issueCategory: issueCategory ?? (status === "no_edge" ? "diagnostic_only" : "detector_not_implemented"),
  nextAction
});

const rankRecommendation = (audits) => {
  const byId = Object.fromEntries(audits.map((item) => [item.strategyId, item]));
  const cmd = byId.ict_cmd_short_paper_watchlist_v1;
  const silverV2 = byId.silver_bullet_v2_refined_research;
  const turtle = byId.turtle_soup_v1;
  return {
    nextBestWork:
      "Keep CMD paper-only while collecting independent dates; investigate Turtle Soup setup-range diagnostics next; keep Silver Bullet v2 as a low-sample strict research variant.",
    strategyPriority: [
      {
        strategyId: "ict_cmd_short_paper_watchlist_v1",
        reason: `Highest quality signal (${round((cmd?.targetFirstRate ?? 0) * 100, 2)}% target-first) but blocked by ${cmd?.uniqueTradingDates ?? 0} unique date(s) and ${cmd?.activeRollingWindows ?? 0} active window(s).`
      },
      {
        strategyId: "turtle_soup_v1",
        reason: `Zero valid candidates; ${turtle?.blockerDistribution?.[0]?.count ?? 0} setup-range sweep failures suggest the range definition should be audited before entry rules.`
      },
      {
        strategyId: "silver_bullet_v2_refined_research",
        reason: `Strict filter reduced candidates to ${silverV2?.validCandidates ?? 0}; NY AM produced the only positive cluster worth future separate testing.`
      }
    ],
    doNotPromote: audits.map((item) => item.strategyId),
    authority
  };
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.equal(report.safety.realOrderPlaced, false);
  assert.equal(report.safety.brokerMutation, false);
  for (const audit of report.strategies) {
    assert.ok(allowedStatuses.has(audit.status), `${audit.strategyId} has unsupported audit status ${audit.status}`);
    assert.ok(!("candles" in audit), `${audit.strategyId} must not expose candles`);
  }
};

async function main() {
  const silverV1 = runJsonScript("test-silver-bullet-performance.mjs");
  const silverV2 = runJsonScript("test-silver-bullet-v2-performance.mjs");
  const turtleSoup = runJsonScript("test-turtle-soup-performance.mjs");
  const cmdOos = runJsonScript("test-ict-cmd-paper-watchlist-oos.mjs");

  const defaultSource = compactSource(silverV1.source ?? silverV2.source ?? turtleSoup.source ?? cmdOos.source);
  const strategies = [
    cmdAudit(cmdOos),
    silverV1Audit(silverV1),
    silverV2Audit(silverV2),
    turtleSoupAudit(turtleSoup),
    placeholderAudit({
      strategyId: "cisd_v1",
      source: defaultSource,
      reason: "CISD now has a dedicated executable research detector and 90-day performance diagnostic; use test:cisd-performance for current edge assessment.",
      status: "ready_for_more_validation",
      issueCategory: "dedicated_diagnostic_available",
      nextAction: "Review docs/cisd-performance-audit.md and refine only if replay/OOS evidence justifies it."
    }),
    placeholderAudit({
      strategyId: "ifvg_v1",
      source: defaultSource,
      reason: "IFVG now has a dedicated executable research detector and 90-day performance diagnostic; use test:ifvg-performance for current edge assessment.",
      status: "ready_for_more_validation",
      issueCategory: "dedicated_diagnostic_available",
      nextAction: "Review docs/ifvg-performance-audit.md and refine only if replay/OOS evidence justifies it."
    }),
    placeholderAudit({
      strategyId: "ote_research_v1",
      source: defaultSource,
      reason: "OTE is registered as a research-only placeholder; swing selection and fib-zone rules are not deterministic yet.",
      nextAction: "Build a no-hindsight OTE swing/PD-array detector before replay."
    }),
    placeholderAudit({
      strategyId: "market_map_only_diagnostic_v1",
      source: defaultSource,
      reason: "Market-map is diagnostic context only; it has no target, invalidation, or entry model by design.",
      status: "no_edge",
      nextAction: "Use market-map only as confluence/context, never as a candidate lane."
    })
  ];

  const report = {
    status: "passed",
    diagnostic: "strategy_detector_blocker_distribution_audit",
    generatedAt: new Date().toISOString(),
    scope:
      "Research-only blocker distribution audit. Diagnostics use compact MT5 read-only summaries and existing replay scripts; raw candles stay internal.",
    strategies,
    specialFocus: {
      turtleSoup: {
        diagnosis: strategies.find((item) => item.strategyId === "turtle_soup_v1")?.diagnosis,
        recommendation: "Audit setup-range definition first; do not relax rejection/MSS/RR until setup-range diagnostics explain the zero-candidate result."
      },
      silverBulletV2: {
        diagnosis: strategies.find((item) => item.strategyId === "silver_bullet_v2_refined_research")?.diagnosis,
        recommendation: "Keep v2 strict. NY AM may deserve a separate diagnostic variant, but only as research-only replay work."
      },
      cmd: {
        diagnosis: strategies.find((item) => item.strategyId === "ict_cmd_short_paper_watchlist_v1")?.diagnosis,
        recommendation: "CMD remains promising but overfit-risk; missing independent dates and active rolling windows are the blocker."
      }
    },
    recommendation: rankRecommendation(strategies),
    safety,
    authority
  };

  assertSafeReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    status: "failed",
    diagnostic: "strategy_detector_blocker_distribution_audit",
    error: error instanceof Error ? error.message : String(error),
    safety,
    authority
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
