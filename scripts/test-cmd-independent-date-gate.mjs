#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "cmd-independent-date-gate-test");
const sourceFiles = ["ictCmdIndependentDateGateTypes.ts", "ictCmdIndependentDateGate.ts"];

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

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safeBase = {
  modelName: "consolidation_manipulation_distribution",
  side: "short",
  sourceProvider: "mt5_read_only",
  sourceFingerprint: "mt5|MNQ|USTECH|5m|17799|90d",
  timeframe: "5m",
  isMockOrSample: false,
  targetFirstRate: 0.875,
  invalidationFirstRate: 0.037,
  averageRr: 2.7475,
  robustnessClassification: "promising_but_small_sample",
  oosVerdict: "promising"
};

const assertSafe = (result) => {
  const serialized = JSON.stringify(result);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.safety.rawCandlesExcluded, true);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"token"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
};

async function main() {
  compileForNode();
  const mod = await import(pathToFileURL(path.join(outRoot, "ictCmdIndependentDateGate.mjs")).href);

  const oneDateHighWinRate = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    candidateCount: 8,
    uniqueTradingDates: 1,
    activeRollingWindows: 1,
    tradingDates: ["2026-06-12"],
    robustnessClassification: "overfit_risk"
  });
  assert.equal(oneDateHighWinRate.status, "overfit_risk");
  assert.equal(oneDateHighWinRate.paperDemoEligible, false);
  assert.match(oneDateHighWinRate.blockerReason, /date-concentrated/i);
  assert.equal(oneDateHighWinRate.nextAction, "Run independent-date CMD validation over 90-day history.");
  assertSafe(oneDateHighWinRate);

  const threeDatePass = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    candidateCount: 24,
    uniqueTradingDates: 3,
    activeRollingWindows: 2,
    tradingDates: ["2026-06-10", "2026-06-11", "2026-06-12"],
    robustnessClassification: "promising_but_small_sample"
  });
  assert.equal(threeDatePass.status, "passed");
  assert.equal(threeDatePass.paperDemoEligible, true);
  assertSafe(threeDatePass);

  const mockBlocked = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    sourceProvider: "mock",
    sourceFingerprint: "mock|sample",
    isMockOrSample: true,
    candidateCount: 24,
    uniqueTradingDates: 4,
    activeRollingWindows: 3
  });
  assert.equal(mockBlocked.status, "source_blocked");
  assert.equal(mockBlocked.paperDemoEligible, false);
  assertSafe(mockBlocked);

  const degradedBlocked = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    candidateCount: 24,
    uniqueTradingDates: 4,
    activeRollingWindows: 3,
    targetFirstRate: 0.41,
    invalidationFirstRate: 0.34,
    robustnessClassification: "unstable",
    oosVerdict: "failed_oos_degraded"
  });
  assert.equal(degradedBlocked.status, "oos_degraded");
  assert.equal(degradedBlocked.paperDemoEligible, false);
  assertSafe(degradedBlocked);

  const lowSampleBlocked = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    candidateCount: 12,
    uniqueTradingDates: 3,
    activeRollingWindows: 2,
    robustnessClassification: "promising_but_small_sample"
  });
  assert.equal(lowSampleBlocked.status, "insufficient_sample");
  assert.equal(lowSampleBlocked.paperDemoEligible, false);
  assertSafe(lowSampleBlocked);

  const notCmd = mod.evaluateCmdIndependentDateGate({
    ...safeBase,
    modelName: "accumulation_manipulation_expansion",
    side: "long",
    candidateCount: 24,
    uniqueTradingDates: 4,
    activeRollingWindows: 3
  });
  assert.equal(notCmd.status, "not_cmd");
  assert.equal(notCmd.paperDemoEligible, false);
  assertSafe(notCmd);

  const profile = mod.buildCmdPaperWatchlistNarrowProfile({
    sourceProvider: "mt5_read_only",
    sourceFingerprint: safeBase.sourceFingerprint,
    timeframe: "5m"
  });
  assert.equal(profile.modelName, "consolidation_manipulation_distribution");
  assert.equal(profile.side, "short");
  assert.equal(profile.mockSourceAllowed, false);
  assert.deepEqual(profile.authority, authorityNone);

  const missing = mod.buildMissingCmdIndependentDateGate({
    sourceProvider: "mt5_read_only",
    sourceFingerprint: safeBase.sourceFingerprint,
    timeframe: "5m"
  });
  assert.equal(missing.status, "overfit_risk");
  assert.equal(missing.paperDemoEligible, false);
  assert.match(mod.summarizeCmdIndependentDateGate(missing), /date-concentrated|independent-date/i);
  assertSafe(missing);

  const report = {
    status: "passed",
    diagnostic: "cmd_independent_date_gate",
    cases: {
      oneDateHighWinRate: oneDateHighWinRate.status,
      threeDatePass: threeDatePass.status,
      mockBlocked: mockBlocked.status,
      degradedBlocked: degradedBlocked.status,
      lowSampleBlocked: lowSampleBlocked.status,
      notCmd: notCmd.status
    },
    gateDefaults: threeDatePass.options,
    blocker: mod.CMD_INDEPENDENT_DATE_BLOCKER,
    nextAction: mod.CMD_INDEPENDENT_DATE_NEXT_ACTION,
    authority: authorityNone,
    safety: {
      candleArraysPresent: false,
      credentialLeaksPresent: false,
      accountOrderPositionPresent: false
    }
  };
  assert.doesNotMatch(JSON.stringify(report), /"candles"\s*:|"rawCandles"\s*:|secret|api[_-]?key|password|accountData|orderData|positionData/i);

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`CMD independent-date gate tests failed: ${error?.stack ?? error?.message ?? error}`);
  process.exitCode = 1;
});
