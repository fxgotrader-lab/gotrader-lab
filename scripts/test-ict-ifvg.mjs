#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-ifvg-test");
const sourceFiles = ["ictIfvgTypes.ts", "ictIfvg.ts"];

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
const candle = (minute, open, high, low, close, volume = 100) => ({
  timestamp: iso(minute),
  open,
  high,
  low,
  close,
  volume
});

const contextBullish = {
  "15m": [candle(-120, 90, 93, 89, 92), candle(-105, 92, 98, 91, 97), candle(-90, 97, 102, 96, 101)],
  "1h": [candle(-240, 88, 94, 87, 93), candle(-180, 93, 103, 92, 101)]
};

const contextBearish = {
  "15m": [candle(-120, 110, 111, 104, 105), candle(-105, 105, 106, 99, 100), candle(-90, 100, 101, 94, 95)],
  "1h": [candle(-240, 112, 113, 103, 104), candle(-180, 104, 105, 92, 95)]
};

function filler(startMinute, count, base = 100) {
  return Array.from({ length: count }, (_, index) => {
    const value = base + Math.sin(index / 2) * 0.4;
    return candle(startMinute + index * 5, value, value + 0.8, value - 0.8, value + (index % 2 ? 0.2 : -0.2), 100 + index);
  });
}

function overlapFiller(startMinute, count, base = 98) {
  return Array.from({ length: count }, (_, index) => {
    const open = base + (index % 3) * 0.12;
    const close = base + ((index + 1) % 3) * 0.12;
    return candle(startMinute + index * 5, open, base + 1.2, base - 1.2, close, 150 + index);
  });
}

function validLongIfvg() {
  return [
    ...overlapFiller(0, 10, 100),
    candle(50, 101, 104, 96, 97),
    candle(55, 97, 99, 95.5, 96.8),
    candle(60, 93, 94, 90, 91),
    candle(65, 91, 93.4, 90.5, 92.2),
    candle(70, 92.5, 98.6, 92.2, 98),
    candle(75, 97.8, 98.2, 94.8, 95.6),
    candle(80, 95.7, 99, 95.2, 98.5),
    candle(85, 98.5, 101, 98, 100),
    ...overlapFiller(90, 10, 98)
  ];
}

function validShortIfvg() {
  return [
    ...overlapFiller(0, 10, 100),
    candle(50, 99, 104, 98, 103),
    candle(55, 103, 104.5, 102, 103.5),
    candle(60, 107, 110, 106, 109),
    candle(65, 109, 110.2, 106.4, 108.2),
    candle(70, 108, 108.4, 100.8, 101.2),
    candle(75, 101, 107.2, 99.2, 105.6),
    candle(80, 105.4, 105.9, 98.4, 99.2),
    candle(85, 99, 100, 96, 97.4),
    ...overlapFiller(90, 10, 99)
  ];
}

function notInverted() {
  return [
    ...overlapFiller(0, 10, 100),
    candle(50, 101, 104, 96, 97),
    candle(55, 97, 99, 95.5, 96.8),
    candle(60, 93, 94, 90, 91),
    candle(65, 91, 93.4, 90.5, 92.2),
    ...overlapFiller(70, 14, 92)
  ];
}

function reusedBeforeInversion() {
  return [
    ...overlapFiller(0, 10, 100),
    candle(50, 101, 104, 96, 97),
    candle(55, 97, 99, 95.5, 96.8),
    candle(60, 93, 94, 90, 91),
    candle(65, 94.6, 95.2, 93.8, 94.4),
    candle(70, 92.5, 98.6, 92.2, 98),
    ...overlapFiller(75, 10, 97)
  ];
}

function noRetest() {
  return [
    ...overlapFiller(0, 10, 100),
    candle(50, 101, 104, 96, 97),
    candle(55, 97, 99, 95.5, 96.8),
    candle(60, 93, 94, 90, 91),
    candle(65, 91, 93.4, 90.5, 92.2),
    candle(70, 92.5, 98.6, 92.2, 98),
    ...overlapFiller(75, 10, 99)
  ];
}

function lowRr() {
  return [
    ...overlapFiller(0, 10, 95),
    candle(50, 96.4, 96.6, 96, 96.2),
    candle(55, 96.2, 96.4, 95.6, 96),
    candle(60, 93, 94, 90, 91),
    candle(65, 91, 93.4, 90.5, 92.2),
    candle(70, 92.5, 96.4, 92.2, 96.2),
    candle(75, 95.6, 95.8, 94.8, 95.6),
    ...overlapFiller(80, 10, 95.6)
  ];
}

