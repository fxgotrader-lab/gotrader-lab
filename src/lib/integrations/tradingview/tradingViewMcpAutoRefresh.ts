import type { TradingViewMcpStatusCheck } from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import type {
  ActiveTradingViewMcpChartFeed,
  TradingViewMcpFeedUsageMode
} from "@/lib/integrations/tradingview/tradingViewCandleFeedTypes";
import { createActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview/tradingViewCandleNormalizer";
import {
  fetchTradingViewMcpCandles,
  fetchTradingViewMcpQuote,
  loadActiveTradingViewMcpChartFeed,
  storeActiveTradingViewMcpChartFeed
} from "@/lib/integrations/tradingview/tradingViewMcpFeedClient";
import { checkTradingViewMcpBridgeStatus } from "@/lib/integrations/tradingview/tradingViewMcpClient";
import { saveTradingViewMcpBridgeStatus } from "@/lib/integrations/tradingview/tradingViewEvidenceService";
import {
  loadTradingViewMcpSettings,
  saveTradingViewMcpSettings
} from "@/lib/integrations/tradingview/tradingViewMcpSettings";

export const TRADINGVIEW_MCP_AUTO_REFRESH_STORAGE_KEY = "gotrader-ai-lab-tradingview-mcp-auto-refresh";
export const TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT =
  "gotrader-ai-lab-tradingview-mcp-auto-refresh-updated";

export const tradingViewMcpAutoRefreshIntervalOptions = [5, 10, 15] as const;
export const tradingViewMcpAutoRefreshCandleLimitOptions = [100, 240, 400, 1000] as const;

export type TradingViewMcpAutoRefreshStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "failed"
  | "stopped";

export type TradingViewMcpAutoRefreshEventSeverity = "info" | "success" | "warning" | "failed" | "running";

export interface TradingViewMcpAutoRefreshEvent {
  eventId: string;
  timestamp: string;
  title: string;
  detail: string;
  severity: TradingViewMcpAutoRefreshEventSeverity;
  sourceFingerprint?: string;
}

export interface TradingViewMcpAutoRefreshState {
  enabled: boolean;
  status: TradingViewMcpAutoRefreshStatus;
  refreshIntervalSeconds: 5 | 10 | 15;
  candleLimit: 100 | 240 | 400 | 1000;
  lastRefreshAt?: string;
  nextRefreshAt?: string;
  refreshCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastCandleCount: number;
  lastPrice?: number;
  lastCandleTimestamp?: string;
  lastSymbol?: string;
  lastTimeframe?: string;
  lastStorageBackend?: string;
  lastFeedId?: string;
  lastBridgeStatus?: TradingViewMcpStatusCheck["connectionStatus"];
  lastEvent?: TradingViewMcpAutoRefreshEvent;
  updatedAt: string;
}

export interface TradingViewMcpAutoRefreshRequest {
  symbol: string;
  timeframe: string;
  usageMode?: TradingViewMcpFeedUsageMode;
  refreshIntervalSeconds?: number;
  candleLimit?: number;
  activateLoop?: boolean;
}

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let autoRefreshTimer: number | undefined;
let activeRequest: TradingViewMcpAutoRefreshRequest | undefined;
let currentState: TradingViewMcpAutoRefreshState | undefined;
let inFlight = false;

const authoritySummary = "TradingView MCP remains read-only chart data. Execution, broker, and readiness authority are none.";

const sanitizeInterval = (value?: number): TradingViewMcpAutoRefreshState["refreshIntervalSeconds"] => {
  if (value === 10 || value === 15) {
    return value;
  }
  return 5;
};

const sanitizeCandleLimit = (value?: number): TradingViewMcpAutoRefreshState["candleLimit"] => {
  if (value === 100 || value === 400 || value === 1000) {
    return value;
  }
  return 240;
};

const defaultState = (): TradingViewMcpAutoRefreshState => ({
  enabled: false,
  status: "idle",
  refreshIntervalSeconds: 5,
  candleLimit: 240,
  refreshCount: 0,
  consecutiveFailures: 0,
  lastCandleCount: 0,
  updatedAt: now()
});

const sanitizeState = (
  state: Partial<TradingViewMcpAutoRefreshState> = {},
  { resetRuntime = false }: { resetRuntime?: boolean } = {}
): TradingViewMcpAutoRefreshState => {
  const runtimeStatus =
    resetRuntime && (state.status === "running" || state.status === "starting" || state.status === "paused")
      ? "stopped"
      : state.status;
  return {
    ...defaultState(),
    ...state,
    enabled: resetRuntime ? false : Boolean(state.enabled),
    status: runtimeStatus ?? "idle",
    refreshIntervalSeconds: sanitizeInterval(state.refreshIntervalSeconds),
    candleLimit: sanitizeCandleLimit(state.candleLimit),
    refreshCount: Math.max(0, Number(state.refreshCount ?? 0)),
    consecutiveFailures: Math.max(0, Number(state.consecutiveFailures ?? 0)),
    lastCandleCount: Math.max(0, Number(state.lastCandleCount ?? 0)),
    updatedAt: state.updatedAt ?? now()
  };
};

const persistAutoRefreshState = (state: TradingViewMcpAutoRefreshState) => {
  currentState = state;
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(TRADINGVIEW_MCP_AUTO_REFRESH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Auto-refresh metadata is small and optional; keep the in-memory state alive.
  }
};

const publishAutoRefreshState = (
  state: TradingViewMcpAutoRefreshState,
  event?: TradingViewMcpAutoRefreshEvent
) => {
  const nextState = {
    ...state,
    lastEvent: event ?? state.lastEvent,
    updatedAt: now()
  };
  persistAutoRefreshState(nextState);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TRADINGVIEW_MCP_AUTO_REFRESH_UPDATED_EVENT, {
        detail: {
          state: nextState,
          event
        }
      })
    );
  }
  return nextState;
};

