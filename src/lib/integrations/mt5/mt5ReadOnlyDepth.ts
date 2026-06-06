import type { Mt5ReadOnlyCandlesResponse } from "@/lib/integrations/mt5/mt5ReadOnlyTypes";

export type Mt5ReadOnlyHistoryDepthStatus = "sufficient" | "limited" | "insufficient" | "unavailable";

export interface Mt5ReadOnlyDepthSummary {
  provider: "mt5_read_only";
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  requestedLookbackDays: number;
  availableLookbackDays: number;
  returnedCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  depthStatus: Mt5ReadOnlyHistoryDepthStatus;
  chunkingStatus: "not_supported_by_wrapper" | "single_window" | "chunked_cached" | "unavailable";
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
  requestedLookbackDays = 90
}: {
  candlesResponse?: Partial<Mt5ReadOnlyCandlesResponse>;
  chunkingStatus?: Mt5ReadOnlyDepthSummary["chunkingStatus"];
  requestedLookbackDays?: number;
}): Mt5ReadOnlyDepthSummary => {
  const returnedCount = Number(candlesResponse?.returnedCount ?? candlesResponse?.candles?.length ?? 0);
  const firstTimestamp = candlesResponse?.firstTimestamp ?? candlesResponse?.candles?.[0]?.timestamp;
  const lastTimestamp = candlesResponse?.lastTimestamp ?? candlesResponse?.candles?.at?.(-1)?.timestamp;
  const availableLookbackDays =
    firstTimestamp && lastTimestamp
      ? round(Math.max(0, Date.parse(lastTimestamp) - Date.parse(firstTimestamp)) / (24 * 60 * 60 * 1000))
      : 0;
  const depthStatus = classifyMt5ReadOnlyDepth({
    availableLookbackDays,
    returnedCount,
    requestedLookbackDays
  });
  return {
    provider: "mt5_read_only",
    requestedSymbol: candlesResponse?.requestedSymbol ?? "MNQ",
    brokerSymbol: candlesResponse?.brokerSymbol ?? candlesResponse?.symbol ?? "USTECH",
    timeframe: candlesResponse?.timeframe ?? candlesResponse?.requestedTimeframe ?? "5m",
    requestedLookbackDays,
    availableLookbackDays,
    returnedCount,
    firstTimestamp,
    lastTimestamp,
    depthStatus,
    chunkingStatus,
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
