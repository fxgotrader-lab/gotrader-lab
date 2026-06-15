# GoTrader Analysis Decision Trace

Date: 2026-06-14

Scope: investigation, documentation, and compact trace tooling. This document explains how GoTrader turns market data into a current opportunity state, validation-chain entry, Paper-Demo blocker, or no-trade state. It does not change strategy rules, add strategies, redesign UI, or change safety boundaries.

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

GoTrader is a deterministic research terminal. Recognition is not execution, and recognition is not evidence.

## 1. Source And Data Step

### Source Selection

The active market-data source is summarized by `SourceStatusSnapshot`.

Primary files:

- `src/lib/sourceStatus/sourceStatusTypes.ts`
- `src/lib/sourceStatus/buildSourceStatusSnapshot.ts`
- `src/lib/ict-strategy-suite/ictMarketAnalysisContext.ts`
- `src/lib/currentOpportunity/buildCurrentOpportunityContext.ts`

GoTrader separates:

- `requestedSymbol`: what the operator wants to study, for example `MNQ`.
- `brokerSymbol`: what the read-only MT5 broker actually provides, for example `USTECH`.
- `sourceProvider`: usually `mt5_read_only` for current research.
- `sourceFingerprint`: compact identity for the candle set and context.

For the current workflow, `USTECH` is treated as MT5 CFD/proxy data for requested `MNQ` research. It is useful for model research, session context, replay, and validation, but it is not CME MNQ futures truth.

### Source Depth Layers

GoTrader intentionally uses different depth layers for different jobs.

| Layer | Purpose | Typical Data | Source Of Truth |
| --- | --- | --- | --- |
| Dashboard chart window | Visual context and current operator view | Latest `1,000 x 5m` candles | Active canonical source |
| Tactical current analysis | Immediate setup and current-read state | Latest window, usually `M5`/`M15` | Canonical source/current read |
| Swing/session context | Enough history for session model, swing levels, recent ranges | Multi-day `M5`/`M15`/`H1` | `SourceStatusSnapshot` and Activate Market context |
| 90-day validation context | Replay, OOS, scorecard, performance audits | Explicit chunked MT5 range history | Manual CLI/validation path only |

`buildSourceStatusSnapshot` classifies depth into:

- `validation_context`
- `swing_context`
- `tactical_only`
- `unavailable`

The Dashboard and Advisor should not silently claim validation-depth evidence from only the chart window. If 90-day history has not been explicitly loaded, current analysis can still be useful but should remain tactical or swing-context only.

### Timeframes

`ictMarketAnalysisContext.ts` defines the current multi-timeframe analysis stack:

| Timeframe | Role | Notes |
| --- | --- | --- |
| `W1` | weekly bias | Native W1 first; can derive W1 from D1 when native W1 is unavailable. |
| `D1` | daily bias | Uses explicit read-only history when Activate Market runs. |
| `H4` | higher-timeframe bias | Supports top-down context. |
| `H1` | bias and dealing range | Useful for PD location and draw-on-liquidity. |
| `M15` | session model | Session narrative and model context. |
| `M5` | confirmation/refinement | Current-read and most detector contexts. |
| `M1` | entry refinement | Optional, especially for Silver Bullet. |

If a required timeframe is missing, GoTrader should display the missing timeframe and downgrade the result. Missing HTF context should not be hidden behind a generic "no trade."

## 2. Reference-Level Step

Reference levels are built from compact candle inputs, then passed forward as compact levels or summaries. Raw candles stay internal.

### Reference Owners

