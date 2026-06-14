import { mt5PushFeedEventBus, type Mt5PushFeedEventBus } from "./mt5PushFeedEventBus";
import {
  normalizeMt5PushFeedEvent,
  validateMt5PushFeedEventShape
} from "./mt5PushFeedNormalizer";
import {
  mt5PushFeedAuthority,
  type Mt5CanonicalCandle,
  type Mt5PushFeedEvent,
  type Mt5PushFeedIctTrigger,
  type Mt5PushFeedJournalEvent,
  type Mt5PushFeedProcessingResult,
  type Mt5PushFeedStatusSnapshot,
  type Mt5PushFeedStoreState
} from "./mt5PushFeedTypes";

export const MT5_PUSH_FEED_STATUS_UPDATED_EVENT = "gotrader:mt5-push-feed-status-updated";
export const MT5_PUSH_FEED_STORAGE_KEY = "gotrader.mt5-push-feed.status.v1";

const now = () => new Date().toISOString();

const seriesKeyFor = (candle: Pick<Mt5CanonicalCandle, "brokerSymbol" | "source" | "timeframe">) =>
  `${candle.source}:${candle.brokerSymbol}:${candle.timeframe}`;

const candleKeyFor = (candle: Pick<Mt5CanonicalCandle, "brokerSymbol" | "source" | "timeframe" | "timestamp">) =>
  `${seriesKeyFor(candle)}:${candle.timestamp}`;

export function createDefaultMt5PushFeedStatusSnapshot(): Mt5PushFeedStatusSnapshot {
  return {
    provider: "mt5_push_feed",
    status: "idle",
    connectionStatus: "unknown",
    sourceLabel: "MT5 push feed",
    activeSymbols: [],
    activeTimeframes: [],
    processedEventCount: 0,
    skippedDuplicateCount: 0,
    ignoredEventCount: 0,
    warnings: ["MT5 push feed is not connected. Polling may still be used for manual health checks."],
    ...mt5PushFeedAuthority
  };
}

export function createMt5PushFeedStoreState(): Mt5PushFeedStoreState {
  return {
    candlesBySeries: {},
    status: createDefaultMt5PushFeedStatusSnapshot(),
    journalEvents: []
  };
}

