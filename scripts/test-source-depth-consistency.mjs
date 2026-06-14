#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "sourceStatus");
const outRoot = path.join(projectRoot, ".gotrader", "source-depth-consistency-test");
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

  const validationReady = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: true,
    sourceLabel: "MNQ via USTECH",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    candleCount: 1000,
    fingerprint: "mt5_1000",
    sourceDepth: {
      chartCandleCount: 1000,
      chartTimeframe: "5m",
      analysisCandleCount: 17799,
      analysisTimeframes: ["M5", "M15", "H1", "H4", "D1", "W1"],
      missingAnalysisTimeframes: [],
      availableLookbackDays: 88.95,
      requestedLookbackDays: 90,
      rangeHistoryAvailable: true
    }
  });
  assert.equal(validationReady.sourceDepth.chartCandleCount, 1000);
  assert.equal(validationReady.sourceDepth.analysisCandleCount, 17799);
  assert.equal(validationReady.sourceDepth.depthMode, "validation_context");
  assert.match(validationReady.sourceDepth.depthLabel, /90-day analysis context ready/i);
  assert.equal(validationReady.sourceDepth.rangeHistoryAvailable, true);
  assert.deepEqual(validationReady.sourceDepth.analysisTimeframes, ["M5", "M15", "H1", "H4", "D1", "W1"]);

  const tacticalOnly = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: true,
    sourceLabel: "MNQ via USTECH",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    candleCount: 1000,
    fingerprint: "mt5_1000"
  });
  assert.equal(tacticalOnly.sourceDepth.depthMode, "tactical_only");
  assert.equal(tacticalOnly.sourceDepth.rangeHistoryAvailable, false);
  assert.match(tacticalOnly.sourceDepth.depthLabel, /tactical chart window only/i);
  assert.match(tacticalOnly.sourceDepth.warning, /deeper validation context is explicit/i);

  const limited = buildSourceStatusSnapshot({
    provider: "mt5_read_only",
    researchEligible: true,
    sourceLabel: "MNQ via USTECH",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "5m",
    candleCount: 1000,
    sourceDepth: {
      availableLookbackDays: 24.27,
      rangeHistoryAvailable: true,
      analysisTimeframes: ["M5"],
      missingAnalysisTimeframes: ["M15", "H1"]
    }
  });
  assert.equal(limited.sourceDepth.depthMode, "swing_context");
  assert.match(limited.sourceDepth.depthLabel, /Swing context available/i);
  assert.deepEqual(limited.sourceDepth.missingAnalysisTimeframes, ["M15", "H1"]);

  const serialized = JSON.stringify([validationReady, tacticalOnly, limited]);
  assert.doesNotMatch(serialized, /"candles"\s*:/i);
  assert.doesNotMatch(serialized, /account|order|position|password|secret|api[_-]?key|token/i);
  assert.deepEqual(validationReady.authority, {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  });

  console.log("test-source-depth-consistency: all assertions passed.");
  console.log(JSON.stringify({
    chartWindow: `${validationReady.sourceDepth.chartCandleCount} x ${validationReady.sourceDepth.chartTimeframe}`,
    analysisCandles: validationReady.sourceDepth.analysisCandleCount,
    depthMode: validationReady.sourceDepth.depthMode,
    lookbackDays: validationReady.sourceDepth.availableLookbackDays,
    authority: validationReady.authority
  }, null, 2));
}

main().catch((error) => {
  console.error("test-source-depth-consistency failed:", error);
  process.exitCode = 1;
});
