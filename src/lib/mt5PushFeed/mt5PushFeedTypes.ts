import type { Candle, FuturesSymbol, Timeframe } from "@/lib/types";

export type Mt5PushFeedEventType =
  | "mt5.tick"
  | "mt5.candle_opened"
  | "mt5.candle_updated"
  | "mt5.candle_closed"
  | "mt5.connection_status"
  | "mt5.feed_stale";

export type Mt5PushFeedConnectionState = "connected" | "disconnected" | "degraded" | "error";
export type Mt5PushFeedStatusState = "idle" | "connected" | "disconnected" | "degraded" | "stale" | "error";
export type Mt5PushFeedCandleEventType = Extract<
  Mt5PushFeedEventType,
  "mt5.candle_opened" | "mt5.candle_updated" | "mt5.candle_closed"
>;

export interface Mt5PushFeedAuthority {
  executionAuthority: "none";
  brokerAuthority: "read_only";
  readinessOverrideAuthority: "none";
}

export const mt5PushFeedAuthority: Mt5PushFeedAuthority = {
  executionAuthority: "none",
  brokerAuthority: "read_only",
  readinessOverrideAuthority: "none"
};

export interface Mt5PushFeedSymbolMapping {
  requestedSymbol: string;
  brokerSymbol: string;
  aliases: string[];
  enabled: boolean;
}

export interface Mt5PushFeedBaseEvent {
  type: Mt5PushFeedEventType;
  eventId?: string;
  source?: "mt5";
  brokerSymbol?: string;
  requestedSymbol?: string;
  normalizedSymbol?: string;
  timeframe?: string;
  serverTimestamp?: string | number;
  publisherTimestamp?: string | number;
  sequence?: number;
}

export interface Mt5PushFeedTickEvent extends Mt5PushFeedBaseEvent {
  type: "mt5.tick";
  brokerSymbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  volume?: number;
  spread?: number;
}

export interface Mt5PushFeedCandlePayload {
  time?: string | number;
  timestamp?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
  spread?: number;
}

export interface Mt5PushFeedCandleEvent extends Mt5PushFeedBaseEvent {
  type: Mt5PushFeedCandleEventType;
  brokerSymbol: string;
  timeframe: string;
  candle: Mt5PushFeedCandlePayload;
}

export interface Mt5PushFeedConnectionStatusEvent extends Mt5PushFeedBaseEvent {
  type: "mt5.connection_status";
  connectionStatus: Mt5PushFeedConnectionState;
  message?: string;
  activeSymbols?: string[];
  activeTimeframes?: string[];
}

export interface Mt5PushFeedStaleEvent extends Mt5PushFeedBaseEvent {
  type: "mt5.feed_stale";
  reason: string;
  lastEventAt?: string;
  staleSeconds?: number;
  activeSymbols?: string[];
  activeTimeframes?: string[];
}

export type Mt5PushFeedEvent =
  | Mt5PushFeedTickEvent
  | Mt5PushFeedCandleEvent
  | Mt5PushFeedConnectionStatusEvent
  | Mt5PushFeedStaleEvent;

export interface CanonicalTick extends Mt5PushFeedAuthority {
  source: "mt5";
  brokerSymbol: string;
  requestedSymbol: FuturesSymbol;
  normalizedSymbol: FuturesSymbol;
  bid?: number;
  ask?: number;
  last?: number;
  mid?: number;
  volume?: number;
  spread?: number;
  serverTimestamp: string;
  receivedAt: string;
  sourceFingerprint: string;
}

export interface Mt5CanonicalCandle extends Candle, Mt5PushFeedAuthority {
  source: "mt5";
  brokerSymbol: string;
  requestedSymbol: FuturesSymbol;
  normalizedSymbol: FuturesSymbol;
  serverTimestamp: string;
  receivedAt: string;
  tickVolume?: number;
  spread?: number;
  closed: boolean;
  sourceFingerprint: string;
}

export type Mt5PushFeedCanonicalEventType =
  | "canonical.tick"
  | "canonical.candle_opened"
  | "canonical.candle_updated"
  | "canonical.candle_closed"
  | "canonical.connection_status"
  | "canonical.feed_stale";

export interface Mt5PushFeedCanonicalEvent extends Mt5PushFeedAuthority {
  type: Mt5PushFeedCanonicalEventType;
  originalType: Mt5PushFeedEventType;
  receivedAt: string;
  source: "mt5";
  tick?: CanonicalTick;
  candle?: Mt5CanonicalCandle;
  status?: Mt5PushFeedStatusSnapshot;
  warnings: string[];
}

export interface Mt5PushFeedIctTrigger extends Mt5PushFeedAuthority {
  triggerType:
    | "none"
    | "ict_current_read_refresh"
    | "advisor_packet_refresh"
    | "replay_validation_may_queue"
    | "feed_health_warning";
  reason: string;
  symbol?: FuturesSymbol;
  brokerSymbol?: string;
  timeframe?: Timeframe;
  sourceFingerprint?: string;
  triggeredAt: string;
  advisorPacketShouldRefresh: boolean;
  currentReadShouldRefresh: boolean;
  replayValidationMayQueue: boolean;
}

export interface Mt5PushFeedStatusSnapshot extends Mt5PushFeedAuthority {
  provider: "mt5_push_feed";
  status: Mt5PushFeedStatusState;
  connectionStatus: Mt5PushFeedConnectionState | "unknown";
  sourceLabel: "MT5 push feed";
  lastEventAt?: string;
  lastCandleReceivedAt?: string;
  lastCandleTimestamp?: string;
  lastCandleFingerprint?: string;
  lastTickAt?: string;
  staleFeedWarning?: string;
  activeSymbols: string[];
  activeTimeframes: string[];
  processedEventCount: number;
  skippedDuplicateCount: number;
  ignoredEventCount: number;
  lastError?: string;
  warnings: string[];
}

export interface Mt5PushFeedJournalEvent extends Mt5PushFeedAuthority {
  eventType:
    | "mt5_push_feed_connected"
    | "mt5_push_feed_disconnected"
    | "mt5_push_feed_stale"
    | "mt5_push_feed_candle_closed";
  timestamp: string;
  requestedSymbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  sourceFingerprint?: string;
  summary: string;
}

export interface Mt5PushFeedStoreState {
  candlesBySeries: Record<string, Mt5CanonicalCandle[]>;
  status: Mt5PushFeedStatusSnapshot;
  journalEvents: Mt5PushFeedJournalEvent[];
  latestTrigger?: Mt5PushFeedIctTrigger;
}

export interface Mt5PushFeedProcessingResult extends Mt5PushFeedAuthority {
  accepted: boolean;
  duplicate: boolean;
  normalizedEvent?: Mt5PushFeedCanonicalEvent;
  trigger?: Mt5PushFeedIctTrigger;
  status: Mt5PushFeedStatusSnapshot;
  warnings: string[];
}
