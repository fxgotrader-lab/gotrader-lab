# Market Data, Agent Bridge, and Future Execution Architecture

## Executive Summary

GoTrader is the authoritative trading system. Twelve Data is the current market-data provider, and FMP is the first market-context provider behind provider-neutral contracts. GoTrader owns normalization, symbol translation, bounded evidence, scanner output, strategy candidates, risk decisions, journaling contracts, and future execution boundaries.

OpenClaw is advisory/review/memory only. It receives normalized summaries and bounded evidence from GoTrader. It does not receive raw provider access, API keys, broker credentials, or authority to bypass the Risk Manager.

Broker execution remains disabled. MetaTrader 5 and Supabase journaling are future phases.

## Recommended Flow

```text
Twelve Data
  -> GoTrader Market Data Service
  -> GoTrader Agent Bridge
  -> Market Scanner Agent
  -> Strategy Agent
  -> Risk Manager Agent
  -> future MT5 Execution Agent
  -> future Supabase Trade Journal

FMP
  -> GoTrader Market Context Service
  -> EconomicCalendarEvent / MarketNewsItem normalization
  -> MacroRiskFlag / NewsSentimentSummary
  -> StrategyCandidate and RiskDecision context

OpenClaw
  <- normalized advisory packets, bounded evidence, scan summaries, risk summaries, bounded market context
```

The Strategy/Risk Context Evaluator is the current bridge between normalized scanner/context outputs and research-only risk/journal/advisory records:

```text
MarketSnapshot + ScannerOutput + MarketContextSnapshot
  -> Strategy/Risk Context Evaluator
  -> flat StrategyCandidate
  -> rejected paper-mode RiskDecision
  -> local JournalEvent object
  -> optional local JSONL journal
  -> bounded OpenClaw advisory packet
```

## Source Of Truth

The source-of-truth layers are:

- External provider source: Twelve Data.
- Internal market-data source: GoTrader Market Data Service.
- Market-context source: GoTrader Market Context Service using FMP as the first provider implementation.
- Agent/research source: GoTrader Agent Bridge contracts.
- Risk authority: GoTrader Risk Manager.
- Future execution authority: MT5 bridge only after Risk Manager approval.
- Audit source: GoTrader journal contracts and future Supabase persistence.

OpenClaw can suggest, remember, and review. It cannot approve risk, execute trades, change broker settings, or override readiness.

## Contract Boundaries

### MarketSnapshot

Represents normalized market data from GoTrader, not raw provider payloads.

Required fields:

- `snapshotId`
- `provider`
- `symbol`
- `providerSymbol`
- `brokerSymbolCandidates`
- `timeframe`
- `candles`
- `latestQuote`
- `dataQuality`
- `generatedAt`
- `sourceFingerprint`
- `aliasMappingVersion`

### ScannerOutput

Represents the Market Scanner Agent result. In this phase it keeps `setup: "no_trade"` because strategy rules are not enabled yet.

Required fields:

- `scanId`
- `snapshotId`
- `symbol`
- `timeframe`
- `latest_close`
- `trend`
- `setup`
- `confidence`
- `reason`
- `dataProvider`
- `providerSymbol`
- `generatedAt`

### StrategyCandidate

Represents a future strategy candidate. In this phase it is always flat with `setup: "no_trade"` or `setup: "research_only"`.

Required fields:

- `signalId`
- `scanId`
- `symbol`
- `side`
- `setup`
- `entry`
- `stop_loss`
- `take_profit`
- `confidence`
- `evidence`
- `sentimentContextId`
- `macroRiskFlags`
- `generatedAt`

### RiskDecision

The Risk Manager is mandatory before any future execution layer. This phase always rejects by default.

Required fields:

- `riskDecisionId`
- `signalId`
- `approved`
- `rejectReasons`
- `mode`
- `maxLoss`
- `executionAllowed`
- `riskPolicyVersion`
- `macroRiskFlags`
- `generatedAt`

Default:

```json
{
  "approved": false,
  "executionAllowed": false,
  "mode": "paper"
}
```

The Strategy/Risk Context Evaluator adds reject/caution reasons for missing market data, active high-impact macro blocks, medium-impact risk windows, non-paper mode, and the current research-only/no-executable-setup state.

### JournalEvent

The journal must record accepted and rejected signals, including no-trade outputs and failed data-quality checks. This phase can persist compact local JSONL records, but it does not write to Supabase.

Required fields:

- `journalEntryId`
- `signalId`
- `riskDecisionId`
- `status`
- `reason`
- `timestamp`
- `decisionVersion`
- `strategyVersion`
- `marketSnapshotId`
- `sentimentSnapshotId`
- `riskPolicyVersion`
- `agentChain`
- `macroRiskFlags`

