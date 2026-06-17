import { evaluateIctSessionRaidReversal } from "./ictSessionRaidReversal";
import type {
  IctSessionRaidReversalInput,
  IctSessionRaidReversalNarrative,
  IctSessionRaidReversalStepName
} from "./ictSessionRaidReversalTypes";
import type {
  IctSessionRaidReversalV2Evaluation,
  IctSessionRaidReversalV2FailedFilter,
  IctSessionRaidReversalV2Input,
  IctSessionRaidReversalV2Outcome,
  IctSessionRaidReversalV2Thresholds
} from "./ictSessionRaidReversalV2Types";

type CompactCandle = IctSessionRaidReversalInput["candles5m"][number];

export const DEFAULT_ICT_SESSION_RAID_REVERSAL_V2_THRESHOLDS: IctSessionRaidReversalV2Thresholds = {
  minDisplacementBodySize: 35.45,
  minFvgSize: 9.48,
  maxFvgSize: 92.2,
  maxRetraceDepthPercent: 0.75,
  maxRaidDistanceAboveLondonHigh: 81.3,
  maxStopDistance: 60,
  minTargetFeasibilityScore: 0.45,
  maxRrWithoutStrongFeasibility: 4,
  strongFeasibilityScore: 0.7
};

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const defaultZone = "America/New_York";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const sortCandles = (candles: CompactCandle[] = []) =>
  candles
    .filter((candle) =>
      Boolean(candle?.timestamp) &&
      finite(candle.open) &&
      finite(candle.high) &&
      finite(candle.low) &&
      finite(candle.close)
    )
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const localParts = (timestamp: string, timeZone: string) => {
  const parts = Object.fromEntries(
    formatterFor(timeZone).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const dateKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return { dateKey, minuteOfDay: hour * 60 + minute };
};

const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const tradingDateFor = (timestamp: string, timeZone: string) => {
  const parts = localParts(timestamp, timeZone);
  return parts.minuteOfDay >= 20 * 60 ? addDays(parts.dateKey, 1) : parts.dateKey;
};

const stepFor = (narrative: IctSessionRaidReversalNarrative, stepName: IctSessionRaidReversalStepName) =>
  narrative.steps.find((item) => item.step === stepName);

const findByTimestamp = (candles: CompactCandle[], timestamp?: string) =>
  timestamp ? candles.find((candle) => candle.timestamp === timestamp) : undefined;

const rangeSize = (range?: { high?: number; low?: number }) =>
  finite(range?.high) && finite(range?.low) ? Math.max(0, range.high - range.low) : undefined;

const selectedTargetTypeFor = (narrative: IctSessionRaidReversalNarrative) => {
  if (!finite(narrative.target)) return undefined;
  const targets = narrative.referenceLevels.sellSideLiquidityTargets ?? [];
  const exact = targets.find((item) => finite(item.price) && Math.abs(item.price - narrative.target!) <= 0.01);
  if (exact) return exact.label;
  return targets
    .filter((item) => finite(item.price))
    .slice()
    .sort((left, right) => Math.abs(left.price! - narrative.target!) - Math.abs(right.price! - narrative.target!))[0]?.label;
};

const targetFeasibilityScoreFor = (
  narrative: IctSessionRaidReversalNarrative,
  stopDistance?: number,
  targetDistance?: number
) => {
  if (!finite(targetDistance) || targetDistance <= 0) return undefined;
  const referenceRange = Math.max(
    1,
    stopDistance ?? 0,
    rangeSize(narrative.referenceLevels.asiaRange) ?? 0,
    rangeSize(narrative.referenceLevels.londonRange) ?? 0,
    rangeSize(narrative.referenceLevels.nyRange) ?? 0
  );
  const distancePenalty = Math.max(0, targetDistance - referenceRange * 1.25) / Math.max(1, referenceRange * 1.5);
  const liquidityBonus = selectedTargetTypeFor(narrative) ? 0.08 : 0;
  return round(clamp(1 - distancePenalty + liquidityBonus), 4);
};

const replayOutcomeForShort = (
  narrative: IctSessionRaidReversalNarrative,
  candles: CompactCandle[],
  timingZone: string
): { outcome: IctSessionRaidReversalV2Outcome; timestamp?: string } => {
  const retraceTimestamp = stepFor(narrative, "fvg_retrace")?.timestamp ?? narrative.fairValueGap?.createdAt;
  if (!retraceTimestamp || !finite(narrative.entry) || !finite(narrative.invalidation) || !finite(narrative.target)) {
    return { outcome: "not_replay_ready" };
  }
  const tradingDate = narrative.tradingDate;
  const future = candles.filter((candle) =>
    Date.parse(candle.timestamp) > Date.parse(retraceTimestamp) &&
    (!tradingDate || tradingDateFor(candle.timestamp, timingZone) === tradingDate)
  );
  if (!future.length) return { outcome: "insufficient_future_candles" };
  for (const candle of future) {
    const targetHit = candle.low <= narrative.target;
    const invalidationHit = candle.high >= narrative.invalidation;
    if (targetHit && invalidationHit) return { outcome: "partial", timestamp: candle.timestamp };
    if (targetHit) return { outcome: "target_first", timestamp: candle.timestamp };
    if (invalidationHit) return { outcome: "invalidation_first", timestamp: candle.timestamp };
  }
  return { outcome: "stalled" };
};

export const evaluateIctSessionRaidReversalV2Filtered = (
  input: IctSessionRaidReversalV2Input
): IctSessionRaidReversalV2Evaluation => {
  const thresholds = { ...DEFAULT_ICT_SESSION_RAID_REVERSAL_V2_THRESHOLDS, ...(input.thresholds ?? {}) };
  const base = evaluateIctSessionRaidReversal(input);
  const timingZone = input.timingZone ?? defaultZone;
  const candles5m = sortCandles(input.candles5m);
  const candles15m = sortCandles(input.candles15m ?? []);
  const failedFilters: IctSessionRaidReversalV2FailedFilter[] = [];

  const nyRaidStep = stepFor(base, "ny_london_high_raid");
  const mssStep = stepFor(base, "bearish_mss");
  const retraceStep = stepFor(base, "fvg_retrace");
  const mssBar = findByTimestamp(candles5m, mssStep?.timestamp);
  const retraceBar = findByTimestamp(candles15m, retraceStep?.timestamp) ?? findByTimestamp(candles5m, retraceStep?.timestamp);
  const fvgSize = finite(base.fairValueGap?.high) && finite(base.fairValueGap?.low)
    ? round(base.fairValueGap.high - base.fairValueGap.low)
    : undefined;
  const retraceDepthPercent = finite(fvgSize) && fvgSize > 0 && retraceBar && finite(base.fairValueGap?.low)
    ? round(clamp((retraceBar.high - base.fairValueGap.low) / fvgSize, 0, 1.5))
    : undefined;
  const raidDistanceAboveLondonHigh = finite(nyRaidStep?.price) && finite(base.referenceLevels.londonHigh?.price)
    ? round(nyRaidStep.price - base.referenceLevels.londonHigh.price)
    : undefined;
  const displacementBodySize = mssBar ? round(Math.abs(mssBar.close - mssBar.open)) : undefined;
  const stopDistance = finite(base.entry) && finite(base.invalidation) ? round(base.invalidation - base.entry) : undefined;
  const targetDistance = finite(base.entry) && finite(base.target) ? round(base.entry - base.target) : undefined;
  const targetFeasibilityScore = targetFeasibilityScoreFor(base, stopDistance, targetDistance);
  const selectedTargetType = selectedTargetTypeFor(base);
  const replayOutcome = replayOutcomeForShort(base, candles5m, timingZone);

  if (base.status !== "complete_bearish_reversal_candidate" || !base.canCreateValidationChainEntry) {
    failedFilters.push("base_v1_not_complete");
  }
  if (base.sourceProvider === "mock" || base.sourceProvider === "sample") {
    failedFilters.push("source_mock_sample");
  }
  if (!base.sourceFingerprint) {
    failedFilters.push("source_fingerprint_missing");
  }
  if (!finite(displacementBodySize) || displacementBodySize < thresholds.minDisplacementBodySize) {
    failedFilters.push("weak_displacement_body");
  }
  if (!finite(fvgSize) || fvgSize < thresholds.minFvgSize) {
    failedFilters.push("fvg_too_small");
  }
  if (finite(fvgSize) && fvgSize > thresholds.maxFvgSize) {
    failedFilters.push("fvg_too_large");
  }
  if (!finite(retraceDepthPercent) || retraceDepthPercent > thresholds.maxRetraceDepthPercent) {
    failedFilters.push("fvg_retrace_too_deep");
  }
  if (!finite(raidDistanceAboveLondonHigh) || raidDistanceAboveLondonHigh > thresholds.maxRaidDistanceAboveLondonHigh) {
    failedFilters.push("raid_too_extended");
  }
  if (!finite(stopDistance) || stopDistance > thresholds.maxStopDistance) {
    failedFilters.push("stop_too_wide");
  }
  if (!finite(targetFeasibilityScore) || targetFeasibilityScore < thresholds.minTargetFeasibilityScore) {
    failedFilters.push("target_feasibility_weak");
  }
  if (finite(base.rr) && base.rr > thresholds.maxRrWithoutStrongFeasibility) {
    if (!finite(targetFeasibilityScore) || targetFeasibilityScore < thresholds.strongFeasibilityScore) {
      failedFilters.push("high_rr_trap");
    }
  }

  const dedupedFailedFilters = Array.from(new Set(failedFilters));
  const passedV2 = dedupedFailedFilters.length === 0;
  const status =
    base.sourceProvider === "mock" || base.sourceProvider === "sample" ? "rejected" :
    base.status === "needs_more_data" ? "needs_more_data" :
    passedV2 ? "filtered_research_candidate" :
    "filtered_out";

  return {
    strategyId: "nasdaq_london_raid_ny_reversal_v2_filtered_research",
    baseStrategyId: "nasdaq_london_raid_ny_reversal_v1",
    baseStatus: base.status,
    status,
    researchOnly: true,
    replayRequired: true,
    paperDemoEligible: false,
    walkForwardReady: false,
    telemetry: {
      strategyId: "nasdaq_london_raid_ny_reversal_v2_filtered_research",
      baseStrategyId: "nasdaq_london_raid_ny_reversal_v1",
      baseCandidateId: `nasdaq_london_raid_ny_reversal_v1:${base.tradingDate ?? "unknown"}`,
      tradingDate: base.tradingDate,
      requestedSymbol: base.requestedSymbol,
      brokerSymbol: base.brokerSymbol,
      sourceProvider: base.sourceProvider,
      sourceFingerprint: base.sourceFingerprint,
      passedV2,
      failedFilters: dedupedFailedFilters,
      displacementBodySize,
      fvgSize,
      retraceDepthPercent,
      raidDistanceAboveLondonHigh,
      stopDistance,
      targetDistance,
      targetFeasibilityScore,
      rr: base.rr,
      selectedTargetType,
      outcome: replayOutcome.outcome,
      outcomeTimestamp: replayOutcome.timestamp,
      thresholdSet: thresholds,
      authority
    },
    nextAction: passedV2
      ? "Keep as filtered research candidate and run independent replay/walk-forward before any progression."
      : "Keep v1 unchanged; use failed v2 filters as calibration telemetry only.",
    authority,
    safety
  };
};

export const summarizeIctSessionRaidReversalV2Filtered = (evaluation?: IctSessionRaidReversalV2Evaluation) => {
  if (!evaluation) return "Session raid reversal v2 filtered research variant has not run.";
  const filters = evaluation.telemetry.failedFilters.length
    ? `failed ${evaluation.telemetry.failedFilters.join(", ")}`
    : "passed all v2 filters";
  return `${evaluation.status.replace(/_/g, " ")} / ${filters} / outcome ${evaluation.telemetry.outcome}.`;
};
