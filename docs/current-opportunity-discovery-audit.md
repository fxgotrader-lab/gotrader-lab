# Current Opportunity Discovery Audit

## Finding

GoTrader already has a safe explicit deep-history path through Activate Market. The MT5 range endpoint can supply roughly 90 days of M5 data, and the multi-timeframe context builder requests W1, D1, H4, H1, M15, and M5 without relying on the chart display timeframe.

The weak live-discovery behavior came from presentation and routing, not a need to loosen strategy gates:

- Page-load Advisor and ICT Lab can still be lightweight and may only see the latest tactical candle window.
- The existing Current Read exposed one primary opportunity/no-trade state, which flattened valid context, forming setups, rejected setups, and missing-condition diagnostics into a single summary.
- ICT Lab did not have a compact current-opportunity scanner readout from the latest Activate Market run.
- The Advisor packet did not carry a dedicated compact opportunity summary for advisory consumers.

## Fix

Added a research-only current opportunity scanner under `src/lib/currentOpportunity`.

The scanner consumes compact current-read/advisor metadata and source-depth metadata. It does not fetch raw candles from the UI, does not serialize candle arrays, and does not create execution intent.

Depth policy:

- Tactical latest window: latest canonical candles, usually 1000 for display/current read.
- Session context: current and previous-session compact model context when available.
- Swing context: 5-10 trading days when enough range/depth metadata exists.
- Validation context: explicit range/deep history, ideally 90 days.

If only the latest tactical window is present, the scanner marks depth as `tactical_only` or `insufficient` and surfaces the exact next action: run Activate Market with explicit MT5 range context.

## Strategy Coverage

The scanner reports compact diagnostics for:

- CMD paper-watchlist and CMD variant research.
- Silver Bullet v1.
- Silver Bullet v2 refined research.
- Turtle Soup v1.
- CISD v1.
- IFVG v1.
- Market-map-only diagnostic.

Strategies that are not fully confirmed are shown as `forming`, `near_miss`, `rejected`, `no_trade`, or `needs_more_data`. They are not promoted into Paper-Demo or execution.

## Safety Boundary

All scanner outputs preserve:

- `executionAuthority: "none"`
- `brokerAuthority: "none"`
- `readinessOverrideAuthority: "none"`
- `researchOnly: true`
- `executionIntentCreated: false`

Excluded from scanner output:

- raw candles
- raw snapshots
- secrets/API keys/tokens
- account data
- order data
- position data
- MT5 credentials

## UI Surfaces

Dashboard:

- The compact Advisor card now includes a Current Opportunities readout with valid/forming/near-miss counts, depth status, top blocker, and next action.

Advisor:

- The full Advisor decision board shows the current opportunity scanner panel with top setup, rejected/no-trade reasons, source-depth status, and required next validation.

ICT Lab:

- ICT Lab reads the latest saved scanner result from Activate Market and shows forming/rejected/no-trade reasons without triggering another deep-history fetch on page load.

## Calibration Note

This is not a threshold-loosening change. The scanner explains why ideas are not approved and identifies near-misses for later deterministic replay. Paper-Demo and readiness gates remain unchanged.
