# TradingView MCP Analysis Adapter

## Role

TradingView MCP is a chart-analysis and technical-confirmation source only. It can help GoTrader read chart state, visible levels, indicators, annotations, OHLCV summaries, replay state, and screenshots.

It cannot place orders, approve risk, approve readiness, send handoffs, or act as broker truth.

## Source Repo Findings

The inspected TradingView MCP repo exposes local TradingView Desktop automation through MCP and CLI tools. It supports chart navigation, quotes, OHLCV summaries, indicator values, Pine tooling, drawing, alerts, replay, screenshots, and local streaming from the chart.

Those capabilities fit GoTrader as bounded evidence:

- chart state
- technical summary
- detected support/resistance and liquidity levels
- indicator snapshots
- patterns
- replay context
- screenshot references

They do not fit as:

- account truth
- execution authority
- position state
- order routing
- readiness approval

## Normalization Rules

Raw MCP output is normalized into `TradingViewEvidence`.

If TradingView returns `buy` or `sell`, GoTrader records it as advisory bias only:

- `buy` becomes `bias = bullish`
- `sell` becomes `bias = bearish`

Any claimed authority is downgraded:

- `executionAuthority = none`
- `brokerAuthority = none`
- `readinessOverrideAuthority = none`

Warnings are added when authority-like language is detected.

## Journal Boundary

Journal entries may include:

- `TradingViewEvidence.evidenceId`
- technical summary
- bounded levels, indicators, patterns
- warnings and missing evidence

Journal entries must not include:

- raw unrestricted MCP payloads
- broker credentials
- TradingView account/session secrets
- execution instructions as authority

## Future Adapter

A future live adapter may call TradingView MCP through a local bridge. That adapter should return only normalized `TradingViewEvidence`, not raw MCP payloads.

TradingView chart data remains supporting evidence. GoTrader market data, broker quotes, and broker account state remain separate sources.
