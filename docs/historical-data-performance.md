# Historical Data Performance

GoTrader AI Lab can import large historical candle files for research, but browser-side analysis must stay bounded. A full 1-minute futures export can contain tens of thousands of candles, and the AI Research Cycle runs ICT analysis, backtests, validation scenarios, Auto Research candidates, and compact LLM context generation. Processing the whole raw set synchronously can freeze the page.

## Default Safe Mode

Imported 1-minute data uses a safe research window by default:

- Window: latest 2,000 raw candles
- Research timeframe: 5m
- Expected processed candles: about 400 after aggregation
- Performance mode: safe

The raw import remains stored locally, but dashboard research, Backtest Lab, validation, and Auto Research use the prepared research window instead of the full raw dataset.

## Window Choices

The UI supports:

- 500 candles
- 1,000 candles
- 2,000 candles
- 5,000 candles
- custom size with a warning

Safe mode caps imported research windows at 5,000 raw candles. Advanced mode allows larger stress tests, but browser processing is still hard-capped to prevent crashes.

## Timeframe Aggregation

The candle window can be compressed from 1m into 5m or 15m candles:

- open = first candle open
- high = maximum high
- low = minimum low
- close = last candle close
- volume = summed volume

Use 5m for the default AI Research Cycle. Use 15m when the page feels heavy or when researching broader structure. Use 1m only for smaller windows or focused debugging.

## LLM Context Safety

LLM packets never include the full candle series. They include only compact metadata and summary facts:

- data source label
- first and last timestamps
- candle count used
- research timeframe
- latest ICT/context summary
- validation and readiness summaries

API keys still stay outside browser code.

## If Processing Fails

If historical processing feels slow or fails, reduce the window or aggregate to 5m/15m. A future backend worker/server path can process larger datasets outside the browser, but the current app keeps research local and simulation-only.

Safety remains unchanged: historical market data is a research input only. It does not enable broker execution, live trading, order placement, or readiness override.
