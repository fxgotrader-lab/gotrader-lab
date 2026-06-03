# GoTrader AI Lab

GoTrader AI Lab is a local-first research workbench for ICT/Grinch-style futures market analysis. It imports or reads read-only candle data, normalizes sources through a canonical candle-source manager, runs deterministic regime and agent analysis, coordinates debate and research cycles, and surfaces readiness/evidence/maturity status. It is research-only: no broker execution, live trading, order placement, account mutation, or readiness override is implemented.

## Status

Working today: React/Vite Command Center, imported OHLCV, canonical candle sources, MT5 read-only bridge/client, TradingView MCP legacy read-only bridge/client, deterministic regime classifier, internal agents, debate, autonomous research loop, walk-forward, evidence, maturity, readiness, and local LLM advisory bridge plumbing.

In progress or planned: Tradovate read-only, complete Monte Carlo robustness, deeper order-flow inputs, future MT5 execution planning, and live broker truth. Execution remains blocked.

## Quick Start

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Optional: copy `.env.example` to `.env` and add Twelve Data or FMP keys if using those providers.

3. Optional: start read-only bridges:

   ```powershell
   npm.cmd run mt5:readonly-bridge
   npm.cmd run tradingview:mcp-bridge
   npm.cmd run llm:bridge
   ```

4. Start the app:

   ```powershell
   npm.cmd run dev
   ```

5. Validate:

   ```powershell
   npm.cmd run build
   npm.cmd run smoke:routes
   npm.cmd run test:mt5-readonly-safety
   ```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - full system docs
- [AGENT-CONTEXT.md](./AGENT-CONTEXT.md) - for AI assistants

## Important

> This system performs research only. No broker execution is implemented. The autonomous loop cannot execute trades or approve live trading.
