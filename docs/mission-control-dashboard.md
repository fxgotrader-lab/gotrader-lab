# Mission-Control Dashboard

The Dashboard is the primary operating surface for GoTrader AI Lab. It should feel like a clean trading research dashboard: direct status, the active chart, a small set of operational controls, current market/research state, and one action queue.

## Purpose

The Command Center answers three questions:

- Is the system connected?
- What chart and research data source is active?
- What action, if any, is required?

Detailed tables, raw diagnostics, proposal history, runtime fingerprints, pipeline internals, and one-cycle research controls remain on drill-down pages or inside Advanced details.

## Default Layout

1. Top status bar: TradingView MCP, chart source, research source, regime, readiness, and execution lock.
2. Main chart panel: Lightweight Chart, source badge, symbol/timeframe, candle count, and latest candle timestamp.
3. Primary action panel: connect TradingView MCP, refresh candles, start/stop auto-refresh, guarded research-source activation, and start/stop autonomous research.
4. Market state card: regime, Grinch/ICT profile, volatility/chop summary, and top blocker.
5. Research status card: latest cycle status, trades, win rate, average R, drawdown, walk-forward, maturity, and evidence.
6. Action Required panel: current actionable blockers with one clear route.
7. Research Flow Tape: compact high-signal events only.

## Advanced Details

The Advanced Details drawer is closed by default. It contains:

- readiness explanation
- loop settings
- autonomous loop progress
- pipeline stage diagnostics
- raw runtime/source fingerprints
- TradingView MCP runtime details
- Grinch score breakdown
- proposal mismatch warnings
- Paperclip and multi-broker planned states
- direct links to detail pages
- one-cycle Research Cycle control

## Action Required

The Action Required panel shows only meaningful items such as:

- proposal review required
- failed or insufficient walk-forward validation
- weak evidence quality
- maturity too low
- readiness gate blockers
- missing LLM advisory review
- unavailable imported market data
- regime mismatch pause

If the panel is clear, the user can keep supervising without visiting detail pages.

## Detail Pages

Market Data, ICT Lab, Walk-Forward, Self-Improvement, Evidence Quality, Research Maturity, Communications, and Settings remain the detail pages. Normal TradingView MCP connection and chart activation should happen from the Dashboard, not from Market Data or Settings.

## What Is Automated

The Command Center can start the autonomous research supervisor loop. The loop may diagnose blockers, select scenario families, run bounded Auto Research, run validation and walk-forward, update maturity, and create or block research calibration proposals.

Policy-gated auto-apply is off by default. When enabled, it can only apply safe research-only calibration fields if the autonomy safety policy allows it.

## What Remains Locked

The Command Center cannot:

- execute trades
- approve Paper-Demo Candidate automatically
- send go-trader execution handoffs
- connect Tradovate
- override readiness
- change broker, API, risk, contract-size, demo/live, or order settings

Broker execution remains disabled on the dashboard at all times.

## Drill-Down Workflow

Use the dashboard for operation. Open detail pages only when the Action Required panel or Advanced Details asks for deeper inspection:

- Market Data for imported candle state and presets
- Agent Debate for consensus reasoning
- Walk-Forward for OOS window results
- Self-Improvement for proposals
- Readiness Gate for blockers
- Autonomous Research for loop history
- Performance for canonical metrics
- Simulation Runbook for review-only go-trader gate checks
