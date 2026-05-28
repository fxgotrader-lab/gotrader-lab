#!/usr/bin/env node

import {
  get_candles,
  getTwelveDataEnvironmentStatus,
  GOTRADER_TWELVE_DATA_WATCHLIST,
  scan_symbol,
  validate_symbol
} from "./services/twelve-data-service.mjs";

const defaultChecks = [
  { symbol: "EUR/USD", interval: "1min" },
  { symbol: "XAU/USD", interval: "5min" },
  { symbol: "BTC/USD", interval: "5min" },
  { symbol: "US30", interval: "5min" },
  { symbol: "NASDAQ", interval: "5min" },
  { symbol: "SPX", interval: "5min" }
];

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run"),
    outputsize: Number(argv[argv.indexOf("--outputsize") + 1] ?? 5) || 5
  };
}

function printHelp() {
  process.stdout.write(`GoTrader Twelve Data market-data smoke test

Usage:
  npm run test:twelvedata
  npm run test:twelvedata -- --dry-run
  npm run test:twelvedata -- --outputsize 10

Environment:
  TWELVE_DATA_API_KEY   Required for live API checks.
  GOTRADER_MODE         Use paper. Defaults to paper for this market-data-only script.

This script only reads market data. It does not place orders, connect MT5, or change readiness.
`);
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toString() : "n/a";
}

function printDryRun() {
  const env = getTwelveDataEnvironmentStatus();
  process.stdout.write("Twelve Data dry-run configuration check\n");
  process.stdout.write(`API key configured: ${env.hasApiKey ? "yes" : "no"}\n`);
  process.stdout.write(`GOTRADER_MODE: ${env.gotraderMode}\n`);
  process.stdout.write(`Paper mode: ${env.modeIsPaper ? "yes" : "no"}\n`);
  process.stdout.write("\nWatchlist alias preview:\n");

  for (const symbol of GOTRADER_TWELVE_DATA_WATCHLIST) {
    const validation = validate_symbol(symbol);
    if (validation.ok) {
      process.stdout.write(
        `- ${symbol}: Twelve Data candidates [${validation.data.twelveDataCandidates.join(", ")}], future MT5 candidates [${validation.data.futureMt5Candidates.join(", ")}]\n`
      );
    }
  }
}

async function runCheck({ symbol, interval }, outputsize) {
  process.stdout.write(`\n[CHECK] ${symbol} ${interval}\n`);
  const candlesResult = await get_candles(symbol, interval, outputsize);
  if (!candlesResult.ok) {
    process.stdout.write(`  API status: error\n`);
    process.stdout.write(`  Error: ${candlesResult.error.code} - ${candlesResult.error.message}\n`);
    if (candlesResult.error.attemptedTwelveDataSymbols) {
      process.stdout.write(`  Attempted symbols: ${candlesResult.error.attemptedTwelveDataSymbols.join(", ")}\n`);
    }
    return false;
  }

  const latestCandle = candlesResult.data[candlesResult.data.length - 1];
  const preview = candlesResult.data.slice(-Math.min(3, candlesResult.data.length));
  process.stdout.write(`  API status: ok\n`);
  process.stdout.write(`  GoTrader symbol: ${candlesResult.symbolMapping.gotraderSymbol}\n`);
  process.stdout.write(`  Twelve Data symbol: ${candlesResult.symbolMapping.resolvedTwelveDataSymbol}\n`);
  process.stdout.write(`  Candle count: ${candlesResult.data.length}\n`);
  process.stdout.write(`  Latest close: ${formatNumber(latestCandle?.close)}\n`);
  process.stdout.write(`  Latest candle: ${JSON.stringify(latestCandle)}\n`);
  process.stdout.write(`  Normalized preview: ${JSON.stringify(preview, null, 2)}\n`);

  const scan = await scan_symbol(symbol, interval, { outputsize });
  process.stdout.write(`  Agent scan: ${JSON.stringify(scan, null, 2)}\n`);
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.dryRun) {
    printDryRun();
    return;
  }

  const env = getTwelveDataEnvironmentStatus();
  if (!env.hasApiKey) {
    process.stderr.write(
      "TWELVE_DATA_API_KEY is missing. Set it in PowerShell or .env.local before running live Twelve Data checks.\n" +
        'Example: $env:TWELVE_DATA_API_KEY = "your_key_here"; $env:GOTRADER_MODE = "paper"; npm run test:twelvedata\n'
    );
    process.exitCode = 1;
    return;
  }

  if (!env.modeIsPaper) {
    process.stderr.write(`GOTRADER_MODE is "${env.gotraderMode}". This script expects paper mode for research-only operation.\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("GoTrader Twelve Data market-data smoke test\n");
  process.stdout.write("Mode: paper. Market data only. No broker execution. No MT5 orders.\n");

  let passed = 0;
  for (const check of defaultChecks) {
    const ok = await runCheck(check, args.outputsize);
    if (ok) {
      passed += 1;
    }
  }

  process.stdout.write(`\nResult: ${passed}/${defaultChecks.length} checks passed.\n`);
  if (passed !== defaultChecks.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Unexpected Twelve Data test failure: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
