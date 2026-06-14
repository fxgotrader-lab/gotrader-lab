import type { Mt5PushFeedEventBus } from "./mt5PushFeedEventBus";
import {
  mt5PushFeedAuthority,
  type Mt5PushFeedCanonicalEvent,
  type Mt5PushFeedIctTrigger
} from "./mt5PushFeedTypes";

export interface Mt5PushFeedIctTriggerController {
  handleBusEvent: (event: Mt5PushFeedCanonicalEvent) => Mt5PushFeedIctTrigger;
  latestTrigger?: Mt5PushFeedIctTrigger;
  currentReadRefreshCount: number;
  advisorPacketRefreshCount: number;
  replayValidationQueueCount: number;
  feedWarningCount: number;
}

const noTrigger = (reason: string): Mt5PushFeedIctTrigger => ({
  triggerType: "none",
  reason,
  triggeredAt: new Date().toISOString(),
  advisorPacketShouldRefresh: false,
  currentReadShouldRefresh: false,
  replayValidationMayQueue: false,
  ...mt5PushFeedAuthority
});

export function createMt5PushFeedIctTriggerController(): Mt5PushFeedIctTriggerController {
  const controller: Mt5PushFeedIctTriggerController = {
    currentReadRefreshCount: 0,
    advisorPacketRefreshCount: 0,
    replayValidationQueueCount: 0,
    feedWarningCount: 0,
    handleBusEvent(event) {
      if (event.type === "canonical.candle_closed" && event.candle) {
        const trigger: Mt5PushFeedIctTrigger = {
          triggerType: "ict_current_read_refresh",
          reason: "MT5 candle_closed updates the canonical candle store.",
          symbol: event.candle.requestedSymbol,
          brokerSymbol: event.candle.brokerSymbol,
          timeframe: event.candle.timeframe,
          sourceFingerprint: event.candle.sourceFingerprint,
          triggeredAt: event.receivedAt,
          advisorPacketShouldRefresh: true,
          currentReadShouldRefresh: true,
          replayValidationMayQueue: true,
          ...mt5PushFeedAuthority
        };
        controller.latestTrigger = trigger;
        controller.currentReadRefreshCount += 1;
        controller.advisorPacketRefreshCount += 1;
        controller.replayValidationQueueCount += 1;
        return trigger;
      }

      if (event.type === "canonical.feed_stale") {
        const trigger: Mt5PushFeedIctTrigger = {
          triggerType: "feed_health_warning",
          reason: event.status?.staleFeedWarning ?? "MT5 push feed is stale.",
          triggeredAt: event.receivedAt,
          advisorPacketShouldRefresh: false,
          currentReadShouldRefresh: false,
          replayValidationMayQueue: false,
          ...mt5PushFeedAuthority
        };
        controller.latestTrigger = trigger;
        controller.feedWarningCount += 1;
        return trigger;
      }

      const trigger = noTrigger("No current-read refresh required for this MT5 push-feed event.");
      controller.latestTrigger = trigger;
      return trigger;
    }
  };
  return controller;
}

export function subscribeIctTriggersToMt5PushFeed(eventBus: Mt5PushFeedEventBus) {
  const controller = createMt5PushFeedIctTriggerController();
  const unsubscribe = eventBus.subscribe((event) => {
    controller.handleBusEvent(event);
  });
  return { controller, unsubscribe };
}
