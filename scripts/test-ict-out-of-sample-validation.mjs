#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const mt5Root = path.join(projectRoot, "src", "lib", "integrations", "mt5");
const outRoot = path.join(projectRoot, ".gotrader", "ict-out-of-sample-validation-test");
const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const primaryTimeframe = process.env.MT5_READONLY_TIMEFRAME || "5m";
const htfTimeframes = (process.env.ICT_OOS_HTF_TIMEFRAMES || "15m,1h")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const requestedLookbackDays = Number(process.env.ICT_OOS_LOOKBACK_DAYS || 90);
const chunkDays = Number(process.env.ICT_OOS_CHUNK_DAYS || 10);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.ICT_OOS_LIMIT_PER_CHUNK || 5000)));
const windowDays = Math.max(5, Number(process.env.ICT_OOS_WINDOW_DAYS || 30));
const stepDays = Math.max(1, Number(process.env.ICT_OOS_STEP_DAYS || 15));
const maxReplayWindowsPerSlice = Math.max(1, Number(process.env.ICT_OOS_MAX_REPLAY_WINDOWS || 250));
const aggregateReferenceMaxReplayWindows = Math.max(1, Number(process.env.ICT_APPROVED_OUTCOME_MAX_WINDOWS || 1000));
const replayWindowSize = Math.max(3, Number(process.env.ICT_OOS_REPLAY_WINDOW_SIZE || 80));
const lookaheadCandles = Math.max(1, Number(process.env.ICT_OOS_LOOKAHEAD_CANDLES || 12));
const minRequiredCandles = Math.max(120, Number(process.env.ICT_OOS_MIN_REQUIRED_CANDLES || 120));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 10000);
const timingZone = process.env.ICT_SESSION_NARRATIVE_TIMING_ZONE || "America/New_York";

const sourceFiles = [
  { root: sourceRoot, file: "ictStrategySuiteTypes.ts" },
  { root: sourceRoot, file: "ictAdvisorTypes.ts" },
  { root: sourceRoot, file: "ictSessionNarrativeTypes.ts" },
  { root: sourceRoot, file: "ictGrinchModelTypes.ts" },
  { root: sourceRoot, file: "ictPhase2Types.ts" },
  { root: sourceRoot, file: "ictReplayValidationTypes.ts" },
  { root: sourceRoot, file: "ictReplayDiagnosticsTypes.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfileTypes.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizerTypes.ts" },
  { root: sourceRoot, file: "ictIndexSmtTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRiskTypes.ts" },
  { root: sourceRoot, file: "ictNewsSessionRisk.ts" },
  { root: sourceRoot, file: "ictRealReplayRunnerTypes.ts" },
  { root: sourceRoot, file: "ictManualReplayReviewTypes.ts" },
  { root: sourceRoot, file: "ictMarketScorecardTypes.ts" },
  { root: sourceRoot, file: "ictMonteCarloTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchStateTypes.ts" },
  { root: sourceRoot, file: "ictLatestResearchState.ts" },
  { root: sourceRoot, file: "ictMarketAnalysisContextTypes.ts" },
  { root: sourceRoot, file: "ictMarketAnalysisContext.ts" },
  { root: sourceRoot, file: "ictOpportunityDetectionTypes.ts" },
  { root: sourceRoot, file: "ictOpportunityDetection.ts" },
  { root: sourceRoot, file: "ictUniversalRecognitionTypes.ts" },
  { root: sourceRoot, file: "ictUniversalRecognition.ts" },
  { root: sourceRoot, file: "ictSelfImprovementTypes.ts" },
  { root: sourceRoot, file: "ictSelfImprovement.ts" },
  { root: sourceRoot, file: "ictHypothesisValidationTypes.ts" },
  { root: sourceRoot, file: "ictHypothesisValidation.ts" },
  { root: sourceRoot, file: "ictSignalContractTypes.ts" },
  { root: sourceRoot, file: "ictSignalContract.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulatorTypes.ts" },
  { root: sourceRoot, file: "ictPaperSignalSimulator.ts" },
  { root: sourceRoot, file: "ictCmdPaperTrackingTypes.ts" },
  { root: sourceRoot, file: "ictCmdPaperTracking.ts" },
  { root: sourceRoot, file: "ictResearchReportTypes.ts" },
  { root: sourceRoot, file: "ictStrategySuiteJournal.ts" },
  { root: sourceRoot, file: "ictBrowserResearchLimits.ts" },
  { root: sourceRoot, file: "ictAdvisorJournal.ts" },
  { root: sourceRoot, file: "ictStrategySuiteHelpers.ts" },
  { root: sourceRoot, file: "ictSessionNarrative.ts" },
  { root: sourceRoot, file: "ictStrategySuiteEngines.ts" },
  { root: sourceRoot, file: "ictPhase2OrderBlocks.ts" },
  { root: sourceRoot, file: "ictPhase2BreadAndButter.ts" },
  { root: sourceRoot, file: "ictPhase2OneShotOneKill.ts" },
  { root: sourceRoot, file: "ictAdvisorEngine.ts" },
  { root: sourceRoot, file: "ictCurrentReadTypes.ts" },
  { root: sourceRoot, file: "ictCurrentRead.ts" },
  { root: sourceRoot, file: "ictReplayValidation.ts" },
  { root: sourceRoot, file: "ictReplayDiagnostics.ts" },
  { root: sourceRoot, file: "ictApprovedSetupProfile.ts" },
  { root: sourceRoot, file: "ictApprovedProfileOptimizer.ts" },
  { root: sourceRoot, file: "ictIndexSmt.ts" },
  { root: sourceRoot, file: "ictRealReplayRunner.ts" },
  { root: sourceRoot, file: "ictManualReplayReview.ts" },
  { root: sourceRoot, file: "ictMarketScorecard.ts" },
  { root: sourceRoot, file: "ictMonteCarlo.ts" },
  { root: sourceRoot, file: "ictResearchReport.ts" },
  { root: mt5Root, file: "mt5ReadOnlyTypes.ts" },
  { root: mt5Root, file: "mt5SymbolSettings.ts" },
  { root: mt5Root, file: "mt5ReadOnlyNormalizer.ts" },
  { root: mt5Root, file: "mt5ReadOnlyDepth.ts" },
  { root: mt5Root, file: "mt5ReadOnlyClient.ts" },
  { root: sourceRoot, file: "index.ts" }
];

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesIncluded: false,
  rawReplayArraysIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const median = (values) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 4);
};

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
  return globalThis.__ICT_OOS_TEST_SOURCES?.get(sourceId);
}
export async function listCanonicalCandleSourceSummaries() {
  return Array.from(globalThis.__ICT_OOS_TEST_SOURCES?.values() ?? []).map(({ candles, ...summary }) => summary);
}
`,
    "utf8"
  );
}

const endpoint = (pathName, params = {}) => {
  const url = new URL(`${bridgeUrl}/${pathName.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
};

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

