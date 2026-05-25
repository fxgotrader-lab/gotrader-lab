# Simulation Bridge Status

The GoTrader Simulation Bridge card shows the local status of the safe AI Lab to `go-trader` handoff workflow. It is a visibility panel only: it does not connect to brokers, open websocket feeds, place orders, or execute trades.

## What The Card Shows

- Bridge mode is locked to simulation only.
- Last handoff export timestamp comes from AI Lab local storage.
- Total handoff exports comes from the same local audit log.
- Recommended handoff path points to the ignored local exports folder:

```text
C:/Users/andre/OneDrive/Documents/gotrader/exports/latest-gotrader-handoff.json
```

- Reader and scheduler commands show how the separate `go-trader` repo can consume the local JSON handoff in simulation mode.
- The checklist is manually controlled and stored in local browser storage.

## Commands

From `C:/Users/andre/OneDrive/Documents/go-trader`, convert the exported handoff with:

```bash
python shared_scripts/check_ict_ai_lab.py --handoff-file ../gotrader/exports/latest-gotrader-handoff.json
```

From `C:/Users/andre/OneDrive/Documents/go-trader/scheduler`, run one scheduler cycle with:

```powershell
$env:GOTRADER_PYTHON = "C:\Python314\python.exe"
go run . -config ../docs/ai-lab-scheduler-simulation.config.json -once
```

The expected scheduler evidence is a logged `ict_ai_lab` signal with `mode=simulation`, `platform=ai_lab_handoff`, `broker execution skipped`, and `0 trades`.

## Why This Remains Simulation-Only

- AI Lab only exports local JSON research handoffs.
- The handoff mode is always `simulation`.
- The reader rejects non-simulation mode.
- The scheduler simulation path logs the signal and skips broker execution.
- No Tradovate, TopStep, broker API keys, websocket feeds, live order placement, or multi-account copy-trading logic is present in AI Lab.

## Before Broker-Demo Integration

Before any broker-demo paper integration exists, the project needs explicit user approval gates, a paper-mode-only execution contract, max-loss and max-contract controls, a kill switch, symbol allowlists, execution audit logs, open-position visibility, and manual close or flatten controls. Those controls must be implemented in the separate `go-trader` execution layer, not in this research-only frontend.