const buildEvent = (
  title: string,
  detail: string,
  severity: TradingViewMcpAutoRefreshEventSeverity,
  sourceFingerprint?: string
): TradingViewMcpAutoRefreshEvent => ({
  eventId: uid("tv_auto_refresh"),
  timestamp: now(),
  title,
  detail,
  severity,
  sourceFingerprint
});

const nextRefreshAtFor = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export function loadTradingViewMcpAutoRefreshState(): TradingViewMcpAutoRefreshState {
  if (currentState) {
    return currentState;
  }
  if (!isBrowser()) {
    currentState = defaultState();
    return currentState;
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_AUTO_REFRESH_STORAGE_KEY);
  if (!raw) {
    currentState = defaultState();
    return currentState;
  }
  try {
    currentState = sanitizeState(JSON.parse(raw) as Partial<TradingViewMcpAutoRefreshState>, {
      resetRuntime: true
    });
  } catch {
    currentState = defaultState();
  }
  persistAutoRefreshState(currentState);
  return currentState;
}

export function saveTradingViewMcpAutoRefreshSettings({
  candleLimit,
  refreshIntervalSeconds
}: {
  candleLimit?: number;
  refreshIntervalSeconds?: number;
}) {
  const state = loadTradingViewMcpAutoRefreshState();
  return publishAutoRefreshState({
    ...state,
    refreshIntervalSeconds: sanitizeInterval(refreshIntervalSeconds ?? state.refreshIntervalSeconds),
    candleLimit: sanitizeCandleLimit(candleLimit ?? state.candleLimit),
    updatedAt: now()
  });
}

const selectedUsageMode = (requested?: TradingViewMcpFeedUsageMode) => {
  if (requested) {
    return requested;
  }
  return loadActiveTradingViewMcpChartFeed()?.usageMode === "research_source" ? "research_source" : "chart_only";
};

const emitFailureState = ({
  detail,
  sourceFingerprint,
  state,
  title
}: {
  detail: string;
  sourceFingerprint?: string;
  state: TradingViewMcpAutoRefreshState;
  title: string;
}) => {
  const failures = state.consecutiveFailures + 1;
  const autoPaused = failures >= 3;
  if (autoPaused) {
    stopTradingViewMcpAutoRefresh(
      "Auto-refresh paused after 3 consecutive failures. Start npm.cmd run tradingview:mcp-bridge, then restart auto-refresh.",
      false
    );
  }
  return publishAutoRefreshState(
    {
      ...loadTradingViewMcpAutoRefreshState(),
      enabled: state.enabled && !autoPaused,
      status: autoPaused ? "paused" : "failed",
      consecutiveFailures: failures,
      lastError: detail,
      nextRefreshAt: autoPaused ? undefined : nextRefreshAtFor(state.refreshIntervalSeconds),
      updatedAt: now()
    },
    buildEvent(title, detail, autoPaused ? "warning" : "failed", sourceFingerprint)
  );
};

