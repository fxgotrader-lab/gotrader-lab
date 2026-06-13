#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const outRoot = path.join(projectRoot, ".gotrader", "auto-paper-demo-cycle-test");
const modules = [
  ["src/lib/validationChain", ["validationChainTypes.ts", "buildValidationChain.ts", "validationChainStore.ts"]],
  ["src/lib/ict-strategy-suite", ["ictCmdIndependentDateGateTypes.ts", "ictCmdIndependentDateGate.ts"]],
  [
    "src/lib/paperDemoOperations",
    [
      "paperDemoTypes.ts",
      "paperDemoEligibility.ts",
      "paperDemoStore.ts",
      "paperDemoReport.ts",
      "autoPaperDemoCycleTypes.ts",
      "buildPaperDemoDailyReport.ts",
      "runAutoPaperDemoCycle.ts",
      "index.ts"
    ]
  ]
];

function rewriteImports(source) {
  return source
    .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
    .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
    .replace(/from\s+"\.\.\/([^"]+)"/g, 'from "../$1.mjs"')
    .replace(/from\s+'\.\.\/([^']+)'/g, "from '../$1.mjs'");
}

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  for (const [relativeRoot, files] of modules) {
    const sourceRoot = path.join(projectRoot, relativeRoot);
    const targetRoot = path.join(outRoot, relativeRoot.replace(/^src\/lib\//, ""));
    fs.mkdirSync(targetRoot, { recursive: true });
    for (const file of files) {
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
      fs.writeFileSync(path.join(targetRoot, file.replace(/\.ts$/, ".mjs")), rewriteImports(transpiled), "utf8");
    }
  }
}

function installLocalStorage() {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear()
    },
    dispatchEvent: () => true
  };
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const validSource = {
  sourceProvider: "mt5_read_only",
  sourceStatus: "mt5_research_active",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  displayLabel: "MNQ via USTECH",
  primaryTimeframe: "5m",
  higherTimeframes: ["15m:1000", "1h:500"],
  candleCount: 1000,
  sourceFingerprint: "mt5|MNQ|USTECH|5m|1000",
  isResearchActive: true,
  isMockOrSample: false,
  isProxyInstrument: true,
  warningLabel: "USTECH is CFD/proxy data.",
  authority: authorityNone
};

const replayPassed = {
  generatedAt: "2026-06-12T12:00:00.000Z",
  verdict: "passed",
  totalWindows: 12,
  totalSignals: 8,
  targetFirstRate: 0.63,
  averageRr: 1.42,
  usableOutcomes: 8,
  reason: "Target-first rate 63% across 8 signals."
};

const replayFailed = {
  ...replayPassed,
  generatedAt: "2026-06-12T12:01:00.000Z",
  verdict: "failed",
  targetFirstRate: 0.12,
  reason: "Replay failed target-first threshold."
};

const walkForwardPassed = {
  generatedAt: "2026-06-12T12:05:00.000Z",
  verdict: "passed",
  grade: 72,
  oosVerdict: "promising",
  tradeCount: 14,
  windowsTested: 4,
  oosWindowsPassed: 3,
  warningFlags: [],
  reason: "Walk-forward passed 3/4 OOS windows."
};

const evidenceUpdated = {
  generatedAt: "2026-06-12T12:10:00.000Z",
  evidenceQualityScore: 68,
  maturityScore: 64,
  maturityGrade: "developing",
  selfImprovementStatus: "queued_for_replay",
  detail: "Evidence and maturity summaries updated from deterministic validation."
};

const checklistPassed = {
  checklistId: "paper_demo_checklist_test_passed",
  generatedAt: "2026-06-12T12:12:00.000Z",
  researchReady: true,
  paperDemoCandidate: true,
  passCount: 15,
  failCount: 0,
  warningCount: 0,
  notApplicableCount: 0,
  primaryBlocker: "none",
  nextAction: "Add to watchlist and monitor manually.",
  sourceContext: {
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "5m",
    candleCount: 1000,
    sourceFingerprint: "mt5|MNQ|USTECH|5m|1000",
    sourceLabel: "MT5 read-only USTECH proxy",
    proxyWarning: "USTECH is CFD/proxy data."
  },
  items: [
    {
      id: "no_authority_violations",
      label: "No authority violations",
      status: "pass",
      currentValue: "none/none/none",
      requiredValue: "none/none/none",
      blockerReason: "No blocker.",
      nextAction: "Continue manual research operations.",
      proposalEligible: false
    }
  ],
  proposalEligibleBlockers: [],
  authority: authorityNone,
  safetyNotice: "Checklist is reporting-only. It cannot promote readiness, place orders, or override authority."
};

const cmdIndependentDateEvidence = {
  modelName: "consolidation_manipulation_distribution",
  side: "short",
  sourceProvider: "mt5_read_only",
  sourceFingerprint: validSource.sourceFingerprint,
  timeframe: "5m",
  candidateCount: 24,
  uniqueTradingDates: 3,
  activeRollingWindows: 2,
  targetFirstRate: 0.72,
  invalidationFirstRate: 0.12,
  averageRr: 2.1,
  robustnessClassification: "promising_but_small_sample",
  oosVerdict: "promising"
};

