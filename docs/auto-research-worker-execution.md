# Auto Research Worker Execution

GoTrader AI Lab now runs Auto Research candidate evaluation in a chunked browser-local workflow. This is a reliability layer for simulation research only. It does not connect to brokers, place orders, enable demo/live mode, or override readiness.

## Why Chunking Is Needed

Imported historical data can make a full research cycle expensive because the app evaluates multiple candidate configurations through backtest, validation, research quality, adaptive passes, zero-trade recovery, and trade-quality optimization. If all candidates run in one synchronous loop, the browser can freeze before React has time to update progress or respond to user input.

Chunked execution yields to the UI between candidates and major phases. This keeps Safe mode responsive and makes progress visible while the browser is doing research work.

## Checkpoints

Before and during candidate execution, Auto Research stores compact checkpoints:

- cycle id
- phase
- current candidate index
- total candidates
- current pass
- current candidate name
- best candidate so far
- elapsed time
- status: `running`, `canceled`, `completed`, or `failed`

Checkpoints are compact summaries only. They do not store full raw candle arrays, full backtest payloads, or large validation objects.

## Cancellation

Dashboard and Auto Research both expose a cancel action while a run is active. Cancellation is cooperative:

1. The current candidate finishes safely.
2. The next checkpoint detects the cancel request.
3. The cycle is stored as `canceled`, not completed.
4. Partial progress remains visible.
5. Broker execution remains disabled.

Canceled cycles never count as successful completion.

## Crash Recovery

If the page reloads or the browser stops during a run, the latest checkpoint remains in local storage. The UI shows:

> Previous research cycle stopped before completion.

Full resume is intentionally not implemented yet because candidate evaluation is browser-local and depends on in-memory candle/config context. The safe behavior is to discard the checkpoint and rerun in Safe mode.

## Time Guards

Auto Research uses a browser-safe timeout. Imported-data Safe mode uses a shorter threshold than mock/advanced runs. If evaluation exceeds the threshold, the run stops with a failed checkpoint instead of freezing indefinitely.

## Safe, Standard, and Advanced

- Safe mode: preferred for imported historical data, small candle window, quick search, compact audit.
- Standard mode: moderate research pass for smaller datasets or intentional checks.
- Advanced mode: larger windows or deeper search; use only when the browser can tolerate it.

Start with Safe mode. Move up only after the app remains responsive and the previous cycle produced useful diagnostics.

## Safety

Auto Research can optimize simulation settings only. It cannot execute trades, enable demo/live mode, change broker settings, approve proposals, or override readiness gates.