| Reference | File / Function | Timeframe / Session Logic | Output / Consumer | Known Limitations |
| --- | --- | --- | --- | --- |
| 12AM New York Open | `ictReferenceAccuracy.ts` / `buildIctReferenceAccuracyReport`; legacy `openingPriceEquilibrium.ts` / `findTwelveAmOpenState` | America/New_York session-local midnight, not literal UTC HH:mm | Price/timestamp status for Grinch, replay diagnostics, current read | Requires a candle at or after local midnight; MT5 CFD sessions can gap or start late. |
| Sunday Open | `ictReferenceAccuracy.ts`; legacy `findSundayOpenState` | First Sunday evening candle after 18:00 New York | Sunday open price, volume imbalance context | Broker Sunday history may be missing. |
| Prior day high/low | `ictReferenceAccuracy.ts` | Previous New York local trading date | Draw-on-liquidity and reference report | Holiday/partial sessions may need manual review. |
| Prior week/month high/low | `ictStrategySuiteHelpers.ts` / `detectLiquidityPools` | Higher aggregate windows | Liquidity pools | Depends on loaded depth and calendar handling. |
| Asia range | `ictSessionNarrative.ts` / session ranges | Asia killzone 20:00-01:00 New York | Session narrative, CMD, range context | Requires session-local grouping. |
| London range/sweep | `ictSessionNarrative.ts` | London 02:00-05:00 New York | London sweep, compression, manipulation context | London logic is session-local; helper fallback grouping can be simpler. |
| NY session high/low | `ictSessionNarrative.ts` | NY AM 09:30-12:00, lunch 12:00-13:30, PM 13:30-16:00 | Session range and liquidity reference | Needs enough intraday candles. |
| Swing highs/lows | `ictReferenceAccuracy.ts`, `ictStrategySuiteHelpers.ts` | Compact fractal strength | Structural liquidity, targets, stops | Fractal strength changes sensitivity. |
| Equal highs/lows | `ictStrategySuiteHelpers.ts` | Tolerance-based clustering | Liquidity pools | Tolerance can miss imperfect CFD/proxy equal levels. |
| Consolidation high/low | `ictReferenceAccuracy.ts`, `ictStrategySuiteHelpers.ts` / `detectConsolidation` | Rolling compression range | CMD and range models | Range width/duration thresholds are research parameters. |
| Dealing range/equilibrium | `ictReferenceAccuracy.ts`; legacy `dealingRangePremiumDiscount.ts` | Swing/range high-low midpoint | Premium/discount/equilibrium location | Bad range anchors produce bad PD labels. |
| FVG | `ictStrategySuiteHelpers.ts` / `detectFairValueGap`; legacy `detectFVG.ts` | Three-candle imbalance | Entry zones, displacement, IFVG, Silver Bullet | Requires direction and mitigation state review. |
| IFVG | `ictIfvg.ts`, `detectCurrentOpportunities.ts` | FVG inversion plus clean retest/displacement for filtered v2 | IFVG v1/v2 opportunities | Broad v1 needs filtering; filtered v2 is research-only candidate consideration. |
| Order blocks/breakers/mitigation blocks | `ictStrategySuiteHelpers.ts` | Candle structure around displacement and reclaim | Trade construction, PD arrays | Still compact research logic, not execution authority. |
| Liquidity pools | `ictStrategySuiteHelpers.ts` / `detectLiquidityPools` | Prior period, session, equal highs/lows, old swings, opening gaps | Targets and draw-on-liquidity | Output quality depends on loaded timeframes. |
| PD arrays | `ictStrategySuiteHelpers.ts` and Advisor signal fields | FVG, OB, breaker, mitigation, liquidity void, range location | Advisor context and research setup labels | PD-array alone is support/context, not a complete validated strategy. |

Suspicious area to watch: session logic is split between session-local New York modules and generic helper grouping. When a level looks wrong, check whether it came from `ictSessionNarrative.ts` or the simpler helper path.

## 3. Market Context Step

Market context answers "what kind of environment are we in?" before a setup is treated as a candidate.

Primary files:

- `src/lib/ict-strategy-suite/ictMarketAnalysisContext.ts`
- `src/lib/currentOpportunity/buildCurrentOpportunityContext.ts`
- `src/lib/ict-strategy-suite/ictSessionNarrative.ts`
- `src/lib/researchCycle/*`
- `src/lib/evidence/*`
- `src/lib/maturity/*`

Current context includes:

