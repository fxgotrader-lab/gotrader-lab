# Twelve Data Market Data Service

GoTrader AI Lab uses Twelve Data as a planned primary market-data provider for forex, metals, crypto, index/CFD research, candle analysis, market scanning, and agent-readable outputs.

This integration is market-data only. It does not place trades, connect MetaTrader 5, route orders, change broker settings, approve readiness, or enable live/demo execution.

## Runtime Boundary

The Twelve Data HTTP client lives in `scripts/services/twelve-data-service.mjs` so API keys remain outside the Vite frontend bundle.

Agents and local scripts can import the service functions:

- `get_candles(symbol, interval = "5min", outputsize = 100)`
- `get_quote(symbol)`
- `get_market_snapshot(symbols, interval = "5min")`
- `validate_symbol(symbol)`
- `normalize_candles(response)`
- `scan_symbol(symbol, interval = "5min")`

JavaScript-friendly aliases are also exported:

- `getCandles`
- `getQuote`
- `getMarketSnapshot`
- `validateSymbol`
- `normalizeCandles`
- `scanSymbol`

## Environment

Create `.env.local` in the project root or set variables in PowerShell. `.env` and `.env.local` are ignored by git.

```powershell
$env:TWELVE_DATA_API_KEY = "your_twelve_data_key"
$env:GOTRADER_MODE = "paper"
```

Or use `.env.local`:

```text
TWELVE_DATA_API_KEY=your_twelve_data_key
GOTRADER_MODE=paper
```

Optional local tuning:

```text
TWELVE_DATA_TIMEOUT_MS=10000
TWELVE_DATA_CACHE_TTL_MS=30000
TWELVE_DATA_MIN_REQUEST_INTERVAL_MS=850
```

Never commit real keys.

## Symbol Translation

The service separates three symbol layers:

- GoTrader user-facing symbol
- Twelve Data API candidate symbols
- future MT5 broker candidate symbols

Initial watchlist:

| GoTrader symbol | Asset class | Twelve Data candidates | Future MT5 candidates |
| --- | --- | --- | --- |
| `EUR/USD` | forex | `EUR/USD` | `EURUSD` |
| `GBP/USD` | forex | `GBP/USD` | `GBPUSD` |
| `USD/JPY` | forex | `USD/JPY` | `USDJPY` |
| `XAU/USD` | metal | `XAU/USD` | `XAUUSD`, `GOLD` |
| `BTC/USD` | crypto | `BTC/USD` | `BTCUSD` |
| `ETH/USD` | crypto | `ETH/USD` | `ETHUSD` |
| `US30` | index/CFD | `DJI`, `DIA`, `US30`, `DJI/USD` | `US30`, `DJI30`, `WallStreet30` |
| `NASDAQ` | index/CFD | `NDX`, `QQQ`, `IXIC`, `NAS100`, `NASDAQ` | `NAS100`, `USTEC`, `NAS100.cash` |
| `SPX` | index/CFD | `SPX`, `SPY`, `US500` | `US500`, `SPX500`, `SP500` |

Availability depends on the Twelve Data plan and symbol coverage. Index/CFD symbols are especially provider-specific, so the service tries direct index candidates first and then liquid ETF/proxy candidates such as `DIA`, `QQQ`, or `SPY` where useful. The live test command records the resolved Twelve Data symbol and attempted candidates when a symbol cannot be resolved.

## Normalized Candles

Twelve Data candles are normalized into oldest-to-newest order:

```json
[
  {
    "datetime": "2026-05-28 09:35:00",
    "open": 0,
    "high": 0,
    "low": 0,
    "close": 0,
    "volume": 0
  }
]
```

Numeric strings are converted to numbers. Missing volume is treated as `0`. Malformed candles are filtered out so agents receive a stable shape.

## Agent Scan Output

`scan_symbol()` returns a fixed research-only shape:

```json
{
  "symbol": "XAU/USD",
  "timeframe": "5min",
  "latest_close": 0,
  "trend": "neutral",
  "setup": "no_trade",
  "entry": null,
  "stop_loss": null,
  "take_profit": null,
  "confidence": 0,
  "reason": "Market data loaded successfully. Strategy rules not yet enabled."
}
```

Trend is a simple candle-direction context label, not a trade signal. Strategy rules are intentionally not enabled yet.

## Error Handling

The service returns structured results instead of throwing for normal provider failures:

```json
{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "API request limit reached.",
    "retryable": true
  }
}
```

Handled failure classes include:

- missing API key
- invalid symbols
- empty data
- network failure
- timeout
- malformed response
- Twelve Data provider errors
- rate limits

API keys are never printed in logs or returned in error output.

## Rate-Limit Awareness

The service includes:

- in-memory response cache
- minimum request spacing
- per-request timeout
- sequential market snapshot scanning

Defaults are conservative for local multi-agent research and can be tuned with environment variables.

## Test Command

Dry-run without an API key:

```powershell
npm run test:twelvedata -- --dry-run
```

Live provider smoke test:

```powershell
$env:TWELVE_DATA_API_KEY = "your_twelve_data_key"
$env:GOTRADER_MODE = "paper"
npm run test:twelvedata
```

The test checks:

- `EUR/USD` 1min candles
- `XAU/USD` 5min candles
- `BTC/USD` 5min candles
- `US30` 5min candles
- `NASDAQ` 5min candles
- `SPX` 5min candles

It prints API status, resolved Twelve Data symbol, latest candle, latest close, normalized preview, and agent scan output.

## Future Path

This service is designed for:

- Market Scanner Agent
- Strategy Agent
- Risk Manager Agent
- News/Sentiment Agent
- future MT5 Execution Agent inputs
- WebSocket streaming later
- multi-timeframe analysis
- Supabase journaling
- multiple concurrent agents

Future live data and MT5 execution must stay behind separate adapter boundaries. Twelve Data is a market-data provider, not an execution provider.
