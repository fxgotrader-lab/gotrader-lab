import type {
  IctCmdCandidateTelemetry,
  IctCmdTelemetryBuildInput,
  IctCmdTelemetryBucket,
  IctCmdTelemetryFeatureComparison,
  IctCmdTelemetryHtfContext,
  IctCmdTelemetryOutcome,
  IctCmdTelemetryQuality,
  IctCmdTelemetrySummary,
  IctCmdVariantDiscoveryResult
} from "./ictCmdTelemetryTypes";
import type { IctReplayOutcome } from "./ictReplayValidationTypes";

export const ICT_CMD_TELEMETRY_AUTHORITY = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

export const ICT_CMD_TELEMETRY_SAFETY = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const timeZone = "America/New_York";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number | undefined, decimals = 4) =>
  finite(value) ? Number(value.toFixed(decimals)) : undefined;
const safeRound = (value: number | undefined, decimals = 4) => round(value, decimals) ?? 0;

const safeDateParts = (timestamp?: string) => {
  const parsed = Date.parse(timestamp ?? "");
  if (!Number.isFinite(parsed)) {
    return { tradingDate: "unknown", hour: 0, minute: 0 };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(new Date(parsed))
    .reduce<Record<string, string>>((accumulator, part) => {
      if (part.type !== "literal") accumulator[part.type] = part.value;
      return accumulator;
    }, {});
  return {
    tradingDate: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? 0),
    minute: Number(parts.minute ?? 0)
  };
};

export const getIctCmdTelemetryTradingDate = (timestamp?: string) => safeDateParts(timestamp).tradingDate;

export const getIctCmdTelemetrySession = (timestamp?: string) => {
  const { hour, minute } = safeDateParts(timestamp);
  const minutes = hour * 60 + minute;
  if (minutes >= 20 * 60 || minutes < 2 * 60) return "asia";
  if (minutes >= 2 * 60 && minutes < 5 * 60) return "london";
  if (minutes >= 9 * 60 + 30 && minutes < 12 * 60) return "ny_am";
  if (minutes >= 12 * 60 && minutes < 13 * 60 + 30) return "ny_lunch";
  if (minutes >= 13 * 60 + 30 && minutes < 16 * 60) return "ny_pm";
  return "other";
};

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const distance = (left?: number, right?: number) =>
  finite(left) && finite(right) ? Math.abs(left - right) : undefined;

const bucket = (value: number | undefined, thresholds: [number, number, number, number]): IctCmdTelemetryBucket => {
  if (!finite(value)) return "missing";
  if (value < thresholds[0]) return "low";
  if (value < thresholds[1]) return "medium";
  if (value < thresholds[2]) return "high";
  if (value < thresholds[3]) return "extreme";
  return "extreme";
};

const rrBucket = (rr?: number) => bucket(rr, [1.5, 2.5, 4, 6]);
const displacementBucket = (score?: number) => bucket(score, [0.75, 1.25, 2, 3.5]);
const rangeBucket = (value?: number) => bucket(value, [50, 125, 250, 500]);

const mapOutcome = (outcome: IctReplayOutcome): IctCmdTelemetryOutcome => {
  if (outcome === "target_first") return "target_first";
  if (outcome === "invalidation_first") return "invalidation_first";
  if (outcome === "no_trade") return "no_trade";
  if (outcome === "insufficient_future_candles") return "insufficient_data";
  return "stalled";
};

const smtStateFor = (input: IctCmdTelemetryBuildInput["result"]): IctCmdCandidateTelemetry["smtState"] => {
  if (input.smtConfirmsCandidate) return "confirms";
  if (input.smtRejectsCandidate) return "rejects";
  if (input.smtDivergenceType === "insufficient_data") return "insufficient_data";
  if (input.smtDivergenceType) return "neutral";
  return "unknown";
};

const htfContextFor = (input: IctCmdTelemetryBuildInput): IctCmdTelemetryHtfContext => {
  const decisionContext = input.decision?.htfAlignment;
  const fallback = input.fallbackHtfContext ?? {};
  const alignmentStatus =
    decisionContext?.alignmentStatus ??
    fallback.alignmentStatus ??
    (input.result.htfAligned === true ? "aligned" : input.result.htfAligned === false ? "conflicted" : "missing");
  return {
    alignmentStatus,
    W1: decisionContext?.W1 ?? fallback.W1,
    D1: decisionContext?.D1 ?? fallback.D1,
    H4: decisionContext?.H4 ?? fallback.H4,
    H1: decisionContext?.H1 ?? fallback.H1,
    M15: decisionContext?.M15 ?? fallback.M15,
    M5: decisionContext?.M5 ?? fallback.M5,
    setupDirection: input.result.side,
    conflictReason: decisionContext?.conflictReason ?? fallback.conflictReason
  };
};

