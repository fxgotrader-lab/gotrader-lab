#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "currentOpportunity");
const outRoot = path.join(projectRoot, ".gotrader", "top-down-timeframe-context-test");
const sourceFiles = ["currentOpportunityTypes.ts", "buildCurrentOpportunityContext.ts"];

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
  const {
    buildCurrentOpportunityContext,
    buildCurrentOpportunityTimeframeRoleSummary,
    classifyCurrentOpportunityTopDownBias
  } = await import(pathToFileURL(path.join(outRoot, "buildCurrentOpportunityContext.mjs")).href);

  const roles = buildCurrentOpportunityTimeframeRoleSummary({
    loaded: ["M5", "M15", "H1", "H4", "D1", "W1"],
    missing: []
  });
  assert.deepEqual(
    roles.map((item) => `${item.timeframe}:${item.role}:${item.status}`),
    [
      "W1:weekly bias:loaded",
      "D1:daily bias:loaded",
      "H4:HTF bias:loaded",
      "H1:dealing range:loaded",
      "M15:session model:loaded",
      "M5:confirmation/refinement:loaded"
    ]
  );
  assert.equal(
    classifyCurrentOpportunityTopDownBias({
      htfAlignmentStatus: "aligned",
      weeklyBiasDirection: "bullish",
      timeframeRoleSummary: roles
    }),
    "aligned"
  );
  assert.equal(
    classifyCurrentOpportunityTopDownBias({
      htfAlignmentStatus: "conflicted",
      weeklyBiasDirection: "bearish",
      timeframeRoleSummary: roles
    }),
    "conflicted"
  );
  assert.equal(
    classifyCurrentOpportunityTopDownBias({
      htfAlignmentStatus: "mixed",
      weeklyBiasDirection: "bullish",
      timeframeRoleSummary: roles
    }),
    "mixed"
  );
  assert.equal(
    classifyCurrentOpportunityTopDownBias({
      htfAlignmentStatus: "aligned",
      missingTimeframes: ["M15"],
      weeklyBiasDirection: "bullish",
      timeframeRoleSummary: buildCurrentOpportunityTimeframeRoleSummary({ loaded: ["M5"], missing: ["M15"] })
    }),
    "insufficient_data"
  );

  const context = buildCurrentOpportunityContext({
    currentRead: {
      packetSource: "live_mt5",
      requestedSymbol: "MNQ",
      brokerSymbol: "USTECH",
      primaryTimeframe: "5m",
      candleCount: 1000,
      analysisDepthStatus: "sufficient",
      availableLookbackDays: 88.95,
      analysisTimeframesUsed: ["M5", "M15", "H1", "H4", "D1", "W1"],
      missingTimeframes: [],
      htfAlignment: {
        setupDirection: "short",
        alignmentStatus: "mixed",
        conflictReason: "W1 bullish while M15/M5 bearish.",
        timeframeBias: {
          W1: "bullish",
          D1: "neutral",
          H4: "bearish",
          H1: "bearish",
          M15: "bearish",
          M5: "bearish"
        }
      },
      weeklyBiasDirection: "bullish",
      topReasons: ["M15/M5 align bearish, W1 bullish."]
    }
  });
  assert.equal(context.sourceProvider, "mt5_read_only");
  assert.equal(context.sourceDepth.depthPolicyStatus, "validation_context_ready");
  assert.equal(context.topDownBiasStatus, "mixed");
  assert.equal(context.timeframeRoleSummary.length, 6);
  assert.equal(context.timeframeRoleSummary.find((item) => item.timeframe === "W1")?.role, "weekly bias");
  assert.equal(context.timeframeRoleSummary.find((item) => item.timeframe === "M5")?.role, "confirmation/refinement");
  assert.equal(context.weeklyBiasDirection, "bullish");

  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /"candles"\s*:/i);
  assert.doesNotMatch(serialized, /account|order|position|password|secret|api[_-]?key|token/i);

  console.log("test-top-down-timeframe-context: all assertions passed.");
  console.log(JSON.stringify({
    topDownBiasStatus: context.topDownBiasStatus,
    weeklyBiasDirection: context.weeklyBiasDirection,
    timeframeRoleSummary: context.timeframeRoleSummary,
    depthPolicyStatus: context.sourceDepth.depthPolicyStatus
  }, null, 2));
}

main().catch((error) => {
  console.error("test-top-down-timeframe-context failed:", error);
  process.exitCode = 1;
});