- source depth and range-history availability
- weekly/daily/H4/H1/M15/M5 roles
- HTF alignment and conflict reason
- weekly bias direction/status
- session narrative profile
- directional session read
- FVG and displacement status
- draw-on-liquidity
- liquidity swept
- source warnings, especially mock/sample or CFD/proxy warnings

Top-down bias is compactly classified as:

- `aligned`
- `mixed`
- `conflicted`
- `insufficient_data`
- `unavailable`

This classification explains context. It should not override a model gate by itself.

## 4. Strategy Recognition Step

Strategy recognition converts context and references into a research hypothesis. A detected model is not yet evidence.

Primary files:

- `src/lib/strategyLibrary/strategyRegistry.ts`
- `src/lib/currentOpportunity/detectCurrentOpportunities.ts`
- `src/lib/ict-strategy-suite/ictUniversalRecognition.ts`
- `src/lib/ict-strategy-suite/ictCmdTelemetry.ts`
- `src/lib/ict-strategy-suite/ictIfvg.ts`
- `src/lib/ict-strategy-suite/ictSilverBullet.ts`
- `src/lib/ict-strategy-suite/ictTurtleSoup.ts`
- `src/lib/ict-strategy-suite/ictCisd.ts`
- `src/lib/strategyLibrary/grinchProfileDiagnostics.ts`

### Strategy Summary

| Strategy | Required Conditions | Entry Model | Stop / Invalidation | Target Model | Min RR | Current Status |
| --- | --- | --- | --- | --- | ---: | --- |
| CMD short paper-watchlist | Consolidation, manipulation/sweep, distribution/expansion away, external liquidity, valid target/invalidation, session alignment, no mock source | Usually return/continuation after distribution evidence | Beyond manipulation/range/structural invalidation | External liquidity in delivery direction | Usually 2R+ | Promising but overfit-risk; independent-date gate blocks promotion. |
| IFVG v1 | FVG inversion, target/invalidation/RR, no mock source | Inversion FVG retest | Beyond IFVG/FVG structure | External liquidity or next draw | 2R+ | Executable research; broad v1 needs filtering. |
| IFVG filtered v2 | Original FVG, full inversion, unused IFVG, clean retest, displacement confirmation, HTF review, liquidity target, min RR | Clean IFVG retest | Beyond IFVG/FVG structure | External liquidity | 2R+ | Research-only paper-watchlist candidate family; Paper-Demo still gated. |
| Silver Bullet v1 | NY killzone, sweep, directional FVG, return to FVG, target/invalidation/RR | FVG return in 03:00-04:00, 10:00-11:00, or 14:00-15:00 New York | Beyond swept side/FVG boundary | Next liquidity pool | 2R+ | Rejected/research-only baseline; weak replay/OOS. |
| Silver Bullet v2 | Meaningful sweep, timely displacement FVG, timely return, 5m/15m context alignment, realistic target/RR | Refined FVG return | Beyond swept wick/FVG boundary, realistic stop | Nearest logical liquidity | 2R to 15R | Executable research; sample currently small. |
| Turtle Soup v1 | Setup-range high/low sweep, immediate rejection, MSS/reclaim, entry retest, RR | Rejection/retest after sweep | Beyond sweep | Opposing liquidity | 2R+ | Too strict or setup-range mismatch in current audit. |
| CISD v1 | Prior delivery trend, opposite close beyond significant prior body, valid retest, no chop, RR | Retest of CISD candle body | Beyond full CISD candle wick | Next opposing liquidity pool | 2R+ | Executable research; replay/OOS required. |
| Market-map-only | Context only | None | None | None | 0 | Diagnostic only; cannot become evidence. |
| Scalp setup | Lower-timeframe liquidity and displacement context | Compact lower-timeframe entry | Explicit close invalidation required | Compact target required | 1.2R+ | Research/watchlist only. |
| PD-array setup | Dealing-range location and active PD array | Support/context only unless paired with model | Not standalone | Not standalone | 1.2R+ | Support-only; cannot stand alone. |
| Grinch models | Session timing, 12AM/Sunday open, profile evidence, expansion/reversal/consolidation rules | Profile-specific | Profile-specific | 12AM/PD-array targets only when valid | 1.2R+ | Timing/profile diagnostics and research families; no readiness override. |

