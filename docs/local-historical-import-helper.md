# Local Historical Import Helper

This helper lets GoTrader AI Lab load the local MNQ `06-26` historical workbook for development and repeatable imported-data research tests without using the browser file picker.

The flow stays local and research-only:

1. A Node script parses the local `.xlsx` workbook.
2. The script writes a normalized JSON artifact for development.
3. The Market Data page imports that JSON into the app's IndexedDB historical candle store.
4. The imported dataset can then be activated for Dashboard, walk-forward, Grinch validation, and runtime snapshot tests.

No broker execution, live trading, Tradovate connection, websocket feed, API key, order placement, readiness override, or go-trader handoff is added by this helper.

## Files

Default source workbook:

```text
C:\Users\andre\Downloads\NATION OF DUVAL\PRIVATE\AI TRADER SET UP\MNQ_06-26_OHLCV.xlsx
```

Generated local artifact:

```text
.gotrader/imports/MNQ_06-26_OHLCV.normalized.json
```

Generated dev-served artifact:

```text
public/local-imports/MNQ_06-26_OHLCV.normalized.json
```

Both generated artifacts are gitignored. The `public/local-imports/.gitkeep` file is tracked only so the development directory exists.

## Usage

Generate the normalized artifact:

```powershell
npm run import:local-mnq-history
```

Optional custom workbook path:

```powershell
node scripts/import-local-mnq-history.mjs --input="C:\path\to\MNQ_06-26_OHLCV.xlsx"
```

Start the app, then open `/market-data` on localhost or `127.0.0.1`. In the Historical Candle Imports section, use:

```text
Import normalized local JSON
```

The action fetches `/local-imports/MNQ_06-26_OHLCV.normalized.json`, imports it into IndexedDB through the same app storage path as browser uploads, and sets it as the active imported dataset.

## Expected Result

After import, `/market-data` should show:

- Data source: imported
- Symbol: `MNQ`
- Contract: `06-26`
- Timeframe: `1m`
- Raw candles: about `40,013`
- Active import persisted across refreshes

With the Dashboard research preset set to Standard, `/dashboard` should show roughly:

- `2,000` raw candles selected
- about `400` processed `5m` candles

Mock data remains available as a demo fallback, but mock results are not valid for imported MNQ comparisons.

## Artifact Shape

The normalized JSON artifact contains:

- `importId`
- `symbol`
- `contract`
- `sourceTimeframe`
- `candles[]`
- `firstTimestamp`
- `lastTimestamp`
- `rawCandleCount`
- `validationSummary`
- `sourceFileName`
- `generatedAt`

Candles are normalized oldest to newest with numeric OHLCV values. Missing volume is handled safely as `0`.

## Safety Notes

- Large candle arrays are stored in IndexedDB, not localStorage.
- The generated JSON artifact is local development data and is not committed.
- The app action is visible only on `localhost` and `127.0.0.1`.
- No local filesystem path is exposed in production UI.
- No provider API keys, broker credentials, or execution controls are involved.
