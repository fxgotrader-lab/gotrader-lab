#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ifvg-performance-test");
const sourceFiles = ["ictIfvgTypes.ts", "ictIfvg.ts"];
const reportPath = path.join(projectRoot, "docs", "ifvg-performance-audit.md");

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const requestedLookbackDays = Number(process.env.IFVG_LOOKBACK_DAYS || 90);
const entryTimeframes = (process.env.IFVG_TIMEFRAMES || "5m,15m").split(",").map((item) => item.trim()).filter(Boolean);
const fetchTimeframes = [...new Set([...entryTimeframes, "1h"])];
const chunkDays = Number(process.env.IFVG_CHUNK_DAYS || 14);
const limitPerChunk = Math.max(1, Math.min(5000, Number(process.env.IFVG_CHUNK_LIMIT || 5000)));
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 12000);
const sliceCandlesByTimeframe = { "5m": Number(process.env.IFVG_5M_SLICE_CANDLES || 160), "15m": Number(process.env.IFVG_15M_SLICE_CANDLES || 120) };
const lookaheadByTimeframe = { "5m": Number(process.env.IFVG_5M_LOOKAHEAD_CANDLES || 72), "15m": Number(process.env.IFVG_15M_LOOKAHEAD_CANDLES || 48) };
const evalStrideByTimeframe = {
  "5m": Math.max(1, Number(process.env.IFVG_5M_EVAL_STRIDE || 6)),
  "15m": Math.max(1, Number(process.env.IFVG_15M_EVAL_STRIDE || 3))
};

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
  realOrderPlaced: false,
  brokerMutation: false
};

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

const round = (value, decimals = 4) => Number(Number.isFinite(value) ? value.toFixed(decimals) : 0);
const average = (values) => (values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 4) : 0);
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? round(sorted[midpoint], 4) : round((sorted[midpoint - 1] + sorted[midpoint]) / 2, 4);
};
const countBy = (values, selector) => {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
};

