#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-silver-bullet-test");
const sourceFiles = ["ictSilverBulletTypes.ts", "ictSilverBullet.ts"];

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

const candle = (timestamp, open, high, low, close) => ({
  id: `MNQ-1m-${timestamp}`,
  symbol: "MNQ",
  timeframe: "1m",
  timestamp,
  open,
  high,
  low,
  close,
  volume: 100
});

const isoMinute = (hourUtc, minute) => `2026-06-12T${String(hourUtc).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

function basePreSession() {
  return Array.from({ length: 25 }, (_, index) =>
    candle(isoMinute(13, 35 + index), 105, 110, 100, 105)
  );
}

function validLongCandles() {
  return [
    ...basePreSession(),
    candle(isoMinute(14, 0), 105, 107, 101, 104),
    candle(isoMinute(14, 1), 104, 106, 101.5, 103),
    candle(isoMinute(14, 2), 102, 102, 99, 101.2),
    candle(isoMinute(14, 3), 101.5, 108, 103.5, 107),
    candle(isoMinute(14, 4), 107.5, 109, 103.2, 108.5),
    candle(isoMinute(14, 5), 108, 108.2, 102.6, 104),
    candle(isoMinute(14, 6), 104, 105, 103, 104.2)
  ];
}

function validShortCandles() {
  return [
    ...basePreSession(),
    candle(isoMinute(14, 0), 105, 108, 102, 106),
    candle(isoMinute(14, 1), 106, 109, 103, 107),
    candle(isoMinute(14, 2), 109, 111, 108, 109),
    candle(isoMinute(14, 3), 108.5, 108.8, 104, 105),
    candle(isoMinute(14, 4), 105, 107, 104, 104.5),
    candle(isoMinute(14, 5), 105, 107.6, 104.6, 106.8),
    candle(isoMinute(14, 6), 106.5, 106.8, 104, 104.2)
  ];
}

const safeSource = {
  sourceProvider: "mt5_read_only",
  sourceFingerprint: "mt5|MNQ|USTECH|1m|fixture",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "1m",
  contextCandles: {
    "5m": [candle("2026-06-12T14:00:00.000Z", 105, 109, 99, 104)],
    "15m": [candle("2026-06-12T14:00:00.000Z", 105, 110, 99, 104)]
  },
  newsEvents: [],
  vwap: 104
};

const assertCandidateSafe = (candidate) => {
  const serialized = JSON.stringify(candidate);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
  assert.equal(candidate.researchOnly, true);
  assert.equal(candidate.authority.executionAuthority, "none");
  assert.equal(candidate.authority.brokerAuthority, "none");
  assert.equal(candidate.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileForNode();
  const silverBullet = await import(pathToFileURL(path.join(outRoot, "ictSilverBullet.mjs")).href);

  const longCandidate = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles()
  });
  assert.equal(longCandidate.status, "replay_required");
  assert.equal(longCandidate.side, "long");
  assert.equal(longCandidate.canCreateValidationChainEntry, true);
  assert.equal(longCandidate.sessionWindow.id, "new_york_am");
  assert.ok(longCandidate.rr >= 2);
  assert.deepEqual(longCandidate.blockers, []);
  assert.ok(longCandidate.presentConditions.includes("liquidity_sweep"));
  assert.ok(longCandidate.presentConditions.includes("directional_fvg"));
  assert.ok(longCandidate.presentConditions.includes("return_to_fvg"));
  assertCandidateSafe(longCandidate);

  const shortCandidate = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validShortCandles()
  });
  assert.equal(shortCandidate.status, "replay_required");
  assert.equal(shortCandidate.side, "short");
  assert.ok(shortCandidate.rr >= 2);
  assertCandidateSafe(shortCandidate);

  const noSweep = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles().map((item) =>
      item.timestamp === isoMinute(14, 2)
        ? { ...item, low: 100.5, close: 101.2 }
        : item
    )
  });
  assert.equal(noSweep.status, "no_trade");
  assert.match(noSweep.blockers.join(" "), /liquidity sweep/i);

  const noFvg = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles().map((item) =>
      item.timestamp === isoMinute(14, 4)
        ? { ...item, low: 101.8, close: 102 }
        : item
    )
  });
  assert.equal(noFvg.status, "no_trade");
  assert.match(noFvg.blockers.join(" "), /FVG/i);

  const noReturn = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles().map((item) =>
      item.timestamp === isoMinute(14, 5)
        ? { ...item, low: 104.5, close: 105 }
        : item.timestamp === isoMinute(14, 6)
          ? { ...item, low: 104, close: 104.8 }
        : item
    )
  });
  assert.equal(noReturn.status, "no_trade");
  assert.match(noReturn.blockers.join(" "), /returned|return/i);

  const lowRr = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles().map((item) =>
      item.timestamp.startsWith("2026-06-12T13:")
        ? { ...item, low: 95 }
        : item.timestamp === isoMinute(14, 2)
          ? { ...item, low: 94 }
        : item
    )
  });
  assert.equal(lowRr.status, "no_trade");
  assert.match(lowRr.blockers.join(" "), /below 2R/i);

  const outsideKillzone = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: [
      ...basePreSession(),
      ...validLongCandles().slice(25, -1),
      candle("2026-06-12T17:00:00.000Z", 104, 105, 103, 104)
    ]
  });
  assert.equal(outsideKillzone.status, "no_trade");
  assert.match(outsideKillzone.blockers.join(" "), /Outside Silver Bullet killzone/i);

  const mockBlocked = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    sourceProvider: "mock",
    candles: validLongCandles()
  });
  assert.equal(mockBlocked.status, "no_trade");
  assert.match(mockBlocked.blockers.join(" "), /Mock\/sample/i);

  const highImpactNews = silverBullet.evaluateIctSilverBullet({
    ...safeSource,
    candles: validLongCandles(),
    newsEvents: [{ timestamp: "2026-06-12T14:10:00.000Z", impact: "high", label: "FOMC" }]
  });
  assert.equal(highImpactNews.status, "no_trade");
  assert.match(highImpactNews.blockers.join(" "), /High-impact news/i);

  const report = {
    status: "passed",
    longStatus: longCandidate.status,
    longSide: longCandidate.side,
    shortStatus: shortCandidate.status,
    shortSide: shortCandidate.side,
    noSweep: noSweep.blockers[0],
    noFvg: noFvg.blockers[0],
    noReturn: noReturn.blockers[0],
    lowRr: lowRr.blockers[0],
    outsideKillzone: outsideKillzone.blockers[0],
    mockBlocked: mockBlocked.blockers[0],
    researchOnly: true,
    authority: longCandidate.authority,
    safety: longCandidate.safety
  };
  assertCandidateSafe(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT Silver Bullet tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