Important principle: the strategy registry describes research definitions and forbidden promotion reasons. The current-opportunity scanner decides what is currently visible. Replay/walk-forward/evidence decide whether it becomes evidence.

## 5. Trade Construction Step

Primary files:

- `src/lib/ict-strategy-suite/ictTradeConstruction.ts`
- `src/lib/ict-strategy-suite/ictTradeConstructionTypes.ts`

Trade construction answers whether a recognized setup has the minimum compact fields needed for replay:

- entry
- target
- invalidation/stop
- RR estimate
- source and authority safety

### Entry

Entry may come from:

- explicit current-read entry zone
- FVG/IFVG midpoint or zone
- order-block/body zone
- setup-specific retest zone

If entry is missing, the blocker is `entry_missing`.

### Stop / Invalidation

Stop logic is model-aware:

- FVG/IFVG long: stop below FVG or swept sell-side structure.
- FVG/IFVG short: stop above FVG or swept buy-side structure.
- OB/mitigation/breaker: stop beyond structural candle boundary.
- CISD: stop beyond full CISD candle including wick.

For USTECH/MNQ-style research, `ictTradeConstruction.ts` applies a max stop-distance guard so very wide stops cannot sneak through as clean candidates.

### Target

Target should be the next logical draw-on-liquidity:

- prior high/low
- session high/low
- equal high/low
- external liquidity
- range high/low
- PD-array target when model supports it

If target is missing, the correct blocker is `target_missing`.

### RR

RR is calculated only when entry, stop, and target exist. `target_too_close` is valid only after target exists and RR is below the required minimum. If the target is missing, GoTrader should say `target_missing` and `rr_unavailable`, not `target_too_close`.

This distinction matters because "target too close" means a bad target; "target missing" means the detector did not define a target.

## 6. Current Opportunity Scanner Step

Primary files:

- `src/lib/currentOpportunity/buildCurrentOpportunityContext.ts`
- `src/lib/currentOpportunity/detectCurrentOpportunities.ts`
- `src/lib/currentOpportunity/currentOpportunityTypes.ts`

`buildCurrentOpportunityContext` merges:

- Advisor packet source metadata
- current read fields
- multi-timeframe context
- source depth
- model lane and opportunity state
- trade construction fields

`detectCurrentOpportunities` emits compact opportunities with one of:

- `valid_candidate`
- `forming`
- `near_miss`
- `rejected`
- `no_trade`
- `needs_more_data`

### Status Meaning

| Status | Meaning | Typical Next Action |
| --- | --- | --- |
| `valid_candidate` | Compact setup has source, structure, entry/target/invalidation/RR, and no hard blockers. | Queue replay validation. |
| `forming` | Structure exists, but a condition like return-to-FVG or displacement confirmation is still forming. | Wait for confirmation. |
| `near_miss` | Setup is understandable but blocked by missing fields, low RR, shallow depth, or validation-depth gap. | Fix evidence/target/context or run explicit validation. |
| `rejected` | Hard blocker such as mock/sample source, reused IFVG, failed OOS, or unsafe source. | Do not use as evidence. |
| `no_trade` | No recognized setup exists. | Wait for structure. |
| `needs_more_data` | Setup cannot be judged with current source depth. | Load/activate deeper context. |

### Ranking

The scanner ranks in this order:

1. valid candidates
2. forming setups
3. near misses
4. rejected setups
5. needs-more-data
6. no-trade

The summary is sent to Dashboard, Advisor, ICT Lab, and validation-related panels as compact metadata. It excludes raw candles and raw snapshots.

## 7. Validation Chain Step

Primary files:

- `src/lib/validationChain/buildValidationChain.ts`
- `src/lib/validationChain/validationChainTypes.ts`
- `src/lib/validationChain/validationChainIntegrations.ts`

