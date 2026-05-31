# Grinch ICT Phase 2 / Reversal Profile

GoTrader AI Lab now extends the Phase 1 Grinch profile layer with a research-only Reversal Profile. It builds on the existing Phase 1 higher-timeframe bias, 12AM Opening Price, PD array hierarchy, market cycle, and timing framework. It does not replace Phase 1 and it cannot execute trades, create broker handoffs, or override readiness.

The requested repo transcript path `docs/strategy-sources/grinch-video-jZdl_0Jgo2k.md` was not present in the workspace during implementation, so the model was aligned to the uploaded transcript file `(8) Grinch video-jZdl_0Jgo2k.md` and the user-defined Phase 2 rules.

## Reversal Profile Thesis

All Grinch models are organized around 12AM Open and what price does into NY. The Reversal Profile is present when London does not meaningfully interact with 12AM Open around 2:00-3:00 AM, then price expands away into the NY approach.

Core rules:

- 12AM Open is daily equilibrium and support/resistance.
- London 2:00-3:00 should fail to interact with 12AM Open.
- Price should expand away from 12AM into NY.
- Around 9:30-10:00, a reversal back toward 12AM is expected.
- First target is always 12AM Open.
- Continuation beyond 12AM requires higher-timeframe draw, displacement/reclaim through 12AM, and a valid PD array or liquidity target beyond 12AM.
- Strong rejection at 12AM weakens continuation beyond 12AM.
- 5m/1m confirmation is still required after the 15m profile is identified.

## Outputs

`analyzeGrinchPhase2Reversal()` returns:

- `reversalProfileState`: `valid | weak | invalid | not_present`
- `twelveAmInteractionState`: `interacted | failed_to_interact | unclear`
- `londonBehavior`: `above_12am | below_12am | around_12am | expanded_away | unclear`
- `reversalBias`: `bullish | bearish | unclear`
- `nyReversalWindow`: `expected | active | missed | expired`
- `firstTarget`: `12am_open`
- `continuationBeyond12am`: `supported | weak | rejected | unclear`
- `timingGrade`: `ideal | acceptable | early | late | expired`
- `entryIntent`: `reversal_entry | no_trade | wait_for_confirmation`
- `confidenceAdjustment`
- `invalidation`
- `reasons[]`
- `missingEvidence[]`

## Timing

The transcript gives the timing nuance:

- If the higher-timeframe target is met by 9:30, reversal can be immediate and the first five minutes matter.
- If the target is not met, the move can continue into 10:00, with reversal entry forming around 10:00-10:15.
- If it is 9:36, the model should wait for 10:00 rather than force the entry.
- After 10:30, timing is late/expired unless a future model supplies exceptional confirmation.

## Continuation Beyond 12AM

Phase 2 treats 12AM as first target, not automatic continuation. Continuation beyond 12AM is only `supported` when:

- higher-timeframe draw supports continuation,
- price reclaims or breaks through 12AM with displacement,
- and a valid PD array or liquidity objective exists beyond 12AM.

If price reaches 12AM and rejects strongly, continuation is `rejected` and the profile is weakened.

## Integrations

Phase 2 is wired into:

- ICT Lab Reversal Profile panel
- runtime snapshot compact summary
- Mission Control advanced ICT summary
- internal agent roster via Reversal Profile Agent
- Agent Debate and CIO synthesis inputs
- LLM context packet as advisory-only reversal profile evidence
- Auto Research false-positive candidate family for reversal profile validation

## Safety

This is simulation/research logic only. It does not add live feeds, broker execution, MT5/Tradovate integration, order placement, go-trader handoff, or readiness override.
