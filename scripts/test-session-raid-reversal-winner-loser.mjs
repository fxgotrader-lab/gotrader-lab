#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const ictRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "session-raid-reversal-winner-loser");

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || process.env.MT5_READONLY_DEFAULT_SYMBOL || "USTECH";
const lookbackDays = Number(process.env.SESSION_RAID_EVIDENCE_DAYS || process.env.MT5_READONLY_DEPTH_DAYS || 90);
const chunkDays = Number(process.env.SESSION_RAID_EVIDENCE_CHUNK_DAYS || process.env.MT5_READONLY_DEPTH_CHUNK_DAYS || 10);
const timeoutMs = Number(process.env.MT5_READONLY_TEST_TIMEOUT_MS || 15000);
const timingZone = "America/New_York";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesIncluded: false,
  rawSnapshotsIncluded: false,
  secretsIncluded: false,
  accountDataIncluded: false,
  orderDataIncluded: false,
  positionDataIncluded: false
};

const sourceFiles = [
  { root: ictRoot, file: "ictTradeConstructionTypes.ts" },
  { root: ictRoot, file: "ictTradeConstruction.ts" },
  { root: ictRoot, file: "ictSessionRaidReversalTypes.ts" },
  { root: ictRoot, file: "ictSessionRaidReversal.ts" }
];

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, decimals = 2) => finite(value) ? Number(value.toFixed(decimals)) : undefined;
const compactString = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const { root, file } of sourceFiles) {
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
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const endpoint = (route, params = {}) => {
  const url = new URL(`${bridgeUrl}/${route.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const fetchWithTimeout = async (url) => {
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
};

const parseTime = (bar) => {
  const parsed = Date.parse(bar?.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(bar?.time) ? bar.time * 1000 : 0;
};

const normalizeBars = (items = []) => {
  const seen = new Set();
  return items
    .filter((bar) =>
      bar &&
      typeof bar === "object" &&
      Boolean(bar.timestamp) &&
      Number.isFinite(Number(bar.open)) &&
      Number.isFinite(Number(bar.high)) &&
      Number.isFinite(Number(bar.low)) &&
      Number.isFinite(Number(bar.close))
    )
    .sort((left, right) => parseTime(left) - parseTime(right))
    .filter((bar) => {
      const key = parseTime(bar);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((bar) => ({
      timestamp: bar.timestamp,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.tickVolume ?? bar.volume ?? 0)
    }));
};

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: timingZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const localParts = (timestamp) => {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    dateKey,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    label: `${dateKey} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${timingZone}`
  };
};

const addDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp) => {
  const parts = localParts(timestamp);
  return parts.minuteOfDay >= 20 * 60 ? addDays(parts.dateKey, 1) : parts.dateKey;
};

const daysBetween = (first, last) => {
  if (!first || !last) return 0;
  const span = Date.parse(last) - Date.parse(first);
  return Number.isFinite(span) ? Number((Math.max(0, span) / 86400000).toFixed(2)) : 0;
};

const dateWindows = (endTimestamp) => {
  const end = endTimestamp ? new Date(endTimestamp) : new Date();
  const start = new Date(end.getTime() - lookbackDays * 86400000);
  const chunkMillis = Math.max(1, chunkDays) * 86400000;
  const windows = [];
  let cursor = start.getTime();
  while (cursor < end.getTime() && windows.length < 80) {
    const next = Math.min(cursor + chunkMillis, end.getTime());
    windows.push({ from: new Date(cursor).toISOString(), to: new Date(next).toISOString() });
    cursor = next;
  }
  return windows;
};

async function fetchLatestBars(timeframe, limit = 5000) {
  const response = await fetchWithTimeout(endpoint("candles", {
    requestedSymbol,
    symbol: brokerSymbol,
    timeframe,
    limit
  }));
  const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
  return normalizeBars(Array.isArray(payload.candles) ? payload.candles : []);
}

async function fetchRangeBars(timeframe, endTimestamp) {
  const windows = dateWindows(endTimestamp);
  const chunkResults = await Promise.all(
    windows.map(async (window) => {
      try {
        const response = await fetchWithTimeout(endpoint("candles/range", {
          requestedSymbol,
          symbol: brokerSymbol,
          timeframe,
          from: window.from,
          to: window.to,
          limit: 5000
        }));
        const payload = response.payload && typeof response.payload === "object" ? response.payload : {};
        return {
          window,
          ok: response.ok,
          status: response.status,
          sourceMethod: payload.sourceMethod,
          connectionStatus: payload.connectionStatus,
          missingEvidence: payload.missingEvidence ?? [],
          bars: normalizeBars(Array.isArray(payload.candles) ? payload.candles : [])
        };
      } catch (error) {
        return {
          window,
          ok: false,
          status: 0,
          missingEvidence: [error instanceof Error ? error.message : String(error)],
          bars: []
        };
      }
    })
  );
  const bars = normalizeBars(chunkResults.flatMap((chunk) => chunk.bars));
  return {
    timeframe,
    bars,
    summary: {
      provider: "mt5_read_only",
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedLookbackDays: lookbackDays,
      requestedChunkDays: chunkDays,
      requestedChunkCount: windows.length,
      completedChunkCount: chunkResults.filter((chunk) => chunk.ok).length,
      compactBarCount: bars.length,
      firstTimestamp: bars[0]?.timestamp,
      lastTimestamp: bars.at(-1)?.timestamp,
      availableLookbackDays: daysBetween(bars[0]?.timestamp, bars.at(-1)?.timestamp),
      dataDepthStatus: daysBetween(bars[0]?.timestamp, bars.at(-1)?.timestamp) >= lookbackDays * 0.8
        ? "sufficient"
        : bars.length ? "limited" : "unavailable",
      rangeEndpointAvailable: chunkResults.some((chunk) => chunk.ok),
      limitationReason: bars.length
        ? undefined
        : chunkResults.find((chunk) => chunk.missingEvidence.length)?.missingEvidence[0] ?? "MT5 range history returned no compact bars."
    }
  };
}

const countBy = (items, selector) => {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1]));
};

const groupByTradingDate = (bars) => {
  const groups = new Map();
  for (const bar of bars) {
    const key = tradingDateFor(bar.timestamp);
    const group = groups.get(key) ?? [];
    group.push(bar);
    groups.set(key, group);
  }
  return groups;
};

const dateWindowFor = (dateKey, lookbackTradingDays = 8) => {
  const dates = [];
  for (let offset = lookbackTradingDays; offset >= 0; offset -= 1) {
    dates.push(addDays(dateKey, -offset));
  }
  return dates;
};

const barsForDateWindow = (groups, dateKey) =>
  normalizeBars(dateWindowFor(dateKey).flatMap((key) => groups.get(key) ?? []));

const stepFor = (narrative, stepName) =>
  Array.isArray(narrative?.steps) ? narrative.steps.find((step) => step.step === stepName) : undefined;

const findByTimestamp = (bars, timestamp) =>
  timestamp ? bars.find((bar) => bar.timestamp === timestamp) : undefined;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const minutesBetween = (left, right) => {
  if (!left || !right) return undefined;
  const diff = Date.parse(right) - Date.parse(left);
  return Number.isFinite(diff) ? Math.round(diff / 60000) : undefined;
};

const sessionTagFor = (timestamp) => {
  if (!timestamp) return "unknown";
  const minute = localParts(timestamp).minuteOfDay;
  if (minute >= 9 * 60 + 30 && minute < 10 * 60) return "ny_open_0930_1000";
  if (minute >= 10 * 60 && minute < 11 * 60) return "ny_am_1000_1100";
  if (minute >= 11 * 60 && minute < 12 * 60) return "ny_am_late_1100_1200";
  return "outside_ny_am";
};

const avg = (values) => {
  const nums = values.filter(finite);
  return nums.length ? round(nums.reduce((sum, value) => sum + value, 0) / nums.length, 4) : undefined;
};

const median = (values) => {
  const nums = values.filter(finite).slice().sort((left, right) => left - right);
  if (!nums.length) return undefined;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? round(nums[middle], 4) : round((nums[middle - 1] + nums[middle]) / 2, 4);
};

const min = (values) => {
  const nums = values.filter(finite);
  return nums.length ? round(Math.min(...nums), 4) : undefined;
};

const max = (values) => {
  const nums = values.filter(finite);
  return nums.length ? round(Math.max(...nums), 4) : undefined;
};

const rangeSummary = (values) => ({
  min: min(values),
  median: median(values),
  average: avg(values),
  max: max(values)
});

const firstSellSideTargetType = (narrative) => {
  const target = narrative.target;
  const targets = narrative.referenceLevels?.sellSideLiquidityTargets ?? [];
  if (!finite(target) || !targets.length) return undefined;
  const exact = targets.find((item) => finite(item.price) && Math.abs(item.price - target) <= 0.01);
  if (exact) return exact.label;
  const nearest = targets
    .filter((item) => finite(item.price))
    .slice()
    .sort((left, right) => Math.abs(left.price - target) - Math.abs(right.price - target))[0];
  return nearest?.label;
};

const replayOutcomeForShort = (feature, dayBars) => {
  const start = feature.retraceTimestamp ?? feature.fvgCreatedAt;
  if (!start || !finite(feature.entry) || !finite(feature.invalidation) || !finite(feature.target)) {
    return { outcome: "insufficient_future_candles", reason: "missing_entry_invalidation_target_or_start" };
  }
  const future = dayBars.filter((bar) => Date.parse(bar.timestamp) > Date.parse(start));
  if (!future.length) return { outcome: "insufficient_future_candles", reason: "no_future_bars_after_retrace" };
  for (const bar of future) {
    const targetHit = bar.low <= feature.target;
    const invalidationHit = bar.high >= feature.invalidation;
    if (targetHit && invalidationHit) {
      return { outcome: "partial", timestamp: bar.timestamp, localTime: localParts(bar.timestamp).label };
    }
    if (targetHit) return { outcome: "target_first", timestamp: bar.timestamp, localTime: localParts(bar.timestamp).label };
    if (invalidationHit) return { outcome: "invalidation_first", timestamp: bar.timestamp, localTime: localParts(bar.timestamp).label };
  }
  return { outcome: "stalled", reason: "neither_target_nor_invalidation_hit_same_trading_date" };
};

const extractFeature = (narrative, day5m, day15m, sourceFingerprint) => {
  const references = narrative.referenceLevels ?? {};
  const nyRaidStep = stepFor(narrative, "ny_london_high_raid");
  const mssStep = stepFor(narrative, "bearish_mss");
  const fvgStep = stepFor(narrative, "fvg_detected");
  const retraceStep = stepFor(narrative, "fvg_retrace");
  const nyRaidBar = findByTimestamp(day5m, nyRaidStep?.timestamp);
  const mssBar = findByTimestamp(day5m, mssStep?.timestamp);
  const retraceBar = findByTimestamp(day15m, retraceStep?.timestamp) ?? findByTimestamp(day5m, retraceStep?.timestamp);
  const fvg = narrative.fairValueGap ?? {};
  const breaker = narrative.breaker ?? {};
  const asiaHigh = references.asiaRange?.high;
  const asiaLow = references.asiaRange?.low;
  const londonHigh = references.londonHigh?.price;
  const londonLow = references.londonLow?.price;
  const priorDayHigh = references.priorDayHigh?.price;
  const nyRaidHigh = nyRaidStep?.price ?? nyRaidBar?.high;
  const fvgSize = finite(fvg.high) && finite(fvg.low) ? round(fvg.high - fvg.low, 4) : undefined;
  const retraceDepth = finite(fvgSize) && fvgSize > 0 && retraceBar
    ? round(clamp((retraceBar.high - fvg.low) / fvgSize), 4)
    : undefined;
  const stopDistance = finite(narrative.entry) && finite(narrative.invalidation)
    ? round(narrative.invalidation - narrative.entry, 4)
    : undefined;
  const targetDistance = finite(narrative.entry) && finite(narrative.target)
    ? round(narrative.entry - narrative.target, 4)
    : undefined;
  const displacementCandleSize = mssBar ? round(mssBar.high - mssBar.low, 4) : undefined;
  const displacementBodySize = mssBar ? round(Math.abs(mssBar.close - mssBar.open), 4) : undefined;
  const raidMinute = nyRaidStep?.timestamp ? localParts(nyRaidStep.timestamp).minuteOfDay : undefined;
  const feature = {
    candidateId: `nasdaq_london_raid_ny_reversal_v1:${narrative.tradingDate}`,
    strategyId: "nasdaq_london_raid_ny_reversal_v1",
    tradingDate: narrative.tradingDate,
    requestedSymbol,
    brokerSymbol,
    sourceProvider: narrative.sourceProvider,
    sourceFingerprint,
    primaryTimeframe: narrative.primaryTimeframe,
    entryTimeframe: narrative.entryTimeframe,
    side: "short",
    sessionTag: sessionTagFor(nyRaidStep?.timestamp),
    nyRaidTimestamp: nyRaidStep?.timestamp,
    nyRaidLocalTime: nyRaidStep?.timestamp ? localParts(nyRaidStep.timestamp).label : undefined,
    nyRaidMinuteOfDay: raidMinute,
    londonHigh,
    nyRaidHigh: round(nyRaidHigh, 4),
    raidDistanceAboveLondonHigh: finite(nyRaidHigh) && finite(londonHigh) ? round(nyRaidHigh - londonHigh, 4) : undefined,
    raidDistanceAboveAsiaHigh: finite(nyRaidHigh) && finite(asiaHigh) ? round(nyRaidHigh - asiaHigh, 4) : undefined,
    raidDistanceAbovePriorDayHigh: finite(nyRaidHigh) && finite(priorDayHigh) ? round(nyRaidHigh - priorDayHigh, 4) : undefined,
    midnightOpen: references.midnightOpen?.price,
    sundayOpen: references.sundayOpen?.price,
    premiumDiscountRelativeToSundayOpen: references.currentPremiumDiscount,
    asiaRangeSize: finite(asiaHigh) && finite(asiaLow) ? round(asiaHigh - asiaLow, 4) : undefined,
    londonExpansionSize: finite(references.londonRange?.high) && finite(references.londonRange?.low)
      ? round(references.londonRange.high - references.londonRange.low, 4)
      : undefined,
    displacementCandleSize,
    displacementBodySize,
    bearishMssTimestamp: mssStep?.timestamp,
    bearishMssLocalTime: mssStep?.timestamp ? localParts(mssStep.timestamp).label : undefined,
    breakerHigh: breaker.high,
    breakerLow: breaker.low,
    fvgHigh: fvg.high,
    fvgLow: fvg.low,
    fvgSize,
    fvgMidpoint: fvg.midpoint,
    fvgCreatedAt: fvg.createdAt ?? fvgStep?.timestamp,
    retraceTimestamp: retraceStep?.timestamp,
    retraceLocalTime: retraceStep?.timestamp ? localParts(retraceStep.timestamp).label : undefined,
    retraceDepthIntoFvg: retraceDepth,
    entry: narrative.entry,
    invalidation: narrative.invalidation,
    target: narrative.target,
    stopDistance,
    targetDistance,
    rr: narrative.rr,
    firstSellSideTargetType: firstSellSideTargetType(narrative),
    targetBelowLondonLow: finite(narrative.target) && finite(londonLow) ? narrative.target < londonLow : undefined,
    targetBelowAsiaLow: finite(narrative.target) && finite(asiaLow) ? narrative.target < asiaLow : undefined,
    timeFromRaidToMssMinutes: minutesBetween(nyRaidStep?.timestamp, mssStep?.timestamp),
    timeFromMssToFvgRetraceMinutes: minutesBetween(mssStep?.timestamp, retraceStep?.timestamp),
    htfBias: "unknown",
    blockerReasons: narrative.blockers ?? [],
    tradeConstructionBlockers: narrative.tradeConstructionBlockers ?? [],
    authority
  };
  const outcome = replayOutcomeForShort(feature, day5m);
  return {
    ...feature,
    outcome: outcome.outcome,
    outcomeTimestamp: outcome.timestamp,
    outcomeLocalTime: outcome.localTime,
    outcomeReason: outcome.reason,
    timeFromRetraceToOutcomeMinutes: minutesBetween(feature.retraceTimestamp, outcome.timestamp)
  };
};

const summarizeGroup = (items) => ({
  count: items.length,
  uniqueDates: new Set(items.map((item) => item.tradingDate)).size,
  averageRaidDistanceAboveLondonHigh: avg(items.map((item) => item.raidDistanceAboveLondonHigh)),
  medianRaidDistanceAboveLondonHigh: median(items.map((item) => item.raidDistanceAboveLondonHigh)),
  averageDisplacementCandleSize: avg(items.map((item) => item.displacementCandleSize)),
  averageDisplacementBodySize: avg(items.map((item) => item.displacementBodySize)),
  averageFvgSize: avg(items.map((item) => item.fvgSize)),
  medianFvgSize: median(items.map((item) => item.fvgSize)),
  averageRr: avg(items.map((item) => item.rr)),
  medianRr: median(items.map((item) => item.rr)),
  averageStopDistance: avg(items.map((item) => item.stopDistance)),
  averageTargetDistance: avg(items.map((item) => item.targetDistance)),
  averageRetraceDepthIntoFvg: avg(items.map((item) => item.retraceDepthIntoFvg)),
  medianRetraceDepthIntoFvg: median(items.map((item) => item.retraceDepthIntoFvg)),
  sessionDistribution: countBy(items, (item) => item.sessionTag ?? "unknown"),
  targetTypeDistribution: countBy(items, (item) => item.firstSellSideTargetType ?? "unknown"),
  premiumDiscountDistribution: countBy(items, (item) => item.premiumDiscountRelativeToSundayOpen ?? "unknown"),
  htfAlignmentDistribution: countBy(items, (item) => item.htfBias ?? "unknown")
});

const classifyFailureMode = (candidate, winnerProfile) => {
  const reasons = [];
  if (finite(candidate.raidDistanceAboveLondonHigh) && finite(winnerProfile.minRaidDistance) && candidate.raidDistanceAboveLondonHigh < winnerProfile.minRaidDistance * 0.75) {
    reasons.push("raid_too_shallow");
  }
  if (finite(candidate.nyRaidMinuteOfDay) && finite(winnerProfile.maxRaidMinute) && candidate.nyRaidMinuteOfDay > winnerProfile.maxRaidMinute + 30) {
    reasons.push("raid_too_late");
  }
  if (finite(candidate.displacementBodySize) && finite(winnerProfile.medianDisplacementBody) && candidate.displacementBodySize < winnerProfile.medianDisplacementBody * 0.75) {
    reasons.push("weak_displacement");
  }
  if (finite(candidate.fvgSize) && finite(winnerProfile.maxFvgSize) && candidate.fvgSize > winnerProfile.maxFvgSize * 1.25) {
    reasons.push("fvg_too_wide");
  }
  if (finite(candidate.fvgSize) && finite(winnerProfile.minFvgSize) && candidate.fvgSize < winnerProfile.minFvgSize * 0.75) {
    reasons.push("fvg_too_small");
  }
  if (finite(candidate.retraceDepthIntoFvg) && finite(winnerProfile.maxRetraceDepth) && candidate.retraceDepthIntoFvg > Math.min(1, winnerProfile.maxRetraceDepth + 0.1)) {
    reasons.push("retrace_too_deep");
  }
  if (finite(candidate.stopDistance) && finite(winnerProfile.minStopDistance) && candidate.stopDistance < winnerProfile.minStopDistance * 0.75) {
    reasons.push("stop_too_tight");
  }
  if (finite(candidate.targetDistance) && finite(winnerProfile.maxTargetDistance) && candidate.targetDistance > winnerProfile.maxTargetDistance * 1.25) {
    reasons.push("target_too_far");
  }
  if (candidate.firstSellSideTargetType && winnerProfile.targetTypes.length && !winnerProfile.targetTypes.includes(candidate.firstSellSideTargetType)) {
    reasons.push("sell_side_target_too_close_or_wrong");
  }
  if (!candidate.targetBelowLondonLow && !candidate.targetBelowAsiaLow) {
    reasons.push("insufficient_downside_followthrough");
  }
  if (!finite(candidate.breakerHigh) || !finite(candidate.breakerLow)) {
    reasons.push("no_clean_breaker");
  }
  return {
    primaryFailureMode: reasons[0] ?? "insufficient_downside_followthrough",
    failureModeReasons: reasons.length ? reasons : ["insufficient_downside_followthrough"]
  };
};

const filterSummary = (id, label, items, predicate, note) => {
  const retained = items.filter(predicate);
  const outcomeCounts = countBy(retained, (item) => item.outcome);
  const targetFirst = Number(outcomeCounts.target_first ?? 0);
  const invalidationFirst = Number(outcomeCounts.invalidation_first ?? 0);
  return {
    id,
    label,
    candidatesRetained: retained.length,
    targetFirstCount: targetFirst,
    invalidationFirstCount: invalidationFirst,
    targetFirstRate: retained.length ? round(targetFirst / retained.length, 4) : 0,
    uniqueDates: new Set(retained.map((item) => item.tradingDate)).size,
    averageRr: avg(retained.map((item) => item.rr)),
    stillTooFewForWalkForward: targetFirst < 20 || retained.length < 20,
    note
  };
};

const buildFilterTable = (candidates, winners) => {
  const winnerMinRaid = min(winners.map((item) => item.raidDistanceAboveLondonHigh));
  const winnerMedianRaid = median(winners.map((item) => item.raidDistanceAboveLondonHigh));
  const winnerMinFvg = min(winners.map((item) => item.fvgSize));
  const winnerMaxFvg = max(winners.map((item) => item.fvgSize));
  const winnerMedianDisplacement = median(winners.map((item) => item.displacementBodySize));
  const winnerMaxRetrace = max(winners.map((item) => item.retraceDepthIntoFvg));
  const winnerMaxStop = max(winners.map((item) => item.stopDistance));
  const filterSpecs = [
    ["baseline_complete_candidates", "All complete candidates", () => true, "Baseline before filtering."],
    ["min_raid_distance_winner_min", `Raid distance above London High >= winner min (${winnerMinRaid ?? "n/a"})`, (item) => !finite(winnerMinRaid) || item.raidDistanceAboveLondonHigh >= winnerMinRaid, "Data-derived lower raid-distance bound."],
    ["min_raid_distance_winner_median", `Raid distance above London High >= winner median (${winnerMedianRaid ?? "n/a"})`, (item) => !finite(winnerMedianRaid) || item.raidDistanceAboveLondonHigh >= winnerMedianRaid, "Stricter data-derived raid-distance bound."],
    ["fvg_size_within_winner_range", `FVG size within winner range (${winnerMinFvg ?? "n/a"}-${winnerMaxFvg ?? "n/a"})`, (item) => !finite(winnerMinFvg) || !finite(winnerMaxFvg) || (item.fvgSize >= winnerMinFvg && item.fvgSize <= winnerMaxFvg), "Tests whether winner FVG geometry separates losers."],
    ["displacement_body_gte_winner_median", `Displacement body >= winner median (${winnerMedianDisplacement ?? "n/a"})`, (item) => !finite(winnerMedianDisplacement) || item.displacementBodySize >= winnerMedianDisplacement, "Requires stronger bearish delivery candle."],
    ["retrace_depth_lte_winner_max", `Retrace depth <= winner max (${winnerMaxRetrace ?? "n/a"})`, (item) => !finite(winnerMaxRetrace) || item.retraceDepthIntoFvg <= winnerMaxRetrace, "Avoids deeper mitigations than winners showed."],
    ["rr_gte_2_5", "RR >= 2.5", (item) => item.rr >= 2.5, "Minimum RR stress test."],
    ["rr_gte_3_0", "RR >= 3.0", (item) => item.rr >= 3, "Preferred RR stress test."],
    ["stop_distance_lte_winner_max", `Stop distance <= winner max (${winnerMaxStop ?? "n/a"})`, (item) => !finite(winnerMaxStop) || item.stopDistance <= winnerMaxStop, "Avoids wider stops than winners."],
    ["ny_raid_0930_1030", "NY raid between 09:30 and 10:30", (item) => item.nyRaidMinuteOfDay >= 570 && item.nyRaidMinuteOfDay <= 630, "Opening-drive time window."],
    ["prior_or_asia_high_sweep", "Prior-day high OR Asia high sweep", (item) => (item.raidDistanceAbovePriorDayHigh ?? -Infinity) > 0 || (item.raidDistanceAboveAsiaHigh ?? -Infinity) > 0, "At least one buy-side pool swept."],
    ["prior_and_asia_high_sweep", "Prior-day high AND Asia high sweep", (item) => (item.raidDistanceAbovePriorDayHigh ?? -Infinity) > 0 && (item.raidDistanceAboveAsiaHigh ?? -Infinity) > 0, "Requires deeper buy-side raid."],
    ["premium_to_sunday_open", "Premium to MT5-derived Sunday Open", (item) => item.premiumDiscountRelativeToSundayOpen === "premium", "Keeps only premium-side raids."],
    ["target_below_london_low", "Target below London Low", (item) => item.targetBelowLondonLow === true, "Requires target beyond London sell-side."],
    ["target_below_asia_low", "Target below Asia Low", (item) => item.targetBelowAsiaLow === true, "Requires target beyond Asia sell-side."],
    ["htf_bearish_or_neutral_context", "HTF bearish or neutral context", (item) => ["bearish", "neutral"].includes(item.htfBias), "Not currently evaluable when HTF bias is unknown."]
  ];
  return filterSpecs.map(([id, label, predicate, note]) => filterSummary(id, label, candidates, predicate, note));
};

const strongestSeparators = (winners, losers) => {
  const keys = [
    ["raidDistanceAboveLondonHigh", "Raid distance above London High"],
    ["raidDistanceAboveAsiaHigh", "Raid distance above Asia High"],
    ["raidDistanceAbovePriorDayHigh", "Raid distance above prior day high"],
    ["displacementBodySize", "Displacement body size"],
    ["fvgSize", "FVG size"],
    ["retraceDepthIntoFvg", "Retrace depth into FVG"],
    ["stopDistance", "Stop distance"],
    ["targetDistance", "Target distance"],
    ["rr", "RR"],
    ["timeFromRaidToMssMinutes", "Minutes from raid to MSS"],
    ["timeFromMssToFvgRetraceMinutes", "Minutes from MSS to FVG retrace"]
  ];
  return keys
    .map(([key, label]) => {
      const winnerMedian = median(winners.map((item) => item[key]));
      const loserMedian = median(losers.map((item) => item[key]));
      const delta = finite(winnerMedian) && finite(loserMedian) ? round(winnerMedian - loserMedian, 4) : undefined;
      return { key, label, winnerMedian, loserMedian, medianDelta: delta };
    })
    .filter((item) => finite(item.medianDelta))
    .sort((left, right) => Math.abs(right.medianDelta) - Math.abs(left.medianDelta));
};

const safetyScan = (value) => {
  const serialized = JSON.stringify(value);
  return {
    rawCandlesSerialized: /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i.test(serialized),
    secretsSerialized: /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i.test(serialized),
    accountOrderPositionSerialized: /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i.test(serialized),
    authorityNone:
      value.authority?.executionAuthority === "none" &&
      value.authority?.brokerAuthority === "none" &&
      value.authority?.readinessOverrideAuthority === "none"
  };
};

async function main() {
  compileForNode();
  const detector = await import(pathToFileURL(path.join(outRoot, "ictSessionRaidReversal.mjs")).href);

  const statusResponse = await fetchWithTimeout(endpoint("status")).catch((error) => ({
    ok: false,
    status: 0,
    payload: { error: error instanceof Error ? error.message : String(error) }
  }));
  const statusPayload = statusResponse.payload && typeof statusResponse.payload === "object" ? statusResponse.payload : {};
  const latest5m = await fetchLatestBars("5m", 5000);
  const latestEnd = latest5m.at(-1)?.timestamp;
  const depth5m = await fetchRangeBars("5m", latestEnd);
  const depth15m = await fetchRangeBars("15m", latestEnd);
  const bars5m = depth5m.bars.length ? depth5m.bars : latest5m;
  const bars15m = depth15m.bars;
  const sourceFingerprint = [
    "mt5_read_only",
    brokerSymbol,
    requestedSymbol,
    "session_raid_reversal_winner_loser_90d",
    bars5m.length,
    bars5m[0]?.timestamp,
    bars5m.at(-1)?.timestamp
  ].join("|");

  if (!bars5m.length) {
    const output = {
      passed: true,
      status: "blocked_source_unavailable",
      sourceSummary: {
        bridgeUrl,
        requestedSymbol,
        brokerSymbol,
        sourceProvider: "mt5_read_only",
        wrapperResponded: statusResponse.ok,
        bridgeMode: statusPayload.bridgeMode,
        connectionStatus: statusPayload.connectionStatus,
        latestEndpointAvailable: statusPayload.latestEndpointAvailable,
        rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
        blocker: "No MT5 5m compact bars available for winner/loser audit."
      },
      candidateSummary: {
        candidateCount: 0,
        winnerCount: 0,
        loserCount: 0
      },
      authority,
      safety
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const dates = Array.from(new Set(bars5m.map((bar) => tradingDateFor(bar.timestamp)))).sort();
  const evaluableDates = dates.filter((dateKey) => bars5m.filter((bar) => tradingDateFor(bar.timestamp) === dateKey).length >= 48);
  const bars5mByDate = groupByTradingDate(bars5m);
  const bars15mByDate = groupByTradingDate(bars15m);
  const narratives = evaluableDates.map((tradingDate) => {
    const window5m = barsForDateWindow(bars5mByDate, tradingDate);
    const window15m = barsForDateWindow(bars15mByDate, tradingDate);
    return detector.evaluateIctSessionRaidReversal({
      candles5m: window5m,
      candles15m: window15m,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      sourceFingerprint,
      primaryTimeframe: "5m",
      entryTimeframe: "15m",
      htfContext: { M15: [{}], M5: [{}] },
      timingZone,
      tradingDate
    });
  });
  const completeNarratives = narratives.filter((item) => item.status === "complete_bearish_reversal_candidate");
  const features = completeNarratives.map((narrative) => {
    const day5m = bars5mByDate.get(narrative.tradingDate) ?? [];
    const day15m = bars15mByDate.get(narrative.tradingDate) ?? [];
    return extractFeature(narrative, day5m, day15m, sourceFingerprint);
  });
  const winners = features.filter((item) => item.outcome === "target_first");
  const losers = features.filter((item) => item.outcome === "invalidation_first");
  const winnerProfile = {
    minRaidDistance: min(winners.map((item) => item.raidDistanceAboveLondonHigh)),
    maxRaidMinute: max(winners.map((item) => item.nyRaidMinuteOfDay)),
    medianDisplacementBody: median(winners.map((item) => item.displacementBodySize)),
    minFvgSize: min(winners.map((item) => item.fvgSize)),
    maxFvgSize: max(winners.map((item) => item.fvgSize)),
    maxRetraceDepth: max(winners.map((item) => item.retraceDepthIntoFvg)),
    minStopDistance: min(winners.map((item) => item.stopDistance)),
    maxTargetDistance: max(winners.map((item) => item.targetDistance)),
    targetTypes: Array.from(new Set(winners.map((item) => item.firstSellSideTargetType).filter(Boolean)))
  };
  const loserFailureModes = losers.map((candidate) => ({
    candidateId: candidate.candidateId,
    tradingDate: candidate.tradingDate,
    ...classifyFailureMode(candidate, winnerProfile)
  }));
  const failureModeCounts = countBy(loserFailureModes, (item) => item.primaryFailureMode);
  const filterVariants = buildFilterTable(features, winners);
  const rankedFilters = filterVariants
    .filter((item) => item.id !== "baseline_complete_candidates" && item.candidatesRetained > 0)
    .sort((left, right) =>
      right.targetFirstRate - left.targetFirstRate ||
      right.targetFirstCount - left.targetFirstCount ||
      right.candidatesRetained - left.candidatesRetained
    )
    .slice(0, 5);
  const strongestFeatureSeparators = strongestSeparators(winners, losers).slice(0, 8);
  const recommendation =
    winners.length < 20
      ? "Evidence remains insufficient for walk-forward. Keep model research-only and test winner-derived filters on more independent replay candidates before changing detector rules."
      : "Enough winners exist for deeper walk-forward preflight, but no Paper-Demo promotion is implied by this diagnostic alone.";

  const output = {
    passed: true,
    status: "completed",
    sourceSummary: {
      bridgeUrl,
      requestedSymbol,
      brokerSymbol,
      sourceProvider: "mt5_read_only",
      sourceType: "MT5 CFD/proxy",
      wrapperResponded: statusResponse.ok,
      bridgeMode: statusPayload.bridgeMode,
      connectionStatus: statusPayload.connectionStatus,
      latestEndpointAvailable: statusPayload.latestEndpointAvailable,
      rangeEndpointAvailable: statusPayload.rangeEndpointAvailable,
      sourceFingerprint
    },
    rangeDepthSummary: {
      primary5m: depth5m.summary,
      entry15m: depth15m.summary
    },
    candidateSummary: {
      tradingDaysScanned: evaluableDates.length,
      candidateCount: features.length,
      winnerCount: winners.length,
      loserCount: losers.length,
      partialCount: features.filter((item) => item.outcome === "partial").length,
      stalledCount: features.filter((item) => item.outcome === "stalled").length,
      insufficientFutureCount: features.filter((item) => item.outcome === "insufficient_future_candles").length,
      outcomeCounts: countBy(features, (item) => item.outcome),
      targetFirstRate: features.length ? round(winners.length / features.length, 4) : 0,
      walkForwardStillBlocked: winners.length < 20
    },
    winnerLoserComparison: {
      winners: summarizeGroup(winners),
      losers: summarizeGroup(losers),
      strongestFeatureSeparators
    },
    failureModeAudit: {
      failureModeCounts,
      invalidationFirstCandidates: loserFailureModes
    },
    filterVariantTable: filterVariants,
    bestFilterCandidates: rankedFilters,
    completeCandidateFeatures: features,
    recommendation,
    authority,
    safety
  };
  const scan = safetyScan(output);
  output.safetyChecks = scan;
  output.passed = !scan.rawCandlesSerialized && !scan.secretsSerialized && !scan.accountOrderPositionSerialized && scan.authorityNone;
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.passed ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    passed: false,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    authority,
    safety
  }, null, 2));
  process.exitCode = 1;
});