const sweepQualityFor = (input: IctCmdTelemetryBuildInput["result"]): IctCmdTelemetryQuality => {
  if (input.smtRejectsCandidate) return "weak";
  if (input.liquidityTargetType && input.sessionMitigationDetected && input.modelState === "confirmed") return "strong";
  if (input.liquidityTargetType || input.sessionMitigationDetected || input.fvgTargetDetected) return "partial";
  return "missing";
};

export const buildIctCmdCandidateTelemetry = (input: IctCmdTelemetryBuildInput): IctCmdCandidateTelemetry => {
  const { result, decision } = input;
  const signalTime = result.tradePath?.signalTime ?? result.provenance?.generatedAt;
  const tradingDate = getIctCmdTelemetryTradingDate(signalTime);
  const session = result.sessionName ?? getIctCmdTelemetrySession(signalTime);
  const entry = result.tradePath?.entryReference;
  const targetDistance = distance(result.tradePath?.target, entry);
  const invalidationDistance = distance(entry, result.tradePath?.invalidation);
  const plannedRr =
    finite(targetDistance) && finite(invalidationDistance) && invalidationDistance > 0
      ? targetDistance / invalidationDistance
      : undefined;
  const rr = round(result.rrEstimate ?? result.tradePath?.rrAchieved ?? plannedRr, 4);
  const favorable = Math.abs(result.tradePath?.maxFavorableExcursion ?? 0);
  const adverse = Math.abs(result.tradePath?.maxAdverseExcursion ?? 0);
  const expansionDistance = favorable || targetDistance;
  const manipulationDepth = adverse || invalidationDistance;
  const displacementScore =
    finite(expansionDistance) && finite(invalidationDistance) && invalidationDistance > 0
      ? round(expansionDistance / invalidationDistance, 4)
      : round((result.modelConfidence ?? result.confidence ?? 0) / 100, 4);
  const htfContext = htfContextFor(input);
  const blockerReasons = [
    ...(decision?.rejectionReasons ?? []),
    ...(decision?.watchlistReasons ?? []),
    ...(result.noTradeReasons ?? []),
    ...(result.riskNotes ?? [])
  ].filter(Boolean);

  return {
    candidateId: `cmd_${tradingDate}_${result.side}_${hashText(
      `${signalTime}|${result.side}|${entry}|${result.tradePath?.target}|${result.tradePath?.invalidation}`
    )}`,
    tradingDate,
    session,
    side: result.side,
    requestedSymbol: result.requestedSymbol,
    brokerSymbol: result.brokerSymbol,
    timeframe: result.primaryTimeframe,
    htfContext,
    sourceFingerprint: input.sourceFingerprint,
    consolidationRangeSize: round((targetDistance ?? 0) + (invalidationDistance ?? 0), 4),
    consolidationDuration: result.tradePath?.candlesToTarget ?? result.tradePath?.candlesToInvalidation,
    manipulationSide: result.side === "short" ? "buy_side" : result.side === "long" ? "sell_side" : "unknown",
    manipulationDepth: round(manipulationDepth, 4),
    sweepType: result.liquidityTargetType ?? (result.fvgTargetDetected ? `${result.fvgTargetDirection ?? "unknown"}_fvg_draw` : "none"),
    sweepQuality: sweepQualityFor(result),
    expansionDistance: round(expansionDistance, 4),
    displacementScore: displacementScore ?? 0,
    displacementScoreBucket: displacementBucket(displacementScore),
    fvgPresent: result.fvgStatus !== "not_applicable" || result.fvgTargetDetected === true,
    fvgRespected: result.fvgStatus === "respected" || result.fvgStatus === "partially_mitigated",
    externalLiquidityTargetPresent: Boolean(result.liquidityTargetType || result.fvgTargetDetected),
    targetDistance: round(targetDistance, 4),
    invalidationDistance: round(invalidationDistance, 4),
    rr,
    rrBucket: rrBucket(rr),
    smtState: smtStateFor(result),
    htfAlignment: htfContext.alignmentStatus,
    premiumDiscountContext: result.dealingRangeLocation,
    sessionNarrative: result.sessionNarrativeProfile,
    newsRiskState: result.riskGovernorAction ?? result.newsRiskLevel ?? result.sessionRiskState,
    modelState: result.modelState,
    modelConfidence: result.modelConfidence,
    candidateLane: decision?.status ?? result.approvedProfileStatus ?? "unscored",
    outcome: mapOutcome(result.outcome),
    blockerReasons: Array.from(new Set(blockerReasons)).slice(0, 10),
    authority: ICT_CMD_TELEMETRY_AUTHORITY,
    researchOnly: true
  };
};

