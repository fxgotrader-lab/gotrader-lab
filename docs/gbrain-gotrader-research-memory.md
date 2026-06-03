# gbrain Research Memory Plan

Last updated: 2026-06-02

## Purpose

GoTrader treats `garrytan/gbrain` as an optional memory and synthesis reference, not as a trading runtime. The useful concepts for GoTrader are persistent research memory, cited synthesis, graph traversal, and gap analysis across prior research cycles. gbrain must not become a signal engine, chart source, readiness authority, broker authority, or execution path.

## gbrain Concepts Inspected

- The gbrain README frames the project as a "brain layer" for agents: search retrieves raw pages, while `think` synthesizes answers with citations and gap analysis.
- The README documents local and remote MCP options, including `gbrain serve` for stdio MCP and `gbrain serve --http` for HTTP MCP.
- `AGENTS.md` describes gbrain's trust boundary between trusted local CLI callers and untrusted agent-facing MCP callers.
- `INSTALL_FOR_AGENTS.md` describes PGLite as the default local brain, optional Postgres/pgvector for scale, and a setup flow that asks the operator before choosing expensive search modes.
- `src/core/operations.ts` exposes read operations such as `search`, `list_pages`, `get_links`, and graph traversal, plus mutating write operations such as tagging, links, timeline entries, raw data, and ingest logs.

## GoTrader-Native Use Cases

1. Store compact AI Research Cycle summaries so future advisory reviews can see what worked, what failed, and what remained blocked.
2. Store Walk-Forward summaries so OpenClaw can reason about recurring OOS instability without reading raw candle data.
3. Store Self-Improvement proposal summaries and before/after deltas for regression tracking.
4. Store gap-analysis packets for recurring blockers such as missing macro inputs, regime insufficiency, low sample size, or Grinch profile absence.
5. Store agent metric provenance so confidence, hit rate, and weighting changes can be traced to source, regime, and sample size.

## Current Implementation

GoTrader now has a native research-memory contract in `src/lib/researchMemory`. It creates compact packets only. It does not send anything to gbrain, does not add a gbrain dependency, and does not change the research cycle, chart source, walk-forward, readiness, or safety gates.

Created packet types:

- `GoTraderResearchCycleMemory`
- `GoTraderWalkForwardMemory`
- `GoTraderSelfImprovementMemory`
- `GoTraderGapAnalysisMemory`
- `GoTraderAgentMetricMemory`

Created builder:

- `buildResearchCycleMemoryPacket(latestCycle, runtimeSnapshot)`

## Packet Fields

Every packet includes:

- `packetId`
- `timestamp`
- `source.provider`
- `source.requestedSymbol`
- `source.brokerSymbol` when MT5 provides broker/proxy data
- `source.candleCount`
- `regime`
- `ictThesis`
- `grinch.profile` and `grinch.blocker`
- `metrics`
- `readiness`
- `evidenceMaturity`
- `walkForwardVerdict`
- `blockers`
- `nextAction`
- `authority.executionAuthority: "none"`
- `authority.brokerAuthority: "none"`
- `authority.readinessOverrideAuthority: "none"`

## Exclusions

Research-memory packets must not contain:

- candle arrays
- raw runtime snapshots
- secrets
- account, order, or position data
- screenshots or base64 media
- imported OHLCV arrays

The packet contract records these exclusions explicitly in `exclusions` so future connectors can assert the safety boundary before writing memory.

## OpenClaw Advisory Context

OpenClaw can eventually read gbrain memory as advisory context for calibration, self-improvement, and gap analysis. The intended flow is:

```text
GoTrader deterministic cycle
  -> compact research-memory packet
  -> optional gbrain write connector [PLANNED]
  -> gbrain search/think synthesis [PLANNED]
  -> OpenClaw advisory context [PLANNED]
  -> GoTrader explanation/proposal review only
```

OpenClaw and gbrain advisory outputs remain explanation-only. They cannot activate a source, pass readiness, place orders, override safety gates, or mark broker truth.

## Offline Behavior

gbrain is optional. If gbrain is missing, offline, unconfigured, or rate-limited:

- charts still render from the canonical candle source manager
- MT5 read-only still fetches candles
- AI Research Cycle can still run deterministic logic
- Walk-Forward can still use eligible canonical sources
- readiness gates still use GoTrader's own evidence, maturity, and safety logic
- OpenClaw/LLM advisory can report memory unavailable without blocking deterministic research

## Future Connector Plan

A future connector may add:

- `researchMemoryClient.ts` for optional gbrain MCP/HTTP writes
- a dry-run validator that rejects packets containing candles or forbidden authority
- a queue for best-effort packet writes
- read-side gap-analysis queries for OpenClaw advisory context

The connector should be optional and disabled by default. It must not become a required runtime dependency.

## Safety Boundary

gbrain receives compact research summaries only. It has no execution authority, no broker authority, and no readiness override authority. GoTrader must never expose account, order, position, password, API-key, screenshot, or raw candle-array data through the research-memory packet.
