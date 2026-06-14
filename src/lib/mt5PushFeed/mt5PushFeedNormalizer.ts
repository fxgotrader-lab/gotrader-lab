import {
  mt5PushFeedAuthority,
  type CanonicalTick,
  type Mt5CanonicalCandle,
  type Mt5PushFeedCanonicalEvent,
  type Mt5PushFeedCandleEvent,
  type Mt5PushFeedEvent
} from "./mt5PushFeedTypes";
import {
  normalizeMt5PushFeedTimeframe,
  resolveMt5PushFeedSymbolMapping
} from "./mt5PushFeedSymbolMapping";

const validNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export function parseMt5PushFeedTimestamp(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return fallback;
}

const compactNumber = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(8)) : "n/a";

export function createMt5PushFeedFingerprint({
  brokerSymbol,
  close,
  receivedAt,
  source = "mt5",
  timeframe,
  timestamp
}: {
  brokerSymbol: string;
  close?: number;
  receivedAt: string;
  source?: "mt5";
  timeframe?: string;
  timestamp: string;
}) {
  return [source, brokerSymbol, timeframe ?? "tick", timestamp, compactNumber(close), receivedAt].join("|");
}

function candleTimestamp(event: Mt5PushFeedCandleEvent, receivedAt: string) {
  return parseMt5PushFeedTimestamp(
    event.candle.timestamp ?? event.candle.time ?? event.serverTimestamp ?? event.publisherTimestamp,
    receivedAt
  );
}

export function normalizeMt5PushFeedCandleEvent(
  event: Mt5PushFeedCandleEvent,
  receivedAt = new Date().toISOString()
): Mt5CanonicalCandle {
  const mapping = resolveMt5PushFeedSymbolMapping({
    brokerSymbol: event.brokerSymbol,
    requestedSymbol: event.requestedSymbol ?? event.normalizedSymbol
  });
  const timeframe = normalizeMt5PushFeedTimeframe(event.timeframe);
  const timestamp = candleTimestamp(event, receivedAt);
  const sourceFingerprint = createMt5PushFeedFingerprint({
    brokerSymbol: mapping.brokerSymbol,
    close: event.candle.close,
    receivedAt,
    timeframe,
    timestamp
  });

  return {
    id: `mt5_push_${mapping.brokerSymbol}_${timeframe}_${timestamp}`,
    symbol: mapping.normalizedSymbol,
    requestedSymbol: mapping.requestedSymbol,
    normalizedSymbol: mapping.normalizedSymbol,
    brokerSymbol: mapping.brokerSymbol,
    timeframe,
    timestamp,
    serverTimestamp: timestamp,
    receivedAt,
    open: Number(event.candle.open),
    high: Number(event.candle.high),
    low: Number(event.candle.low),
    close: Number(event.candle.close),
    volume: validNumber(event.candle.volume) ? event.candle.volume : event.candle.tickVolume,
    tickVolume: validNumber(event.candle.tickVolume) ? event.candle.tickVolume : undefined,
    spread: validNumber(event.candle.spread) ? event.candle.spread : undefined,
    closed: event.type === "mt5.candle_closed",
    source: "mt5",
    sourceFingerprint,
    ...mt5PushFeedAuthority
  };
}

export function normalizeMt5PushFeedTickEvent(
  event: Extract<Mt5PushFeedEvent, { type: "mt5.tick" }>,
  receivedAt = new Date().toISOString()
): CanonicalTick {
  const mapping = resolveMt5PushFeedSymbolMapping({
    brokerSymbol: event.brokerSymbol,
    requestedSymbol: event.requestedSymbol ?? event.normalizedSymbol
  });
  const serverTimestamp = parseMt5PushFeedTimestamp(event.serverTimestamp ?? event.publisherTimestamp, receivedAt);
  const bid = validNumber(event.bid) ? event.bid : undefined;
  const ask = validNumber(event.ask) ? event.ask : undefined;
  const mid = bid !== undefined && ask !== undefined ? Number(((bid + ask) / 2).toFixed(8)) : undefined;
  return {
    source: "mt5",
    brokerSymbol: mapping.brokerSymbol,
    requestedSymbol: mapping.requestedSymbol,
    normalizedSymbol: mapping.normalizedSymbol,
    bid,
    ask,
    last: validNumber(event.last) ? event.last : mid,
    mid,
    volume: validNumber(event.volume) ? event.volume : undefined,
    spread: validNumber(event.spread) ? event.spread : undefined,
    serverTimestamp,
    receivedAt,
    sourceFingerprint: createMt5PushFeedFingerprint({
      brokerSymbol: mapping.brokerSymbol,
      close: validNumber(event.last) ? event.last : mid,
      receivedAt,
      timestamp: serverTimestamp
    }),
    ...mt5PushFeedAuthority
  };
}

