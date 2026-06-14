# MT5 Push Feed Architecture

GoTrader now has a read-only MT5 push-feed path for live market data. The goal is to move current-read and advisor updates away from frequent candle polling and toward event-driven updates from a local MT5 publisher or gateway.

## Boundary

- MT5 is treated as the broker-truth market-data source for read-only ticks and candles.
- The feed does not expose account, balance, order, position, or execution data.
- GoTrader does not trade from this feed.
- `executionAuthority` remains `none`.
- `brokerAuthority` for this feed is `read_only`.
- `readinessOverrideAuthority` remains `none`.
- Polling remains available only for slow health checks, manual diagnostics, and explicit historical-depth requests.

## Event Contracts

The local MT5 publisher can push these events:

- `mt5.tick`
- `mt5.candle_opened`
- `mt5.candle_updated`
- `mt5.candle_closed`
- `mt5.connection_status`
- `mt5.feed_stale`

`mt5.candle_closed` is the meaningful event for ICT recalculation. Tick, candle-open, and candle-update events update feed state but do not create research evidence by themselves.

## Gateway

GoTrader exposes a client-side gateway service that can receive events from:

- WebSocket stream from a local MT5 publisher.
- Local HTTP webhook bridge that forwards payloads into the same gateway function.

The gateway rejects payloads that attempt to carry account, order, position, balance, or execution fields. Unsafe payloads are not published to the internal event bus.

## Normalization

Incoming MT5 events are normalized into compact canonical objects:

- `CanonicalTick`
- `Mt5CanonicalCandle`

Normalization preserves:

- `source: "mt5"`
- requested GoTrader symbol
- broker symbol
- normalized symbol
- timeframe
- server timestamp
- local received timestamp
- source fingerprint

Default symbol mappings:

- `MNQ` / `NQ` -> `USTECH`
- `ES` -> `US500`
- `YM` -> `US30`
- `XAUUSD` -> `XAUUSD`
- `EURUSD` -> `EURUSD.pro`
- `BTCUSD` -> `BTCUSD`

Mappings are isolated in `src/lib/mt5PushFeed/mt5PushFeedSymbolMapping.ts` so broker-specific aliases can be changed without touching ICT strategy code.

## Event Bus And Store

Raw MT5 events do not reach ICT engines directly. They flow through:

1. Gateway safety inspection.
2. Canonical normalizer.
3. Rolling canonical candle store.
4. Internal market-data event bus.
5. ICT trigger controller.

Closed candles are appended and deduplicated by:

`source + brokerSymbol + timeframe + timestamp`

Only compact status and journal events are persisted. Raw candles are kept in the in-memory rolling store and are not sent to UI packets, OpenClaw, gbrain, or local journals.

## ICT Trigger Rules

- `candle_closed` triggers current-read refresh.
- `candle_closed` triggers advisor packet refresh.
- `candle_closed` may enqueue replay/OOS validation later.
- `feed_stale` creates a feed warning only.
- `connection_status` updates UI health only.

No event creates execution intent, broker mutation, order placement, or readiness override.

## UI

Dashboard shows a compact MT5 Feed Status card with:

- connected/disconnected/stale state
- last event time
- last candle received
- stale warning
- active symbols
- active timeframes
- source label: MT5 push feed
- authority summary: execution none / broker read-only / readiness none

## Test Coverage

`npm.cmd run test:mt5-push-feed` verifies:

- MT5 candle and connection events normalize correctly.
- Duplicate closed candles are skipped.
- `candle_closed` triggers current-read/advisor/replay-refresh intent.
- `feed_stale` does not trigger trading or validation evidence.
- Authority remains `none/read_only/none`.
- Unsafe account/order/position/execution payloads are blocked.
