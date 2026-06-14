import { mt5PushFeedEventBus, type Mt5PushFeedEventBus } from "./mt5PushFeedEventBus";
import {
  defaultMt5PushFeedStoreState,
  processMt5PushFeedEvent
} from "./mt5PushFeedStore";
import type {
  Mt5PushFeedEvent,
  Mt5PushFeedProcessingResult,
  Mt5PushFeedStoreState
} from "./mt5PushFeedTypes";
import { mt5PushFeedAuthority } from "./mt5PushFeedTypes";

const forbiddenPayloadKeys = [
  "account",
  "accounts",
  "balance",
  "equity",
  "order",
  "orders",
  "position",
  "positions",
  "placeOrder",
  "buyMarket",
  "sellMarket",
  "closePosition",
  "modifyOrder",
  "cancelOrder"
];

export function inspectMt5PushFeedPayloadSafety(payload: unknown): { safe: boolean; blockedFields: string[] } {
  const serialized = JSON.stringify(payload ?? {});
  const blockedFields = forbiddenPayloadKeys.filter((key) => new RegExp(`"${key}"\\s*:`, "i").test(serialized));
  return { safe: blockedFields.length === 0, blockedFields };
}

export interface Mt5PushFeedGateway {
  receiveEvent: (payload: unknown) => Mt5PushFeedProcessingResult;
  receiveWebhook: (payload: unknown) => Mt5PushFeedProcessingResult;
  connectWebSocket: (url: string) => { stop: () => void; connected: boolean; mode: "websocket" | "unavailable" };
  state: Mt5PushFeedStoreState;
}

export function createMt5PushFeedGateway({
  eventBus = mt5PushFeedEventBus,
  persistStatus = true,
  state = defaultMt5PushFeedStoreState
}: {
  eventBus?: Mt5PushFeedEventBus;
  persistStatus?: boolean;
  state?: Mt5PushFeedStoreState;
} = {}): Mt5PushFeedGateway {
  const receiveEvent = (payload: unknown): Mt5PushFeedProcessingResult => {
    const safety = inspectMt5PushFeedPayloadSafety(payload);
    if (!safety.safe) {
      const status = {
        ...state.status,
        status: "error" as const,
        connectionStatus: "error" as const,
        lastEventAt: new Date().toISOString(),
        ignoredEventCount: state.status.ignoredEventCount + 1,
        lastError: `Unsafe MT5 push-feed payload fields: ${safety.blockedFields.join(", ")}`,
        warnings: [`Unsafe MT5 push-feed payload blocked: ${safety.blockedFields.join(", ")}`],
        ...mt5PushFeedAuthority
      };
      state.status = status;
      return {
        accepted: false,
        duplicate: false,
        status,
        warnings: status.warnings,
        ...mt5PushFeedAuthority
      };
    }
    return processMt5PushFeedEvent(state, payload as Mt5PushFeedEvent, {
      eventBus,
      persistStatus
    });
  };

  return {
    receiveEvent,
    receiveWebhook: receiveEvent,
    connectWebSocket(url) {
      if (typeof WebSocket === "undefined") {
        return { stop: () => undefined, connected: false, mode: "unavailable" };
      }
      const socket = new WebSocket(url);
      socket.addEventListener("message", (message) => {
        try {
          receiveEvent(JSON.parse(String(message.data)));
        } catch {
          receiveEvent({ type: "mt5.feed_stale", reason: "Malformed MT5 push-feed WebSocket message." });
        }
      });
      socket.addEventListener("open", () => {
        receiveEvent({ type: "mt5.connection_status", connectionStatus: "connected", message: "MT5 push feed WebSocket connected." });
      });
      socket.addEventListener("close", () => {
        receiveEvent({ type: "mt5.connection_status", connectionStatus: "disconnected", message: "MT5 push feed WebSocket disconnected." });
      });
      socket.addEventListener("error", () => {
        receiveEvent({ type: "mt5.connection_status", connectionStatus: "error", message: "MT5 push feed WebSocket error." });
      });
      return {
        stop: () => socket.close(),
        connected: socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING,
        mode: "websocket"
      };
    },
    state
  };
}
