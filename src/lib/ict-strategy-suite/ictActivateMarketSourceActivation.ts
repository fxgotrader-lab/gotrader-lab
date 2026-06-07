import {
  checkMt5ReadOnlyStatus,
  fetchAndStoreMt5ReadOnlyCandleFeed,
  fetchMt5ReadOnlyQuote,
  fetchMt5ReadOnlySymbols,
  loadMt5ReadOnlySettings,
  saveMt5ReadOnlySettings,
  type ActiveMt5ReadOnlyCandleFeed,
  type Mt5ReadOnlyQuote,
  type Mt5ReadOnlySettings,
  type Mt5ReadOnlyStatus
} from "@/lib/integrations/mt5";
import { fetchAndStoreMt5HigherTimeframeSources } from "@/lib/integrations/mt5/mt5MultiTimeframe";
import {
  displayLabelForMt5Mapping,
  sanitizeMt5HigherTimeframes,
  sanitizeMt5ReadOnlyTimeframe,
  type Mt5HigherTimeframeSourceSummary
} from "@/lib/integrations/mt5/mt5SymbolSettings";
import { resolveResearchRuntimeSnapshot, type ResearchRuntimeSnapshot } from "@/lib/runtime";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const compactSafety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  secretsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true
};

export type Mt5ActivateMarketSourceStatus = "activated" | "blocked" | "unavailable";
export type Mt5ActivateMarketSourceFailedStep =
  | "settings"
  | "wrapper_status"
  | "upstream_status"
  | "symbol_check"
  | "quote"
  | "candles"
  | "canonical_registration"
  | "higher_timeframe_context"
  | "chart_activation"
  | "research_activation"
  | "authority";

export interface Mt5ActivateMarketSourceSummary {
  provider: "mt5_read_only";
  requestedSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  candleLimit: number;
  candleCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  sourceFingerprint?: string;
  feedId?: string;
  activeForChart: boolean;
  activeForResearch: boolean;
  researchEligibilityState?: string;
  researchEligibilityReasons: string[];
  depthStatus?: string;
  storageBackend?: string;
  sourceMethod?: string;
  authority: typeof authority;
}

export interface Mt5ActivateMarketHigherTimeframeSummary {
  requestedTimeframes: string[];
  loadedTimeframes: string[];
  sources: Array<{
    timeframe: string;
    candleCount: number;
    firstTimestamp?: string;
    lastTimestamp?: string;
    fingerprint?: string;
    warning?: string;
  }>;
  warning?: string;
}

export interface Mt5ActivateMarketSourceResult {
  ok: boolean;
  status: Mt5ActivateMarketSourceStatus;
  message: string;
  failedStep?: Mt5ActivateMarketSourceFailedStep;
  source: Mt5ActivateMarketSourceSummary;
  quote?: {
    bid?: number;
    ask?: number;
    mid?: number;
    spread?: number;
    timestamp?: string;
  };
  higherTimeframes: Mt5ActivateMarketHigherTimeframeSummary;
  snapshot?: ResearchRuntimeSnapshot;
  safety: typeof compactSafety;
  authority: typeof authority;
}

export interface EnsureMt5CanonicalResearchSourceOptions {
  brokerSymbol?: string;
  candleLimit?: number;
  displayLabel?: string;
  higherTimeframes?: string[];
  requestedSymbol?: string;
  timeframe?: string;
}

export interface EnsureMt5CanonicalResearchSourceDependencies {
  checkStatus?: typeof checkMt5ReadOnlyStatus;
  fetchCandleFeed?: typeof fetchAndStoreMt5ReadOnlyCandleFeed;
  fetchHigherTimeframes?: typeof fetchAndStoreMt5HigherTimeframeSources;
  fetchQuote?: typeof fetchMt5ReadOnlyQuote;
  fetchSymbols?: typeof fetchMt5ReadOnlySymbols;
  loadSettings?: typeof loadMt5ReadOnlySettings;
  resolveSnapshot?: typeof resolveResearchRuntimeSnapshot;
  saveSettings?: typeof saveMt5ReadOnlySettings;
}

const clean = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const brokerSymbolExists = (symbols: string[], brokerSymbol: string) =>
  !symbols.length || symbols.some((symbol) => symbol.trim().toUpperCase() === brokerSymbol.trim().toUpperCase());

const feedSummary = ({
  brokerSymbol,
  candleLimit,
  feed,
  requestedSymbol,
  timeframe
}: {
  brokerSymbol: string;
  candleLimit: number;
  feed?: ActiveMt5ReadOnlyCandleFeed;
  requestedSymbol: string;
  timeframe: string;
}): Mt5ActivateMarketSourceSummary => ({
  provider: "mt5_read_only",
  requestedSymbol: feed?.requestedSymbol ?? requestedSymbol,
  brokerSymbol: feed?.brokerSymbol ?? brokerSymbol,
  timeframe: feed?.timeframe ?? timeframe,
  candleLimit,
  candleCount: feed?.candleCount ?? 0,
  firstTimestamp: feed?.firstTimestamp,
  lastTimestamp: feed?.lastTimestamp,
  sourceFingerprint: feed?.candleFingerprint,
  feedId: feed?.feedId,
  activeForChart: Boolean(feed?.activeForChart),
  activeForResearch: Boolean(feed?.activeForResearch),
  researchEligibilityState: feed?.researchEligibility.state,
  researchEligibilityReasons: feed?.researchEligibility.reasons ?? [],
  depthStatus: feed?.depthStatus,
  storageBackend: feed?.storageBackend,
  sourceMethod: feed?.sourceMethod,
  authority
});