const endpoint = (pathName, params = {}) => {
  const url = new URL(`${bridgeUrl}/${pathName.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
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
      payload: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text()
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

const normalizeMt5Candles = ({ candles = [], timeframe }) => {
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
      id: `mt5_ifvg_${brokerSymbol}_${timeframe}_${parseCandleTime(candle)}_${index}`,
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
  while (cursor < end && windows.length < 120) {
    const next = Math.min(cursor + chunkMillis, end);
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchLatestAnchorTimestamp() {
  const latest = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe: "5m",
    limit: 1000
  }));
  if (!latest.ok) throw new Error(`Latest MT5 anchor candles returned HTTP ${latest.status}`);
  const latestCandles = Array.isArray(latest.payload?.candles) ? latest.payload.candles : [];
  const lastTimestamp = latest.payload?.lastTimestamp ?? latestCandles.at(-1)?.timestamp;
  if (!lastTimestamp) throw new Error("Latest MT5 anchor candles did not include a last timestamp.");
  return lastTimestamp;
}

async function fetchChunkedCandles(timeframe, anchorTimestamp) {
  const rawCandles = [];
  const chunks = [];
  for (const window of dateWindows(anchorTimestamp)) {
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
    chunks.push({ from: window.from, to: window.to, returnedCount: Number(payload.returnedCount ?? chunkCandles.length ?? 0) });
  }
  const candles = normalizeMt5Candles({ candles: rawCandles, timeframe });
  return {
    timeframe,
    candles,
    chunks,
    candleCount: candles.length,
    firstTimestamp: candles[0]?.timestamp,
    lastTimestamp: candles.at(-1)?.timestamp,
    availableLookbackDays:
      candles[0]?.timestamp && candles.at(-1)?.timestamp
        ? round((Date.parse(candles.at(-1).timestamp) - Date.parse(candles[0].timestamp)) / 86_400_000, 2)
        : 0
  };
}

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const nyParts = (timestamp) => {
  const parts = Object.fromEntries(nyFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute ?? "0");
  return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, minuteOfDay: hour * 60 + minute };
};

const sessionBucket = (minuteOfDay) => {
  if (minuteOfDay >= 180 && minuteOfDay < 300) return "london_open";
  if (minuteOfDay >= 570 && minuteOfDay < 660) return "new_york_open";
  if (minuteOfDay >= 570 && minuteOfDay < 960) return "other_rth";
  return "outside_rth";
};

const upperBoundTimestamp = (candles, cutoff) => {
  let left = 0;
  let right = candles.length;
  while (left < right) {
    const midpoint = Math.floor((left + right) / 2);
    if (Date.parse(candles[midpoint].timestamp) <= cutoff) {
      left = midpoint + 1;
    } else {
      right = midpoint;
    }
  }
  return left;
};

const candlesBefore = (candles, timestamp, maxCount) => {
  const cutoff = Date.parse(timestamp);
  const end = upperBoundTimestamp(candles, cutoff);
  return candles.slice(Math.max(0, end - maxCount), end);
};

const contextFor = ({ depthsByTimeframe, entryTimeframe, timestamp }) => {
  const context = {};
  if (entryTimeframe === "5m") {
    context["15m"] = candlesBefore(depthsByTimeframe.get("15m")?.candles ?? [], timestamp, 96);
    context["1h"] = candlesBefore(depthsByTimeframe.get("1h")?.candles ?? [], timestamp, 96);
  }
  if (entryTimeframe === "15m") {
    context["1h"] = candlesBefore(depthsByTimeframe.get("1h")?.candles ?? [], timestamp, 96);
  }
  return context;
};

const simulateOutcome = ({ candles, candidate, signalIndex, timeframe }) => {
  if (!candidate.canCreateValidationChainEntry || candidate.side === "flat") return "no_trade";
  const lookahead = lookaheadByTimeframe[timeframe] ?? 72;
  const future = candles.slice(signalIndex + 1, signalIndex + 1 + lookahead);
  if (!future.length) return "insufficient_data";
  for (const candle of future) {
    if (candidate.side === "long") {
      const invalidationHit = candle.low <= candidate.stop;
      const targetHit = candle.high >= candidate.target;
      if (invalidationHit && targetHit) return "invalidation_first";
      if (targetHit) return "target_first";
      if (invalidationHit) return "invalidation_first";
    }
    if (candidate.side === "short") {
      const invalidationHit = candle.high >= candidate.stop;
      const targetHit = candle.low <= candidate.target;
      if (invalidationHit && targetHit) return "invalidation_first";
      if (targetHit) return "target_first";
      if (invalidationHit) return "invalidation_first";
    }
  }
  return "stalled";
};

const compactCandidate = ({ candidate, timeframe, signalIndex, outcome, tradingDate, session }) => ({
  key: [timeframe, candidate.originalFvgCandle?.timestamp, candidate.inversionCandle?.timestamp, candidate.retestCandle?.timestamp, candidate.side].join("|"),
  tradingDate,
  timeframe,
  session,
  side: candidate.side,
  outcome,
  rr: candidate.rr,
  signalIndex,
  originalFvgDirection: candidate.originalFvgDirection,
  htfAlignment: candidate.htfAlignment,
  retestTimestamp: candidate.retestCandle?.timestamp,
  blocker: candidate.blockers[0],
  canCreateValidationChainEntry: candidate.canCreateValidationChainEntry,
  authority: candidate.authority
});

const summarizeBasic = (candidates) => {
  const targetFirst = candidates.filter((candidate) => candidate.outcome === "target_first").length;
  const invalidationFirst = candidates.filter((candidate) => candidate.outcome === "invalidation_first").length;
  const stalled = candidates.filter((candidate) => candidate.outcome === "stalled").length;
  const insufficientData = candidates.filter((candidate) => candidate.outcome === "insufficient_data").length;
  const rrValues = candidates.map((candidate) => candidate.rr).filter(Number.isFinite);
  return {
    count: candidates.length,
    targetFirst,
    invalidationFirst,
    stalled,
    insufficientData,
    targetFirstRate: candidates.length ? round(targetFirst / candidates.length, 4) : 0,
    invalidationFirstRate: candidates.length ? round(invalidationFirst / candidates.length, 4) : 0,
    averageRR: average(rrValues),
    medianRR: median(rrValues)
  };
};

const summarizeCandidates = (candidates) => ({
  ...summarizeBasic(candidates),
  uniqueTradingDates: Object.keys(countBy(candidates, (candidate) => candidate.tradingDate)).length,
  byTimeframe: Object.fromEntries(entryTimeframes.map((timeframe) => [timeframe, summarizeBasic(candidates.filter((candidate) => candidate.timeframe === timeframe))])),
  bySession: Object.fromEntries(["london_open", "new_york_open", "other_rth", "outside_rth"].map((session) => [session, summarizeBasic(candidates.filter((candidate) => candidate.session === session))])),
  bySide: Object.fromEntries(["long", "short"].map((side) => [side, summarizeBasic(candidates.filter((candidate) => candidate.side === side))]))
});

const rollingWindows = (firstTimestamp, lastTimestamp) => {
  const start = Date.parse(firstTimestamp);
  const end = Date.parse(lastTimestamp);
  const windowMs = 30 * 86_400_000;
  const stepMs = 15 * 86_400_000;
  const windows = [];
  for (let cursor = start; cursor + windowMs <= end + 1; cursor += stepMs) {
    windows.push({ from: cursor, to: cursor + windowMs });
  }
  return windows;
};

const rollingSummary = ({ candidates, firstTimestamp, lastTimestamp }) => {
  const rows = rollingWindows(firstTimestamp, lastTimestamp).map((window, index) => {
    const scoped = candidates.filter((candidate) => {
      const value = Date.parse(`${candidate.tradingDate}T12:00:00.000Z`);
      return value >= window.from && value < window.to;
    });
    return { window: index + 1, from: new Date(window.from).toISOString().slice(0, 10), to: new Date(window.to).toISOString().slice(0, 10), ...summarizeBasic(scoped) };
  });
  return { windowCount: rows.length, activeRollingWindows: rows.filter((row) => row.count > 0).length, windows: rows };
};

const oosSummary = (candidates) => {
  if (candidates.length < 20) return { verdict: "insufficient_data", firstHalf: summarizeBasic([]), secondHalf: summarizeBasic([]) };
  const sorted = candidates.slice().sort((left, right) => `${left.tradingDate}|${left.retestTimestamp}`.localeCompare(`${right.tradingDate}|${right.retestTimestamp}`));
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = summarizeBasic(sorted.slice(0, midpoint));
  const secondHalf = summarizeBasic(sorted.slice(midpoint));
  const verdict =
    secondHalf.count < 5
      ? "insufficient_second_half"
      : secondHalf.targetFirstRate < 0.4 || secondHalf.targetFirstRate < firstHalf.targetFirstRate * 0.6
        ? "degraded"
        : "passed";
  return { verdict, firstHalf, secondHalf };
};

const classifyRobustness = ({ summary, rolling, oos, blockerCounts, totalEvaluated }) => {
  if (summary.count === 0) return "too_strict";
  if (summary.count < 20) return "insufficient_data";
  if (summary.uniqueTradingDates < 3 || rolling.activeRollingWindows < 2) return "promising_but_unstable";
  if (summary.averageRR < 2 || summary.medianRR < 2) return "no_edge";
  if (oos.verdict === "degraded" || oos.verdict === "failed") return "rejected";
  if (summary.targetFirstRate >= 0.55 && summary.invalidationFirstRate <= 0.35) return "paper_watchlist_candidate";
  const validRate = totalEvaluated ? summary.count / totalEvaluated : 0;
  if (validRate > 0.08 && summary.targetFirstRate < 0.45) return "too_broad";
  if ((blockerCounts["FVG was never fully inverted."] ?? 0) > summary.count * 10) return "too_strict";
  return "no_edge";
};

const assertSafeReport = (report) => {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");
  assert.equal(report.safety.realOrderPlaced, false);
  assert.equal(report.safety.brokerMutation, false);
};

const pct = (value) => `${(value * 100).toFixed(2)}%`;

function writeMarkdownReport(report) {
  const tfRows = report.source.timeframes
    .map((row) => `| ${row.timeframe} | ${row.candleCount.toLocaleString()} | ${row.chunkCount} | ${row.availableLookbackDays} days | ${row.dataDepthStatus} |`)
    .join("\n");
  const blockerRows = report.detectorFunnel.topBlockers.length
    ? report.detectorFunnel.topBlockers.map((row) => `| ${row.reason} | ${row.count.toLocaleString()} |`).join("\n")
    : "| none | 0 |";
  const segmentRows = [
    ["All IFVG", report.performance],
    ...Object.entries(report.performance.byTimeframe).map(([key, value]) => [key, value]),
    ...Object.entries(report.performance.bySide).map(([key, value]) => [key, value]),
    ...Object.entries(report.performance.bySession).map(([key, value]) => [key, value])
  ].map(([label, value]) => `| ${label} | ${value.count} | ${pct(value.targetFirstRate)} | ${pct(value.invalidationFirstRate)} | ${value.stalled} | ${value.averageRR} | ${value.medianRR} |`).join("\n");
  const rollingRows = report.rollingOos.windows.length
    ? report.rollingOos.windows.map((row) => `| ${row.window} | ${row.from} to ${row.to} | ${row.count} | ${pct(row.targetFirstRate)} | ${pct(row.invalidationFirstRate)} |`).join("\n")
    : "| none | n/a | 0 | 0.00% | 0.00% |";

  const markdown = `# IFVG Performance Audit

Generated from \`npm.cmd run test:ifvg-performance\` on explicit MT5 read-only history.

## Scope

- Strategy: \`ifvg_v1\`
- Source: MT5 read-only CFD/proxy candles
- Requested symbol: \`${requestedSymbol}\`
- Broker symbol: \`${brokerSymbol}\`
- Authority: \`executionAuthority none\`, \`brokerAuthority none\`, \`readinessOverrideAuthority none\`
- Data policy: raw candles stayed internal to the CLI diagnostic; the report uses compact counts only.

## Data Depth

| Timeframe | Candles | Chunks | Lookback | Status |
|---|---:|---:|---:|---|
${tfRows}

${report.source.cfdProxyWarning}

## Detector Funnel

| Metric | Count |
|---|---:|
| Evaluated windows | ${report.detectorFunnel.totalEvaluatedWindows.toLocaleString()} |
| Setup-condition hits | ${report.detectorFunnel.setupConditionHits.toLocaleString()} |
| Blocked candidates | ${report.detectorFunnel.blockedCandidates.toLocaleString()} |
| No-trade windows | ${report.detectorFunnel.noTrade.toLocaleString()} |
| Insufficient-data windows | ${report.detectorFunnel.insufficientData.toLocaleString()} |
| Valid replay candidates | ${report.detectorFunnel.validCandidates.toLocaleString()} |

Top blockers:

| Blocker | Count |
|---|---:|
${blockerRows}

## Performance Summary

| Segment | Candidates | Target-first | Invalidation-first | Stalled | Avg RR | Median RR |
|---|---:|---:|---:|---:|---:|---:|
${segmentRows}

## Rolling / OOS

| Window | Dates | Candidates | Target-first | Invalidation-first |
|---|---|---:|---:|---:|
${rollingRows}

First half:
- Candidates: ${report.rollingOos.firstHalf.count}
- Target-first: ${pct(report.rollingOos.firstHalf.targetFirstRate)}
- Invalidation-first: ${pct(report.rollingOos.firstHalf.invalidationFirstRate)}

Second half:
- Candidates: ${report.rollingOos.secondHalf.count}
- Target-first: ${pct(report.rollingOos.secondHalf.targetFirstRate)}
- Invalidation-first: ${pct(report.rollingOos.secondHalf.invalidationFirstRate)}

OOS verdict: \`${report.rollingOos.oosVerdict}\`.

## Robustness Classification

\`${report.robustnessClassification}\`

## Promotion Decision

${report.promotionDecision}

## Recommendation

IFVG v1 is now measurable as an executable research detector. Treat strategy rejection as a valid outcome. Only consider a narrower variant if this audit shows an independent-date, OOS-stable paper-watchlist signal. Recognition alone is not evidence.

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
  compileForNode();
  const { evaluateIctIfvg } = await import(pathToFileURL(path.join(outRoot, "ictIfvg.mjs")).href);
  const anchorTimestamp = await fetchLatestAnchorTimestamp();
  const depths = [];
  for (const timeframe of fetchTimeframes) {
    depths.push(await fetchChunkedCandles(timeframe, anchorTimestamp));
  }
  const depthsByTimeframe = new Map(depths.map((depth) => [depth.timeframe, depth]));

  const candidatesByKey = new Map();
  const diagnostics = {
    totalEvaluatedWindows: 0,
    setupConditionHits: 0,
    blockedCandidates: 0,
    noTrade: 0,
    insufficientData: 0,
    blockerDistribution: {}
  };

  for (const timeframe of entryTimeframes) {
    const depth = depthsByTimeframe.get(timeframe);
    if (!depth) continue;
    const sliceSize = sliceCandlesByTimeframe[timeframe] ?? 120;
    const stride = evalStrideByTimeframe[timeframe] ?? 1;
    const startIndex = Math.max(0, Math.min(sliceSize - 1, depth.candles.length - 1));
    for (let index = startIndex; index < depth.candles.length; index += stride) {
      const candle = depth.candles[index];
      const parts = nyParts(candle.timestamp);
      const session = sessionBucket(parts.minuteOfDay);
      diagnostics.totalEvaluatedWindows += 1;
      const slice = depth.candles.slice(Math.max(0, index - sliceSize), index + 1);
      const contextCandles = contextFor({ depthsByTimeframe, entryTimeframe: timeframe, timestamp: candle.timestamp });
      const candidate = evaluateIctIfvg({
        candles: slice,
        contextCandles,
        sourceProvider: "mt5_read_only",
        sourceFingerprint: `mt5|${requestedSymbol}|${brokerSymbol}|${timeframe}|${depth.candleCount}`,
        requestedSymbol,
        brokerSymbol,
        timeframe,
        generatedAt: candle.timestamp
      });
      if (candidate.originalFvgCandle) diagnostics.setupConditionHits += 1;
      if (candidate.status === "needs_more_data") diagnostics.insufficientData += 1;
      if (candidate.status === "no_trade") diagnostics.noTrade += 1;
      if (!candidate.canCreateValidationChainEntry) {
        diagnostics.blockedCandidates += 1;
        const reason = candidate.blockers[0] ?? candidate.missingConditions[0] ?? candidate.status;
        diagnostics.blockerDistribution[reason] = (diagnostics.blockerDistribution[reason] ?? 0) + 1;
        continue;
      }
      const outcome = simulateOutcome({ candles: depth.candles, candidate, signalIndex: index, timeframe });
      const compact = compactCandidate({ candidate, timeframe, signalIndex: index, outcome, tradingDate: parts.dayKey, session });
      if (!candidatesByKey.has(compact.key)) candidatesByKey.set(compact.key, compact);
    }
  }

  const candidates = [...candidatesByKey.values()];
  const entryDepths = entryTimeframes.map((timeframe) => depthsByTimeframe.get(timeframe)).filter(Boolean);
  const firstTimestamp = entryDepths.map((depth) => depth.firstTimestamp).filter(Boolean).sort()[0];
  const lastTimestamp = entryDepths.map((depth) => depth.lastTimestamp).filter(Boolean).sort().at(-1);
  const performance = summarizeCandidates(candidates);
  const rolling = rollingSummary({ candidates, firstTimestamp, lastTimestamp });
  const oos = oosSummary(candidates);
  const robustnessClassification = classifyRobustness({
    summary: performance,
    rolling,
    oos,
    blockerCounts: diagnostics.blockerDistribution,
    totalEvaluated: diagnostics.totalEvaluatedWindows
  });
  const promotionDecision =
    robustnessClassification === "paper_watchlist_candidate"
      ? "IFVG may be tracked as paper-watchlist research only; Paper-Demo remains blocked until the full deterministic checklist passes."
      : "Do not promote IFVG; keep replay-required/research-only until replay, OOS, evidence, maturity, and checklist gates improve.";

  const report = {
    status: "passed",
    diagnostic: "ifvg_performance_90d",
    generatedAt: new Date().toISOString(),
    source: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      requestedLookbackDays,
      evaluationStride: evalStrideByTimeframe,
      timeframes: depths.map((depth) => ({
        timeframe: depth.timeframe,
        candleCount: depth.candleCount,
        chunkCount: depth.chunks.length,
        availableLookbackDays: depth.availableLookbackDays,
        firstTimestamp: depth.firstTimestamp,
        lastTimestamp: depth.lastTimestamp,
        dataDepthStatus: depth.availableLookbackDays >= requestedLookbackDays * 0.8 ? "sufficient" : "limited"
      })),
      cfdProxyWarning: "USTECH is MT5 read-only CFD/proxy data for requested MNQ, not CME futures truth."
    },
    detectorFunnel: {
      totalEvaluatedWindows: diagnostics.totalEvaluatedWindows,
      setupConditionHits: diagnostics.setupConditionHits,
      blockedCandidates: diagnostics.blockedCandidates,
      noTrade: diagnostics.noTrade,
      insufficientData: diagnostics.insufficientData,
      validCandidates: performance.count,
      topBlockers: Object.entries(diagnostics.blockerDistribution)
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10)
    },
    performance,
    rollingOos: {
      oosVerdict: oos.verdict,
      firstHalf: oos.firstHalf,
      secondHalf: oos.secondHalf,
      activeRollingWindows: rolling.activeRollingWindows,
      rollingWindowCount: rolling.windowCount,
      windows: rolling.windows
    },
    gates: {
      minimumUniqueDates: 3,
      minimumActiveRollingWindows: 2,
      minimumValidCandidates: 20,
      minimumRR: 2,
      noMockOrSampleSource: true,
      paperDemoBlockedIfOosDegrades: oos.verdict === "degraded" || oos.verdict === "failed"
    },
    robustnessClassification,
    promotionDecision,
    safety,
    authority
  };
  assertSafeReport(report);
  writeMarkdownReport(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const report = {
    status: "failed",
    diagnostic: "ifvg_performance_90d",
    error: error instanceof Error ? error.message : String(error),
    promotionDecision: "Do not promote IFVG; diagnostic did not complete.",
    safety,
    authority
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
