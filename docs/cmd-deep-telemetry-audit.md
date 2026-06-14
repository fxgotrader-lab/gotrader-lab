# CMD Deep Telemetry Audit

Generated: 2026-06-14T01:38:28.654Z

Scope: research telemetry and variant discovery only. No broker execution, live trading, order placement, MT5 mutation, readiness override, OpenClaw auto-apply, calibration apply, or Paper-Demo promotion was added.

## Source Status

The diagnostic harness is implemented, but the local MT5 read-only wrapper was unavailable for this run.

- Bridge URL: `http://127.0.0.1:7341`
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Timeframe: `5m`
- Status: `blocked_source_unavailable`
- Error: `fetch failed`

Run `npm.cmd run test:cmd-deep-telemetry` again after starting the MT5 upstream service and GoTrader read-only wrapper.

## Safety Result

- No raw candles were written.
- No account/order/position data was accessed.
- Authority remained `none/none/none`.
- No CMD promotion occurred.
