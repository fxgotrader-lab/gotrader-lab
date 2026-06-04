import {
  checkMt5ReadOnlyStatus,
  fetchMt5ReadOnlyCandles,
  fetchMt5ReadOnlyQuote,
  loadActiveMt5ReadOnlyCandleFeed,
  loadMt5ReadOnlySettings,
  saveMt5ReadOnlySettings,
  storeActiveMt5ReadOnlyCandleFeed
} from "@/lib/integrations/mt5/mt5ReadOnlyClient";
import {
  buildMt5ReadOnlyCandleFingerprint,
  createActiveMt5ReadOnlyCandleFeed
} from "@/lib/integrations/mt5/mt5ReadOnlyNormalizer";
import type {
  ActiveMt5ReadOnlyCandleFeed,
  Mt5ReadOnlyFeedUsageMode,
  Mt5ReadOnlyQuote
} from "@/lib/integrations/mt5/mt5ReadOnlyTypes";

export const MT5_READ_ONLY_AUTO_REFRESH_STORAGE_KEY = "gotrader-ai-lab-mt5-readonly-auto-refresh";
export const MT5_READ_ONLY_AUTO_REFRESH_UPDATED_EVENT = "gotrader-ai-lab-mt5-readonly-auto-refresh-updated";

export const mt5ReadOnlyAutoRefreshIntervalOptions = ["manual", 10, 15, 25] as const;
export const mt5ReadOnlyAutoRefreshCandleLimitOptions = [400, 1000] as const;

export type Mt5ReadOnlyAutoRefreshInterval = (typeof mt5ReadOnlyAutoRefreshIntervalOptions)[number];
export type Mt5ReadOnlyAutoRefreshStatus = "idle" | "running" | "paused" | "error" | "stopped";
export type Mt5ReadOnlyStorageWriteStatus = "none" | "written" | "skipped_unchanged" | "session_only" | "error";
export type Mt5ReadOnlyAutoRefreshEventSeverity = "info" | "success" | "warning" | "failed" | "running";
export type Mt5ReadOnlyManualRefreshResult = "updated" | "unchanged" | "failed" | "skipped_overlap";

export interface Mt5ReadOnlyRefreshPhaseTiming {
  detail?: string;
  durationMs: number;
  phase: string;
}

export interface Mt5ReadOnlyAutoRefreshEvent {
  eventId: string;
  timestamp: string;
  title: string;
  detail: string;
  severity: Mt5ReadOnlyAutoRefreshEventSeverity;
  sourceFingerprint?: string;
}

export interface Mt5ReadOnlyAutoRefreshState {
  enabled: boolean;
  status: Mt5ReadOnlyAutoRefreshStatus;
  refreshInProgress: boolean;
  interval: Mt5ReadOnlyAutoRefreshInterval;
  candleLimit: 400 | 1000;
  lastRefreshAt?: string;
  lastRefreshDurationMs?: number;
  lastRefreshPhaseTimings: Mt5ReadOnlyRefreshPhaseTiming[];
  lastCheckedAt?: string;
  nextRefreshAt?: string;
  refreshCount: number;
  skippedOverlapCount: number;
  skippedUnchangedCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastQuote?: Mt5ReadOnlyQuote;
  lastCandleTimestamp?: string;
  lastCandleFingerprint?: string;
  lastCandleCount: number;
  lastCandleUpdateAt?: string;
  lastStorageWriteStatus: Mt5ReadOnlyStorageWriteStatus;
  lastManualRefreshAt?: string;
  lastManualRefreshDurationMs?: number;
  lastManualRefreshResult?: Mt5ReadOnlyManualRefreshResult;
  lastManualRefreshCandleCount?: number;
  lastManualRefreshSourceRegistered?: boolean;
  lastManualRefreshStorageWriteStatus?: Mt5ReadOnlyStorageWriteStatus;
  lastManualRefreshError?: string;
  lastFeedId?: string;
  lastBrokerSymbol?: string;
  lastRequestedSymbol?: string;
  lastTimeframe?: string;
  lastEvent?: Mt5ReadOnlyAutoRefreshEvent;
  updatedAt: string;
}

