# Grinch ICT Phase 3 / Consolidation Profile

GoTrader AI Lab now adds the Grinch Consolidation Profile as a research-only layer beside Phase 1 Model 1 and Phase 2 Reversal Profile. It builds on the same 12AM Opening Price, higher-timeframe bias, PD array, market-cycle, and time-price alignment framework. It cannot execute trades, approve readiness, create broker handoffs, or override any safety gate.

The task referenced `docs/strategy-sources/grinch-video-jZdl_0Jgo2k.md`; the workspace currently contains the uploaded transcript as `docs/strategy-sources/(8) Grinch video-jZdl_0Jgo2k.md`, so this phase follows that source and the user-defined Consolidation Profile rules.

## Profile Thesis

The Consolidation Profile appears when price is held in a tight range around 12AM Open into NY. Around 9:30, the model expects price to interact with 12AM Open or raid one side of the consolidation, then expand into 10:00.

Direction is not created from consolidation alone. It comes from:

- higher-timeframe bias first,
- which side of consolidation liquidity is raided,
- 12AM Open acting as support or resistance,
- displacement confirmation,
- and later SMT/intermarket confirmation when a future phase adds it.

SMT/intermarket divergence is intentionally not implemented in Phase 3.

## Bullish Context

In bullish HTF context, price may:

- raid the consolidation low,
- use a discount PD array below the range as support,
- reverse or expand higher,
- or trade back into 12AM Open and expand higher if 12AM acts as support.

## Bearish Context

In bearish HTF context, price may:

- raid the consolidation high,
- use a premium PD array above the range as resistance,
- reverse or expand lower,
- or trade back into 12AM Open and expand lower if 12AM acts as resistance.

## Outputs

`analyzeGrinchPhase3Consolidation()` returns:

- `consolidationProfileState`: `valid | weak | invalid | not_present`
- `consolidationRange`: `rangeHigh`, `rangeLow`, `rangeMidpoint`, `rangeWidth`, `isTight`
- `twelveAmRelationship`: `above | below | around | acting_as_support | acting_as_resistance | unclear`
- `liquidityRaidState`: `buySideRaided | sellSideRaided | none | both | unclear`
- `expectedExpansionDirection`: `bullish | bearish | neutral | unclear`
- `entryIntent`: `continuation_entry | reversal_entry | wait_for_confirmation | no_trade`
- `timingGrade`: `ideal | acceptable | early | late | expired`
- `targetHierarchy`
- `invalidation`
- `confidenceAdjustment`
- `reasons[]`
- `missingEvidence[]`

## Integrations

Phase 3 is wired into:

- ICT Lab Consolidation Profile panel and chart overlays for consolidation high, midpoint, and low.
- Dashboard active Grinch profile summary.
- Runtime snapshot current active Grinch profile among Model 1, Reversal, and Consolidation.
- Agent Debate through the Consolidation Profile Agent.
- LLM advisory context as compact, advisory-only consolidation evidence.
- Auto Research false-positive candidate family for consolidation profile validation.

## Safety

This remains simulation/research logic only. No live feed, broker connection, MT5/Tradovate integration, order placement, go-trader handoff, or readiness override is present.
