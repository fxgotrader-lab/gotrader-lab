# Run Fingerprint and Metric Provenance

GoTrader AI Lab now attaches a compact run fingerprint to the runtime snapshot so metrics and proposals can be traced back to the exact source that produced them.

## Purpose

The app has several views that can legitimately show different numbers:

- Dashboard and Performance usually show the latest AI Research Cycle.
- Self-Improvement often shows a proposal snapshot from a candidate or older cycle.
- Backtest Lab, Validation, and Research Quality may show recomputed previews.

Run fingerprints make that source difference explicit instead of relying on page labels alone.

## Fingerprint Fields

Each fingerprint can include:

- `runId` / `cycleId`
- `proposalId`
- `sourceCandidateId`
- `dataSource`
- `symbol`
- `timeframe`
- `rawCandleCount`
- `processedCandleCount`
- `candleWindow`
- `dataPreset`
- `activeCalibrationId`
- `configMergeStatus`
- `llmReviewerSchemaVersion`
- `llmRunId`
- `generatedAt`
- `metricSourceType`

The compact label is shown by default. Full provenance rows live in Advanced details.

## Metric Source Types

- `latest_cycle`: metrics captured from the latest dashboard AI Research Cycle.
- `proposal_snapshot`: before/after metrics captured when a calibration proposal was created.
- `active_baseline`: the resolved baseline config and data context currently active.
- `recomputed_preview`: a page-local standalone result that may differ from the latest cycle.

## Runtime Snapshot Integration

`resolveResearchRuntimeSnapshot()` builds fingerprints for:

- active baseline
- latest research cycle
- latest proposal snapshot

It also creates metric provenance tables and mismatch warnings. If two metrics use different fingerprints, the UI warns:

> Different run/source. Do not compare as the same test.

## UI Placement

Compact fingerprint labels are surfaced on:

- Dashboard
- Performance
- Self-Improvement
- Readiness Gate
- Auto Research
- Validation
- Research Quality
- Backtest Lab

Full provenance is shown behind Advanced details to avoid making default views too dense.

## Safety

This is a read-model/provenance layer only. It does not alter strategy scoring, readiness logic, broker permissions, demo/live mode, order execution, or API-key handling.