export interface Mt5ReadOnlyAutoRefreshRequest {
  brokerSymbol?: string;
  candleLimit?: number;
  interval?: Mt5ReadOnlyAutoRefreshInterval | number | string;
  requestedSymbol?: string;
  timeframe?: string;
  usageMode?: Mt5ReadOnlyFeedUsageMode;
  activateLoop?: boolean;
  emitStartEvent?: boolean;
  trigger?: "auto" | "manual";
}

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const hiddenRefreshIntervalSeconds = 25;

let autoRefreshTimer: number | undefined;
let activeRequest: Mt5ReadOnlyAutoRefreshRequest | undefined;
let currentState: Mt5ReadOnlyAutoRefreshState | undefined;
let inFlight = false;
let visibilityHandler: (() => void) | undefined;

const authoritySummary = "MT5 read-only remains market-data only. Execution, broker, and readiness authority are none.";

const sanitizeInterval = (value?: Mt5ReadOnlyAutoRefreshRequest["interval"]): Mt5ReadOnlyAutoRefreshInterval => {
  if (value === "manual") {
    return "manual";
  }
  const parsed = Number(value);
  if (parsed === 10 || parsed === 15 || parsed === 25) {
    return parsed;
  }
  return 15;
};

const sanitizeCandleLimit = (value?: number): Mt5ReadOnlyAutoRefreshState["candleLimit"] =>
  value === 400 ? 400 : 1000;

const intervalSecondsFor = (interval: Mt5ReadOnlyAutoRefreshInterval) =>
  interval === "manual" ? undefined : interval;

const defaultState = (): Mt5ReadOnlyAutoRefreshState => ({
  enabled: false,
  status: "idle",
  refreshInProgress: false,
  interval: 15,
  candleLimit: 1000,
  refreshCount: 0,
  skippedOverlapCount: 0,
  skippedUnchangedCount: 0,
  failureCount: 0,
  consecutiveFailures: 0,
  lastCandleCount: 0,
  lastRefreshPhaseTimings: [],
  lastStorageWriteStatus: "none",
  updatedAt: now()
});

const sanitizeState = (
  state: Partial<Mt5ReadOnlyAutoRefreshState> = {},
  { resetRuntime = false }: { resetRuntime?: boolean } = {}
): Mt5ReadOnlyAutoRefreshState => {
  const runtimeStatus =
    resetRuntime && (state.status === "running" || state.status === "paused")
      ? "stopped"
      : state.status;
  return {
    ...defaultState(),
    ...state,
    enabled: resetRuntime ? false : Boolean(state.enabled),
    status: runtimeStatus ?? "idle",
    refreshInProgress: resetRuntime ? false : Boolean(state.refreshInProgress),
    interval: sanitizeInterval(state.interval),
    candleLimit: sanitizeCandleLimit(state.candleLimit),
    refreshCount: Math.max(0, Number(state.refreshCount ?? 0)),
    skippedOverlapCount: Math.max(0, Number(state.skippedOverlapCount ?? 0)),
    skippedUnchangedCount: Math.max(0, Number(state.skippedUnchangedCount ?? 0)),
    failureCount: Math.max(0, Number(state.failureCount ?? 0)),
    consecutiveFailures: Math.max(0, Number(state.consecutiveFailures ?? 0)),
    lastCandleCount: Math.max(0, Number(state.lastCandleCount ?? 0)),
    lastRefreshDurationMs:
      state.lastRefreshDurationMs === undefined ? undefined : Math.max(0, Number(state.lastRefreshDurationMs)),
    lastRefreshPhaseTimings: Array.isArray(state.lastRefreshPhaseTimings)
      ? state.lastRefreshPhaseTimings
          .filter((timing): timing is Mt5ReadOnlyRefreshPhaseTiming =>
            Boolean(timing && typeof timing.phase === "string" && Number.isFinite(Number(timing.durationMs)))
          )
          .map((timing) => ({
            detail: timing.detail,
            durationMs: Math.max(0, Number(timing.durationMs)),
            phase: timing.phase
          }))
          .slice(-20)
      : [],
    lastStorageWriteStatus: state.lastStorageWriteStatus ?? "none",
    updatedAt: state.updatedAt ?? now()
  };
};

const persistAutoRefreshState = (state: Mt5ReadOnlyAutoRefreshState) => {
  currentState = state;
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(MT5_READ_ONLY_AUTO_REFRESH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // MT5 auto-refresh state is small and recoverable; keep the in-memory state.
  }
};

