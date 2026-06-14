import type { Mt5PushFeedCandleEvent, Mt5PushFeedConnectionStatusEvent, Mt5PushFeedStaleEvent } from "./mt5PushFeedTypes";

export const mt5PushFeedConnectionStatusFixture: Mt5PushFeedConnectionStatusEvent = {
  type: "mt5.connection_status",
  connectionStatus: "connected",
  brokerSymbol: "USTECH",
  requestedSymbol: "MNQ",
  serverTimestamp: "2026-06-14T14:00:00.000Z",
  activeSymbols: ["USTECH"],
  activeTimeframes: ["5m"],
  message: "MT5 push feed connected."
};

export const mt5PushFeedCandleClosedFixture: Mt5PushFeedCandleEvent = {
  type: "mt5.candle_closed",
  brokerSymbol: "USTECH",
  requestedSymbol: "MNQ",
  timeframe: "M5",
  serverTimestamp: "2026-06-14T14:05:00.000Z",
  candle: {
    timestamp: "2026-06-14T14:05:00.000Z",
    open: 30710.25,
    high: 30728.5,
    low: 30698.75,
    close: 30721.5,
    tickVolume: 821,
    spread: 1.2
  }
};

export const mt5PushFeedStaleFixture: Mt5PushFeedStaleEvent = {
  type: "mt5.feed_stale",
  brokerSymbol: "USTECH",
  requestedSymbol: "MNQ",
  serverTimestamp: "2026-06-14T14:07:30.000Z",
  reason: "No MT5 push-feed event received for 90 seconds.",
  staleSeconds: 90,
  activeSymbols: ["USTECH"],
  activeTimeframes: ["5m"]
};
