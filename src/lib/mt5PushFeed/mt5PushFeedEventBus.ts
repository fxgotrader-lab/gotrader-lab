import type { Mt5PushFeedCanonicalEvent } from "./mt5PushFeedTypes";

export type Mt5PushFeedEventHandler = (event: Mt5PushFeedCanonicalEvent) => void;

export interface Mt5PushFeedEventBus {
  publish: (event: Mt5PushFeedCanonicalEvent) => void;
  subscribe: (handler: Mt5PushFeedEventHandler) => () => void;
  clear: () => void;
  subscriberCount: () => number;
}

export function createMt5PushFeedEventBus(): Mt5PushFeedEventBus {
  const handlers = new Set<Mt5PushFeedEventHandler>();

  return {
    publish(event) {
      for (const handler of handlers) {
        handler(event);
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    clear() {
      handlers.clear();
    },
    subscriberCount() {
      return handlers.size;
    }
  };
}

export const mt5PushFeedEventBus = createMt5PushFeedEventBus();
