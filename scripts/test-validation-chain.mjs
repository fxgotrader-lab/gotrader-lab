#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "validationChain");
const outRoot = path.join(projectRoot, ".gotrader", "validation-chain-test");
const sourceFiles = ["validationChainTypes.ts", "buildValidationChain.ts"];

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
    queueValidationChainEntry,
    applyValidationChainReplayResult,
    applyValidationChainWalkForwardResult,
    applyValidationChainEvidenceUpdate,
    describeValidationChainStage
  } = await import(pathToFileURL(path.join(outRoot, "buildValidationChain.mjs")).href);

  const mt5SourceStatus = {
    sourceProvider: "mt5_read_only",
    isMockOrSample: false,
    isResearchActive: true,
    statusLabel: "MT5 read-only research active"
  };
  const mockSourceStatus = {
    sourceProvider: "mock",
    isMockOrSample: true,
    isResearchActive: false,
    statusLabel: "Mock/sample data"
  };
  const recognitionInput = (overrides = {}) => ({
    recognitionId: "recognition_test_1",
    recognitionType: "full_model",
    setupLabel: "CMD Full Model",
    symbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "5m",
    htfContext: ["15m", "1h"],
    sourceFingerprint: "mt5_fp_test",
    sourceStatus: mt5SourceStatus,
    generatedAt: "2026-06-11T10:00:00.000Z",
    ...overrides
  });

  // 1. Mock recognition cannot create evidence.
  const mockQueue = queueValidationChainEntry(recognitionInput({ sourceStatus: mockSourceStatus }));
  assert.equal(mockQueue.ok, false, "mock/sample recognition must be rejected from the validation chain");
  assert.match(mockQueue.reason, /mock\/sample/i);
  assert.equal(mockQueue.entry.hypothesisStatus, "not_queued");
  assert.match(mockQueue.entry.nextAction, /Activate MT5/i);

  // 2. MT5 recognition queues replay_required.
  const queued = queueValidationChainEntry(recognitionInput());
  assert.equal(queued.ok, true);
  const entry = queued.entry;
  assert.equal(entry.hypothesisStatus, "replay_required");
  assert.equal(entry.recognitionId, "recognition_test_1");
  assert.equal(entry.candidateFamily, "known_model");
  assert.equal(entry.sourceFingerprint, "mt5_fp_test");
  assert.equal(entry.executionIntent, "none");
  assert.match(describeValidationChainStage(entry), /not evidence/i);

  const marketMapQueue = queueValidationChainEntry(
    recognitionInput({
      recognitionId: "recognition_market_map_only",
      recognitionType: "market_map_only",
      setupLabel: "Market map context only"
    })
  );
  assert.equal(marketMapQueue.ok, false, "market-map diagnostics must not queue validation-chain evidence");
  assert.match(marketMapQueue.reason, /Context-only|registered trade setup/i);
  assert.equal(marketMapQueue.entry.hypothesisStatus, "not_queued");
  assert.equal(marketMapQueue.entry.candidateFamily, "market_map");
  assert.match(marketMapQueue.entry.paperDemoChecklistImpact, /No Paper-Demo impact/i);

  const ifvgQueued = queueValidationChainEntry(
    recognitionInput({
      recognitionId: "recognition_ifvg_filtered_v2",
      setupLabel: "IFVG filtered v2 - clean retest displacement",
      htfContext: ["15m", "1h", "4h", "1d"],
      sourceFingerprint: "mt5_fp_ifvg_filtered_v2"
    })
  );
  assert.equal(ifvgQueued.ok, true);
  assert.equal(ifvgQueued.entry.candidateFamily, "ifvg");
  assert.equal(ifvgQueued.entry.hypothesisStatus, "replay_required");
  assert.equal(ifvgQueued.entry.sourceFingerprint, "mt5_fp_ifvg_filtered_v2");
  assert.match(ifvgQueued.entry.nextAction, /IFVG filtered v2/i);
  assert.match(ifvgQueued.entry.paperDemoChecklistImpact, /candidate consideration only/i);
  assert.equal(ifvgQueued.entry.executionIntent, "none");

  // 3. Replay result is preserved on the chain entry.
  const replayPassed = applyValidationChainReplayResult(entry, {
    runId: "replay_run_1",
    generatedAt: "2026-06-11T11:00:00.000Z",
    verdict: "passed",
    totalWindows: 12,
    totalSignals: 18,
    targetFirstRate: 0.61,
    averageRr: 1.4,
    usableOutcomes: 18,
    reason: "Target-first rate 61% across 18 signals."
  });
  assert.ok(replayPassed.replayResult, "replay result summary must be preserved, not dropped");
  assert.equal(replayPassed.replayResult.runId, "replay_run_1");
  assert.equal(replayPassed.replayResult.targetFirstRate, 0.61);

  // 4. Walk-forward required follows a replay pass.
  assert.equal(replayPassed.hypothesisStatus, "walk_forward_required");
  assert.match(replayPassed.nextAction, /walk-forward/i);
  assert.match(replayPassed.paperDemoChecklistImpact, /walk-forward/i);

  // 5. Failed replay blocks walk-forward.
  const replayFailed = applyValidationChainReplayResult(entry, {
    generatedAt: "2026-06-11T11:00:00.000Z",
    verdict: "failed",
    totalWindows: 12,
    totalSignals: 18,
    targetFirstRate: 0.2,
    reason: "Target-first rate 20% across 18 signals."
  });
  assert.equal(replayFailed.hypothesisStatus, "replay_failed");
  const wfAfterFailedReplay = applyValidationChainWalkForwardResult(replayFailed, {
    runId: "wf_run_blocked",
    generatedAt: "2026-06-11T12:00:00.000Z",
    verdict: "passed",
    warningFlags: [],
    reason: "should be ignored"
  });
  assert.equal(wfAfterFailedReplay.hypothesisStatus, "replay_failed", "failed replay must block walk-forward");
  assert.equal(wfAfterFailedReplay.walkForwardResult, undefined, "walk-forward verdict must not attach after failed replay");
  assert.ok(wfAfterFailedReplay.blockers.some((blocker) => /walk-forward ignored/i.test(blocker)));

  // 6. Walk-forward verdict attaches after replay pass; evidence update follows.
  const wfPassed = applyValidationChainWalkForwardResult(replayPassed, {
    runId: "wf_run_1",
    generatedAt: "2026-06-11T12:30:00.000Z",
    verdict: "passed",
    grade: 71,
    oosVerdict: "robust_research",
    tradeCount: 42,
    windowsTested: 5,
    oosWindowsPassed: 4,
    warningFlags: ["low trade count in window 3"],
    reason: "4/5 OOS windows passed."
  });
  assert.equal(wfPassed.hypothesisStatus, "walk_forward_passed");
  assert.equal(wfPassed.walkForwardResult.oosVerdict, "robust_research");
  assert.equal(wfPassed.walkForwardResult.tradeCount, 42);
  const evidenceUpdated = applyValidationChainEvidenceUpdate(wfPassed, {
    generatedAt: "2026-06-11T13:00:00.000Z",
    evidenceQualityScore: 64,
    maturityScore: 55,
    maturityGrade: "developing",
    detail: "test evidence snapshot"
  });
  assert.equal(evidenceUpdated.hypothesisStatus, "evidence_updated");
  assert.equal(evidenceUpdated.evidenceQuality.evidenceQualityScore, 64);

  // Failed walk-forward is rejected as evidence.
  const wfFailed = applyValidationChainWalkForwardResult(replayPassed, {
    generatedAt: "2026-06-11T12:30:00.000Z",
    verdict: "failed",
    grade: 18,
    oosVerdict: "fail",
    tradeCount: 10,
    warningFlags: ["oos collapse"],
    reason: "OOS windows failed."
  });
  assert.equal(wfFailed.hypothesisStatus, "walk_forward_failed");
  assert.match(wfFailed.paperDemoChecklistImpact, /Blocked for Paper-Demo/i);

  // 7. Authority remains none and no raw candles are serialized at any stage.
  for (const candidate of [mockQueue.entry, entry, replayPassed, replayFailed, wfPassed, wfFailed, evidenceUpdated]) {
    assert.equal(candidate.authority.executionAuthority, "none");
    assert.equal(candidate.authority.brokerAuthority, "none");
    assert.equal(candidate.authority.readinessOverrideAuthority, "none");
    assert.equal(candidate.executionIntent, "none");
    assert.equal(candidate.researchOnly, true);
    const serialized = JSON.stringify(candidate).toLowerCase();
    assert.ok(!/"candles"\s*:/.test(serialized), "no raw candle arrays may be serialized");
    assert.ok(!serialized.includes('"open":'), "no candle OHLC fields may be serialized");
    assert.ok(!serialized.includes("api_key"), "no secrets may be serialized");
  }

  console.log("validation-chain tests passed:");
  console.log("- mock recognition cannot create evidence");
  console.log("- MT5 recognition queues replay_required");
  console.log("- replay result summary is preserved");
  console.log("- walk-forward required follows replay pass");
  console.log("- failed replay blocks walk-forward");
  console.log("- failed walk-forward blocks Paper-Demo");
  console.log("- authority remains none; no raw candles serialized");
}

main().catch((error) => {
  console.error("validation-chain tests failed:", error);
  process.exitCode = 1;
});
