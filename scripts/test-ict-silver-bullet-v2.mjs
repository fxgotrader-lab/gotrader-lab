#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-silver-bullet-v2-test");
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

const iso = (hourUtc, minute) => `2026-06-12T${String(hourUtc).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

const preSession = () =>
  Array.from({ length: 56 }, (_, index) => {
    const minute = index % 60;
    const hour = 13 + Math.floor(index / 60);
    return candle(iso(hour, minute), 105, 106, 104, 105);
  });

const validLong = () => [
  ...preSession(),
  candle(iso(14, 0), 105, 106, 103, 104.8),
  candle(iso(14, 1), 104.8, 105.5, 104.2, 104.5),
  candle(iso(14, 2), 107, 113, 107, 112),
  candle(iso(14, 3), 112, 112.5, 106.4, 107.4)
];

const validShort = () => [
  ...preSession(),
  candle(iso(14, 0), 105, 107, 104, 105.2),
  candle(iso(14, 1), 105.2, 105.8, 104.5, 105.5),
  candle(iso(14, 2), 103, 103, 97, 98),
  candle(iso(14, 3), 98, 103.6, 97.5, 102.6)
].map((item, index) =>
  index < 56 ? { ...item, high: 106, low: 104, close: 105 } : item
).map((item, index) =>
  index === 56 ? { ...item, high: 107.5, close: 105.4 } : item
);

const bullishContext = (timeframe) =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `ctx-${timeframe}-${index}`,
    symbol: "MNQ",
    timeframe,
    timestamp: `2026-06-12T13:${String(index * 5).padStart(2, "0")}:00.000Z`,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 100
  }));

const bearishContext = (timeframe) =>
  bullishContext(timeframe).map((item, index) => ({
    ...item,
    open: 110 - index,
    high: 111 - index,
    low: 108 - index,
    close: 109 - index
  }));

const source = (context = "bullish") => ({
  sourceProvider: "mt5_read_only",
  sourceFingerprint: "mt5|MNQ|USTECH|1m|fixture|v2",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "1m",
  contextCandles: {
    "5m": context === "bearish" ? bearishContext("5m") : bullishContext("5m"),
    "15m": context === "bearish" ? bearishContext("15m") : bullishContext("15m")
  },
  newsEvents: [],
  vwap: 106
});

const assertSafe = (candidate) => {
  const serialized = JSON.stringify(candidate);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
  if ("researchOnly" in candidate) assert.equal(candidate.researchOnly, true);
  assert.equal(candidate.authority.executionAuthority, "none");
  assert.equal(candidate.authority.brokerAuthority, "none");
  assert.equal(candidate.authority.readinessOverrideAuthority, "none");
};

async function main() {
  compileForNode();
  const { evaluateIctSilverBulletV2 } = await import(pathToFileURL(path.join(outRoot, "ictSilverBullet.mjs")).href);

  const longCandidate = evaluateIctSilverBulletV2({ ...source("bullish"), candles: validLong() });
  assert.equal(longCandidate.strategyId, "silver_bullet_v2_refined_research");
  assert.equal(longCandidate.status, "replay_required");
  assert.equal(longCandidate.side, "long");
  assert.ok(longCandidate.rr >= 2 && longCandidate.rr <= 15);
  assert.equal(longCandidate.canCreateValidationChainEntry, true);
  assertSafe(longCandidate);

  const shortCandidate = evaluateIctSilverBulletV2({ ...source("bearish"), candles: validShort() });
  assert.equal(shortCandidate.status, "replay_required");
  assert.equal(shortCandidate.side, "short");
  assert.ok(shortCandidate.rr >= 2 && shortCandidate.rr <= 15);
  assertSafe(shortCandidate);

  const weakSweep = evaluateIctSilverBulletV2({
    ...source("bullish"),
    candles: validLong().map((item) => item.timestamp === iso(14, 0) ? { ...item, low: 103.95 } : item)
  });
  assert.equal(weakSweep.status, "blocked_low_quality_sweep");

  const noDisplacement = evaluateIctSilverBulletV2({
    ...source("bullish"),
    candles: validLong().map((item) => item.timestamp === iso(14, 2) ? { ...item, open: 106.5, high: 107.2, low: 106.4, close: 106.7 } : item)
  });
  assert.equal(noDisplacement.status, "blocked_weak_displacement");

  const lateReturn = evaluateIctSilverBulletV2({
    ...source("bullish"),
    candles: [
      ...validLong().slice(0, -1),
      ...Array.from({ length: 11 }, (_, index) => candle(iso(14, 3 + index), 112, 113, 110, 112)),
      candle(iso(14, 15), 112, 112, 106.5, 107)
    ]
  });
  assert.equal(lateReturn.status, "blocked_late_return");

  const unrealisticRr = evaluateIctSilverBulletV2({
    ...source("bullish"),
    candles: validLong().map((item) =>
      item.timestamp === iso(14, 2) ? { ...item, open: 107, high: 110, low: 107, close: 109 } : item
    )
  });
  assert.equal(unrealisticRr.status, "blocked_unrealistic_rr");

  const noContext = evaluateIctSilverBulletV2({
    ...source("bearish"),
    candles: validLong()
  });
  assert.equal(noContext.status, "blocked_no_context_alignment");

  const mockBlocked = evaluateIctSilverBulletV2({
    ...source("bullish"),
    sourceProvider: "mock",
    candles: validLong()
  });
  assert.notEqual(mockBlocked.status, "replay_required");
  assert.match(mockBlocked.blockers.join(" "), /Mock\/sample/i);

  const report = {
    status: "passed",
    longStatus: longCandidate.status,
    shortStatus: shortCandidate.status,
    weakSweep: weakSweep.status,
    noDisplacement: noDisplacement.status,
    lateReturn: lateReturn.status,
    unrealisticRr: unrealisticRr.status,
    noContext: noContext.status,
    mockBlocked: mockBlocked.blockers[0],
    authority: longCandidate.authority,
    safety: longCandidate.safety
  };
  assertSafe(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT Silver Bullet v2 tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