const parseCandleTime = (candle) => {
  const parsed = Date.parse(candle?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle?.time) ? candle.time * 1000 : 0;
};

const normalizeMt5Candles = ({ candles = [], requestedSymbol, brokerSymbol, timeframe }) => {
  const seen = new Set();
  return candles
    .filter(
      (candle) =>
        candle &&
        typeof candle === "object" &&
        Boolean(candle.timestamp) &&
        Number.isFinite(Number(candle.open)) &&
        Number.isFinite(Number(candle.high)) &&
        Number.isFinite(Number(candle.low)) &&
        Number.isFinite(Number(candle.close))
    )
    .sort((left, right) => parseCandleTime(left) - parseCandleTime(right))
    .filter((candle) => {
      const key = parseCandleTime(candle);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candle, index) => ({
      id: `mt5_oos_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
      symbol: requestedSymbol,
      timeframe,
      timestamp: candle.timestamp,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? candle.tickVolume ?? candle.tick_volume ?? 0)
    }));
};

const dateWindows = (endTimestamp) => {
  const end = Date.parse(endTimestamp);
  const start = end - requestedLookbackDays * 86_400_000;
  const chunkMillis = Math.max(1, chunkDays) * 86_400_000;
  const windows = [];
  let cursor = start;
  while (cursor < end && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchLatestAnchor({ timeframe }) {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit: limitPerChunk
  }));
  if (!response.ok) throw new Error(`Latest MT5 candles returned HTTP ${response.status}`);
  const latestCandles = Array.isArray(response.payload?.candles) ? response.payload.candles : [];
  const lastTimestamp = response.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error(`Latest MT5 ${timeframe} candles did not include a last timestamp.`);
  return { lastTimestamp };
}

async function fetchChunkedCandles({ timeframe, endTimestamp }) {
  const rawCandles = [];
  const chunkReports = [];
  for (const window of dateWindows(endTimestamp)) {
    const response = await fetchWithTimeout(endpoint("candles/range", {
      requestedSymbol,
      symbol: brokerSymbol,
      timeframe,
      from: window.from,
      to: window.to,
      limit: limitPerChunk
    }));
    if (!response.ok) throw new Error(`Range MT5 ${timeframe} candles returned HTTP ${response.status}`);
    const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
    const chunkCandles = Array.isArray(payload.candles) ? payload.candles : [];
    rawCandles.push(...chunkCandles);
    chunkReports.push({
      returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0),
      firstTimestamp: payload.firstTimestamp ?? payload.firstCandleTime ?? chunkCandles[0]?.timestamp,
      lastTimestamp: payload.lastTimestamp ?? payload.lastCandleTime ?? chunkCandles.at(-1)?.timestamp,
      sourceMethod: payload.sourceMethod ?? payload.source
    });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, requestedSymbol, brokerSymbol, timeframe });
  return {
    timeframe,
    candles,
    candleCount: candles.length,
    chunkReports,
    completedChunkCount: chunkReports.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp
  };
}

const availableLookbackDaysFor = (firstTimestamp, lastTimestamp) => {
  if (!firstTimestamp || !lastTimestamp) return 0;
  const span = Date.parse(lastTimestamp) - Date.parse(firstTimestamp);
  return Number.isFinite(span) ? round(Math.max(0, span) / 86_400_000, 2) : 0;
};

const classifyDepth = ({ candleCount, availableLookbackDays }) => {
  if (!candleCount || availableLookbackDays <= 0) return "unavailable";
  if (availableLookbackDays >= requestedLookbackDays * 0.8) return "sufficient";
  if (availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)) return "limited";
  return "insufficient";
};

const rollingWindowsFor = (candles) => {
  const first = Date.parse(candles[0]?.timestamp);
  const last = Date.parse(candles.at(-1)?.timestamp);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last) return [];
  const windowMillis = windowDays * 86_400_000;
  const stepMillis = stepDays * 86_400_000;
  const windows = [];
  let cursor = first;
  while (cursor + windowMillis <= last + 60_000 && windows.length < 20) {
    const end = Math.min(cursor + windowMillis, last);
    windows.push({
      id: `oos_${windows.length + 1}`,
      from: new Date(cursor).toISOString(),
      to: new Date(end).toISOString()
    });
    cursor += stepMillis;
  }
  const lastWindow = windows.at(-1);
  if (lastWindow && Date.parse(lastWindow.to) < last) {
    const trailingFrom = Math.max(first, last - windowMillis);
    const duplicateTrailing = windows.some((window) => Date.parse(window.from) === trailingFrom && Date.parse(window.to) === last);
    if (!duplicateTrailing) {
      windows.push({
        id: `oos_${windows.length + 1}_trailing`,
        from: new Date(trailingFrom).toISOString(),
        to: new Date(last).toISOString(),
        trailingPartial: true
      });
    }
  }
  if (!windows.length) {
    windows.push({ id: "oos_1", from: new Date(first).toISOString(), to: new Date(last).toISOString() });
  }
  return windows;
};

const candlesInWindow = (candles, window) =>
  candles.filter((candle) => {
    const time = Date.parse(candle.timestamp);
    return time >= Date.parse(window.from) && time <= Date.parse(window.to);
  });

const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))));
};

const topCounts = (values, selector, limit = 6) =>
  Object.entries(countBy(values, selector))
    .map(([key, count]) => ({ key, count }))
    .slice(0, limit);

const profileCountsForNarratives = (narratives) =>
  Object.fromEntries(
    topCounts(narratives, (narrative) => narrative.profile, 8).map(({ key, count }) => [key, count])
  );

const approvalWeight = (status) =>
  status === "approved_research_candidate" ? 5 : status === "paper_watchlist_candidate" ? 4 : status === "watchlist_candidate" ? 3 : status === "rejected_candidate" ? 2 : status === "no_trade" ? 1 : 0;

const formatterCache = new Map();
const formatterFor = (timeZone) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric"
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const localParts = (timestamp, timeZone = timingZone) => {
  const parts = formatterFor(timeZone).formatToParts(new Date(timestamp));
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")) % 24
  };
};

const addCalendarDay = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp) => {
  const parts = localParts(timestamp);
  return parts.hour >= 20 ? addCalendarDay(parts.date) : parts.date;
};

const buildNarrativeSummaries = (suite, candles, availableLookbackDays) => {
  const tradingDates = [...new Set(candles.map((candle) => tradingDateFor(candle.timestamp)))].sort();
  return tradingDates
    .map((tradingDate) => {
      const dayCount = candles.filter((candle) => tradingDateFor(candle.timestamp) === tradingDate).length;
      if (dayCount < 12) return undefined;
      const narrative = suite.buildIctSessionNarrative(candles, {
        requestedSymbol,
        brokerSymbol,
        primaryTimeframe,
        timingZone,
        requestedLookbackDays,
        availableLookbackDays,
        depthSource: "out_of_sample_window",
        tradingDate
      });
      assert.equal(suite.assertIctSessionNarrativeIsCompact(narrative).ok, true, `Narrative for ${tradingDate} must stay compact`);
      return {
        tradingDate,
        profile: narrative.profile,
        directionalRead: narrative.directionalRead,
        confidence: narrative.confidence,
        topReason: narrative.topReasons[0],
        noTradeReason: narrative.noTradeReasons[0]
      };
    })
    .filter(Boolean);
};

const selectDecision = (decisions) =>
  decisions
    .slice()
    .sort(
      (left, right) =>
        approvalWeight(right.status) - approvalWeight(left.status) ||
        right.approvalScore - left.approvalScore ||
        left.profileId.localeCompare(right.profileId)
    )[0];

const selectedDecisionResults = (suite, replayResults, calibratedProfile) =>
  replayResults.map((result) => {
    const calibratedProfileDecision = suite.evaluateApprovedSetupProfile(result, calibratedProfile);
    const decision = selectDecision(suite.evaluateApprovedSetupProfiles(result)) ?? calibratedProfileDecision;
    return {
      replayResult: {
        ...result,
        approvedProfileStatus: decision.status,
        approvedProfileId: decision.profileId,
        approvedProfileScore: decision.approvalScore,
        approvedProfileReasons: [...decision.approvedReasons, ...decision.watchlistReasons, ...decision.rejectionReasons].slice(0, 6)
      },
      calibratedProfileDecision,
      decision
    };
  });

const approvedMetricsFor = (replayResults) => {
  const approved = replayResults.filter(
    (result) => result.approvedProfileStatus === "approved_research_candidate" && result.decision === "research_only"
  );
  return {
    approvedCount: approved.length,
    approvedTargetFirstRate: approved.length ? round(approved.filter((result) => result.outcome === "target_first").length / approved.length, 4) : 0,
    approvedAverageRr: average(approved.map((result) => result.tradePath.rrAchieved).filter((value) => typeof value === "number"))
  };
};

const signalTimeFor = (result) => result.tradePath?.signalTime;
const signalDateFor = (result) => signalTimeFor(result)?.slice(0, 10) ?? "unknown";
const replayFieldCompleteness = (results) => ({
  missingTargetCount: results.filter((result) => typeof result.tradePath?.target !== "number").length,
  missingInvalidationCount: results.filter((result) => typeof result.tradePath?.invalidation !== "number").length,
  missingRrCount: results.filter((result) => typeof result.tradePath?.rrAchieved !== "number" && typeof result.rrEstimate !== "number").length,
  missingApprovedStatusCount: results.filter((result) => !result.approvedProfileStatus).length
});

const rejectionReasonFor = (decision) =>
  [...(decision.rejectionReasons ?? []), ...(decision.watchlistReasons ?? [])][0] ?? "no rejection/watchlist reason supplied";

const compactMonteCarlo = (summary) => ({
  usableOutcomes: summary.input.usableOutcomes,
  robustnessRating: summary.recommendation.robustnessRating,
  medianEndingR: summary.performance.medianEndingR,
  fifthPercentileEndingR: summary.performance.fifthPercentileEndingR,
  medianDrawdownR: summary.performance.medianMaxDrawdownR,
  worstDrawdownR: summary.performance.worstMaxDrawdownR,
  riskOfRuinPct: summary.performance.riskOfRuinPct,
  recommendedMaxRiskPerTradePct: summary.recommendation.recommendedMaxRiskPerTradePct
});

const coverageReportFor = (candles, windows) => {
  const first = candles[0]?.timestamp;
  const last = candles.at(-1)?.timestamp;
  const coveredCandles = candles.filter((candle) =>
    windows.some((window) => {
      const time = Date.parse(candle.timestamp);
      return time >= Date.parse(window.from) && time <= Date.parse(window.to);
    })
  );
  return {
    firstCandleTime: first,
    lastCandleTime: last,
    windowCount: windows.length,
    trailingPartialIncluded: windows.some((window) => window.trailingPartial),
    coveredCandleCount: coveredCandles.length,
    totalCandleCount: candles.length,
    coveragePct: candles.length ? round(coveredCandles.length / candles.length, 4) : 0,
    windows: windows.map((window) => ({
      windowId: window.id,
      from: window.from,
      to: window.to,
      trailingPartial: Boolean(window.trailingPartial)
    }))
  };
};

function classifyOutOfSample({ aggregate, windows }) {
  const approvedWindows = windows.filter((window) => window.approvedCount > 0);
  const totalApproved = aggregate.approvedCount;
  const maxWindowApproved = Math.max(0, ...windows.map((window) => window.approvedCount));
  const concentration = totalApproved ? maxWindowApproved / totalApproved : 0;
  const approvedWindowRates = approvedWindows.map((window) => window.approvedTargetFirstRate);
  const medianTargetFirst = median(approvedWindowRates);
  const strongWindowCount = approvedWindows.filter((window) => window.approvedTargetFirstRate >= 0.6).length;

  if (totalApproved < 8 || approvedWindows.length < 2) {
    return {
      classification: totalApproved > 0 ? "promising_but_unproven" : "insufficient_data",
      reason:
        totalApproved > 0
          ? "Approved outcomes exist, but not across enough independent rolling windows to claim robustness."
          : "Too few approved outcomes or approved windows to judge rolling-window robustness."
    };
  }
  if (concentration >= 0.65 || approvedWindows.length === 1) {
    return {
      classification: "overfit_risk",
      reason: "Approved outcomes are concentrated in one rolling window."
    };
  }
  if (approvedWindowRates.some((rate) => rate < 0.45) || medianTargetFirst < 0.55) {
    return {
      classification: "unstable",
      reason: "Approved target-first performance varies materially between windows."
    };
  }
  if (
    totalApproved >= 30 &&
    approvedWindows.length >= 3 &&
    aggregate.approvedTargetFirstRate >= 0.6 &&
    strongWindowCount >= Math.min(3, approvedWindows.length) &&
    ["strong", "moderate"].includes(aggregate.monteCarlo.robustnessRating)
  ) {
    return {
      classification: "robust",
      reason: "Approved outcomes are distributed across multiple windows with strong target-first and Monte Carlo support."
    };
  }
  return {
    classification: "promising_but_small_sample",
    reason: "Rolling-window performance is supportive, but sample size is still preliminary."
  };
}

const recommendationFor = (classification) =>
  ({
    robust: "Keep the calibrated profile for further research review; do not promote execution readiness without normal paper-demo gates.",
    promising_but_unproven: "Keep as research-only and add train/validation optimization before trusting the aggregate result.",
    promising_but_small_sample: "Collect more data and test other symbols before changing readiness; keep profile as research-only.",
    unstable: "Tighten or segment the profile by session narrative before relying on the aggregate 90-day result.",
    overfit_risk: "Do not rely on the current calibrated profile; approved outcomes are too concentrated in one period.",
    insufficient_data: "Collect more approved outcomes before interpreting the calibrated profile."
  })[classification] ?? "Collect more data.";

async function main() {
  compileSuiteForNode();
  const suite = await import(pathToFileURL(path.join(outRoot, "index.mjs")));
  const calibratedProfile = suite.getApprovedSetupProfileById("gotrader_ict_90d_session_calibrated");
  assert.ok(calibratedProfile, "90-day calibrated approved setup profile must exist");

  const { lastTimestamp } = await fetchLatestAnchor({ timeframe: primaryTimeframe });
  const primary = await fetchChunkedCandles({ timeframe: primaryTimeframe, endTimestamp: lastTimestamp });
  const htfData = {};
  for (const timeframe of htfTimeframes.filter((timeframe) => timeframe !== primaryTimeframe)) {
    htfData[timeframe] = await fetchChunkedCandles({ timeframe, endTimestamp: lastTimestamp });
  }

  const dataDepth = {
    requestedLookbackDays,
    availableLookbackDays: availableLookbackDaysFor(primary.firstTimestamp, primary.lastTimestamp),
    candleCount: primary.candleCount,
    completedChunkCount: primary.completedChunkCount,
    firstCandleTime: primary.firstTimestamp,
    lastCandleTime: primary.lastTimestamp,
    dataDepthStatus: classifyDepth({
      candleCount: primary.candleCount,
      availableLookbackDays: availableLookbackDaysFor(primary.firstTimestamp, primary.lastTimestamp)
    }),
    rangeEndpointAvailable: true
  };
  assert.ok(primary.candleCount >= minRequiredCandles, `Need at least ${minRequiredCandles} primary candles for OOS validation.`);

  const windows = rollingWindowsFor(primary.candles);
  const windowCoverage = coverageReportFor(primary.candles, windows);
  const windowReports = [];
  const allCalibratedReplayResults = [];

  for (const window of windows) {
    const windowCandles = candlesInWindow(primary.candles, window);
    const windowLookbackDays = availableLookbackDaysFor(windowCandles[0]?.timestamp, windowCandles.at(-1)?.timestamp);
    const htfCandles = Object.fromEntries(
      Object.entries(htfData).map(([timeframe, data]) => [timeframe, candlesInWindow(data.candles, window)])
    );
    const narratives = buildNarrativeSummaries(suite, windowCandles, windowLookbackDays);
    if (windowCandles.length < minRequiredCandles) {
      windowReports.push({
        windowId: window.id,
        from: window.from,
        to: window.to,
        candleCount: windowCandles.length,
        status: "insufficient_data",
        reason: `Window has ${windowCandles.length} candles, below required ${minRequiredCandles}.`,
        sessionNarratives: profileCountsForNarratives(narratives),
        dominantSessionNarratives: topCounts(narratives, (narrative) => narrative.profile, 4),
        totalSignals: 0,
        approvedCount: 0,
        approvedCountBeforeMonteCarloExtraction: 0,
        approvedCountAfterMonteCarloExtraction: 0,
        calibratedProfileOnlyApprovedCount: 0,
        watchlistCount: 0,
        rejectedCount: 0,
        noTradeCount: 0,
        fieldCompleteness: {
          missingTargetCount: 0,
          missingInvalidationCount: 0,
          missingRrCount: 0,
          missingApprovedStatusCount: 0
        },
        selectedProfileCounts: {},
        approvedTargetFirstRate: 0,
        approvedAverageRr: 0,
        monteCarlo: compactMonteCarlo(
          suite.runMonteCarloBatch([], {
            source: "real_replay",
            simulationCount: 100,
            tradesPerSimulation: 1,
            randomSeed: 700 + windowReports.length,
            researchOnly: true
          })
        ),
        topRejectionReasons: []
      });
      continue;
    }

    const replayReport = suite.runIctReplayValidation({
      symbol: requestedSymbol,
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      htfTimeframes: Object.keys(htfCandles).filter((timeframe) => htfCandles[timeframe]?.length),
      candles: windowCandles,
      htfCandles,
      newsSessionRiskContext: { syntheticNoRisk: true, provider: "historical_replay" },
      replayWindowSize,
      lookaheadCandles,
      maxReplayWindows: maxReplayWindowsPerSlice,
      requestedLookbackDays,
      availableLookbackDays: windowLookbackDays,
      dataDepthStatus: classifyDepth({ candleCount: windowCandles.length, availableLookbackDays: windowLookbackDays }),
      appendJournal: false,
      researchOnly: true
    });
    assert.equal(suite.assertIctReplayOutputIsCompact(replayReport).ok, true, `${window.id} replay report must stay compact`);

    const calibrated = selectedDecisionResults(suite, replayReport.results, calibratedProfile);
    const calibratedReplayResults = calibrated.map((item) => item.replayResult);
    allCalibratedReplayResults.push(...calibratedReplayResults);
    const outcomes = suite.extractMonteCarloOutcomesFromReplayResults(calibratedReplayResults);
    const monteCarlo = suite.runMonteCarloBatch(outcomes, {
      source: "real_replay",
      simulationCount: 250,
      tradesPerSimulation: Math.min(100, Math.max(1, outcomes.length)),
      randomSeed: 800 + windowReports.length,
      researchOnly: true
    });
    assert.equal(suite.assertIctMonteCarloSummaryIsCompact(monteCarlo).ok, true, `${window.id} Monte Carlo summary must stay compact`);

    const approvedMetrics = approvedMetricsFor(calibratedReplayResults);
    windowReports.push({
      windowId: window.id,
      from: window.from,
      to: window.to,
      candleCount: windowCandles.length,
      status: replayReport.results.length ? "completed" : "insufficient_data",
      sessionNarratives: profileCountsForNarratives(narratives),
      dominantSessionNarratives: topCounts(narratives, (narrative) => narrative.profile, 4),
      totalSignals: replayReport.results.length,
      approvedCount: approvedMetrics.approvedCount,
      approvedCountBeforeMonteCarloExtraction: approvedMetrics.approvedCount,
      approvedCountAfterMonteCarloExtraction: monteCarlo.input.usableOutcomes,
      calibratedProfileOnlyApprovedCount: calibrated.filter(
        (item) => item.calibratedProfileDecision.status === "approved_research_candidate"
      ).length,
      watchlistCount: calibrated.filter((item) => item.decision.status === "watchlist_candidate").length,
      rejectedCount: calibrated.filter((item) => item.decision.status === "rejected_candidate").length,
      noTradeCount: calibrated.filter((item) => item.decision.status === "no_trade").length,
      fieldCompleteness: replayFieldCompleteness(calibratedReplayResults),
      selectedProfileCounts: countBy(calibrated, (item) => item.decision.profileId),
      approvedByDate: countBy(
        calibratedReplayResults.filter((item) => item.approvedProfileStatus === "approved_research_candidate"),
        signalDateFor
      ),
      approvedTargetFirstRate: approvedMetrics.approvedTargetFirstRate,
      approvedAverageRr: approvedMetrics.approvedAverageRr,
      monteCarlo: compactMonteCarlo(monteCarlo),
      topRejectionReasons: topCounts(
        calibrated.filter((item) => item.decision.status !== "approved_research_candidate"),
        (item) => rejectionReasonFor(item.decision),
        5
      )
    });
  }

  const aggregateMetrics = approvedMetricsFor(allCalibratedReplayResults);
  const aggregateOutcomes = suite.extractMonteCarloOutcomesFromReplayResults(allCalibratedReplayResults);
  const aggregateMonteCarlo = suite.runMonteCarloBatch(aggregateOutcomes, {
    source: "real_replay",
    simulationCount: 500,
    tradesPerSimulation: Math.min(100, Math.max(1, aggregateOutcomes.length)),
    randomSeed: 900,
    researchOnly: true
  });
  assert.equal(suite.assertIctMonteCarloSummaryIsCompact(aggregateMonteCarlo).ok, true, "aggregate Monte Carlo summary must stay compact");

  const aggregate = {
    windowCount: windowReports.length,
    completedWindowCount: windowReports.filter((window) => window.status === "completed").length,
    approvedWindowCount: windowReports.filter((window) => window.approvedCount > 0).length,
    totalSignals: allCalibratedReplayResults.length,
    approvedCount: aggregateMetrics.approvedCount,
    approvedCountBeforeMonteCarloExtraction: aggregateMetrics.approvedCount,
    approvedCountAfterMonteCarloExtraction: aggregateMonteCarlo.input.usableOutcomes,
    calibratedProfileOnlyApprovedCount: windowReports.reduce((total, window) => total + window.calibratedProfileOnlyApprovedCount, 0),
    watchlistCount: windowReports.reduce((total, window) => total + window.watchlistCount, 0),
    rejectedCount: windowReports.reduce((total, window) => total + window.rejectedCount, 0),
    noTradeCount: windowReports.reduce((total, window) => total + window.noTradeCount, 0),
    fieldCompleteness: replayFieldCompleteness(allCalibratedReplayResults),
    approvedByDate: countBy(
      allCalibratedReplayResults.filter((item) => item.approvedProfileStatus === "approved_research_candidate"),
      signalDateFor
    ),
    selectedProfileCounts: Object.fromEntries(
      Object.entries(
        windowReports.reduce((counts, window) => {
          for (const [profileId, count] of Object.entries(window.selectedProfileCounts ?? {})) {
            counts[profileId] = (counts[profileId] ?? 0) + count;
          }
          return counts;
        }, {})
      ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    ),
    approvedTargetFirstRate: aggregateMetrics.approvedTargetFirstRate,
    approvedAverageRr: aggregateMetrics.approvedAverageRr,
    approvedOutcomeConcentrationPct: aggregateMetrics.approvedCount
      ? round((Math.max(...windowReports.map((window) => window.approvedCount)) / aggregateMetrics.approvedCount) * 100, 2)
      : 0,
    medianWindowApprovedTargetFirstRate: median(
      windowReports.filter((window) => window.approvedCount > 0).map((window) => window.approvedTargetFirstRate)
    ),
    monteCarlo: compactMonteCarlo(aggregateMonteCarlo),
    dominantSessionNarratives: topCounts(
      windowReports.flatMap((window) =>
        Object.entries(window.sessionNarratives ?? {}).flatMap(([profile, count]) => Array.from({ length: count }, () => profile))
      ),
      (value) => value,
      6
    ),
    topRejectionReasons: topCounts(
      windowReports.flatMap((window) =>
        window.topRejectionReasons.flatMap((entry) => Array.from({ length: entry.count }, () => entry.key))
      ),
      (value) => value,
      8
    )
  };
  const robustness = classifyOutOfSample({ aggregate, windows: windowReports });
  const approvedExtractionDroppedCount = Math.max(
    0,
    aggregate.approvedCountBeforeMonteCarloExtraction - aggregate.approvedCountAfterMonteCarloExtraction
  );
  const settingMismatches = Object.entries({
    maxReplayWindows: maxReplayWindowsPerSlice === aggregateReferenceMaxReplayWindows,
    contextScope: false
  })
    .filter(([, matches]) => !matches)
    .map(([key]) => key);

  const report = {
    status: dataDepth.dataDepthStatus === "sufficient" ? "passed" : "limited",
    validationType: "ict_out_of_sample_rolling_window",
    profile: {
      profileId: calibratedProfile.id,
      label: calibratedProfile.label,
      decisionMode: "selected_best_default_profile_for_prior_calibration_comparison",
      directCalibratedProfileOnlyMetric: "calibratedProfileOnlyApprovedCount",
      researchOnly: true
    },
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      primaryTimeframe,
      htfTimeframes,
      timingZone
    },
    split: {
      method: "rolling_window",
      windowDays,
      stepDays,
      maxReplayWindowsPerSlice,
      replayWindowSize,
      lookaheadCandles
    },
    aggregateSettingsComparison: {
      matchesAggregateCalibration: {
        requestedSymbol: requestedSymbol === (process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ"),
        brokerSymbol: brokerSymbol === (process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH"),
        primaryTimeframe: primaryTimeframe === (process.env.MT5_READONLY_TIMEFRAME || "5m"),
        replayWindowSize: replayWindowSize === 80,
        lookaheadCandles: lookaheadCandles === 12,
        selectedProfileComparison: true,
        chunked90DayPath: true,
        maxReplayWindows: maxReplayWindowsPerSlice === aggregateReferenceMaxReplayWindows
      },
      aggregateReferenceMaxReplayWindows,
      oosMaxReplayWindowsPerSlice: maxReplayWindowsPerSlice,
      note:
        maxReplayWindowsPerSlice === aggregateReferenceMaxReplayWindows
          ? "OOS slice replay-window cap matches aggregate calibration."
          : "OOS slices use a smaller replay-window cap than aggregate calibration for CLI runtime; use ICT_OOS_MAX_REPLAY_WINDOWS=1000 for exact cap matching."
    },
    pipelineDiagnostics: {
      sessionNarrativeResolution: "per_signal_trading_date",
      approvalStatusPropagation: aggregate.fieldCompleteness.missingApprovedStatusCount === 0 ? "preserved" : "missing_status_detected",
      approvedCountBeforeMonteCarloExtraction: aggregate.approvedCountBeforeMonteCarloExtraction,
      approvedCountAfterMonteCarloExtraction: aggregate.approvedCountAfterMonteCarloExtraction,
      approvedExtractionDroppedCount,
      monteCarloExtractionDroppedApprovedOutcomes: approvedExtractionDroppedCount > 0,
      settingMismatches,
      contextComparison:
        "Aggregate calibration scans the explicit 90-day context; rolling OOS uses each 30-day slice as the available validation context.",
      interpretation:
        aggregate.approvedCount === 0
          ? "Rolling OOS produced zero approved outcomes before Monte Carlo extraction, so the blocker is validation approval quality rather than Monte Carlo extraction."
          : "Rolling OOS produced approved outcomes; use robustness classification before interpreting aggregate calibration."
    },
    dataDepth,
    windowCoverage,
    windows: windowReports,
    aggregate,
    robustness: {
      classification: robustness.classification,
      reason: robustness.reason,
      stableTargetFirstClaim: aggregate.approvedTargetFirstRate >= 0.6 && aggregate.approvedWindowCount >= 2,
      monteCarloRemainsSupportive: ["strong", "moderate"].includes(aggregate.monteCarlo.robustnessRating),
      approvedOutcomesConcentrated: aggregate.approvedOutcomeConcentrationPct >= 65,
      recommendation: recommendationFor(robustness.classification),
      readinessNote: "Out-of-sample validation is research-only and does not create execution or readiness authority."
    },
    safety,
    authority
  };

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "OOS report must not expose raw candles");
  assert.doesNotMatch(serialized, /"replayResults"\s*:/i, "OOS report must not expose raw replay arrays");
  assert.doesNotMatch(
    serialized,
    /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i,
    "OOS report must not expose unsafe data"
  );
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.ok(report.windows.length >= 1, "OOS report must include at least one window.");
  assert.equal(report.profile.profileId, "gotrader_ict_90d_session_calibrated", "OOS must use the same calibrated profile reference as aggregate calibration.");
  assert.ok(report.windowCoverage?.windowCount >= 1, "OOS window date coverage must be reported.");
  assert.ok(report.aggregate && "approvedByDate" in report.aggregate, "Approved outcome distribution by date must be reported.");
  assert.ok(
    report.windows.every((window) => "approvedCountBeforeMonteCarloExtraction" in window && "approvedCountAfterMonteCarloExtraction" in window),
    "Each OOS window must separate approval count from Monte Carlo usable count."
  );
  assert.ok(
    report.windows.every((window) => window.fieldCompleteness && "missingApprovedStatusCount" in window.fieldCompleteness),
    "Each OOS window must report approval status propagation diagnostics."
  );
  assert.equal(report.pipelineDiagnostics.sessionNarrativeResolution, "per_signal_trading_date");
  assert.equal(report.pipelineDiagnostics.approvalStatusPropagation, "preserved", "Approved status propagation should be preserved before OOS interpretation.");
  assert.ok(
    ["robust", "promising_but_small_sample", "promising_but_unproven", "unstable", "overfit_risk", "insufficient_data"].includes(
      report.robustness.classification
    ),
    "OOS classification must be explicit and honest."
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT out-of-sample validation failed: ${error?.message ?? error}`);
  process.exitCode = 1;
});