## Decision Provenance

Every scanner, strategy, risk, and journal object carries:

- `decisionVersion`
- `strategyVersion`
- `marketSnapshotId`
- `sentimentSnapshotId`
- `riskPolicyVersion`
- `agentChain`

This supports audit, replay, backtesting, future Supabase storage, and OpenClaw review without leaking raw provider state.

## Strategy/Risk Context Evaluator

The evaluator consumes `MarketSnapshot`, `ScannerOutput`, and `MarketContextSnapshot` and produces the research-only `StrategyCandidate`, conservative `RiskDecision`, `JournalEvent`, and bounded OpenClaw packet.

It blocks/no-trades when:

- market data or scanner output is missing
- candle count is too low
- latest close is missing or zero
- market context says raw provider payloads are included
- high-impact macro event is inside the blocking window
- `GOTRADER_MODE` is not `paper`

It never creates long/short direction from market context.

## OpenClaw Advisory Packet

OpenClaw receives:

- scan summary
- bounded normalized evidence
- risk decision summary
- bounded market-context summary
- provenance
- safety locks

OpenClaw does not receive:

- Twelve Data API key
- FMP API key
- MT5 credentials
- broker credentials
- raw provider payloads
- unrestricted candle history
- execution permission

Even if a future `RiskDecision.executionAllowed` can become true, this phase always returns false.

## Market Context Service

FMP enters as the first GoTrader-controlled Market Context provider:

```text
FMP -> GoTrader Market Context Service -> MarketContextSnapshot -> Strategy/Risk/Journal/OpenClaw context
```

The Market Context Service normalizes economic events, news items, macro risk flags, and context-only sentiment. Context can add warnings, reduce confidence, and block future execution windows through RiskDecision reject reasons. It cannot create long/short direction, execution permission, or readiness approval.

Future providers can be swapped behind the same contracts, including Forex Factory, TradingEconomics, FXStreet, Finnhub, and Alpha Vantage.

## MT5 Future Position

MT5 should enter only after the Risk Manager:

```text
RiskApprovedExecutionIntent -> MT5 Execution Agent -> MT5 MCP/local bridge
```

The MT5 bridge must never receive a raw StrategyCandidate directly. It receives only a risk-approved execution intent from a mandatory RiskDecision gate.

## Supabase Future Position

Supabase should persist:

- market snapshot metadata and source fingerprints
- scanner outputs
- strategy candidates
- sentiment snapshots
- market context snapshots and macro risk flags
- risk decisions
- journal events
- execution feedback later
- OpenClaw advisory packet summaries
- replay/backtest provenance

Supabase writes are not implemented in this phase.

## Local Journal Position

Local journal persistence stores compact audit/replay records under:

```text
.gotrader/journal/YYYY-MM-DD/research-events.jsonl
```

It persists `LocalJournalRecord` wrappers around `JournalEvent` objects only after sanitization. It never stores API keys, raw provider payloads, broker credentials, MT5 credentials, execution secrets, frontend session data, unbounded candle history, or approved executable decisions in this phase.

## Files Added In This Phase

- `src/lib/agentBridge/agentBridgeTypes.ts`
- `src/lib/agentBridge/marketScannerContracts.ts`
- `src/lib/risk/riskDecisionTypes.ts`
- `src/lib/journal/tradeJournalTypes.ts`
- `scripts/services/agent-bridge-adapter.mjs`
- `scripts/test-agent-bridge-contracts.mjs`
- `src/lib/marketContext/marketContextTypes.ts`
- `src/lib/marketContext/marketContextContracts.ts`
- `scripts/services/fmp-market-context-service.mjs`
- `scripts/test-fmp-market-context.mjs`
- `docs/fmp-economic-news-market-context.md`
- `src/lib/strategy/strategyContextTypes.ts`
- `src/lib/strategy/strategyContextEvaluator.ts`
- `scripts/services/strategy-risk-context-evaluator.mjs`
- `scripts/test-strategy-risk-context.mjs`
- `docs/strategy-risk-context-evaluator.md`
- `src/lib/journal/localJournalTypes.ts`
- `src/lib/journal/localJournalContracts.ts`
- `scripts/services/local-journal-service.mjs`
- `scripts/test-local-journal.mjs`
- `docs/local-journal-persistence.md`

## What Not To Build Yet

- Live trading.
- MT5 order placement.
- Unbounded FMP payload storage.
- Supabase writes.
- Autonomous execution.
- Broker credentials UI.
- Frontend API key access.
- Raw provider access for OpenClaw.
- Risk Manager bypass.

## Next Phase

The next safe phase is a local replay/report reader for the JSONL journal so rejected/no-trade/research-only history can be inspected without Supabase writes, MT5 calls, or broker connectivity.
