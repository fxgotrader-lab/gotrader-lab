#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-cisd-test");
const sourceFiles = ["ictCisdTypes.ts", "ictCisd.ts"];

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        verbatimModuleSyntax: false
      },
      fileName: sourcePath
    }).outputText;
    const rewritten = transpiled
      .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

const iso = (minute) => new Date(Date.UTC(2026, 5, 12, 13, 30 + minute)).toISOString();
const candle = (minute, open, high, low, close) => ({
  timestamp: iso(minute),
  open,
  high,
  low,
  close,
  volume: 100 + minute
});

function bearishDelivery() {
  const candles = [];
  let price = 102;
  for (let index = 0; index < 14; index += 1) {
    const open = price;
    const close = price - 1.3;
    candles.push(candle(index * 5, open, open + (index === 0 ? 10 : 0.4), close - 0.6, close));
    price = close - 0.2;
  }
  return candles;
}

function bullishDelivery() {
  const candles = [];
  let price = 98;
  for (let index = 0; index < 14; index += 1) {
    const open = price;
    const close = price + 1.3;
    candles.push(candle(index * 5, open, close + 0.6, open - (index === 0 ? 10 : 0.4), close));
    price = close + 0.2;
  }
  return candles;
}

function validBullishCisd() {
  return [
    ...bearishDelivery(),
    candle(70, 82.4, 98.2, 81.8, 97.4),
    candle(75, 97.2, 98.1, 90.6, 92.2),
    candle(80, 92.3, 96.4, 91.8, 95.8),
    candle(85, 96, 101.5, 95.4, 100.8),
    candle(90, 101, 104.5, 100.5, 104)
  ];
}

function validBearishCisd() {
  return [
    ...bullishDelivery(),
    candle(70, 117.8, 118.4, 101.2, 102.5),
    candle(75, 102.7, 109.6, 101.8, 108.4),
    candle(80, 108.1, 108.8, 102.2, 103.4),
    candle(85, 103.2, 103.8, 96.4, 97.2),
    candle(90, 96.9, 97.3, 92.2, 93.1)
  ];
}

function weakBullishCisd() {
  const candles = bearishDelivery();
  candles.push(candle(70, 95.5, 99.8, 81.2, 95.9));
  candles.push(candle(75, 95.7, 96.2, 90.2, 91.4));
  candles.push(candle(80, 91.6, 95.7, 90.9, 94.5));
  candles.push(candle(85, 94.5, 101.5, 94.1, 101));
  return candles;
}

function noRetestBullishCisd() {
  const candles = bearishDelivery();
  candles.push(candle(70, 82.4, 98.2, 81.8, 97.4));
  candles.push(candle(75, 99.2, 101.1, 98.5, 100.2));
  candles.push(candle(80, 100.3, 103.4, 100.1, 102.8));
  candles.push(candle(85, 103, 105, 102.5, 104.4));
  return candles;
}

function lowRrBullishCisd() {
  const candles = bearishDelivery().map((item) => ({ ...item, high: Math.min(item.high, 97.8) }));
  candles.push(candle(70, 82.4, 98.2, 81.8, 97.4));
  candles.push(candle(75, 97.2, 98.1, 90.6, 92.2));
  candles.push(candle(80, 92.3, 94.4, 91.8, 93.8));
  candles.push(candle(85, 94, 96.5, 93.4, 96));
  return candles;
}