Validation chain principle:

> Recognition is not evidence. Replay creates preliminary evidence. Walk-forward/OOS creates stronger evidence. Evidence and maturity gates decide any further progression.

A setup can create a validation-chain entry only when:

- source is not mock/sample
- source fingerprint exists
- recognition is structured enough to validate
- authority remains none
- raw candles are not stored

### Validation Stages

| Stage | Meaning |
| --- | --- |
| `replay_required` | Candidate exists, but no replay evidence yet. |
| `replay_running` | Replay is running. |
| `walk_forward_required` | Replay passed; OOS is required next. |
| `walk_forward_passed` | Stronger evidence exists, but not readiness by itself. |
| `evidence_updated` | Evidence/maturity summaries attached. |
| `replay_failed` / `walk_forward_failed` | Hypothesis is blocked as evidence. |
| `needs_more_data` | Validation did not have enough windows/signals. |

For CMD, even a walk-forward pass still requires independent-date validation before Paper-Demo consideration.

For IFVG filtered v2, replay and walk-forward are required, then evidence, maturity, readiness checklist, and Paper-Demo checklist.

## 8. Paper-Demo Step

Primary files:

- `src/lib/paperDemoOperations/paperDemoEligibility.ts`
- `src/lib/paperDemoOperations/*`

Paper-Demo Operations is manual research operations, not broker paper trading.

Paper-Demo blocks candidates when:

- source is mock/sample
- source fingerprint is missing
- validation chain is missing
- replay has not passed or is insufficient
- walk-forward is missing, failed, or insufficient
- evidence/maturity summaries are missing
- Paper-Demo checklist is incomplete
- authority is not none
- execution intent exists
- CMD independent-date gate has not passed

Allowed operator actions include watchlist, monitoring, blocked, retired, notes, and links to validation pages. They do not place orders.

## 9. Advisor And OpenClaw Step

Primary files:

- `src/lib/ict-strategy-suite/ictAdvisorTypes.ts`
- `src/lib/llm/*`
- `src/lib/openclawPilot/*`
- `src/components/advisor/ResearchAdvisorView.tsx`
- `src/components/advisor/OpenClawProposalIntentPanel.tsx`
- `src/components/self-improvement/SelfImprovementView.tsx`

The Advisor packet is compact. It may include:

- requested/broker symbol
- source provider and fingerprint
- current opportunity summary
- compact signal fields
- validation chain status
- journal event summaries
- safety locks
- authority none

It must not include:

- raw candle arrays
- raw runtime snapshots
- screenshots/base64
- secrets, API keys, tokens, passwords
- MT5 credentials
- account/order/position data
- broker mutation routes

OpenClaw may:

- explain the cycle
- identify blockers
- suggest research-only proposal intents
- request deterministic validation
- create compact audit/memory summaries

OpenClaw may not:

- place trades
- call MT5
- mutate broker/account/order/position state
- approve readiness
- apply calibration
- set auto-apply

OpenClaw proposal intents are dry-run validated by `openclawPilotDryRun.ts`. Unsafe responses are blocked, not treated as ordinary success.

## 10. Decision Trace Examples

### Example A - No Valid Setup, Only Near-Miss

Input:

- Source: `mt5_read_only`
- Requested/broker: `MNQ` -> `USTECH`
- Timeframes: `M5`, `M15` loaded, HTF context missing
- Depth: swing/tactical context, not validation context

References:

- Latest session ranges and basic liquidity can be read.
- Full top-down stack is incomplete.

Strategy checks:

- CMD-like consolidation/displacement may be visible.
- FVG return or target/invalidation may be missing.

Trade construction:

- Entry may be present.
- Target or invalidation may be missing.
- RR may be unavailable.

Result:

- `near_miss` or `forming`
- next action: wait for missing confirmation or load full validation context

Validation chain:

- No evidence yet.
- Queue replay only after compact candidate fields exist.

### Example B - Valid IFVG Filtered v2 Candidate, Replay Required

