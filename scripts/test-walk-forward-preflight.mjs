#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "walkForward");
const outRoot = path.join(projectRoot, ".gotrader", "walk-forward-preflight-test");

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  const sourcePath = path.join(sourceRoot, "walkForwardPreflight.ts");
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
  fs.writeFileSync(path.join(outRoot, "walkForwardPreflight.mjs"), transpiled, "utf8");
}

const candle = (timestamp, overrides = {}) => ({
  timestamp,
  symbol: "MNQ",
  timeframe: "5m",
  open: 100,
  high: 101,
  low: 99,
  close: 100.5,
  volume: 1000,
  ...overrides
});

const buildCandles = (days, candlesPerDay = 4) => {
  const start = Date.parse("2026-03-01T14:30:00.000Z");
  const candles = [];
  for (let day = 0; day < days; day += 1) {
    for (let step = 0; step < candlesPerDay; step += 1) {
      candles.push(candle(new Date(start + day * 86400000 + step * 300000).toISOString()));
    }
  }
  return candles;
};

const source = (overrides = {}) => ({
  provider: "mt5_read_only",
  mode: "mt5_read_only",
  brokerSymbol: "USTECH",
  candles: buildCandles(90),
  dataQuality: "sufficient",
  sourceFingerprint: "mt5:USTECH:90d",
  walkForwardEligible: true,
  walkForwardEligibilityReasons: [],
  appliedSettings: { targetTimeframe: "5m" },
  metadata: { symbol: "MNQ" },
  rawCandleCount: 17799,
  processedCandleCount: 17799,
  ...overrides
});

const windows = (count) =>
  Array.from({ length: count }, (_, index) => ({
    splits: [
      { label: "in_sample", processedCandleCount: 100 },
      { label: "validation", processedCandleCount: 40 },
      { label: "out_of_sample", processedCandleCount: 40 }
    ],
    windowId: `window_${index + 1}`
  }));

const replayEntry = (overrides = {}) => ({
  recognitionId: "chain_ifvg_1",
  setupLabel: "IFVG filtered v2",
  symbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "5m",
  sourceFingerprint: "mt5:USTECH:90d",
  replayResult: {
    verdict: "passed",
    totalSignals: 28,
    reason: "Replay passed with compact outcomes."
  },
  ...overrides
});

