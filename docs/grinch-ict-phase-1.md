# Grinch ICT Phase 1 / Model 1

GoTrader AI Lab now has a research-only Grinch strategy profile layer beside the existing deterministic ICT engine. It does not replace the existing detectors and it cannot execute trades, create broker handoffs, or override readiness gates.

## Scope

Phase 1 implements:

- higher-timeframe bias and draw-on-liquidity classification
- current A-B dealing range with 50% equilibrium, premium, and discount
- Sunday Open as weekly equilibrium
- 12AM Open as daily equilibrium/support-resistance reference
- PD array hierarchy:
  1. Sunday Opening Price
  2. 12AM Opening Price
  3. Balanced Price Range
  4. Volume Imbalance
  5. Fair Value Gap
  6. Breaker / Mitigation Block
  7. Order Block
- market-cycle classification:
  - consolidation
  - expansion
  - retracement
  - reversal
  - unclear
- Model 1 / Power 3 OTE profile detection
- time-price alignment grading
- entry-confirmation scoring

Phase 1 intentionally does not implement full reversal profiles, full consolidation profiles, SMT/intermarket divergence, live feeds, go-trader handoff, or broker execution.

## Core Outputs

`analyzeGrinchPhase1()` returns a compact structured summary:

- `htfBias`: `bullish | bearish | neutral | unclear`
- `htfDrawOnLiquidity`: `buyside | sellside | internal_range | external_range | unclear`
- `dealingRange`: range high, range low, equilibrium, premium/discount state
- `activePdArrays[]` and `rankedPdArrays[]`
- `sundayOpenState`
- `twelveAmOpenState`
- `marketCycle`
- `modelOneState`: `valid | weak | invalid | not_present`
- `tradeIntent`: `retracement_entry | continuation_entry | reversal_entry | no_trade`
- `timingGrade`: `ideal | acceptable | early | late | expired`
- `targetHierarchy`
- `invalidation`
- `entryConfirmation`
- `confidenceAdjustment`
- `reasons[]`
- `missingEvidence[]`

## Model 1 / Power 3 OTE Logic

The model starts from 12AM Open as daily equilibrium. London 2:00-3:00 is observed relative to 12AM Open. If London trades above or below that level and then displacement appears before NY, the London extreme becomes one side of the A-B dealing range and the displacement extreme becomes the other side.

If retracement has not already occurred before NY, the 9:30-10:00 window is treated as the preferred retracement-entry window. The 10:00-10:15 window is confirmation/continuation. Delayed profiles to 10:30 are lower probability. After 10:30, Phase 1 grades timing as expired unless a future phase supplies exceptional confirmation.

Retracement entry and continuation entry are separated. Continuation requires PD array respect and displacement confirmation.

## Entry Confirmation

The entry-confirmation framework checks:

- PD array respect
- mean-threshold respect
- displacement away
- MSS/BOS participation
- new FVG after displacement
- time-window alignment

Phase 1 does not implement SMT. SMT belongs to a later model phase.

## Agents

The internal agent registry now includes Grinch Phase 1 strategy agents:

- Higher-Timeframe Bias Agent
- PD Array Hierarchy Agent
- Opening Price Equilibrium Agent
- Dealing Range Agent
- Market Cycle Agent
- Model 1 / Power 3 OTE Agent
- Time-Price Alignment Agent
- Entry Confirmation Agent

These agents provide research opinions to the CIO synthesis and debate layer. They do not create order instructions.

## UI and Context

The ICT Lab displays a Grinch Phase 1 summary and chart overlays for:

- Sunday Open
- 12AM Open
- range high
- equilibrium
- range low
- active PD array midpoint

The runtime snapshot includes the latest Grinch Phase 1 summary. LLM advisory packets include a compact Grinch summary so reviewers can critique the profile without receiving execution authority.

## Auto Research

When false positives are elevated, Auto Research can test Phase 1 candidate families:

- stronger higher-timeframe bias alignment
- stronger PD array hierarchy match
- opening-price equilibrium alignment
- better time-price alignment
- valid Model 1 / entry-confirmation emphasis

These are simulation-only calibration candidates. They cannot approve themselves, change broker settings, or bypass readiness.