export async function refreshTradingViewMcpChartDataNow({
  activateLoop,
  candleLimit,
  refreshIntervalSeconds,
  symbol,
  timeframe,
  usageMode
}: TradingViewMcpAutoRefreshRequest): Promise<TradingViewMcpAutoRefreshState> {
  const baseState = saveTradingViewMcpAutoRefreshSettings({ candleLimit, refreshIntervalSeconds });
  const loopEnabled = Boolean(activateLoop ?? baseState.enabled);
  if (inFlight) {
    return publishAutoRefreshState(
      {
        ...baseState,
        enabled: loopEnabled,
        status: loopEnabled ? "running" : "starting",
        lastError: "Previous TradingView MCP refresh is still running.",
        updatedAt: now()
      },
      buildEvent("TradingView refresh skipped", "Previous refresh is still running.", "warning", symbol)
    );
  }

  inFlight = true;
  const refreshStarted = publishAutoRefreshState(
    {
      ...baseState,
      enabled: loopEnabled,
      status: loopEnabled ? "running" : "starting",
      lastError: undefined,
      lastSymbol: symbol,
      lastTimeframe: timeframe,
      updatedAt: now()
    },
    buildEvent("TradingView refresh started", `Refreshing ${symbol} ${timeframe} read-only chart data.`, "running")
  );

  try {
    const settings = saveTradingViewMcpSettings({ ...loadTradingViewMcpSettings(), enabled: true });
    const status = await checkTradingViewMcpBridgeStatus(settings);
    saveTradingViewMcpBridgeStatus(status);
    if (status.connectionStatus !== "connected_analysis_only") {
      return emitFailureState({
        state: refreshStarted,
        title: "TradingView auto-refresh failed",
        detail: "TradingView MCP wrapper disconnected. Start npm.cmd run tradingview:mcp-bridge.",
        sourceFingerprint: status.message
      });
    }

    const quote = await fetchTradingViewMcpQuote({ symbol, timeframe }, settings);
    publishAutoRefreshState(
      {
        ...loadTradingViewMcpAutoRefreshState(),
        lastBridgeStatus: status.connectionStatus,
        lastPrice: quote.latestPrice,
        updatedAt: now()
      },
      buildEvent(
        "TradingView quote updated",
        quote.latestPrice ? `Latest read-only price ${quote.latestPrice}.` : quote.missingEvidence.join(" ") || "No quote returned.",
        quote.latestPrice ? "success" : "warning",
        quote.timestamp
      )
    );

    const candles = await fetchTradingViewMcpCandles(
      { symbol, timeframe, limit: sanitizeCandleLimit(candleLimit ?? baseState.candleLimit) },
      settings
    );
    if (!candles.candleCount) {
      return emitFailureState({
        state: loadTradingViewMcpAutoRefreshState(),
        title: "TradingView candle refresh failed",
        detail:
          candles.missingEvidence.join(" ") ||
          "TradingView MCP returned zero candles. Keeping the previous chart feed visible.",
        sourceFingerprint: candles.connectionStatus
      });
    }

    const feed: ActiveTradingViewMcpChartFeed = await storeActiveTradingViewMcpChartFeed(
      createActiveTradingViewMcpChartFeed({
        candlesResponse: candles,
        gotraderSymbol: symbol,
        gotraderTimeframe: timeframe,
        usageMode: selectedUsageMode(usageMode)
      })
    );

    publishAutoRefreshState(
      {
        ...loadTradingViewMcpAutoRefreshState(),
        lastBridgeStatus: status.connectionStatus,
        lastPrice: quote.latestPrice ?? feed.latestClose,
        lastCandleCount: feed.candleCount,
        lastCandleTimestamp: feed.lastTimestamp,
        lastStorageBackend: feed.storageBackend,
        lastFeedId: feed.feedId,
        updatedAt: now()
      },
      buildEvent(
        "TradingView candles updated",
        `${feed.candleCount.toLocaleString()} read-only candles refreshed. Storage ${feed.candlesPersisted ? "IndexedDB" : "session-only"}.`,
        "success",
        feed.providerSymbol
      )
    );

    return publishAutoRefreshState(
      {
        ...loadTradingViewMcpAutoRefreshState(),
        enabled: loopEnabled,
        status: loopEnabled ? "running" : "stopped",
        lastRefreshAt: now(),
        nextRefreshAt: loopEnabled ? nextRefreshAtFor(baseState.refreshIntervalSeconds) : undefined,
        refreshCount: loadTradingViewMcpAutoRefreshState().refreshCount + 1,
        consecutiveFailures: 0,
        lastError: undefined,
        updatedAt: now()
      },
      buildEvent(
        "TradingView chart source refreshed",
        `${feed.providerSymbol} ${feed.timeframe}; ${authoritySummary}`,
        "success",
        feed.matchState
      )
    );
  } catch (error) {
    return emitFailureState({
      state: loadTradingViewMcpAutoRefreshState(),
      title: "TradingView auto-refresh failed",
      detail: error instanceof Error ? error.message : "TradingView MCP refresh failed.",
      sourceFingerprint: symbol
    });
  } finally {
    inFlight = false;
  }
}