const quoteSummary = (quote?: Mt5ReadOnlyQuote) => ({
  bid: quote?.bid,
  ask: quote?.ask,
  mid: quote?.mid,
  spread: quote?.spread,
  timestamp: quote?.timestamp
});

const htfSummary = ({
  requestedTimeframes,
  sources,
  warning
}: {
  requestedTimeframes: string[];
  sources?: Mt5HigherTimeframeSourceSummary[];
  warning?: string;
}): Mt5ActivateMarketHigherTimeframeSummary => {
  const safeSources = (sources ?? []).map((source) => ({
    timeframe: source.timeframe,
    candleCount: source.candleCount,
    firstTimestamp: source.firstTimestamp,
    lastTimestamp: source.lastTimestamp,
    fingerprint: source.fingerprint,
    warning: source.warning
  }));
  return {
    requestedTimeframes,
    loadedTimeframes: safeSources.filter((source) => source.candleCount > 0).map((source) => source.timeframe),
    sources: safeSources,
    warning
  };
};

const result = ({
  failedStep,
  feed,
  higherTimeframes,
  message,
  ok,
  quote,
  requested,
  snapshot,
  status
}: {
  failedStep?: Mt5ActivateMarketSourceFailedStep;
  feed?: ActiveMt5ReadOnlyCandleFeed;
  higherTimeframes: Mt5ActivateMarketHigherTimeframeSummary;
  message: string;
  ok: boolean;
  quote?: Mt5ReadOnlyQuote;
  requested: {
    brokerSymbol: string;
    candleLimit: number;
    requestedSymbol: string;
    timeframe: string;
  };
  snapshot?: ResearchRuntimeSnapshot;
  status: Mt5ActivateMarketSourceStatus;
}): Mt5ActivateMarketSourceResult => ({
  ok,
  status,
  message,
  failedStep,
  source: feedSummary({
    brokerSymbol: requested.brokerSymbol,
    candleLimit: requested.candleLimit,
    feed,
    requestedSymbol: requested.requestedSymbol,
    timeframe: requested.timeframe
  }),
  quote: quoteSummary(quote),
  higherTimeframes,
  snapshot,
  safety: compactSafety,
  authority
});

const statusMessage = (status: Mt5ReadOnlyStatus) =>
  [status.message, ...(status.warnings ?? [])].filter(Boolean).join(" ");

