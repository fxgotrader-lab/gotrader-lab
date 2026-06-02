# Jesse-Inspired Research Metrics

Jesse and Jesse MCP are design references only. GoTrader does not import Jesse,
run Jesse, call Jesse MCP, or add Jesse's PostgreSQL/Redis stack.

## Reference Mapping

| Jesse reference concept | GoTrader-native equivalent |
| --- | --- |
| Backtest performance metrics | `src/lib/researchMetrics` report rows from GoTrader research-cycle and walk-forward state |
| Benchmark mode across strategies/timeframes | Research Benchmark Matrix across progressive ICT/Grinch layers |
| Monte Carlo trade/candle robustness | Planned Monte Carlo Robustness panel; unavailable values stay planned/insufficient |
| Optimization impact review | Proposal Impact Report with before/after metrics and regression warnings |
| Risk metrics and drawdown recovery | Research Risk Report using GoTrader locked research-mode risk policy |
| Backtest chart/report surfaces | Command Center compact Research Quality and Advanced Details reports |
| Regime-aware backtest analysis | Deterministic regime classifier plus walk-forward regime consistency fields |
| Agent-facing metric context | Agent Metric Provenance with sample size, source, regime context, and status |

## Layer Framing

Grinch is not benchmarked as a separate strategy against ICT. GoTrader reports
progressive layer contribution:

1. ICT foundation only
2. ICT + PD/liquidity alignment
3. ICT + Grinch profile
4. ICT + Grinch timing
5. ICT + Grinch entry confirmation
6. ICT + full Grinch stack

The correct language is ICT foundation, Grinch refinement layer, and full-stack
ICT/Grinch setup.

## Safety

These surfaces are research visibility only. They do not create order controls,
broker authority, live trading authority, or readiness override authority.