const runScheduledRefresh = () => {
  const state = loadTradingViewMcpAutoRefreshState();
  if (!activeRequest || !state.enabled) {
    return;
  }
  if (typeof document !== "undefined" && document.hidden) {
    publishAutoRefreshState(
      {
        ...state,
        status: "paused",
        nextRefreshAt: nextRefreshAtFor(state.refreshIntervalSeconds),
        updatedAt: now()
      },
      buildEvent("TradingView auto-refresh paused", "Browser tab is hidden; refresh will resume when visible.", "warning")
    );
    return;
  }
  void refreshTradingViewMcpChartDataNow({
    ...activeRequest,
    candleLimit: state.candleLimit,
    refreshIntervalSeconds: state.refreshIntervalSeconds
  });
};

export async function startTradingViewMcpAutoRefresh(request: TradingViewMcpAutoRefreshRequest) {
  stopTradingViewMcpAutoRefresh("Restarting TradingView MCP auto-refresh.", false);
  const state = saveTradingViewMcpAutoRefreshSettings({
    candleLimit: request.candleLimit,
    refreshIntervalSeconds: request.refreshIntervalSeconds
  });
  activeRequest = {
    ...request,
    activateLoop: true,
    candleLimit: state.candleLimit,
    refreshIntervalSeconds: state.refreshIntervalSeconds
  };
  publishAutoRefreshState(
    {
      ...state,
      enabled: true,
      status: "starting",
      nextRefreshAt: undefined,
      consecutiveFailures: 0,
      lastError: undefined,
      updatedAt: now()
    },
    buildEvent(
      "TradingView auto-refresh started",
      `Every ${state.refreshIntervalSeconds}s, ${state.candleLimit.toLocaleString()} candles, read-only chart data.`,
      "running",
      `${request.symbol} ${request.timeframe}`
    )
  );
  const refreshed = await refreshTradingViewMcpChartDataNow(activeRequest);
  if (isBrowser() && refreshed.enabled && refreshed.consecutiveFailures < 3) {
    autoRefreshTimer = window.setInterval(runScheduledRefresh, refreshed.refreshIntervalSeconds * 1000);
  }
  return loadTradingViewMcpAutoRefreshState();
}

export function stopTradingViewMcpAutoRefresh(reason = "TradingView MCP auto-refresh stopped.", emitEvent = true) {
  if (autoRefreshTimer !== undefined && typeof window !== "undefined") {
    window.clearInterval(autoRefreshTimer);
  }
  autoRefreshTimer = undefined;
  activeRequest = undefined;
  inFlight = false;
  const state = loadTradingViewMcpAutoRefreshState();
  const next = {
    ...state,
    enabled: false,
    status: "stopped" as const,
    nextRefreshAt: undefined,
    updatedAt: now()
  };
  if (!emitEvent) {
    persistAutoRefreshState(next);
    return next;
  }
  return publishAutoRefreshState(next, buildEvent("TradingView auto-refresh stopped", reason, "info"));
}
