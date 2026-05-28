# Strategy/Risk Context Evaluator

The Strategy/Risk Context Evaluator combines normalized GoTrader market data with bounded market context and produces research-only outputs for agents, risk review, journaling, and OpenClaw advisory review.

This phase is deliberately conservative. It does not create trades, grant execution permission, write Supabase records, or call MT5.

## Inputs

The evaluator consumes:

- `MarketSnapshot` from the GoTrader Market Data Service / Agent Bridge.
- `ScannerOutput` from the Market Scanner Agent.
- `MarketContextSnapshot` from the GoTrader Market Context Service.

All inputs are normalized GoTrader contracts. Raw Twelve Data and FMP provider payloads are not accepted by this layer.

## Outputs

The evaluator produces:

- `StrategyCandidate`
- `RiskDecision`
- `JournalEvent`
- `OpenClawAgentBridgeAdvisoryPacket`

Every output carries provenance:

- `decisionVersion`
- `strategyVersion`
- `marketSnapshotId`
- `sentimentSnapshotId`
- `riskPolicyVersion`
- `agentChain`
- `generatedAt`

## Strategy Candidate Behavior

Allowed candidate behavior in this phase:

- `side: flat`
- `setup: no_trade`
- `setup: research_only`
- explanatory evidence only

Not allowed:

- `side: long`
- `side: short`
- market orders
- limit orders
- execution intents
- trade direction from news or sentiment

Market context may explain why a setup is blocked or risky, but it cannot create a directional signal.

## Risk Decision Behavior

The Risk Manager remains mandatory before any future execution layer.

Default:

```json
{
  "approved": false,
  "executionAllowed": false,
  "mode": "paper"
}
```

High-impact active `MacroRiskFlag` records add reject reasons and keep execution blocked. Medium-impact active flags add caution/reduce-risk reasons, but no sizing changes are implemented yet. Missing data, invalid latest close, raw provider payload inclusion, or non-paper mode also keep the decision rejected.

## Journal Behavior

The evaluator builds local journal-ready objects only. It does not write to Supabase.

Journal events can record:

- rejected research-only candidates
- no-trade outputs
- data-quality failures
- macro-risk blocks
- context/provenance for future replay and audit

## OpenClaw Advisory Boundary

OpenClaw may receive:

- scan summary
- bounded market evidence
- bounded market context
- macro risk flags
- risk decision summary
- journal-ready summary
- provenance

OpenClaw must never receive:

- raw provider payloads
- API keys
- broker credentials
- MT5 credentials
- execution permission
- Risk Manager bypass fields

## Data Quality Gates

The evaluator rejects/no-trades when:

- `MarketSnapshot` is missing
- `ScannerOutput` is missing
- candle count is below the minimum
- latest close is missing or zero
- `MarketContextSnapshot.providerPayloadIncluded` is not `false`
- active high-impact macro block exists
- `GOTRADER_MODE` is not `paper`

## Current Files

- `src/lib/strategy/strategyContextTypes.ts`
- `src/lib/strategy/strategyContextEvaluator.ts`
- `scripts/services/strategy-risk-context-evaluator.mjs`
- `scripts/test-strategy-risk-context.mjs`

## Future Path

Next safe steps:

- Add local journal persistence for rejected and research-only events.
- Add a provider-neutral strategy rule registry that still outputs flat until explicitly enabled.
- Add Supabase journaling later for durable audit records.
- Add MT5 only after Risk Manager approval contracts, readiness gates, and paper-mode review are implemented.

## Not Implemented Yet

- MT5 order placement.
- Live trading.
- Broker connection.
- Supabase writes.
- Autonomous execution.
- Real sizing changes.
- Long/short trade generation from news.
- Frontend API key exposure.