const countBy = <T>(values: T[], selector: (value: T) => string | number | boolean | undefined) => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = String(selector(value) ?? "unknown");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
};

const uniqueCount = (values: string[]) => new Set(values.filter((value) => value && value !== "unknown")).size;

export const summarizeIctCmdTelemetry = (telemetry: IctCmdCandidateTelemetry[]): IctCmdTelemetrySummary => {
  const paper = telemetry.filter((item) => item.candidateLane === "paper_watchlist_candidate");
  const winners = telemetry.filter((item) => item.outcome === "target_first");
  const losers = telemetry.filter((item) => item.outcome === "invalidation_first");
  return {
    totalTelemetry: telemetry.length,
    paperWatchlistTelemetry: paper.length,
    winningTelemetry: winners.length,
    losingTelemetry: losers.length,
    uniqueTradingDates: uniqueCount(telemetry.map((item) => item.tradingDate)),
    activeRollingWindows: countActiveRollingWindows(telemetry),
    countBySession: countBy(telemetry, (item) => item.session),
    countBySide: countBy(telemetry, (item) => item.side),
    countByHtfAlignment: countBy(telemetry, (item) => item.htfAlignment),
    countByDisplacementScoreBucket: countBy(telemetry, (item) => item.displacementScoreBucket),
    countByFvgRespected: countBy(telemetry, (item) => item.fvgRespected),
    countBySweepQuality: countBy(telemetry, (item) => item.sweepQuality),
    countByRrBucket: countBy(telemetry, (item) => item.rrBucket),
    countByExternalLiquidityTarget: countBy(telemetry, (item) => item.externalLiquidityTargetPresent),
    countByConsolidationRangeSizeBucket: countBy(telemetry, (item) => rangeBucket(item.consolidationRangeSize)),
    authority: ICT_CMD_TELEMETRY_AUTHORITY,
    safety: ICT_CMD_TELEMETRY_SAFETY,
    researchOnly: true
  };
};

const share = (values: IctCmdCandidateTelemetry[], selector: (value: IctCmdCandidateTelemetry) => boolean) =>
  values.length ? safeRound(values.filter(selector).length / values.length, 4) : 0;

export const compareIctCmdTelemetryFeatures = (
  winners: IctCmdCandidateTelemetry[],
  losers: IctCmdCandidateTelemetry[]
): IctCmdTelemetryFeatureComparison => {
  const averageWinnerDisplacement = safeRound(
    winners.reduce((total, item) => total + item.displacementScore, 0) / Math.max(winners.length, 1),
    4
  );
  const averageLoserDisplacement = safeRound(
    losers.reduce((total, item) => total + item.displacementScore, 0) / Math.max(losers.length, 1),
    4
  );
  return {
    winnerCount: winners.length,
    loserCount: losers.length,
    differentiators: [
      {
        feature: "fvg_respected",
        winnerValue: share(winners, (item) => item.fvgRespected),
        loserValue: share(losers, (item) => item.fvgRespected),
        note: "Higher winner share suggests the FVG return/respect condition deserves isolated testing."
      },
      {
        feature: "external_liquidity_target_present",
        winnerValue: share(winners, (item) => item.externalLiquidityTargetPresent),
        loserValue: share(losers, (item) => item.externalLiquidityTargetPresent),
        note: "CMD paper-watchlist already requires this context; telemetry checks whether losers lacked the same quality."
      },
      {
        feature: "average_displacement_score",
        winnerValue: averageWinnerDisplacement,
        loserValue: averageLoserDisplacement,
        note: "Displacement is normalized by compact risk distance, not by raw candle arrays."
      },
      {
        feature: "htf_aligned_share",
        winnerValue: share(winners, (item) => item.htfAlignment === "aligned" || item.htfAlignment === "partially_aligned"),
        loserValue: share(losers, (item) => item.htfAlignment === "aligned" || item.htfAlignment === "partially_aligned"),
        note: "Shows whether the winning CMD cluster needed HTF support or worked as a lower-timeframe paper idea."
      },
      {
        feature: "smt_confirmed_share",
        winnerValue: share(winners, (item) => item.smtState === "confirms"),
        loserValue: share(losers, (item) => item.smtState === "confirms"),
        note: "SMT is optional; this highlights whether it is worth making a separate candidate family."
      }
    ]
  };
};

