import type { Mt5ReadOnlyCandle, Mt5ReadOnlyCandlesResponse } from "@/lib/integrations/mt5/mt5ReadOnlyTypes";

export type Mt5ReadOnlyHistoryDepthStatus = "sufficient" | "limited" | "insufficient" | "unavailable";

export interface Mt5ReadOnlyDepthSummary {
  provider: "mt5_read_only";
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  requestedLookbackDays: number;
  availableLookbackDays: number;
  returnedCount: number;
  candleCount: number;
  chunkCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  firstCandleTime?: string;
  lastCandleTime?: string;
  depthStatus: Mt5ReadOnlyHistoryDepthStatus;
  dataDepthStatus: Mt5ReadOnlyHistoryDepthStatus;
  chunkingStatus: "not_supported_by_wrapper" | "single_window" | "chunked_cached" | "unavailable";
  limitationReason?: string;
  warnings: string[];
  missingEvidence: string[];
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesIncluded: false;
    rawSnapshotsIncluded: false;
    secretsIncluded: false;
    accountDataIncluded: false;
    orderDataIncluded: false;
    positionDataIncluded: false;
  };
}

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesIncluded: false as const,
  rawSnapshotsIncluded: false as const,
  secretsIncluded: false as const,
  accountDataIncluded: false as const,
  orderDataIncluded: false as const,
  positionDataIncluded: false as const
};

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const parseCandleTime = (candle: Pick<Mt5ReadOnlyCandle, "time" | "timestamp">) => {
  const parsed = Date.parse(candle.timestamp);
  if (Number.isFinite(parsed)) return parsed;
  return Number.isFinite(candle.time) ? candle.time * 1000 : 0;
};

export const sortCandlesAscending = <T extends Pick<Mt5ReadOnlyCandle, "time" | "timestamp">>(candles: T[]) =>
  candles.slice().sort((left, right) => parseCandleTime(left) - parseCandleTime(right));