function lowVolume() {
  const candles = validLongIfvg();
  return candles.map((item, index) => index === 14 ? { ...item, volume: 5 } : { ...item, volume: 1000 });
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
  const ifvg = await import(pathToFileURL(path.join(outRoot, "ictIfvg.mjs")).href);

  const base = {
    sourceProvider: "mt5_read_only",
    sourceFingerprint: "mt5|MNQ|USTECH|5m|ifvg_fixture",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "5m"
  };

  const long = ifvg.evaluateIctIfvg({ ...base, candles: validLongIfvg(), contextCandles: contextBullish });
  assert.equal(long.status, "replay_required");
  assert.equal(long.strategyId, "ifvg_v1");
  assert.equal(long.side, "long");
  assert.equal(long.originalFvgDirection, "bearish");
  assert.ok(long.entry);
  assert.ok(long.stop);
  assert.ok(long.target);
  assert.ok(long.rr >= 2);
  assert.equal(long.canCreateValidationChainEntry, true);
  assert.equal(ifvg.ictIfvgCanQueueValidation(long), true);
  assertSafe(long);

  const short = ifvg.evaluateIctIfvg({ ...base, candles: validShortIfvg(), contextCandles: contextBearish, timeframe: "15m" });
  assert.equal(short.status, "replay_required");
  assert.equal(short.side, "short");
  assert.equal(short.originalFvgDirection, "bullish");
  assert.ok(short.rr >= 2);
  assertSafe(short);

  const blockedHtf = ifvg.evaluateIctIfvg({ ...base, candles: validLongIfvg(), contextCandles: contextBearish });
  assert.equal(blockedHtf.status, "blocked_against_htf");
  assert.match(blockedHtf.blockers.join(" "), /HTF/i);
  assertSafe(blockedHtf);

  const unavailableHtf = ifvg.evaluateIctIfvg({ ...base, candles: validLongIfvg() });
  assert.equal(unavailableHtf.status, "replay_required");
  assert.equal(unavailableHtf.htfAlignment, "unavailable");
  assert.match(unavailableHtf.warnings.join(" "), /HTF context unavailable/i);
  assertSafe(unavailableHtf);

  const notFullyInverted = ifvg.evaluateIctIfvg({ ...base, candles: notInverted(), contextCandles: contextBullish });
  assert.equal(notFullyInverted.status, "blocked_not_inverted");
  assert.match(notFullyInverted.blockers.join(" "), /never fully inverted/i);
  assertSafe(notFullyInverted);

  const reused = ifvg.evaluateIctIfvg({ ...base, candles: reusedBeforeInversion(), contextCandles: contextBullish });
  assert.equal(reused.status, "blocked_reused_ifvg");
  assert.match(reused.blockers.join(" "), /already used/i);
  assertSafe(reused);

  const missingRetest = ifvg.evaluateIctIfvg({ ...base, candles: noRetest(), contextCandles: contextBullish });
  assert.equal(missingRetest.status, "blocked_no_retest");
  assert.match(missingRetest.blockers.join(" "), /retest/i);
  assertSafe(missingRetest);

  const rr = ifvg.evaluateIctIfvg({ ...base, candles: lowRr(), contextCandles: contextBullish });
  assert.equal(rr.status, "blocked_rr");
  assert.match(rr.blockers.join(" "), /2R|liquidity/i);
  assertSafe(rr);

  const lowVol = ifvg.evaluateIctIfvg({ ...base, candles: lowVolume(), contextCandles: contextBullish });
  assert.equal(lowVol.status, "blocked_low_volume");
  assert.match(lowVol.blockers.join(" "), /low-volume/i);
  assertSafe(lowVol);

  const mock = ifvg.evaluateIctIfvg({ ...base, sourceProvider: "mock", candles: validLongIfvg(), contextCandles: contextBullish });
  assert.equal(mock.status, "blocked_mock_source");
  assert.equal(mock.canCreateValidationChainEntry, false);
  assertSafe(mock);

  const unsupported = ifvg.evaluateIctIfvg({ ...base, timeframe: "1m", candles: validLongIfvg(), contextCandles: contextBullish });
  assert.equal(unsupported.status, "needs_more_data");
  assert.match(unsupported.blockers.join(" "), /5m or 15m/i);
  assertSafe(unsupported);

  const report = {
    status: "passed",
    longStatus: long.status,
    shortStatus: short.status,
    htfBlockStatus: blockedHtf.status,
    missingHtfWarningStatus: unavailableHtf.status,
    notInvertedStatus: notFullyInverted.status,
    reusedStatus: reused.status,
    noRetestStatus: missingRetest.status,
    lowRrStatus: rr.status,
    lowVolumeStatus: lowVol.status,
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
  console.error(`ICT IFVG tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
