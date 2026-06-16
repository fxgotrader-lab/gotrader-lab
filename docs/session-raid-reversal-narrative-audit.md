# Session Raid Reversal Narrative Audit

## Purpose

This document describes the research-only `nasdaq_london_raid_ny_reversal_v1` detector. It maps the user-described NASDAQ / USTECH session sequence into a deterministic compact narrative:

- Asia consolidation into London
- London expansion above the 12AM New York Open
- Asia High and prior-day liquidity capture
- London High creation
- NY AM raid above London High
- Bearish market structure break
- 15m breaker and bearish FVG
- Retrace into the FVG
- Sell-side delivery toward compact liquidity targets
- MT5-derived Sunday Open as weekly equilibrium / premium-discount reference

The detector is not an execution model. It creates research-only narrative diagnostics and can only queue replay validation when entry, invalidation, target, RR, source fingerprint, and authority gates are complete.

## Reference Levels

The detector resolves MT5 UTC/Z timestamps into `America/New_York` session time and produces compact references only:

- MT5-derived Sunday Open
- 12AM New York Open
- Asia High / Low
- Prior Day High / Low
- London High / Low
- NY AM High / Low
- MT5-derived Sunday Open premium/discount/equilibrium state
- Buy-side and sell-side liquidity targets

Raw candles are never returned in the narrative, Advisor packet, current-opportunity scan, or UI card.

## User Scenario Mapping

The user-described current NASDAQ setup maps as:

| User observation | Detector step |
| --- | --- |
| Asia consolidated into London | `asia_consolidation` |
| Around 3:45 AM NY, price expanded above MT5-derived 12AM Open | `london_expansion` |
| Price captured Asia High | `asia_high_sweep` |
| Price captured previous daily high | `prior_day_high_sweep` |
| Move created London High | `london_high_created` |
| NY took London High liquidity | `ny_london_high_raid` |
| Bearish break of market structure | `bearish_mss` |
| 15m breaker and FVG formed | `breaker_detected`, `fvg_detected` |
| 9:30 area retrace into 15m FVG | `fvg_retrace` |
| Price aggressively ran lower | `sell_side_delivery` |

When all sequence steps and trade construction pass, status becomes `complete_bearish_reversal_candidate`. Otherwise the detector reports `forming`, `near_miss`, `rejected`, `needs_more_data`, or `context_only` with explicit missing conditions.

## MT5-Derived Sunday Open Logic

MT5-derived Sunday Open is treated as weekly equilibrium and premium/discount context, not as a readiness bypass.

- If price is above MT5-derived Sunday Open, the detector marks premium.
- If price is below MT5-derived Sunday Open, the detector marks discount.
- If weekly bias is bullish, the bullish scenario says MT5-derived Sunday Open may act as equilibrium/support before higher continuation.
- If weekly bias is bearish, the bearish scenario says premium above MT5-derived Sunday Open can support sell-side delivery below it.
- If MT5-derived Sunday Open is missing from the MT5 read-only candle stream, the narrative still runs, but flags `sunday_open_missing`.

## Validation Path

The detector can create a current-opportunity row only through compact state:

- `valid_candidate` when the full bearish reversal candidate and trade construction pass.
- `forming` when the raid exists but MSS/FVG/retrace is incomplete.
- `near_miss` when sequence evidence exists but a required confirmation or target/invalidation/RR is missing.
- `rejected` for mock/sample source or hard-invalid context.
- `diagnostic_context` for context-only narratives.

Replay validation remains required. Recognition is not evidence. Paper-Demo remains blocked until replay, walk-forward/OOS, evidence, maturity, and Paper-Demo checklist gates pass.

## Known Limitations

- The detector is tuned for NASDAQ/USTECH-style session structure first.
- 15m FVG detection uses a compact three-candle imbalance definition.
- MT5-derived Sunday Open and MT5-derived 12AM Open references are resolved from MT5 read-only candles only.
- Prior-day high/low quality depends on loaded session history.
- News and SMT filters are not hard gates in v1; they remain future confluence inputs.

## Safety

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

The detector never places trades, mutates broker state, calls MT5 execution APIs, stores raw candles, or promotes Paper-Demo by itself.