export function loadMt5PushFeedStatusSnapshot(): Mt5PushFeedStatusSnapshot {
  if (typeof window === "undefined") {
    return createDefaultMt5PushFeedStatusSnapshot();
  }
  try {
    const raw = window.localStorage.getItem(MT5_PUSH_FEED_STORAGE_KEY);
    if (!raw) {
      return createDefaultMt5PushFeedStatusSnapshot();
    }
    const parsed = JSON.parse(raw) as Partial<Mt5PushFeedStatusSnapshot>;
    return {
      ...createDefaultMt5PushFeedStatusSnapshot(),
      ...parsed,
      ...mt5PushFeedAuthority,
      activeSymbols: Array.isArray(parsed.activeSymbols) ? parsed.activeSymbols : [],
      activeTimeframes: Array.isArray(parsed.activeTimeframes) ? parsed.activeTimeframes : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
  } catch {
    return createDefaultMt5PushFeedStatusSnapshot();
  }
}

export function saveMt5PushFeedStatusSnapshot(status: Mt5PushFeedStatusSnapshot) {
  if (typeof window === "undefined") {
    return;
  }
  const compact: Mt5PushFeedStatusSnapshot = {
    ...status,
    ...mt5PushFeedAuthority
  };
  window.localStorage.setItem(MT5_PUSH_FEED_STORAGE_KEY, JSON.stringify(compact));
  window.dispatchEvent(new CustomEvent(MT5_PUSH_FEED_STATUS_UPDATED_EVENT, { detail: compact }));
}

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

function compactJournalEventFor(
  event: Mt5PushFeedEvent,
  status: Mt5PushFeedStatusSnapshot,
  candle?: Mt5CanonicalCandle
): Mt5PushFeedJournalEvent | undefined {
  if (event.type === "mt5.candle_closed" && candle) {
    return {
      eventType: "mt5_push_feed_candle_closed",
      timestamp: status.lastEventAt ?? now(),
      requestedSymbol: candle.requestedSymbol,
      brokerSymbol: candle.brokerSymbol,
      timeframe: candle.timeframe,
      sourceFingerprint: candle.sourceFingerprint,
      summary: `${candle.brokerSymbol} ${candle.timeframe} candle closed at ${candle.timestamp}.`,
      ...mt5PushFeedAuthority
    };
  }
  if (event.type === "mt5.connection_status") {
    return {
      eventType: event.connectionStatus === "connected" ? "mt5_push_feed_connected" : "mt5_push_feed_disconnected",
      timestamp: status.lastEventAt ?? now(),
      summary: event.message ?? `MT5 push feed ${event.connectionStatus}.`,
      ...mt5PushFeedAuthority
    };
  }
  if (event.type === "mt5.feed_stale") {
    return {
      eventType: "mt5_push_feed_stale",
      timestamp: status.lastEventAt ?? now(),
      summary: event.reason,
      ...mt5PushFeedAuthority
    };
  }
  return undefined;
}

function triggerFor(event: Mt5PushFeedEvent, candle?: Mt5CanonicalCandle): Mt5PushFeedIctTrigger {
  const triggeredAt = now();
  if (event.type === "mt5.candle_closed" && candle) {
    return {
      triggerType: "ict_current_read_refresh",
      reason: "Closed MT5 candle received from push feed.",
      symbol: candle.requestedSymbol,
      brokerSymbol: candle.brokerSymbol,
      timeframe: candle.timeframe,
      sourceFingerprint: candle.sourceFingerprint,
      triggeredAt,
      advisorPacketShouldRefresh: true,
      currentReadShouldRefresh: true,
      replayValidationMayQueue: true,
      ...mt5PushFeedAuthority
    };
  }
  if (event.type === "mt5.feed_stale") {
    return {
      triggerType: "feed_health_warning",
      reason: event.reason,
      triggeredAt,
      advisorPacketShouldRefresh: false,
      currentReadShouldRefresh: false,
      replayValidationMayQueue: false,
      ...mt5PushFeedAuthority
    };
  }
  return {
    triggerType: "none",
    reason: "No ICT recalculation trigger for this event.",
    triggeredAt,
    advisorPacketShouldRefresh: false,
    currentReadShouldRefresh: false,
    replayValidationMayQueue: false,
    ...mt5PushFeedAuthority
  };
}

export function processMt5PushFeedEvent(
  state: Mt5PushFeedStoreState,
  event: Mt5PushFeedEvent,
  options: {
    eventBus?: Mt5PushFeedEventBus;
    maxCandlesPerSeries?: number;
    persistStatus?: boolean;
    receivedAt?: string;
  } = {}
): Mt5PushFeedProcessingResult {
  const receivedAt = options.receivedAt ?? now();
  const shape = validateMt5PushFeedEventShape(event);
  if (!shape.valid) {
    state.status = {
      ...state.status,
      status: "error",
      connectionStatus: "error",
      lastEventAt: receivedAt,
      ignoredEventCount: state.status.ignoredEventCount + 1,
      lastError: shape.reason,
      warnings: unique([...state.status.warnings, shape.reason ?? "Invalid MT5 push-feed event."]),
      ...mt5PushFeedAuthority
    };
    if (options.persistStatus) {
      saveMt5PushFeedStatusSnapshot(state.status);
    }
    return {
      accepted: false,
      duplicate: false,
      status: state.status,
      warnings: [shape.reason ?? "Invalid MT5 push-feed event."],
      ...mt5PushFeedAuthority
    };
  }

  const normalizedEvent = normalizeMt5PushFeedEvent(event, receivedAt);
  const candle = normalizedEvent.candle;
  const duplicate =
    candle && event.type === "mt5.candle_closed"
      ? Boolean(state.candlesBySeries[seriesKeyFor(candle)]?.some((item) => candleKeyFor(item) === candleKeyFor(candle)))
      : false;

  if (candle && event.type === "mt5.candle_closed" && !duplicate) {
    const key = seriesKeyFor(candle);
    const existing = state.candlesBySeries[key] ?? [];
    const next = [...existing, candle].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
    state.candlesBySeries[key] = next.slice(-Math.max(1, options.maxCandlesPerSeries ?? 1000));
  }

  const activeSymbols = unique([
    ...state.status.activeSymbols,
    ...(event.type === "mt5.connection_status" || event.type === "mt5.feed_stale" ? event.activeSymbols ?? [] : []),
    candle?.brokerSymbol ?? "",
    normalizedEvent.tick?.brokerSymbol ?? ""
  ]);
  const activeTimeframes = unique([
    ...state.status.activeTimeframes,
    ...(event.type === "mt5.connection_status" || event.type === "mt5.feed_stale" ? event.activeTimeframes ?? [] : []),
    candle?.timeframe ?? ""
  ]);

  const connectionStatus =
    event.type === "mt5.connection_status"
      ? event.connectionStatus
      : event.type === "mt5.feed_stale"
        ? "degraded"
        : "connected";
  const trigger = duplicate ? triggerFor({ type: "mt5.connection_status", connectionStatus: "connected" }, undefined) : triggerFor(event, candle);

  state.status = {
    ...state.status,
    status: event.type === "mt5.feed_stale" ? "stale" : connectionStatus === "connected" ? "connected" : connectionStatus,
    connectionStatus,
    lastEventAt: receivedAt,
    lastTickAt: normalizedEvent.tick?.serverTimestamp ?? state.status.lastTickAt,
    lastCandleReceivedAt: candle ? receivedAt : state.status.lastCandleReceivedAt,
    lastCandleTimestamp: candle?.timestamp ?? state.status.lastCandleTimestamp,
    lastCandleFingerprint: candle?.sourceFingerprint ?? state.status.lastCandleFingerprint,
    staleFeedWarning: event.type === "mt5.feed_stale" ? event.reason : undefined,
    activeSymbols,
    activeTimeframes,
    processedEventCount: state.status.processedEventCount + (duplicate ? 0 : 1),
    skippedDuplicateCount: state.status.skippedDuplicateCount + (duplicate ? 1 : 0),
    warnings: normalizedEvent.warnings,
    lastError: undefined,
    ...mt5PushFeedAuthority
  };
  state.latestTrigger = trigger;

  const journalEvent = duplicate ? undefined : compactJournalEventFor(event, state.status, candle);
  if (journalEvent) {
    state.journalEvents = [...state.journalEvents, journalEvent].slice(-100);
  }

  if (!duplicate) {
    (options.eventBus ?? mt5PushFeedEventBus).publish(normalizedEvent);
  }
  if (options.persistStatus) {
    saveMt5PushFeedStatusSnapshot(state.status);
  }

  return {
    accepted: !duplicate,
    duplicate,
    normalizedEvent,
    trigger,
    status: state.status,
    warnings: normalizedEvent.warnings,
    ...mt5PushFeedAuthority
  };
}

export const defaultMt5PushFeedStoreState = createMt5PushFeedStoreState();
