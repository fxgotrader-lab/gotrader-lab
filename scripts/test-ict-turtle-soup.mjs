#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-turtle-soup-test");
const sourceFiles = ["ictTurtleSoupTypes.ts", "ictTurtleSoup.ts"];

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

const candle = ({ timestamp, timeframe, open, high, low, close }) => ({
  id: `MNQ-${timeframe}-${timestamp}`,
  symbol: "MNQ",
  timeframe,
  timestamp,
  open,
  high,
  low,
  close,
  volume: 100
});

const iso = (hourUtc, minute) => `2026-06-12T${String(hourUtc).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
const isoFromMinuteOffset = (hourUtc, minute) =>
  new Date(Date.UTC(2026, 5, 12, hourUtc, minute, 0, 0)).toISOString();

const setupCandles = ({ high, low }) =>
  Array.from({ length: 24 }, (_, index) =>
    candle({
      timestamp: `2026-06-12T${String(6 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}:00.000Z`,
      timeframe: "15m",
      open: (high + low) / 2,
      high,
      low,
      close: (high + low) / 2
    })
  );

const baseEntry = () =>
  Array.from({ length: 30 }, (_, index) =>
    candle({
      timestamp: iso(11 + Math.floor(index / 12), (index % 12) * 5),
      timeframe: "5m",
      open: 103,
      high: 104,
      low: 101,
      close: 103
    })
  );

const validShortEntry = () => [
  ...baseEntry(),
  candle({ timestamp: iso(13, 30), timeframe: "5m", open: 108, high: 112, low: 107, close: 109 }),
  candle({ timestamp: iso(13, 35), timeframe: "5m", open: 109, high: 109.5, low: 104, close: 105 }),
  candle({ timestamp: iso(13, 40), timeframe: "5m", open: 105, high: 106, low: 98, close: 100 }),
  candle({ timestamp: iso(13, 45), timeframe: "5m", open: 104, high: 106, low: 104, close: 105 })
];

const validLongEntry = () => [
  ...baseEntry().map((item) => ({ ...item, open: 101, high: 104, low: 99, close: 101 })),
  candle({ timestamp: iso(13, 30), timeframe: "5m", open: 98, high: 99, low: 93, close: 96 }),
  candle({ timestamp: iso(13, 35), timeframe: "5m", open: 96, high: 102, low: 96, close: 101 }),
  candle({ timestamp: iso(13, 40), timeframe: "5m", open: 101, high: 107, low: 100, close: 106 }),
  candle({ timestamp: iso(13, 45), timeframe: "5m", open: 103, high: 104, low: 102, close: 103 })
];

const source = (overrides = {}) => ({
  sourceProvider: "mt5_read_only",
  sourceFingerprint: "mt5|MNQ|USTECH|turtle-soup|fixture",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  setupTimeframe: "15m",
  entryTimeframe: "5m",
  newsEvents: [],
  ...overrides
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
  const { evaluateIctTurtleSoup } = await import(pathToFileURL(path.join(outRoot, "ictTurtleSoup.mjs")).href);

  const shortCandidate = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: validShortEntry()
  });
  assert.equal(shortCandidate.strategyId, "turtle_soup_v1");
  assert.equal(shortCandidate.status, "replay_required");
  assert.equal(shortCandidate.side, "short");
  assert.ok(shortCandidate.rr >= 2.5);
  assert.equal(shortCandidate.canCreateValidationChainEntry, true);
  assertSafe(shortCandidate);

  const longCandidate = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 135, low: 95 }),
    entryCandles: validLongEntry()
  });
  assert.equal(longCandidate.status, "replay_required");
  assert.equal(longCandidate.side, "long");
  assert.ok(longCandidate.rr >= 2.5);
  assertSafe(longCandidate);

  const staleSweep = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: [
      ...validShortEntry(),
      ...Array.from({ length: 8 }, (_, index) =>
        candle({ timestamp: isoFromMinuteOffset(13, 50 + index * 5), timeframe: "5m", open: 105, high: 106, low: 104, close: 105 })
      )
    ]
  });
  assert.equal(staleSweep.status, "blocked_stale_sweep");

  const noRejection = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: validShortEntry().map((item) =>
      [iso(13, 35), iso(13, 40), iso(13, 45)].includes(item.timestamp)
        ? { ...item, open: 111, high: 112, low: 108, close: 111 }
        : item
    )
  });
  assert.equal(noRejection.status, "blocked_no_rejection");

  const noMss = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: validShortEntry().map((item) =>
      item.timestamp === iso(13, 40) ? { ...item, low: 101, close: 102 } : item
    )
  });
  assert.equal(noMss.status, "blocked_no_mss");

  const middleOfRange = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: validShortEntry().map((item) =>
      item.timestamp === iso(13, 45) ? { ...item, high: 105, low: 89, close: 90 } : item
    )
  });
  assert.equal(middleOfRange.status, "blocked_middle_of_range");

  const lowRr = evaluateIctTurtleSoup({
    ...source(),
    setupCandles: setupCandles({ high: 110, low: 98 }),
    entryCandles: validShortEntry()
  });
  assert.equal(lowRr.status, "blocked_low_rr");

  const mockBlocked = evaluateIctTurtleSoup({
    ...source({ sourceProvider: "mock" }),
    setupCandles: setupCandles({ high: 110, low: 75 }),
    entryCandles: validShortEntry()
  });
  assert.equal(mockBlocked.status, "blocked_mock_source");
  assert.match(mockBlocked.blockers.join(" "), /Mock\/sample/i);

  const report = {
    status: "passed",
    shortStatus: shortCandidate.status,
    longStatus: longCandidate.status,
    staleSweep: staleSweep.status,
    noRejection: noRejection.status,
    noMss: noMss.status,
    middleOfRange: middleOfRange.status,
    lowRr: lowRr.status,
    mockBlocked: mockBlocked.status,
    authority: shortCandidate.authority,
    safety: shortCandidate.safety
  };
  assertSafe(report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`ICT Turtle Soup tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
