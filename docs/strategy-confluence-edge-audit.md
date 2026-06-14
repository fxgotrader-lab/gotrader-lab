# Strategy Confluence Edge Audit

Generated: 2026-06-14 UTC  
Script: `npm.cmd run test:strategy-confluence-edge`

## Scope

This audit evaluates whether registered GoTrader ICT strategies improve when used as confluence filters instead of standalone trade models.

Safety boundary:

- No broker execution
- No live trading
- No order placement
- No MT5 mutation
- No account/order/position access
- No readiness override
- No OpenClaw auto-apply
- No calibration apply
- No Paper-Demo promotion

Authority remains:

- `executionAuthority: none`
- `brokerAuthority: none`
- `readinessOverrideAuthority: none`

The audit uses compact strategy diagnostics only. Raw candles, raw snapshots, account/order/position data, and secrets are not written into this report.

## Source

Input artifacts:

- `docs/gotrader-profitability-failure-audit.md`
- `docs/strategy-detector-blocker-audit.md`
- `docs/silver-bullet-performance-audit.md`
- `docs/silver-bullet-v2-refinement-audit.md`
- `docs/turtle-soup-performance-audit.md`
- `docs/cisd-performance-audit.md`

Research source represented by those artifacts:

- Provider: `mt5_read_only`
- Requested symbol: `MNQ`
- Broker symbol: `USTECH`
- Lookback: explicit 90-day compact diagnostics
- Source warning: `USTECH` is MT5 CFD/proxy research data for requested `MNQ`, not CME futures truth.

## Gates

The confluence audit requires:

- minimum candidates: 20
- minimum unique trading dates: 3
- minimum active rolling windows: 2
- minimum average RR: 2
- no mock/sample source
- OOS cannot degrade or fail
- no single-date cluster promotion

## Bundle Results

| Bundle | Measurement | Candidates | Target-first | Invalidation-first | Dates | Windows | OOS | Classification | Gate result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CMD only | measured | 8 | 87.50% | 12.50% | 1 | 1 | overfit_risk | insufficient_data | blocked |
| CMD + HTF alignment | partially measured | 8 | 87.50% | 12.50% | 1 | 1 | overfit_risk | insufficient_data | blocked |
| CMD + displacement | partially measured | 8 | 87.50% | 12.50% | 1 | 1 | overfit_risk | insufficient_data | blocked |
| CMD + external liquidity target | partially measured | 8 | 87.50% | 12.50% | 1 | 1 | overfit_risk | insufficient_data | blocked |
| CMD + CISD direction | not measurable | 0 | 0.00% | 0.00% | 0 | 0 | not_measured | insufficient_data | blocked |
| CMD + CISD + FVG | not measurable | 0 | 0.00% | 0.00% | 0 | 0 | not_measured | insufficient_data | blocked |
| CMD + SMT confirmation | not available | 0 | 0.00% | 0.00% | 0 | 0 | not_measured | insufficient_data | blocked |
| Silver Bullet v2 + HTF alignment | measured | 3 | 33.33% | 66.67% | 3 | 3 | insufficient_data | insufficient_data | blocked |
| Silver Bullet v2 + CISD | not measurable | 0 | 0.00% | 0.00% | 0 | 0 | not_measured | insufficient_data | blocked |
| Liquidity sweep + displacement + FVG return | measured | 152 | 10.53% | 86.84% | 63 | 4 | degraded | no_edge | blocked |
| FVG return + session context | measured | 152 | 10.53% | 86.84% | 63 | 4 | degraded | no_edge | blocked |
| NY AM Silver Bullet v1 | measured | 50 | 16.00% | 84.00% | unavailable | unavailable | degraded | overfit_risk | blocked |
| NY AM Silver Bullet v2 | measured | 2 | 50.00% | 50.00% | 2 | 2 | insufficient_data | insufficient_data | blocked |
| CISD only | measured | 109 | 25.69% | 72.48% | unavailable | 4 | degraded | overfit_risk | blocked |
| CISD session-open only | measured | 3 | 33.33% | 66.67% | unavailable | unavailable | insufficient_data | insufficient_data | blocked |
| Turtle Soup only | measured | 0 | 0.00% | 0.00% | 0 | 0 | insufficient_data | insufficient_data | blocked |

## Key Findings

### Best raw target-first bundle

CMD remains the strongest raw target-first lane:

- Bundle: `CMD only`
- Candidates: 8
- Target-first: 87.50%
- Invalidation-first: 12.50%
- Average RR: 3.3612
- Unique dates: 1
- Active rolling windows: 1

Decision: do not promote. The result is still a one-date cluster and fails independent-date validation.

### CMD confluence

`CMD + HTF alignment`, `CMD + displacement`, and `CMD + external liquidity target` currently collapse back to the same 8-candidate strict CMD pool. They remain useful research directions, but they are not independently validated confluence bundles yet.

Current blocker:

> CMD lane is promising but date-concentrated; needs independent-date validation.

Additional telemetry needed before these can be scored as true confluence:

- per-candidate HTF alignment directions
- per-candidate target taxonomy
- per-candidate distribution/displacement quality
- per-candidate signal timestamp

### CMD + CISD

`CMD + CISD direction` and `CMD + CISD + FVG` are not measurable from the current compact diagnostics because CMD and CISD reports do not expose shared per-candidate timestamps/feature tags.

Do not infer that CISD improves CMD. Standalone CISD has enough samples but poor behavior:

- Candidates: 109
- Target-first: 25.69%
- Invalidation-first: 72.48%
- OOS verdict: degraded

### Silver Bullet

Silver Bullet v1 is a useful rejected baseline for `liquidity sweep + displacement + FVG return`.

- Candidates: 152
- Target-first: 10.53%
- Invalidation-first: 86.84%
- OOS verdict: degraded

Silver Bullet v2 correctly removes weak setups, but it is too small:

- All v2 candidates: 3
- NY AM v2 candidates: 2
- OOS verdict: insufficient_data

Decision: keep v2 research-only and strict. Do not create a Paper-Demo lane.

### Turtle Soup

Turtle Soup has no valid confluence population yet because v1 produced 0 valid candidates. Its blocker remains setup-range sweep definition, not confluence scoring.

## OOS And Rolling Result

No bundle passes the OOS/rolling gates.

- CMD: strong target-first but active in only 1 rolling window and 1 trading date.
- Silver Bullet v1: enough samples but OOS degraded.
- Silver Bullet v2: too few samples.
- CISD: enough samples but OOS degraded and invalidation-first dominates.
- Turtle Soup: no valid candidates.

## Promotion Decision

No confluence bundle should be promoted.

No new research-only confluence profile was registered because the best candidate family is still date-concentrated or not measurable with current compact candidate telemetry.

Paper-Demo remains blocked.

## Recommended Next Strategy

Recommended next work:

1. Build a deeper CMD variant with candidate-level confluence telemetry:
   - HTF alignment by timeframe
   - CISD direction overlap
   - FVG/IFVG return tag
   - SMT confirmation tag
   - target taxonomy
   - compact signal timestamp
2. Implement IFVG as the next standalone detector.

Why IFVG next:

- Current diagnostics already center around FVG creation, return, invalidation, and liquidity targets.
- IFVG can be scored directly against the existing FVG evidence stack.
- It avoids using weak standalone CISD as an assumed confluence improvement.

OTE and AMD remain good later candidates, but IFVG has the clearest bridge from current evidence.

## Safety Result

The audit remained compact and research-only:

- no raw candles
- no raw snapshots
- no secrets
- no account/order/position data
- no broker mutation
- no real order placement
- no readiness override
- no auto-apply
- authority `none/none/none`