export const countActiveRollingWindows = (telemetry: IctCmdCandidateTelemetry[], windowDays = 30, stepDays = 15) => {
  const timestamps = telemetry
    .map((item) => Date.parse(`${item.tradingDate}T00:00:00.000Z`))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!timestamps.length) return 0;
  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1];
  const windowMs = windowDays * 86_400_000;
  const stepMs = stepDays * 86_400_000;
  let active = 0;
  for (let cursor = start; cursor <= end; cursor += stepMs) {
    const windowEnd = cursor + windowMs;
    if (timestamps.some((timestamp) => timestamp >= cursor && timestamp <= windowEnd)) active += 1;
  }
  return active;
};

const metricsForVariant = (
  variantId: string,
  description: string,
  telemetry: IctCmdCandidateTelemetry[]
): IctCmdVariantDiscoveryResult => {
  const targetFirst = telemetry.filter((item) => item.outcome === "target_first").length;
  const invalidationFirst = telemetry.filter((item) => item.outcome === "invalidation_first").length;
  const uniqueTradingDates = uniqueCount(telemetry.map((item) => item.tradingDate));
  const activeRollingWindows = countActiveRollingWindows(telemetry);
  const overfitRisk = telemetry.length > 0 && (uniqueTradingDates < 3 || activeRollingWindows < 2 || telemetry.length < 20);
  return {
    variantId,
    description,
    candidateCount: telemetry.length,
    targetFirstRate: telemetry.length ? safeRound(targetFirst / telemetry.length, 4) : 0,
    invalidationFirstRate: telemetry.length ? safeRound(invalidationFirst / telemetry.length, 4) : 0,
    uniqueTradingDates,
    activeRollingWindows,
    overfitRisk,
    deservesFutureExecutableVariantTest: telemetry.length >= 3 && targetFirst > invalidationFirst,
    blocker: overfitRisk
      ? "variant remains blocked until it appears across at least 3 dates, 2 rolling windows, and 20 candidates"
      : undefined
  };
};

export const discoverIctCmdVariantCandidates = (
  telemetry: IctCmdCandidateTelemetry[]
): IctCmdVariantDiscoveryResult[] => {
  const short = telemetry.filter((item) => item.side === "short");
  return [
    metricsForVariant(
      "cmd_short_high_displacement_fvg_respected",
      "Short CMD with high displacement score and FVG respected.",
      short.filter((item) => item.displacementScoreBucket === "high" || item.displacementScoreBucket === "extreme").filter((item) => item.fvgRespected)
    ),
    metricsForVariant(
      "cmd_short_external_liquidity_target",
      "Short CMD with external liquidity or first FVG draw target present.",
      short.filter((item) => item.externalLiquidityTargetPresent)
    ),
    metricsForVariant(
      "cmd_short_smt_confirmed",
      "Short CMD with SMT or relative-strength confirmation.",
      short.filter((item) => item.smtState === "confirms")
    ),
    metricsForVariant(
      "cmd_short_ny_session_only",
      "Short CMD in NY AM, NY lunch, or NY PM session windows.",
      short.filter((item) => item.session === "ny_am" || item.session === "ny_lunch" || item.session === "ny_pm")
    ),
    metricsForVariant(
      "cmd_short_htf_aligned",
      "Short CMD with aligned or partially aligned HTF context.",
      short.filter((item) => item.htfAlignment === "aligned" || item.htfAlignment === "partially_aligned")
    )
  ].sort((left, right) => right.targetFirstRate - left.targetFirstRate || right.candidateCount - left.candidateCount);
};

export const assertIctCmdTelemetryIsCompact = (payload: unknown) => {
  const serialized = JSON.stringify(payload);
  return {
    ok:
      !/"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"screenshots?"\s*:|"base64"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:|"mt5Credential/i.test(serialized) &&
      !/"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i.test(serialized) &&
      /"executionAuthority"\s*:\s*"none"/.test(serialized) &&
      /"brokerAuthority"\s*:\s*"none"/.test(serialized) &&
      /"readinessOverrideAuthority"\s*:\s*"none"/.test(serialized),
    serializedBytes: serialized.length
  };
};