async function main() {
  compileForNode();
  const { buildWalkForwardPreflight } = await import(
    pathToFileURL(path.join(outRoot, "walkForwardPreflight.mjs")).href
  );

  const ready = buildWalkForwardPreflight({
    source: source(),
    windows: windows(3),
    validationChainEntry: replayEntry(),
    requireReplayHandoff: true
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.sourceDepthUsed, "mt5_90_day_range");
  assert.equal(ready.sourceDepthStatus, "sufficient");
  assert.equal(ready.availableCandidateCount, 28);
  assert.equal(ready.replayPassedCandidateCount, 28);
  assert.equal(ready.authority.executionAuthority, "none");
  assert.equal(ready.authority.brokerAuthority, "none");
  assert.equal(ready.authority.readinessOverrideAuthority, "none");

  const shallowTactical = buildWalkForwardPreflight({
    source: source({
      candles: buildCandles(3, 12).slice(0, 36),
      rawCandleCount: 1000,
      processedCandleCount: 1000,
      sourceFingerprint: "mt5:USTECH:latest_1000"
    }),
    windows: windows(3),
    validationChainEntry: replayEntry({ sourceFingerprint: "mt5:USTECH:latest_1000" }),
    requireReplayHandoff: true
  });
  assert.equal(shallowTactical.status, "ready", "MT5 latest window should be allowed to request explicit deep history on run");
  assert.equal(shallowTactical.sourceDepthUsed, "tactical_latest_window");
  assert.equal(shallowTactical.sourceDepthStatus, "tactical_only");
  assert.equal(shallowTactical.canRequestDeepMt5History, true);
  assert.match(shallowTactical.warnings.join(" "), /explicit run action will request 90-day MT5 range history/i);

  const insufficientCandidates = buildWalkForwardPreflight({
    source: source(),
    windows: windows(3),
    validationChainEntry: replayEntry({ replayResult: { verdict: "passed", totalSignals: 3 } }),
    requireReplayHandoff: true
  });
  assert.equal(insufficientCandidates.status, "blocked");
  assert.ok(
    insufficientCandidates.blockers.some((item) => item.code === "insufficient_replay_candidates"),
    "low replay candidate count should block before heavy processing"
  );

  const missingStrategy = buildWalkForwardPreflight({
    source: source(),
    windows: windows(3),
    validationChainEntry: replayEntry({ setupLabel: undefined }),
    requireReplayHandoff: true
  });
  assert.equal(missingStrategy.status, "blocked");
  assert.ok(missingStrategy.blockers.some((item) => item.code === "missing_strategy_id"));

  const missingReplay = buildWalkForwardPreflight({
    source: source(),
    windows: windows(3),
    validationChainEntry: replayEntry({ replayResult: undefined }),
    requireReplayHandoff: true
  });
  assert.equal(missingReplay.status, "blocked");
  assert.ok(missingReplay.blockers.some((item) => item.code === "missing_replay_result"));

  const noWindows = buildWalkForwardPreflight({
    source: source(),
    windows: windows(1),
    validationChainEntry: replayEntry(),
    requireReplayHandoff: true
  });
  assert.equal(noWindows.status, "blocked");
  assert.ok(noWindows.blockers.some((item) => item.code === "insufficient_windows"));

  const ineligibleSource = buildWalkForwardPreflight({
    source: source({
      provider: "mock",
      mode: "mock",
      candles: [],
      sourceFingerprint: undefined,
      walkForwardEligible: false,
      walkForwardEligibilityReasons: ["Mock/sample source is not walk-forward eligible."]
    }),
    windows: windows(3),
    validationChainEntry: replayEntry(),
    requireReplayHandoff: true
  });
  assert.equal(ineligibleSource.status, "blocked");
  assert.ok(ineligibleSource.blockers.some((item) => item.code === "source_not_eligible"));

  const serialized = JSON.stringify([ready, shallowTactical, insufficientCandidates, missingStrategy, missingReplay]);
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "preflight summaries must not serialize candle arrays");
  assert.doesNotMatch(serialized, /"open"\s*:/i, "preflight summaries must not serialize OHLC rows");
  assert.doesNotMatch(serialized, /"(account|orders?|positions?|password|api[_-]?key|token|secret)"\s*:/i);

  const uiSource = fs.readFileSync(path.join(projectRoot, "src", "components", "walk-forward", "WalkForwardView.tsx"), "utf8");
  assert.match(uiSource, /Duplicate click ignored/, "Walk-forward UI should ignore duplicate run clicks");
  assert.match(uiSource, /Walk-forward preflight accepted/, "Walk-forward UI should show immediate feedback before async work");
  assert.match(uiSource, /preflight\.status === "blocked"/, "Run button should be disabled when preflight blocks");

  const orchestratorSource = fs.readFileSync(path.join(sourceRoot, "walkForwardOrchestrator.ts"), "utf8");
  assert.match(orchestratorSource, /Walk-forward preflight passed/, "orchestrator should emit preflight progress before heavy windows");
  assert.match(orchestratorSource, /preflight\.status === "blocked"/, "orchestrator should return early on preflight block");

  console.log("walk-forward preflight tests passed:");
  console.log(JSON.stringify({
    readyStatus: ready.status,
    tacticalDepth: shallowTactical.sourceDepthUsed,
    tacticalWarning: shallowTactical.warnings[0],
    lowReplayBlocker: insufficientCandidates.blockers[0]?.code,
    authority: ready.authority
  }, null, 2));
}

main().catch((error) => {
  console.error("walk-forward preflight tests failed:", error);
  process.exitCode = 1;
});