Input:

- Source: `mt5_read_only`, non-mock, fingerprint present
- Timeframes: active M5/M15 plus HTF context
- Depth: validation context available

References:

- Inverted FVG identified.
- Clean retest is present.
- Displacement confirms direction.
- Target and invalidation are defined.

Strategy checks:

- Original FVG exists.
- IFVG is not reused.
- Clean retest and displacement pass.
- RR is at least 2R.

Trade construction:

- Entry from IFVG retest zone.
- Stop beyond IFVG/FVG structure.
- Target at external liquidity.

Result:

- `valid_candidate`
- strategy: `ifvg_filtered_v2_research`
- next action: queue replay validation

Validation chain:

- `replay_required`
- Paper-Demo blocked until replay, walk-forward, evidence, maturity, and checklist gates pass.

### Example C - Rejected Or Near-Miss Due Missing Target/RR

Input:

- Source may be valid.
- Setup structure may be visible.
- Target was not defined by detector.

References:

- Liquidity sweep or FVG may exist.
- Draw-on-liquidity target is missing or not selected.

Trade construction:

- Entry exists.
- Invalidation may exist.
- Target is missing.
- RR cannot be calculated.

Correct blocker:

- `target_missing`
- `rr_unavailable`

Incorrect blocker to watch for:

- `target_too_close` before any target exists.

Result:

- `near_miss`, not a valid candidate.
- next action: define draw-on-liquidity target before RR evaluation.

### Example D - CMD Promising But Blocked By Independent-Date Gate

Input:

- Source: explicit 90-day MT5 read-only history
- CMD strict short paper-watchlist behavior appears strong

Known audit result:

- Strong target-first cluster
- All candidates concentrated on one trading date/window

Strategy checks:

- CMD structure can be valid as research-only.
- Independent-date gate fails.

Paper-Demo blocker:

- "CMD lane is promising but date-concentrated; needs independent-date validation."

Validation chain next action:

- "Run independent-date CMD validation over 90-day history."

Result:

- keep CMD research-only / paper-only tracking
- no Paper-Demo promotion
- no execution readiness

## 11. Suspicious Logic And Debug Checklist

Use this checklist when GoTrader's answer looks wrong.

### If a level looks wrong

Check:

- Did it come from New York session-local logic or generic helper grouping?
- Is the selected chart window only 1,000 candles while validation requires 90-day depth?
- Is the broker session missing Sunday or midnight candles?
- Is USTECH CFD/proxy behavior causing a timestamp gap?

Relevant files:

- `ictReferenceAccuracy.ts`
- `ictSessionNarrative.ts`
- `openingPriceEquilibrium.ts`
- `ictStrategySuiteHelpers.ts`

### If a setup should be forming but shows no-trade

Check:

- `detectCurrentOpportunities.ts` missing conditions
- `currentRead` model fields
- HTF context missing warnings
- source depth policy status
- whether the strategy has an executable detector or only registry placeholder

### If a setup should be rejected but shows valid

Check:

- source mock/sample flag
- fingerprint presence
- trade construction target/invalidation/RR
- IFVG reused/clean retest/displacement gates
- CMD independent-date gate
- validation chain stage

### If Paper-Demo looks too optimistic

Check:

- replay verdict
- walk-forward verdict
- evidence quality
- maturity
- checklist
- authority
- independent-date gate for CMD

## 12. Compact Trace Script

Run:

```powershell
npm.cmd run test:analysis-decision-trace
```

The script prints a compact trace for the active MT5 wrapper when available:

- source status
- timeframe roles
- reference-level summary
- top opportunities
- top blockers
- validation-chain state
- next action
- safety/authority status

If the MT5 wrapper is offline, the script passes in safe unavailable mode and tells the operator to start the local read-only bridge. It never prints raw candles.

## Final Safety Statement

This decision trace is diagnostic only. It does not create orders, mutate MT5, mutate a broker, access account/order/position data, approve readiness, apply calibration, or let OpenClaw auto-apply anything.
