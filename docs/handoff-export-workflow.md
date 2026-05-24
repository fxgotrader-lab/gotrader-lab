# GoTrader Handoff Export Workflow

GoTrader AI Lab exports simulation-only handoff JSON. The exported file is a local research artifact for the separate `go-trader` repo to read later; it does not connect to brokers, submit orders, open websockets, or execute trades.

## Recommended Local Path

Save handoff exports here:

```text
C:/Users/andre/OneDrive/Documents/gotrader/exports/
```

Use this stable filename when you want the latest AI Lab thesis to overwrite the prior local handoff:

```text
latest-gotrader-handoff.json
```

The separate `go-trader` repo can read that file with this relative path from `C:/Users/andre/OneDrive/Documents/go-trader`:

```text
../gotrader/exports/latest-gotrader-handoff.json
```

## Export From AI Lab

1. Open GoTrader AI Lab.
2. Go to Research.
3. Generate or select a simulated thesis.
4. Click `Download as latest-gotrader-handoff.json`.
5. Save the downloaded file into `C:/Users/andre/OneDrive/Documents/gotrader/exports/`.

Generated handoff exports are intentionally ignored by Git. The committed sample remains at `docs/sample-gotrader-handoff.json`.

## Manual go-trader Reader Command

From `C:/Users/andre/OneDrive/Documents/go-trader`:

```bash
.venv/bin/python3 shared_scripts/check_ict_ai_lab.py --handoff-file ../gotrader/exports/latest-gotrader-handoff.json
```

If the local virtual environment is unavailable, use the Python interpreter configured for the `go-trader` repo:

```bash
python shared_scripts/check_ict_ai_lab.py --handoff-file ../gotrader/exports/latest-gotrader-handoff.json
```

## Safety

- The handoff mode is always `simulation`.
- No broker connection exists in this workflow.
- No Tradovate, TopStep, API key, websocket, live trading, or order execution logic is added.
- No multi-account or copy-trading workflow is involved.
