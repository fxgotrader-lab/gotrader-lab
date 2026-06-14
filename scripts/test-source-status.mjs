#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "sourceStatus");
const outRoot = path.join(projectRoot, ".gotrader", "source-status-test");
const sourceFiles = ["sourceStatusTypes.ts", "buildSourceStatusSnapshot.ts"];

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

async function main() {
  compileForNode();
  const { buildSourceStatusSnapshot } = await import(
    pathToFileURL(path.join(outRoot, "buildSourceStatusSnapshot.mjs")).href
  );
  const { sourceStatusLabel } = await import(
    pathToFileURL(path.join(outRoot, "sourceStatusTypes.mjs")).href
  );

  const mt5Active = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: true,
    sourceLabel: "MNQ via USTECH",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    higherTimeframes: [
      { timeframe: "15m", candleCount: 400 },
      { timeframe: "1h", candleCount: 200 }
    ],
    candleCount: 1000,
    fingerprint: "mt5_fp_abc",
    lastUpdated: "2026-06-11T10:00:00.000Z"
  });
  assert.equal(mt5Active.sourceStatus, "mt5_research_active");
  assert.equal(mt5Active.isResearchActive, true);
  assert.equal(mt5Active.isMockOrSample, false);
  assert.equal(mt5Active.isProxyInstrument, true, "USTECH for MNQ must be flagged as proxy instrument");
  assert.match(mt5Active.warningLabel, /CFD\/proxy/i);
  assert.equal(mt5Active.requestedSymbol, "MNQ");
  assert.equal(mt5Active.brokerSymbol, "USTECH");
  assert.equal(mt5Active.primaryTimeframe, "5m");
  assert.deepEqual(mt5Active.higherTimeframes, ["15m:400", "1h:200"]);
  assert.equal(mt5Active.sourceFingerprint, "mt5_fp_abc");
  assert.equal(mt5Active.sourceDepth.chartCandleCount, 1000);
  assert.equal(mt5Active.sourceDepth.depthMode, "tactical_only");
  assert.match(mt5Active.sourceDepth.depthLabel, /tactical chart window only/i);
  assert.equal(sourceStatusLabel(mt5Active.sourceStatus), "MT5 read-only research active");

  const mt5VisualOnly = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: false,
    sourceLabel: "MNQ via USTECH",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    candleCount: 1000,
    fingerprint: "mt5_fp_abc"
  });
  assert.equal(mt5VisualOnly.sourceStatus, "mt5_visual_only");
  assert.equal(mt5VisualOnly.isResearchActive, false);
  assert.match(mt5VisualOnly.warningLabel, /chart-only/i);

  const mockSource = buildSourceStatusSnapshot({
    provider: "mock",
    researchEligible: false,
    sourceLabel: "Mock research candles",
    primaryTimeframe: "5m",
    candleCount: 240
  });
  assert.equal(mockSource.sourceStatus, "mock_sample");
  assert.equal(mockSource.isMockOrSample, true);
  assert.equal(mockSource.isResearchActive, false);
  assert.match(mockSource.warningLabel, /not MT5 research-active/i);
  assert.match(mockSource.warningLabel, /not research evidence/i);
  assert.equal(mockSource.sourceFingerprint, "no fingerprint");

  const unavailable = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: true,
    sourceLabel: "MT5 pending",
    candleCount: 0
  });
  assert.equal(unavailable.sourceStatus, "unavailable");
  assert.equal(unavailable.isMockOrSample, true);
  assert.match(unavailable.warningLabel, /No active candle source/i);

  const imported = buildSourceStatusSnapshot({
    provider: "imported_historical",
    researchEligible: true,
    sourceLabel: "Imported MNQ history",
    requestedSymbol: "MNQ",
    primaryTimeframe: "5m",
    candleCount: 5000,
    fingerprint: "import_fp"
  });
  assert.equal(imported.sourceStatus, "imported_research");
  assert.equal(imported.isMockOrSample, false);
  assert.equal(imported.isProxyInstrument, false);

  for (const snapshot of [mt5Active, mt5VisualOnly, mockSource, unavailable, imported]) {
    assert.deepEqual(snapshot.authority, {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    });
  }

  const serialized = JSON.stringify([mt5Active, mt5VisualOnly, mockSource, unavailable, imported]);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "Source status snapshots must never carry raw candles");
  assert.doesNotMatch(
    serialized,
    /accountNumber|orderId|positionId|password|secret|api[_-]?key/i,
    "Source status snapshots must never carry account/order/secret data"
  );

  console.log("GoTrader source status snapshot test passed.");
  console.log(`Scenarios checked: 5`);
  console.log(
    JSON.stringify(
      {
        authority: mt5Active.authority,
        statuses: [mt5Active, mt5VisualOnly, mockSource, unavailable, imported].map((item) => item.sourceStatus)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
