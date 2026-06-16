# Live Session Raid Reversal Validation

Date generated: 2026-06-16

## Scope

This report validates the research-only `nasdaq_london_raid_ny_reversal_v1` detector against the current MT5 read-only USTECH data used for MNQ-style research.

Safety boundaries remained unchanged:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`
- no broker execution
- no order placement
- no MT5 mutation
- no account/order/position access
- no Paper-Demo promotion

Raw candles were used internally by the diagnostic script only and were not serialized in the report output.

## Source And Date Status

| Field | Value |
| --- | --- |
| Source | MT5 read-only CFD/proxy |
| Requested symbol | MNQ |
| Broker symbol | USTECH |
| Primary timeframe | 5m |
| Entry/context timeframe | 15m |
| Timezone | America/New_York |
| Latest trading date used | 2026-06-16 |
| Previous trading date | 2026-06-15 |
| Latest candle | 2026-06-16T20:15:00.000Z / 2026-06-16 16:15 New York |
| Market weekend | false |
| "Today" interpretation | Current NY trading day, not a stale/weekend fallback |
| Latest 5m depth | 5,000 candles |
| Latest 15m depth | 5,000 candles |
| 90-day range depth | 17,524 compact candles, 9 chunks, 90 days, sufficient |

## Reference Levels Found

| Reference | Value | Timestamp / Local Time | Source |
| --- | ---: | --- | --- |
| MT5-derived Sunday Open | 29,912.03 | 2026-06-15T01:00:00.000Z / 2026-06-14 21:00 NY | first available Sunday evening MT5 candle |
| MT5-derived 12AM Open | 30,452.98 | 2026-06-16T04:00:00.000Z / 2026-06-16 00:00 NY | exact session-local midnight |
| Asia High | 30,543.06 | 2026-06-16T01:00:00.000Z / 2026-06-15 21:00 NY | 20:00-01:00 NY |
| Asia Low | 30,432.48 | 2026-06-16T04:05:00.000Z / 2026-06-16 00:05 NY | 20:00-01:00 NY |
| Prior Day High | 30,591.10 | 2026-06-15T19:30:00.000Z / 2026-06-15 15:30 NY | prior trading date |
| Prior Day Low | 29,896.31 | 2026-06-15T01:00:00.000Z / 2026-06-14 21:00 NY | prior trading date |
| London High | 30,532.22 | 2026-06-16T06:40:00.000Z / 2026-06-16 02:40 NY | 02:00-05:00 NY |
| London Low | 30,455.36 | 2026-06-16T06:00:00.000Z / 2026-06-16 02:00 NY | 02:00-05:00 NY |
| NY AM High | 30,650.67 | 2026-06-16T14:20:00.000Z / 2026-06-16 10:20 NY | 09:30-12:00 NY |
| NY AM Low | 30,492.94 | 2026-06-16T15:45:00.000Z / 2026-06-16 11:45 NY | 09:30-12:00 NY |

Premium/discount relative to MT5-derived Sunday Open: `premium`.

Sell-side targets found:

- London Low: 30,455.36
- Asia Low: 30,432.48
- Intraday Swing Low: 30,084.52
- MT5-derived Sunday Open: 29,912.03
- Prior Day Low: 29,896.31

Buy-side targets found:

- Asia High: 30,543.06
- Prior Day High: 30,591.10
- London High: 30,532.22

## MT5-Derived Sunday Open Note

The detector resolved the current-week MT5-derived Sunday Open as `29,912.03`, from the first available Sunday evening MT5 candle at 2026-06-14 21:00 New York.

MT5 USTECH did not provide earlier Sunday 18:00-20:55 candles in the loaded current-week stream; the first Sunday evening candle available through the wrapper was 21:00 New York.

Fix applied: the MT5-derived Sunday Open resolver now selects the latest relevant Sunday evening open for the current trading date, instead of the first Sunday in a longer multi-week MT5 history window.

## Scenario Match Table

| MT5-derived session step | Detector result | Evidence |
| --- | --- | --- |
| Asia consolidated into London | matched | Asia range 30,543.06 / 30,432.48 |
| Around 3:45 NY, London expanded above MT5-derived 12AM Open | matched | 2026-06-16 03:30 NY, high 30,503.66 above MT5-derived 12AM Open 30,452.98 |
| Asia High sweep | matched | 2026-06-16 07:05 NY, high 30,554.93 |
| Prior-day high sweep | matched | 2026-06-16 07:50 NY, high 30,610.55 |
| London High created | matched | London High 30,532.22 at 02:40 NY |
| NY session raided London High | matched | 09:30 NY high 30,590.38 above London High |
| Bearish MSS / BMS | matched | 11:20 NY close 30,524.55 |
| 15m breaker detected | matched | 11:05 NY breaker body 30,614.01-30,622.96 |
| 15m FVG detected | matched | 11:30 NY bearish FVG 30,547.27-30,598.36 |
| Retrace into FVG around 9:30 | partially matched | Retrace occurred later at 12:45 NY into the FVG midpoint 30,572.82 |
| Sell-side delivery | matched | 13:15 NY low 30,407.60 delivered below first sell-side targets |
| MT5-derived Sunday Open premium scenario | matched | Price traded above MT5-derived Sunday Open; state is premium |

## Detector Status

The live detector returned:

- status: `complete_bearish_reversal_candidate`
- confidence: `1`
- missing conditions: none
- blockers: none
- next action: `Queue replay validation for NASDAQ London Raid -> NY Reversal. Recognition is not evidence.`

Trade construction:

| Field | Value |
| --- | ---: |
| Entry model | 15m FVG |
| Entry | 30,572.82 |
| Invalidation | 30,625.72 |
| Target | 30,455.36 |
| RR | 2.2204 |
| Trade construction blockers | none |
| Validation stage | replay required |

This is not a Paper-Demo approval. It is a research candidate that must go through replay, walk-forward/OOS, evidence, maturity, and Paper-Demo gates.

## UI Trace

The current wiring supports:

- ICT Lab card: `NASDAQ London Raid -> NY Reversal Narrative`
- Advisor card: `NASDAQ London Raid -> NY Reversal`
- reference levels
- narrative steps
- missing steps
- next action
- MT5-derived Sunday Open premium/bearish/bullish scenario language
- authority none display

## Fixes Applied

Two small reference/trace fixes were applied:

1. MT5-derived Sunday Open now resolves the latest relevant Sunday evening open for the current trading date when the input contains multiple weeks of MT5 candles.
2. London expansion evidence now prefers the 03:30-04:00 New York candle when present, instead of showing the earliest minor candle above MT5-derived 12AM Open.

No strategy threshold was loosened.

## Conclusion

The detector correctly identifies the current MT5 USTECH/MNQ session raid reversal sequence as a complete bearish research candidate using MT5-derived reference levels only.

Recommended next action: queue deterministic replay validation for `nasdaq_london_raid_ny_reversal_v1` using the current MT5 read-only source. Do not promote to Paper-Demo without the normal validation gates.