export function normalizeMt5PushFeedEvent(
  event: Mt5PushFeedEvent,
  receivedAt = new Date().toISOString()
): Mt5PushFeedCanonicalEvent {
  if (event.type === "mt5.tick") {
    return {
      type: "canonical.tick",
      originalType: event.type,
      source: "mt5",
      receivedAt,
      tick: normalizeMt5PushFeedTickEvent(event, receivedAt),
      warnings: [],
      ...mt5PushFeedAuthority
    };
  }
  if (event.type === "mt5.candle_opened" || event.type === "mt5.candle_updated" || event.type === "mt5.candle_closed") {
    const candle = normalizeMt5PushFeedCandleEvent(event, receivedAt);
    const type =
      event.type === "mt5.candle_closed"
        ? "canonical.candle_closed"
        : event.type === "mt5.candle_opened"
          ? "canonical.candle_opened"
          : "canonical.candle_updated";
    return {
      type,
      originalType: event.type,
      source: "mt5",
      receivedAt,
      candle,
      warnings: [],
      ...mt5PushFeedAuthority
    };
  }
  if (event.type === "mt5.connection_status") {
    return {
      type: "canonical.connection_status",
      originalType: event.type,
      source: "mt5",
      receivedAt,
      status: {
        provider: "mt5_push_feed",
        status: event.connectionStatus === "connected" ? "connected" : event.connectionStatus,
        connectionStatus: event.connectionStatus,
        sourceLabel: "MT5 push feed",
        lastEventAt: receivedAt,
        activeSymbols: event.activeSymbols ?? [],
        activeTimeframes: event.activeTimeframes ?? [],
        processedEventCount: 0,
        skippedDuplicateCount: 0,
        ignoredEventCount: 0,
        warnings: event.message ? [event.message] : [],
        ...mt5PushFeedAuthority
      },
      warnings: event.message ? [event.message] : [],
      ...mt5PushFeedAuthority
    };
  }

  const staleEvent = event as Extract<Mt5PushFeedEvent, { type: "mt5.feed_stale" }>;
  return {
    type: "canonical.feed_stale",
    originalType: staleEvent.type,
    source: "mt5",
    receivedAt,
    status: {
      provider: "mt5_push_feed",
      status: "stale",
      connectionStatus: "degraded",
      sourceLabel: "MT5 push feed",
      lastEventAt: receivedAt,
      staleFeedWarning: staleEvent.reason,
      activeSymbols: staleEvent.activeSymbols ?? [],
      activeTimeframes: staleEvent.activeTimeframes ?? [],
      processedEventCount: 0,
      skippedDuplicateCount: 0,
      ignoredEventCount: 0,
      warnings: [staleEvent.reason],
      ...mt5PushFeedAuthority
    },
    warnings: [staleEvent.reason],
    ...mt5PushFeedAuthority
  };
}

export function validateMt5PushFeedEventShape(event: unknown): { valid: boolean; reason?: string } {
  if (!event || typeof event !== "object") {
    return { valid: false, reason: "Event payload must be an object." };
  }
  const candidate = event as Partial<Mt5PushFeedEvent>;
  const allowed = new Set([
    "mt5.tick",
    "mt5.candle_opened",
    "mt5.candle_updated",
    "mt5.candle_closed",
    "mt5.connection_status",
    "mt5.feed_stale"
  ]);
  if (!candidate.type || !allowed.has(candidate.type)) {
    return { valid: false, reason: "Unsupported MT5 push-feed event type." };
  }
  if (
    (candidate.type === "mt5.candle_opened" ||
      candidate.type === "mt5.candle_updated" ||
      candidate.type === "mt5.candle_closed") &&
    (!(candidate as Partial<Mt5PushFeedCandleEvent>).candle || !(candidate as Partial<Mt5PushFeedCandleEvent>).brokerSymbol)
  ) {
    return { valid: false, reason: "Candle events require brokerSymbol and candle OHLC data." };
  }
  if (candidate.type === "mt5.tick" && !(candidate as { brokerSymbol?: string }).brokerSymbol) {
    return { valid: false, reason: "Tick events require brokerSymbol." };
  }
  return { valid: true };
}
