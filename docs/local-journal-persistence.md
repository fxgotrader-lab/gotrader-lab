# Local Journal Persistence

GoTrader supports local file-based journal persistence for Strategy/Risk evaluator outputs. This is for local audit and replay only. It does not write to Supabase, call MT5, create execution intents, or connect to any broker.

## Storage Path

Records are stored as JSONL:

```text
.gotrader/journal/YYYY-MM-DD/research-events.jsonl
```

The `.gotrader/journal/` directory and `*.jsonl` files are gitignored because they can contain local research audit history.

## What Is Persisted

Each line is a `LocalJournalRecord` wrapping a compact `JournalEvent`.

Fields include:

- `localJournalRecordId`
- `journalEntryId`
- `recordType`
- `event`
- `provenance`
- `createdAt`
- `schemaVersion`
- `storageMode: local_jsonl`
- `rawProviderPayloadIncluded: false`

Supported record types:

- `rejected`
- `no_trade`
- `data_quality_failure`
- `macro_risk_block`
- `research_only`

## What Is Never Persisted

The local journal must never store:

- API keys
- raw Twelve Data payloads
- raw FMP payloads
- broker credentials
- MT5 credentials
- execution secrets
- unbounded candle history
- frontend session data
- approved executable decisions in this phase

## Sanitization

Before append, records are sanitized and validated:

- secret-like field names are rejected
- `providerPayloadIncluded` must be `false` if present
- `rawProviderPayloadIncluded` must be `false`
- `executionAllowed` must be `false`
- `approved` must be `false`
- macro risk flags are capped
- records are compact JSONL, one object per line

## Why Supabase Is Not Used Yet

Supabase is the future durable audit store. This local phase exists first so the contracts, replay shape, and safety boundaries can stabilize without introducing hosted persistence, service-role keys, or RLS policy complexity.

## How To Run

```powershell
npm.cmd run test:local-journal
```

The test writes a small local JSONL file, reads it back, validates line-by-line JSON, summarizes counts, and checks that `.gotrader/journal/` and `*.jsonl` are ignored.

## How To Inspect Records

Open the latest file under:

```text
.gotrader/journal/YYYY-MM-DD/research-events.jsonl
```

Each line is a standalone JSON record. Tools can process it line by line for local audit, replay, and later migration into Supabase.

## Future Migration Path

Later phases can map `LocalJournalRecord` to Supabase tables for:

- journal records
- risk decisions
- strategy candidates
- market snapshot references
- market context snapshot references
- OpenClaw advisory packet summaries

That migration should remain server-side and must preserve the same safety rules: no API keys, no raw provider payloads, no broker credentials, and no Risk Manager bypass.