async function main() {
  compileForNode();
  installLocalStorage();
  const mod = await import(pathToFileURL(path.join(outRoot, "paperDemoOperations", "index.mjs")).href);

  const mockBlocked = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: { ...validSource, sourceProvider: "mock", sourceStatus: "mock_sample", isMockOrSample: true },
    now: "2026-06-12T11:00:00.000Z"
  });
  assert.equal(mockBlocked.status, "source_required");
  assert.match(mockBlocked.blockers.join(" "), /mock|source/i);

  const unavailableBlocked = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: { ...validSource, sourceStatus: "unavailable", candleCount: 0, isResearchActive: false },
    now: "2026-06-12T11:01:00.000Z"
  });
  assert.equal(unavailableBlocked.status, "source_required");

  const queued = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: validSource,
    recognition: { recognitionType: "full_model", setupLabel: "CMD paper-watchlist scan" },
    now: "2026-06-12T11:02:00.000Z"
  });
  assert.equal(queued.status, "validation_queued");
  assert.ok(queued.validationChainId);
  assert.match(queued.blockers.join(" "), /replay runner not wired/i);
  assert.equal(Boolean(queued.evidenceMaturitySummary), false, "recognition alone must not create evidence");

  const failedReplay = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: validSource,
    recognition: { recognitionType: "full_model", setupLabel: "CMD failed replay" },
    replaySummary: replayFailed,
    now: "2026-06-12T11:03:00.000Z"
  });
  assert.equal(failedReplay.status, "replay_failed");
  assert.equal(Boolean(failedReplay.walkForwardSummary), false, "failed replay must block walk-forward");

  const replayOnly = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: validSource,
    recognition: { recognitionType: "full_model", setupLabel: "CMD replay only" },
    replaySummary: replayPassed,
    now: "2026-06-12T11:04:00.000Z"
  });
  assert.equal(replayOnly.status, "replay_passed");
  assert.match(replayOnly.blockers.join(" "), /walk-forward runner not wired/i);

  const cmdWithoutIndependentDates = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: validSource,
    recognition: { recognitionType: "full_model", setupLabel: "CMD eligible paper demo" },
    replaySummary: replayPassed,
    walkForwardSummary: walkForwardPassed,
    evidenceSummary: evidenceUpdated,
    checklistSummary: checklistPassed,
    createWatchlistCandidate: true,
    now: "2026-06-12T11:04:30.000Z"
  });
  assert.equal(cmdWithoutIndependentDates.status, "paper_demo_blocked");
  assert.match(cmdWithoutIndependentDates.blockers.join(" "), /date-concentrated|independent-date/i);
  assert.equal(Boolean(cmdWithoutIndependentDates.watchlistCandidateId), false);

  const eligible = await mod.runAutoPaperDemoCycle({
    sourceSnapshot: validSource,
    recognition: { recognitionType: "full_model", setupLabel: "CMD eligible paper demo" },
    replaySummary: replayPassed,
    walkForwardSummary: walkForwardPassed,
    evidenceSummary: evidenceUpdated,
    cmdIndependentDateEvidence,
    checklistSummary: checklistPassed,
    persist: true,
    createWatchlistCandidate: true,
    now: "2026-06-12T11:05:00.000Z"
  });
  assert.equal(eligible.status, "paper_demo_candidate_created");
  assert.equal(eligible.paperDemoEligibility?.eligible, true);
  assert.ok(eligible.watchlistCandidateId);
  assert.equal(eligible.dailyReport?.authority.executionAuthority, "none");

  const state = mod.loadAutoPaperDemoCycleState();
  assert.equal(state.latestCycle?.cycleId, eligible.cycleId);
  assert.equal(state.latestCycle?.authority.executionAuthority, "none");

  const paperState = mod.loadPaperDemoOperationsState();
  assert.equal(paperState.candidates.length, 1);
  assert.equal(paperState.candidates[0].status, "watchlist");
  assert.equal(paperState.candidates[0].executionIntent, "none");

  assert.throws(
    () =>
      mod.saveAutoPaperDemoCycleResult({
        ...eligible,
        rawCandles: [{ close: 1 }]
      }),
    /unsafe raw payload/i,
    "raw candles must be rejected before auto-cycle persistence"
  );

  const serialized = JSON.stringify(eligible);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:|"apiKey"\s*:|"secret"\s*:|"password"\s*:|"token"\s*:/i);
  assert.doesNotMatch(serialized, /"(account|accountNumber|accountId|accountData|order|orderId|orderRoute|orderStatus|orderData|position|positionId|positionStatus|positionData)"\s*:/i);
  assert.equal(eligible.safety.executionIntentCreated, false);
  assert.equal(eligible.safety.brokerMutation, false);
  assert.deepEqual(eligible.authority, authorityNone);

  const stopped = mod.stopAutoPaperDemoCycle("Operator stopped the browser-session cycle.");
  assert.equal(stopped.latestCycle.status, "stopped");
  assert.equal(stopped.latestCycle.authority.executionAuthority, "none");

  console.log("Auto Paper-Demo cycle tests passed.");
  console.log(
    JSON.stringify(
      {
        blockedSourceStatus: mockBlocked.status,
        queuedStatus: queued.status,
        failedReplayStatus: failedReplay.status,
        eligibleStatus: eligible.status,
        watchlistCandidateId: eligible.watchlistCandidateId,
        dailyReport: {
          replayStatus: eligible.dailyReport.replayStatus,
          walkForwardStatus: eligible.dailyReport.walkForwardStatus,
          disclaimer: eligible.dailyReport.disclaimer
        },
        authority: eligible.authority,
        safety: {
          rawCandlesExcluded: true,
          realOrderPlaced: false,
          brokerMutation: false
        }
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