const publishAutoRefreshState = (
  state: Mt5ReadOnlyAutoRefreshState,
  event?: Mt5ReadOnlyAutoRefreshEvent
) => {
  const nextState = {
    ...state,
    lastEvent: event ?? state.lastEvent,
    updatedAt: now()
  };
  persistAutoRefreshState(nextState);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MT5_READ_ONLY_AUTO_REFRESH_UPDATED_EVENT, {
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
  severity: Mt5ReadOnlyAutoRefreshEventSeverity,
  sourceFingerprint?: string
): Mt5ReadOnlyAutoRefreshEvent => ({
  eventId: uid("mt5_auto_refresh"),
  timestamp: now(),
  title,
  detail,
  severity,
  sourceFingerprint
});

const nextRefreshAtFor = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export function loadMt5ReadOnlyAutoRefreshState(): Mt5ReadOnlyAutoRefreshState {
  if (currentState) {
    return currentState;
  }
  if (!isBrowser()) {
    currentState = defaultState();
    return currentState;
  }
  const raw = window.localStorage.getItem(MT5_READ_ONLY_AUTO_REFRESH_STORAGE_KEY);
  if (!raw) {
    currentState = defaultState();
    return currentState;
  }
  try {
    currentState = sanitizeState(JSON.parse(raw) as Partial<Mt5ReadOnlyAutoRefreshState>, {
      resetRuntime: true
    });
  } catch {
    currentState = defaultState();
  }
  persistAutoRefreshState(currentState);
  return currentState;
}

export function saveMt5ReadOnlyAutoRefreshSettings({
  candleLimit,
  interval
}: {
  candleLimit?: number;
  interval?: Mt5ReadOnlyAutoRefreshRequest["interval"];
}) {
  const state = loadMt5ReadOnlyAutoRefreshState();
  return publishAutoRefreshState({
    ...state,
    interval: sanitizeInterval(interval ?? state.interval),
    candleLimit: sanitizeCandleLimit(candleLimit ?? state.candleLimit),
    updatedAt: now()
  });
}

const selectedUsageMode = (requested?: Mt5ReadOnlyFeedUsageMode) => {
  if (requested) {
    return requested;
  }
  return loadActiveMt5ReadOnlyCandleFeed()?.usageMode === "research_source" ? "research_source" : "chart_only";
};

const resolveRequest = (request: Mt5ReadOnlyAutoRefreshRequest, state: Mt5ReadOnlyAutoRefreshState) => {
  const settings = loadMt5ReadOnlySettings();
  const requestedSymbol = (request.requestedSymbol || settings.requestedSymbol || "MNQ").trim();
  const brokerSymbol = (request.brokerSymbol || settings.brokerSymbolOverride || "USTECH").trim();
  const timeframe = (request.timeframe || settings.timeframe || "5m").trim();
  const candleLimit = sanitizeCandleLimit(request.candleLimit ?? settings.candleLimit ?? state.candleLimit);
  const interval = sanitizeInterval(request.interval ?? state.interval);
  const savedSettings = saveMt5ReadOnlySettings({
    enabled: true,
    requestedSymbol,
    brokerSymbolOverride: brokerSymbol,
    timeframe,
    candleLimit
  });
  return {
    brokerSymbol,
    candleLimit,
    interval,
    requestedSymbol,
    settings: savedSettings,
    timeframe,
    usageMode: selectedUsageMode(request.usageMode)
  };
};

const emitFailureState = ({
  detail,
  sourceFingerprint,
  state,
  title
}: {
  detail: string;
  sourceFingerprint?: string;
  state: Mt5ReadOnlyAutoRefreshState;
  title: string;
}) => {
  const failures = state.consecutiveFailures + 1;
  const autoPaused = failures >= 3;
  if (autoPaused) {
    stopMt5ReadOnlyAutoRefresh(
      "MT5 auto-refresh stopped after 3 consecutive failures. Verify MT5 upstream on 8000 and GoTrader wrapper on 7341, then restart refresh.",
      false
    );
  }
  return publishAutoRefreshState(
    {
      ...loadMt5ReadOnlyAutoRefreshState(),
      enabled: state.enabled && !autoPaused,
      status: autoPaused ? "paused" : "error",
      refreshInProgress: false,
      failureCount: state.failureCount + 1,
      consecutiveFailures: failures,
      lastError: detail,
      lastCheckedAt: now(),
      nextRefreshAt:
        autoPaused || state.interval === "manual"
          ? undefined
          : nextRefreshAtFor(intervalSecondsFor(state.interval) ?? 15),
      updatedAt: now()
    },
    buildEvent(title, detail, autoPaused ? "warning" : "failed", sourceFingerprint)
  );
};

export async function refreshMt5ReadOnlyNow(
  request: Mt5ReadOnlyAutoRefreshRequest = {}
): Promise<Mt5ReadOnlyAutoRefreshState> {
  const startedAtMs = Date.now();
  const isManualRefresh = request.trigger === "manual" || request.activateLoop === false;
  const phaseTimings: Mt5ReadOnlyRefreshPhaseTiming[] = [];
  const nowMs = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());
  const recordPhase = (phase: string, started: number, detail?: string) => {
    phaseTimings.push({
      detail,
      durationMs: Math.round((nowMs() - started) * 10) / 10,
      phase
    });
  };
  const timePhase = async <T,>(phase: string, fn: () => Promise<T>, detail?: string): Promise<T> => {
    const started = nowMs();
    try {
      return await fn();
    } finally {
      recordPhase(phase, started, detail);
    }
  };
  const timeSyncPhase = <T,>(phase: string, fn: () => T, detail?: string): T => {
    const started = nowMs();
    try {
      return fn();
    } finally {
      recordPhase(phase, started, detail);
    }
  };
  const refreshDuration = () => Math.max(0, Date.now() - startedAtMs);
  const buildManualDiagnostics = ({
    candleCount,
    error,
    result,
    sourceRegistered,
    storageWriteStatus,
    timestamp = now()
  }: {
    candleCount?: number;
    error?: string;
    result: Mt5ReadOnlyManualRefreshResult;
    sourceRegistered?: boolean;
    storageWriteStatus?: Mt5ReadOnlyStorageWriteStatus;
    timestamp?: string;
  }): Partial<Mt5ReadOnlyAutoRefreshState> =>
    isManualRefresh
      ? {
          lastManualRefreshAt: timestamp,
          lastManualRefreshDurationMs: refreshDuration(),
          lastManualRefreshResult: result,
          lastManualRefreshCandleCount: candleCount,
          lastManualRefreshSourceRegistered: sourceRegistered,
          lastManualRefreshStorageWriteStatus: storageWriteStatus,
          lastManualRefreshError: error
        }
      : {};
  const baseState = saveMt5ReadOnlyAutoRefreshSettings({
    candleLimit: request.candleLimit,
    interval: request.interval
  });
  const resolved = resolveRequest(request, baseState);
  const loopEnabled = Boolean(request.activateLoop ?? baseState.enabled) && resolved.interval !== "manual";

  if (inFlight) {
    const skippedState = loadMt5ReadOnlyAutoRefreshState();
    const skippedCount = skippedState.skippedOverlapCount + 1;
    return publishAutoRefreshState(
      {
        ...skippedState,
        enabled: loopEnabled,
        status: loopEnabled ? "running" : "idle",
        refreshInProgress: true,
        skippedOverlapCount: skippedCount,
        lastError: "Previous MT5 refresh is still running.",
        ...buildManualDiagnostics({
          error: "Previous MT5 refresh is still running.",
          result: "skipped_overlap"
        }),
        updatedAt: now()
      },
      skippedCount === 1
        ? buildEvent("MT5 refresh skipped", "Previous refresh is still running; no extra request was queued.", "warning", resolved.brokerSymbol)
        : undefined
    );
  }

  inFlight = true;
  const refreshStarted = publishAutoRefreshState(
    {
      ...baseState,
      enabled: loopEnabled,
      status: loopEnabled ? "running" : "idle",
      refreshInProgress: true,
      lastError: undefined,
      lastBrokerSymbol: resolved.brokerSymbol,
      lastRequestedSymbol: resolved.requestedSymbol,
      lastTimeframe: resolved.timeframe,
      updatedAt: now()
    },
    request.emitStartEvent
      ? buildEvent(
          "MT5 refresh started",
          `Refreshing ${resolved.brokerSymbol} for requested ${resolved.requestedSymbol} ${resolved.timeframe}.`,
          "running",
          resolved.brokerSymbol
        )
      : undefined
  );

  try {
    const status = await timePhase("status_check", () => checkMt5ReadOnlyStatus(resolved.settings), resolved.settings.bridgeUrl);
    if (status.connectionStatus !== "connected" && status.connectionStatus !== "degraded") {
      return emitFailureState({
        state: {
          ...refreshStarted,
          lastRefreshDurationMs: refreshDuration(),
          lastRefreshPhaseTimings: phaseTimings,
          ...buildManualDiagnostics({
            error: `MT5 read-only bridge disconnected: ${status.message}`,
            result: "failed",
            timestamp: now()
          })
        },
        title: "MT5 refresh failed",
        detail: `MT5 read-only bridge disconnected: ${status.message}`,
        sourceFingerprint: resolved.brokerSymbol
      });
    }

    const quote = await timePhase(
      "fetch_quote",
      () =>
        fetchMt5ReadOnlyQuote(
          { symbol: resolved.requestedSymbol, brokerSymbol: resolved.brokerSymbol },
          resolved.settings
        ),
      resolved.brokerSymbol
    );
    const candlesResponse = await timePhase(
      "fetch_candles",
      () =>
        fetchMt5ReadOnlyCandles(
          {
            symbol: resolved.requestedSymbol,
            brokerSymbol: resolved.brokerSymbol,
            timeframe: resolved.timeframe,
            limit: resolved.candleLimit
          },
          resolved.settings
        ),
      `${resolved.brokerSymbol} ${resolved.timeframe} ${resolved.candleLimit}`
    );
    if (!candlesResponse.candles.length) {
      return emitFailureState({
        state: {
          ...loadMt5ReadOnlyAutoRefreshState(),
          lastRefreshDurationMs: refreshDuration(),
          lastRefreshPhaseTimings: phaseTimings,
          ...buildManualDiagnostics({
            candleCount: 0,
            error:
              candlesResponse.missingEvidence.join(" ") ||
              "MT5 read-only wrapper returned zero candles. Keeping the previous source visible.",
            result: "failed",
            sourceRegistered: false,
            storageWriteStatus: "none",
            timestamp: now()
          })
        },
        title: "MT5 candle refresh failed",
        detail:
          candlesResponse.missingEvidence.join(" ") ||
          "MT5 read-only wrapper returned zero candles. Keeping the previous source visible.",
        sourceFingerprint: candlesResponse.connectionStatus
      });
    }

    const checkedAt = now();
    const candidateFeed = timeSyncPhase(
      "normalize_candles",
      () =>
        createActiveMt5ReadOnlyCandleFeed({
          candlesResponse,
          gotraderSymbol: resolved.requestedSymbol,
          gotraderTimeframe: resolved.timeframe,
          latestQuote: quote,
          usageMode: resolved.usageMode
        }),
      `${candlesResponse.candles.length} candles`
    );
    const candleFingerprint =
      candidateFeed.candleFingerprint ??
      timeSyncPhase(
        "build_candidate_fingerprint",
        () => buildMt5ReadOnlyCandleFingerprint(candidateFeed.candles),
        `${candidateFeed.candles.length} candles`
      );
    const existingFeed = timeSyncPhase("load_existing_feed", () => loadActiveMt5ReadOnlyCandleFeed());
    const existingFingerprint = timeSyncPhase(
      "fingerprint_compare",
      () =>
        existingFeed?.candleFingerprint ??
        (existingFeed?.candles.length ? buildMt5ReadOnlyCandleFingerprint(existingFeed.candles) : undefined),
      existingFeed?.feedId
    );
    const fingerprintChanged = candleFingerprint !== existingFingerprint;
    const canSkipCandleWrite = Boolean(existingFeed?.candles.length && !fingerprintChanged);
    let storageWriteStatus: Mt5ReadOnlyStorageWriteStatus = "none";
    let feed: ActiveMt5ReadOnlyCandleFeed;

    if (canSkipCandleWrite && existingFeed) {
      storageWriteStatus = "skipped_unchanged";
      feed = existingFeed;
    } else {
      const shouldPersistCandles =
        !existingFeed?.candlesPersisted || existingFeed.lastTimestamp !== candidateFeed.lastTimestamp;
      feed = await timePhase(
        "canonical_source_register",
        () =>
          storeActiveMt5ReadOnlyCandleFeed(
            {
              ...candidateFeed,
              candleFingerprint,
              fetchedAt: checkedAt,
              storedAt: shouldPersistCandles ? checkedAt : existingFeed?.storedAt ?? checkedAt
            },
            {
              persist: shouldPersistCandles
            }
          ),
        `${candidateFeed.candles.length} candles${shouldPersistCandles ? "" : " session-only"}`
      );
      storageWriteStatus = feed.candlesPersisted ? "written" : "session_only";
    }

    const latestState = loadMt5ReadOnlyAutoRefreshState();
    const recoveredFromFailure =
      baseState.consecutiveFailures > 0 || baseState.status === "error" || baseState.status === "paused";
    const firstSuccess = !baseState.refreshCount && !baseState.lastRefreshAt;
    const shouldEmitUnchangedEvent = canSkipCandleWrite && latestState.skippedUnchangedCount === 0;
    const shouldEmitSuccessEvent = firstSuccess || recoveredFromFailure || fingerprintChanged || shouldEmitUnchangedEvent;
    const successTitle = recoveredFromFailure
      ? "MT5 refresh recovered"
      : fingerprintChanged
        ? "MT5 candles updated"
        : "MT5 refresh skipped unchanged";
    const successDetail = canSkipCandleWrite
      ? `${feed.candleCount.toLocaleString()} candles unchanged; IndexedDB candle write skipped. ${authoritySummary}`
      : `${feed.candleCount.toLocaleString()} read-only candles refreshed from ${feed.brokerSymbol ?? feed.symbol}. Storage ${feed.candlesPersisted ? "IndexedDB" : "session-only"}.`;
    const nextSeconds = intervalSecondsFor(baseState.interval);

    return publishAutoRefreshState(
      {
        ...latestState,
        enabled: loopEnabled,
        status: loopEnabled ? "running" : "idle",
        refreshInProgress: false,
        lastQuote: quote,
        lastCandleCount: feed.candleCount,
        lastCandleTimestamp: feed.lastTimestamp,
        lastCandleFingerprint: candleFingerprint,
        lastCandleUpdateAt: fingerprintChanged || !latestState.lastCandleUpdateAt ? checkedAt : latestState.lastCandleUpdateAt,
        lastCheckedAt: checkedAt,
        lastRefreshAt: checkedAt,
        nextRefreshAt: loopEnabled && nextSeconds ? nextRefreshAtFor(nextSeconds) : undefined,
        refreshCount: latestState.refreshCount + 1,
        skippedUnchangedCount: latestState.skippedUnchangedCount + (canSkipCandleWrite ? 1 : 0),
        consecutiveFailures: 0,
        lastError: undefined,
        lastRefreshDurationMs: refreshDuration(),
        lastRefreshPhaseTimings: phaseTimings,
        lastStorageWriteStatus: storageWriteStatus,
        ...buildManualDiagnostics({
          candleCount: feed.candleCount,
          result: canSkipCandleWrite ? "unchanged" : "updated",
          sourceRegistered: Boolean(feed.feedId && feed.activeForChart),
          storageWriteStatus,
          timestamp: checkedAt
        }),
        lastFeedId: feed.feedId,
        lastBrokerSymbol: feed.brokerSymbol ?? resolved.brokerSymbol,
        lastRequestedSymbol: feed.requestedSymbol,
        lastTimeframe: feed.timeframe,
        updatedAt: now()
      },
      shouldEmitSuccessEvent ? buildEvent(successTitle, successDetail, canSkipCandleWrite ? "info" : "success", feed.candleFingerprint) : undefined
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "MT5 read-only refresh failed.";
    return emitFailureState({
      state: {
        ...loadMt5ReadOnlyAutoRefreshState(),
        lastRefreshDurationMs: refreshDuration(),
        lastRefreshPhaseTimings: phaseTimings,
        ...buildManualDiagnostics({
          error: detail,
          result: "failed",
          timestamp: now()
        })
      },
      title: "MT5 refresh failed",
      detail,
      sourceFingerprint: resolved.brokerSymbol
    });
  } finally {
    inFlight = false;
  }
}

const clearAutoRefreshTimer = () => {
  if (autoRefreshTimer !== undefined && typeof window !== "undefined") {
    window.clearTimeout(autoRefreshTimer);
  }
  autoRefreshTimer = undefined;
};

const scheduleNextAutoRefresh = (seconds: number) => {
  if (!isBrowser()) {
    return;
  }
  clearAutoRefreshTimer();
  autoRefreshTimer = window.setTimeout(runScheduledRefresh, Math.max(0, seconds) * 1000);
};

const ensureVisibilityListener = () => {
  if (typeof document === "undefined" || visibilityHandler) {
    return;
  }
  visibilityHandler = () => {
    const state = loadMt5ReadOnlyAutoRefreshState();
    if (!activeRequest || !state.enabled || document.hidden) {
      return;
    }
    if (state.status === "paused") {
      publishAutoRefreshState(
        {
          ...state,
          status: "running",
          nextRefreshAt: nextRefreshAtFor(0),
          updatedAt: now()
        },
        buildEvent("MT5 refresh resumed", "Browser tab is visible; normal refresh interval resumes.", "info")
      );
    }
    scheduleNextAutoRefresh(0);
  };
  document.addEventListener("visibilitychange", visibilityHandler);
};

const removeVisibilityListener = () => {
  if (typeof document !== "undefined" && visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
  }
  visibilityHandler = undefined;
};

const runScheduledRefresh = () => {
  const state = loadMt5ReadOnlyAutoRefreshState();
  if (!activeRequest || !state.enabled) {
    return;
  }
  if (typeof document !== "undefined" && document.hidden) {
    const alreadyPaused = state.status === "paused";
    publishAutoRefreshState(
      {
        ...state,
        status: "paused",
        refreshInProgress: false,
        nextRefreshAt: nextRefreshAtFor(hiddenRefreshIntervalSeconds),
        updatedAt: now()
      },
      alreadyPaused
        ? undefined
        : buildEvent(
            "MT5 refresh slowed",
            "Browser tab is hidden; refresh work is slowed to a 25s visibility check.",
            "warning"
          )
    );
    scheduleNextAutoRefresh(hiddenRefreshIntervalSeconds);
    return;
  }
  void refreshMt5ReadOnlyNow({
    ...activeRequest,
    candleLimit: state.candleLimit,
    emitStartEvent: false,
    interval: state.interval
  }).then((nextState) => {
    const nextSeconds = intervalSecondsFor(nextState.interval);
    if (nextState.enabled && nextState.consecutiveFailures < 3 && nextSeconds) {
      scheduleNextAutoRefresh(nextSeconds);
    }
  });
};

export async function startMt5ReadOnlyAutoRefresh(request: Mt5ReadOnlyAutoRefreshRequest = {}) {
  stopMt5ReadOnlyAutoRefresh("Restarting MT5 read-only auto-refresh.", false);
  const state = saveMt5ReadOnlyAutoRefreshSettings({
    candleLimit: request.candleLimit,
    interval: request.interval
  });
  const interval = sanitizeInterval(request.interval ?? state.interval);
  activeRequest = {
    ...request,
    activateLoop: interval !== "manual",
    candleLimit: state.candleLimit,
    emitStartEvent: false,
    interval
  };
  publishAutoRefreshState(
    {
      ...state,
      enabled: interval !== "manual",
      status: interval === "manual" ? "idle" : "running",
      refreshInProgress: false,
      nextRefreshAt: undefined,
      consecutiveFailures: 0,
      lastError: undefined,
      updatedAt: now()
    },
    buildEvent(
      "MT5 refresh started",
      interval === "manual"
        ? `Manual MT5 read-only refresh, ${state.candleLimit.toLocaleString()} candles.`
        : `Every ${interval}s, ${state.candleLimit.toLocaleString()} candles, read-only market data.`,
      "running"
    )
  );
  const refreshed = await refreshMt5ReadOnlyNow(activeRequest);
  const nextSeconds = intervalSecondsFor(refreshed.interval);
  if (isBrowser() && refreshed.enabled && refreshed.consecutiveFailures < 3 && nextSeconds) {
    ensureVisibilityListener();
    scheduleNextAutoRefresh(nextSeconds);
  }
  return loadMt5ReadOnlyAutoRefreshState();
}

export function stopMt5ReadOnlyAutoRefresh(reason = "MT5 read-only auto-refresh stopped.", emitEvent = true) {
  clearAutoRefreshTimer();
  removeVisibilityListener();
  activeRequest = undefined;
  inFlight = false;
  const state = loadMt5ReadOnlyAutoRefreshState();
  const next = {
    ...state,
    enabled: false,
    status: "stopped" as const,
    refreshInProgress: false,
    nextRefreshAt: undefined,
    updatedAt: now()
  };
  if (!emitEvent) {
    persistAutoRefreshState(next);
    return next;
  }
  return publishAutoRefreshState(next, buildEvent("MT5 refresh stopped", reason, "info"));
}
