# OpenClaw GoTrader Advisory Plan

GoTrader can use OpenClaw as an optional advisory, calibration, and self-improvement orchestration layer. This plan is for a local, advisory-only integration. It does not add broker execution, live trading, order placement, account mutation, position mutation, readiness overrides, or go-trader execution handoff.

OpenClaw is treated as an external self-hosted agent gateway. GoTrader does not import OpenClaw as a runtime dependency and does not expose broker, order, position, account, or candle-array payloads to OpenClaw.

## Current Provider Modes

Dashboard Research Advisor supports:

- `local_llm_bridge`: existing local bridge at `http://127.0.0.1:8787/llm/run-advisory`.
- `openclaw`: optional OpenClaw advisory endpoint.
- `disabled`: no advisory provider call; deterministic research remains available.

OpenClaw endpoint:

```text
OPENCLAW_ADVISORY_URL=http://127.0.0.1:8797/gotrader/advisory
```

The Dashboard provider selector lives in Research Advisor Advanced Details. The default remains `local_llm_bridge` so existing workflows are preserved.

## Phase 1: Advisory And Explanation

Phase 1 sends a compact `GoTraderAdvisoryPacket` to OpenClaw and expects an `OpenClawAdvisoryResponse`.

OpenClaw may:

- explain a completed research cycle
- explain blockers
- summarize regime and Grinch/ICT profile state
- recommend next tests
- recommend calibration directions

OpenClaw cannot:

- place trades
- call broker APIs
- mutate account, order, or position state
- approve readiness
- override risk gates
- change thresholds directly
- auto-apply self-improvement proposals

## Phase 2: Calibration And Self-Improvement Orchestration

OpenClaw may return `selfImprovementProposalIntent`.

That intent can only mean:

1. OpenClaw recommends a draft proposal direction.
2. GoTrader creates or displays a proposal intent.
3. GoTrader self-improvement evaluates the proposal.
4. Walk-forward, evidence, maturity, and readiness gates decide whether it remains research-useful.
5. Human review is still required where the existing self-improvement flow requires it.

`autoApplyAllowed` must always be `false` in the OpenClaw response contract.

## Phase 3: Future Execution-Request Model

Phase 3 is not implemented.

A future OpenClaw request could ask GoTrader to evaluate a trade idea, but GoTrader would remain final authority. Even in a future phase, OpenClaw would not receive broker execution authority and would not bypass readiness, risk, or human review gates.

## GoTrader Advisory Packet

`GoTraderAdvisoryPacket` is defined in:

```text
src/lib/llm/llmTypes.ts
```

It includes:

- packet id and timestamp
- advisory mode
- latest cycle summary
- active source provider and symbol context
- candle count and first/last timestamps
- regime label, confidence, data quality, and transition state
- ICT thesis summary
- Grinch profile and blocker
- trades, win rate, average R, drawdown, profit factor
- readiness, evidence, maturity, walk-forward verdict
- top blockers
- ICT/Grinch layer contribution metrics when available
- MT5 read-only CFD/proxy warning
- authority fields locked to `none`

It excludes:

- candle arrays
- raw runtime snapshots
- full source objects
- raw agent logs
- raw evidence ledger
- long Research Flow Tape history
- raw JSON diagnostics
- screenshots/base64
- imported OHLCV arrays
- secrets
- account, order, or position data

## OpenClaw Response Contract

`OpenClawAdvisoryResponse` is defined in:

```text
src/lib/llm/llmTypes.ts
```

Required authority fields:

```json
{
  "authority": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

The browser client normalizes advisory text and rejects unsafe authority by forcing the local result into an error-shaped advisory response. The response may contain:

- summary
- top blockers
- next actions
- calibration recommendations
- self-improvement proposal intent
- risk notes
- questions

## Endpoint Contract

GoTrader sends:

```http
POST /gotrader/advisory
Content-Type: application/json
```

Body:

```json
{
  "source": "gotrader_ai_lab",
  "advisoryMode": "explain_cycle",
  "safety": {
    "executionAuthority": "none",
    "brokerAuthority": "none",
    "readinessOverrideAuthority": "none"
  }
}
```

OpenClaw should return the `OpenClawAdvisoryResponse` contract directly, or wrapped as:

```json
{
  "response": {
    "advisoryStatus": "complete",
    "summary": "...",
    "authority": {
      "executionAuthority": "none",
      "brokerAuthority": "none",
      "readinessOverrideAuthority": "none"
    }
  }
}
```

## Dashboard Behavior

Research Advisor quick prompts:

- Explain this cycle
- Why is this blocked?
- Suggest calibration
- Review self-improvement
- What should I test next?
- Why is Grinch profile not present?

If OpenClaw is offline, Dashboard shows:

```text
OpenClaw advisory offline; deterministic research remains available.
```

No OpenClaw response can enable execution, broker authority, readiness override, or auto-apply.

## Safety Boundary

GoTrader remains deterministic-first:

- MT5 read-only is market data only.
- ICT foundation and Grinch refinement are deterministic.
- Regime, evidence, maturity, readiness, and walk-forward gates remain GoTrader-owned.
- OpenClaw is explanation and calibration guidance only.
- Execution authority is always `none`.
- Broker authority is always `none`.
- Readiness override authority is always `none`.

## Files

- `src/lib/llm/llmTypes.ts`
- `src/lib/llm/advisoryProviderClient.ts`
- `src/components/dashboard/LLMAdvisoryReviewPanel.tsx`
- `.env.example`
- `vite.config.ts`