export async function ensureMt5CanonicalResearchSource(
  options: EnsureMt5CanonicalResearchSourceOptions = {},
  dependencies: EnsureMt5CanonicalResearchSourceDependencies = {}
): Promise<Mt5ActivateMarketSourceResult> {
  const deps = {
    checkStatus: dependencies.checkStatus ?? checkMt5ReadOnlyStatus,
    fetchCandleFeed: dependencies.fetchCandleFeed ?? fetchAndStoreMt5ReadOnlyCandleFeed,
    fetchHigherTimeframes: dependencies.fetchHigherTimeframes ?? fetchAndStoreMt5HigherTimeframeSources,
    fetchQuote: dependencies.fetchQuote ?? fetchMt5ReadOnlyQuote,
    fetchSymbols: dependencies.fetchSymbols ?? fetchMt5ReadOnlySymbols,
    loadSettings: dependencies.loadSettings ?? loadMt5ReadOnlySettings,
    resolveSnapshot: dependencies.resolveSnapshot ?? resolveResearchRuntimeSnapshot,
    saveSettings: dependencies.saveSettings ?? saveMt5ReadOnlySettings
  };

  const loadedSettings = deps.loadSettings();
  const requestedSymbol = clean(options.requestedSymbol ?? loadedSettings.requestedSymbol, "MNQ");
  const timeframe = sanitizeMt5ReadOnlyTimeframe(options.timeframe ?? loadedSettings.timeframe ?? "5m");
  const brokerSymbol = clean(options.brokerSymbol ?? loadedSettings.brokerSymbolOverride, "USTECH");
  const candleLimit = Math.max(1, Math.min(5000, Number(options.candleLimit ?? loadedSettings.candleLimit ?? 1000)));
  const higherTimeframes = sanitizeMt5HigherTimeframes(options.higherTimeframes ?? loadedSettings.higherTimeframes)
    .filter((item) => item !== timeframe);
  const displayLabel = displayLabelForMt5Mapping({
    brokerSymbol,
    displayLabel: options.displayLabel ?? loadedSettings.displayLabel,
    requestedSymbol
  });
  const requested = { brokerSymbol, candleLimit, requestedSymbol, timeframe };
  const emptyHtfSummary = htfSummary({ requestedTimeframes: higherTimeframes });

  const settings: Mt5ReadOnlySettings = deps.saveSettings({
    enabled: true,
    requestedSymbol,
    brokerSymbolOverride: brokerSymbol,
    displayLabel,
    timeframe,
    higherTimeframes,
    candleLimit
  });

  const status = await deps.checkStatus(settings);
  if (status.connectionStatus !== "connected" && status.connectionStatus !== "degraded") {
    return result({
      failedStep: "wrapper_status",
      higherTimeframes: emptyHtfSummary,
      message: `MT5 read-only bridge is unavailable. ${statusMessage(status)}`,
      ok: false,
      requested,
      status: "unavailable"
    });
  }
  if (status.connectionStatus !== "connected") {
    return result({
      failedStep: "upstream_status",
      higherTimeframes: emptyHtfSummary,
      message: `MT5 wrapper responded, but upstream MT5 market data is ${status.connectionStatus}. ${statusMessage(status)}`,
      ok: false,
      requested,
      status: "unavailable"
    });
  }

  const symbols = await deps.fetchSymbols(settings);
  if (!brokerSymbolExists(symbols.symbols, brokerSymbol)) {
    return result({
      failedStep: "symbol_check",
      higherTimeframes: emptyHtfSummary,
      message: `MT5 broker symbol ${brokerSymbol} was not found in the upstream symbol list.`,
      ok: false,
      requested,
      status: "blocked"
    });
  }

  const quote = await deps.fetchQuote({ symbol: requestedSymbol, brokerSymbol }, settings);
  if (!(quote.mid || quote.bid || quote.ask)) {
    return result({
      failedStep: "quote",
      higherTimeframes: emptyHtfSummary,
      message: `MT5 quote unavailable for ${brokerSymbol}. ${quote.missingEvidence.join(" ") || "No read-only quote returned."}`,
      ok: false,
      quote,
      requested,
      status: "unavailable"
    });
  }

  const feed = await deps.fetchCandleFeed({
    symbol: requestedSymbol,
    brokerSymbol,
    timeframe,
    gotraderSymbol: requestedSymbol,
    gotraderTimeframe: timeframe,
    limit: candleLimit,
    settings,
    usageMode: "research_source"
  });
  if (!feed.candleCount) {
    return result({
      failedStep: "candles",
      feed,
      higherTimeframes: emptyHtfSummary,
      message: `MT5 candles unavailable for ${brokerSymbol} ${timeframe}. ${feed.missingEvidence.join(" ") || "No read-only candles returned."}`,
      ok: false,
      quote,
      requested,
      status: "unavailable"
    });
  }

  let htfSources: Mt5HigherTimeframeSourceSummary[] = [];
  let htfWarning: string | undefined;
  if (higherTimeframes.length) {
    try {
      htfSources = await deps.fetchHigherTimeframes({
        brokerSymbol,
        limit: candleLimit,
        requestedSymbol,
        timeframes: higherTimeframes
      });
    } catch (error) {
      htfWarning = error instanceof Error ? error.message : "Higher timeframe MT5 context fetch failed.";
    }
  }
  const higherTimeframeSummary = htfSummary({ requestedTimeframes: higherTimeframes, sources: htfSources, warning: htfWarning });

  if (!feed.activeForChart) {
    return result({
      failedStep: "chart_activation",
      feed,
      higherTimeframes: higherTimeframeSummary,
      message: "MT5 candles loaded, but chart activation failed.",
      ok: false,
      quote,
      requested,
      status: "blocked"
    });
  }
  if (!feed.activeForResearch) {
    return result({
      failedStep: "research_activation",
      feed,
      higherTimeframes: higherTimeframeSummary,
      message: `MT5 source is not eligible for guarded research. ${feed.researchEligibility.reasons.join(" ") || "Research source gate failed."}`,
      ok: false,
      quote,
      requested,
      status: "blocked"
    });
  }

  const authorityOk =
    feed.executionAuthority === "none" &&
    feed.brokerAuthority === "none" &&
    feed.readinessOverrideAuthority === "none";
  if (!authorityOk) {
    return result({
      failedStep: "authority",
      feed,
      higherTimeframes: higherTimeframeSummary,
      message: "MT5 source authority is not none/none/none, so Activate Market is blocked.",
      ok: false,
      quote,
      requested,
      status: "blocked"
    });
  }

  const snapshot = await deps.resolveSnapshot();
  return result({
    feed,
    higherTimeframes: higherTimeframeSummary,
    message: `MT5 research source active: ${feed.brokerSymbol ?? brokerSymbol} -> ${feed.requestedSymbol}, ${feed.candleCount.toLocaleString()} ${feed.timeframe} candles, chart/research source active, authority none.`,
    ok: true,
    quote,
    requested,
    snapshot,
    status: "activated"
  });
}
