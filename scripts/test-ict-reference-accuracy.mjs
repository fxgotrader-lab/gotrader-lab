#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-reference-accuracy-test");
const sourceFiles = ["ictReferenceAccuracyTypes.ts", "ictReferenceAccuracy.ts"];

function compileForNode() {
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

const candle = (timestamp, open, high, low, close, index) => ({
  id: `c${index}`,
  timestamp,
  open,
  high,
  low,
  close
});

function buildFixtureCandles() {
  const candles = [];
  // Sunday evening local New York is 2026-06-08T00:00Z during DST.
  candles.push(candle("2026-06-08T00:00:00.000Z", 100, 101, 99, 100.5, candles.length));
  // Previous local day range before the target date.
  for (let hour = 1; hour <= 23; hour += 1) {
    candles.push(candle(`2026-06-08T${String(hour).padStart(2, "0")}:00:00.000Z`, 100 + hour * 0.2, 101 + hour * 0.3, 98 - hour * 0.05, 100 + hour * 0.1, candles.length));
  }
  // Target local day midnight is 2026-06-09T04:00Z.
  candles.push(candle("2026-06-09T04:00:00.000Z", 110, 111, 109, 110.5, candles.length));
  for (let index = 0; index < 26; index += 1) {
    const base = 110 + Math.sin(index / 2) * 2;
    candles.push(candle(new Date(Date.UTC(2026, 5, 9, 4, 5 + index * 5)).toISOString(), base, base + 2, base - 2, base + 0.5, candles.length));
  }
  // Deliberate compact consolidation near 115.
  for (let index = 0; index < 12; index += 1) {
    const base = 115 + (index % 3) * 0.08;
    candles.push(candle(new Date(Date.UTC(2026, 5, 9, 8, index * 5)).toISOString(), base, base + 0.25, base - 0.25, base + 0.02, candles.length));
  }
  // Create a bullish FVG and a later swing high.
  candles.push(candle("2026-06-09T09:00:00.000Z", 116, 116.2, 115.7, 116, candles.length));
  candles.push(candle("2026-06-09T09:05:00.000Z", 117, 118, 116.8, 117.8, candles.length));
  candles.push(candle("2026-06-09T09:10:00.000Z", 119, 120, 118.4, 119.5, candles.length));
  candles.push(candle("2026-06-09T09:15:00.000Z", 118, 119, 117, 117.5, candles.length));
  candles.push(candle("2026-06-09T09:20:00.000Z", 117, 117.4, 116.2, 116.5, candles.length));
  return candles;
}

async function main() {
  compileForNode();
  const { assertIctReferenceAccuracyReportIsCompact, buildIctReferenceAccuracyReport } = await import(
    pathToFileURL(path.join(outRoot, "ictReferenceAccuracy.mjs")).href
  );

  const report = buildIctReferenceAccuracyReport({
    candles: buildFixtureCandles(),
    sourceTimeframe: "M5",
    targetLocalDate: "2026-06-09",
    timeZone: "America/New_York"
  });

  assert.equal(report.sourceTimeframe, "M5");
  assert.equal(report.twelveAmOpen?.price, 110, "12AM Open should use session-local midnight, not literal UTC HH:mm");
  assert.equal(report.twelveAmOpen?.label, "MT5-derived 12AM Open");
  assert.equal(report.twelveAmOpen?.sourceMethod, "mt5_session_local_exact_midnight");
  assert.match(report.twelveAmOpen?.localTimestamp ?? "", /2026-06-09 00:00:00 America\/New_York/);
  assert.equal(report.sundayOpen?.price, 100, "Sunday Open should resolve from Sunday evening local session");
  assert.equal(report.sundayOpen?.label, "MT5-derived Sunday Open");
  assert.equal(report.sundayOpen?.sourceMethod, "mt5_session_local_sunday_after_18");
  assert.ok(report.previousDayHigh?.price && report.previousDayHigh.price > 105, "previous day high should be anchored to prior NY date");
  assert.ok(report.previousDayLow?.price && report.previousDayLow.price < 99, "previous day low should be anchored to prior NY date");
  assert.ok(report.latestSwingHigh?.price, "swing high should be detected from local candle structure");
  assert.ok(report.latestSwingLow?.price, "swing low should be detected from local candle structure");
  assert.ok(report.consolidationHigh?.price && report.consolidationLow?.price, "consolidation high/low should be compact references");
  assert.ok(report.dealingRange?.equilibrium, "dealing range equilibrium should be built from references");
  assert.ok(report.pdArrayReferences.some((item) => item.type === "fair_value_gap" && item.sourceTimeframe === "M5"), "FVG references should carry source timeframe");

  const compact = assertIctReferenceAccuracyReportIsCompact(report);
  assert.equal(compact.ok, true);
  assert.equal(report.authority.executionAuthority, "none");
  assert.equal(report.authority.brokerAuthority, "none");
  assert.equal(report.authority.readinessOverrideAuthority, "none");

  console.log("test-ict-reference-accuracy: all assertions passed.");
  console.log(JSON.stringify({
    twelveAmOpen: report.twelveAmOpen,
    sundayOpen: report.sundayOpen,
    dealingRange: report.dealingRange,
    pdArrayCount: report.pdArrayReferences.length,
    authority: report.authority
  }, null, 2));
}

main().catch((error) => {
  console.error("test-ict-reference-accuracy failed:", error);
  process.exitCode = 1;
});