function choppySequence() {
  const candles = [];
  const values = [
    [100, 102, 99, 101.4],
    [101.4, 101.9, 99.8, 100.1],
    [100.1, 102.4, 99.7, 102],
    [102, 102.3, 100.2, 100.4],
    [100.4, 103, 100, 102.7],
    [102.7, 103.1, 100.8, 101],
    [101, 103.2, 100.6, 102.8],
    [102.8, 103.4, 100.5, 100.9],
    [100.9, 103.8, 100.4, 103.2],
    [103.2, 103.6, 101, 101.3],
    [101.3, 104.1, 100.8, 103.7],
    [103.7, 104, 101.4, 101.6],
    [101.6, 104.4, 101.1, 104],
    [104, 104.3, 101.8, 102.1],
    [102.1, 105.2, 101.9, 104.8],
    [104.8, 105.4, 100.5, 101.2],
    [101.4, 103.2, 100.8, 102.4],
    [102.2, 102.8, 99.7, 100.4],
    [100.1, 100.6, 97.8, 98.4]
  ];
  values.forEach((value, index) => candles.push(candle(index * 5, ...value)));
  return candles;
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const assertSafe = (value) => {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
  assert.deepEqual(value.authority, authorityNone);
};

async function main() {
  compileForNode();
  const cisd = await import(pathToFileURL(path.join(outRoot, "ictCisd.mjs")).href);

  const base = {
    sourceProvider: "mt5_read_only",
    sourceFingerprint: "mt5|MNQ|USTECH|5m|fixture",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "5m"
  };

  const bullish = cisd.evaluateIctCisd({ ...base, candles: validBullishCisd() });
  assert.equal(bullish.status, "replay_required");
  assert.equal(bullish.strategyId, "cisd_v1");
  assert.equal(bullish.side, "long");
  assert.equal(bullish.priorDeliveryDirection, "bearish");
  assert.ok(bullish.entry);
  assert.ok(bullish.stop);
  assert.ok(bullish.target);
  assert.ok(bullish.rr >= 2);
  assert.equal(bullish.canCreateValidationChainEntry, true);
  assert.equal(cisd.ictCisdCanQueueValidation(bullish), true);
  assertSafe(bullish);

  const bearish = cisd.evaluateIctCisd({ ...base, candles: validBearishCisd(), timeframe: "15m" });
  assert.equal(bearish.status, "replay_required");
  assert.equal(bearish.side, "short");
  assert.equal(bearish.priorDeliveryDirection, "bullish");
  assert.ok(bearish.rr >= 2);
  assertSafe(bearish);

  const noPrior = cisd.evaluateIctCisd({ ...base, candles: validBullishCisd().slice(0, 20).map((item, index) => ({ ...item, open: 100 + (index % 2), close: 100 - (index % 2) })) });
  assert.equal(noPrior.status, "blocked_no_prior_delivery");
  assert.match(noPrior.blockers.join(" "), /prior clear delivery/i);
  assertSafe(noPrior);

  const weak = cisd.evaluateIctCisd({ ...base, candles: weakBullishCisd() });
  assert.equal(weak.status, "blocked_weak_cisd_candle");
  assert.match(weak.blockers.join(" "), /weak CISD/i);
  assertSafe(weak);

  const chop = cisd.evaluateIctCisd({ ...base, candles: choppySequence() });
  assert.ok(["blocked_chop", "blocked_no_prior_delivery", "no_trade"].includes(chop.status));
  if (chop.status === "blocked_chop") {
    assert.match(chop.blockers.join(" "), /chop/i);
  }
  assertSafe(chop);

  const noRetest = cisd.evaluateIctCisd({ ...base, candles: noRetestBullishCisd() });
  assert.equal(noRetest.status, "blocked_no_retest");
  assert.match(noRetest.blockers.join(" "), /retest/i);
  assertSafe(noRetest);

  const lowRr = cisd.evaluateIctCisd({ ...base, candles: lowRrBullishCisd() });
  assert.equal(lowRr.status, "blocked_rr");
  assert.match(lowRr.blockers.join(" "), /2R/i);
  assertSafe(lowRr);

  const mock = cisd.evaluateIctCisd({ ...base, sourceProvider: "mock", candles: validBullishCisd() });
  assert.equal(mock.status, "blocked_mock_source");
  assert.equal(mock.canCreateValidationChainEntry, false);
  assertSafe(mock);

  const news = cisd.evaluateIctCisd({
    ...base,
    candles: validBullishCisd(),
    newsEvents: [{ timestamp: validBullishCisd().at(-1).timestamp, impact: "high", label: "CPI" }]
  });
  assert.equal(news.status, "blocked_news");
  assertSafe(news);

  const unsupported = cisd.evaluateIctCisd({ ...base, timeframe: "1m", candles: validBullishCisd() });
  assert.equal(unsupported.status, "needs_more_data");
  assert.match(unsupported.blockers.join(" "), /5m or 15m/i);
  assertSafe(unsupported);

  const report = {
    status: "passed",
    bullishStatus: bullish.status,
    bearishStatus: bearish.status,
    noPriorStatus: noPrior.status,
    weakStatus: weak.status,
    noRetestStatus: noRetest.status,
    lowRrStatus: lowRr.status,
    mockStatus: mock.status,
    authority: authorityNone,
    safety: {
      rawCandlesSerialized: false,
      accountOrderPositionSerialized: false,
      secretsSerialized: false
    }
  };
  assertSafe(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT CISD tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