export const normalizeAndDeduplicateCandles = (candles: Mt5ReadOnlyCandle[] = []) => {
  const seen = new Set<number>();
  return sortCandlesAscending(
    candles.filter((candle) =>
      Boolean(candle.timestamp) &&
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
  ).filter((candle) => {
    const key = parseCandleTime(candle);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const calculateAvailableLookbackDays = (
  candlesOrRange:
    | Mt5ReadOnlyCandle[]
    | {
        firstTimestamp?: string;
        lastTimestamp?: string;
      }
) => {
  const firstTimestamp = Array.isArray(candlesOrRange)
    ? candlesOrRange[0]?.timestamp
    : candlesOrRange.firstTimestamp;
  const lastTimestamp = Array.isArray(candlesOrRange)
    ? candlesOrRange[candlesOrRange.length - 1]?.timestamp
    : candlesOrRange.lastTimestamp;
  if (!firstTimestamp || !lastTimestamp) return 0;
  const span = Date.parse(lastTimestamp) - Date.parse(firstTimestamp);
  return Number.isFinite(span) ? round(Math.max(0, span) / (24 * 60 * 60 * 1000)) : 0;
};

export const classifyMt5ReadOnlyDepth = ({
  availableLookbackDays,
  returnedCount,
  requestedLookbackDays
}: {
  availableLookbackDays: number;
  returnedCount: number;
  requestedLookbackDays: number;
}): Mt5ReadOnlyHistoryDepthStatus => {
  if (!returnedCount || availableLookbackDays <= 0) return "unavailable";
  if (availableLookbackDays >= requestedLookbackDays * 0.8) return "sufficient";
  if (availableLookbackDays >= Math.min(20, requestedLookbackDays * 0.25)) return "limited";
  return "insufficient";
};

export const summarizeMt5ReadOnlyDepth = ({
  candlesResponse,
  chunkingStatus = "single_window",
  chunkCount,
  limitationReason,
  requestedLookbackDays = 90
}: {
  candlesResponse?: Partial<Mt5ReadOnlyCandlesResponse>;
  chunkingStatus?: Mt5ReadOnlyDepthSummary["chunkingStatus"];
  chunkCount?: number;
  limitationReason?: string;
  requestedLookbackDays?: number;
}): Mt5ReadOnlyDepthSummary => {
  const returnedCount = Number(candlesResponse?.returnedCount ?? candlesResponse?.candles?.length ?? 0);
  const firstTimestamp = candlesResponse?.firstTimestamp ?? candlesResponse?.candles?.[0]?.timestamp;
  const lastTimestamp = candlesResponse?.lastTimestamp ?? candlesResponse?.candles?.at?.(-1)?.timestamp;
  const availableLookbackDays = calculateAvailableLookbackDays({ firstTimestamp, lastTimestamp });
  const depthStatus = classifyMt5ReadOnlyDepth({
    availableLookbackDays,
    returnedCount,
    requestedLookbackDays
  });
  const resolvedLimitation =
    limitationReason ??
    (depthStatus === "sufficient"
      ? undefined
      : chunkingStatus === "not_supported_by_wrapper"
        ? "The running MT5 read-only wrapper does not expose a date-range candle route; restart/update the wrapper or configure a compatible upstream range endpoint."
        : chunkingStatus === "single_window"
          ? "The current diagnostic used only the latest-count MT5 candle endpoint, which is capped to a single 5000-candle window."
          : "MT5 read-only history is shorter than the requested lookback window.");
  return {
    provider: "mt5_read_only",
    requestedSymbol: candlesResponse?.requestedSymbol ?? "MNQ",
    brokerSymbol: candlesResponse?.brokerSymbol ?? candlesResponse?.symbol ?? "USTECH",
    timeframe: candlesResponse?.timeframe ?? candlesResponse?.requestedTimeframe ?? "5m",
    requestedLookbackDays,
    availableLookbackDays,
    returnedCount,
    candleCount: returnedCount,
    chunkCount: Math.max(0, chunkCount ?? (chunkingStatus === "chunked_cached" ? 1 : 0)),
    firstTimestamp,
    lastTimestamp,
    firstCandleTime: firstTimestamp,
    lastCandleTime: lastTimestamp,
    depthStatus,
    dataDepthStatus: depthStatus,
    chunkingStatus,
    limitationReason: resolvedLimitation,
    warnings: [
      ...(candlesResponse?.warnings ?? []),
      depthStatus === "sufficient"
        ? "MT5 read-only depth is sufficient for 90-day session calibration review."
        : "MT5 read-only depth is limited or unavailable; current Advisor read remains compact."
    ],
    missingEvidence: [
      ...(candlesResponse?.missingEvidence ?? []),
      depthStatus === "sufficient" ? "" : `Need closer to ${requestedLookbackDays} days before treating session calibration as deep-history evidence.`
    ].filter(Boolean),
    authority,
    safety
  };
};

export const assertMt5ReadOnlyDepthSummaryIsCompact = (summary: Mt5ReadOnlyDepthSummary) => {
  const serialized = JSON.stringify(summary);
  return {
    ok:
      summary.authority.executionAuthority === "none" &&
      summary.authority.brokerAuthority === "none" &&
      summary.authority.readinessOverrideAuthority === "none" &&
      summary.safety.rawCandlesIncluded === false &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};

export const summarizeHistoryDepth = ({
  brokerSymbol,
  candles,
  chunkCount = 0,
  chunkingStatus = "chunked_cached",
  limitationReason,
  requestedLookbackDays = 90,
  requestedSymbol,
  timeframe
}: {
  brokerSymbol: string;
  candles: Mt5ReadOnlyCandle[];
  chunkCount?: number;
  chunkingStatus?: Mt5ReadOnlyDepthSummary["chunkingStatus"];
  limitationReason?: string;
  requestedLookbackDays?: number;
  requestedSymbol: string;
  timeframe: string;
}) => {
  const normalized = normalizeAndDeduplicateCandles(candles);
  return summarizeMt5ReadOnlyDepth({
    candlesResponse: {
      provider: "mt5_read_only",
      symbol: brokerSymbol,
      requestedSymbol,
      brokerSymbol,
      timeframe,
      requestedTimeframe: timeframe,
      requestedLimit: normalized.length,
      returnedCount: normalized.length,
      candles: normalized,
      firstTimestamp: normalized[0]?.timestamp,
      lastTimestamp: normalized[normalized.length - 1]?.timestamp,
      connectionStatus: normalized.length ? "connected" : "degraded",
      depthStatus: normalized.length ? "partial" : "insufficient_history",
      warnings: [],
      missingEvidence: [],
      ...authority
    },
    chunkCount,
    chunkingStatus,
    limitationReason,
    requestedLookbackDays
  });
};
