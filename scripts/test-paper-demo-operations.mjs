#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const outRoot = path.join(projectRoot, ".gotrader", "paper-demo-operations-test");
const modules = [
  {
    sourceRoot: path.join(projectRoot, "src", "lib", "paperDemoOperations"),
    targetRoot: outRoot,
    sourceFiles: [
      "paperDemoTypes.ts",
      "paperDemoEligibility.ts",
      "paperDemoStore.ts",
      "paperDemoReport.ts",
      "autoPaperDemoCycleTypes.ts",
      "buildPaperDemoDailyReport.ts",
      "runAutoPaperDemoCycle.ts",
      "index.ts"
    ]
  },
  {
    sourceRoot: path.join(projectRoot, "src", "lib", "validationChain"),
    targetRoot: path.join(outRoot, "validationChain"),
    sourceFiles: ["validationChainTypes.ts", "buildValidationChain.ts", "validationChainStore.ts"]
  }
];

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  for (const moduleConfig of modules) {
    fs.mkdirSync(moduleConfig.targetRoot, { recursive: true });
    for (const file of moduleConfig.sourceFiles) {
      const sourcePath = path.join(moduleConfig.sourceRoot, file);
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
        .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
        .replace(/from\s+"\.\.\/validationChain\/([^"]+)"/g, 'from "./validationChain/$1.mjs"')
        .replace(/from\s+'\.\.\/validationChain\/([^']+)'/g, "from './validationChain/$1.mjs'");
      fs.writeFileSync(path.join(moduleConfig.targetRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
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

const source = {
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

const validationChain = {
  researchOnly: true,
  recognitionId: "recognition_cmd_1",
  recognitionType: "full_model",
  setupLabel: "CMD paper watchlist",
  candidateFamily: "known_model",
  requiredValidation: "replay_walk_forward_evidence_maturity",
  symbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "5m",
  htfContext: ["15m", "1h", "4h"],
  sourceFingerprint: source.sourceFingerprint,
  sourceStatus: {
    sourceProvider: "mt5_read_only",
    isMockOrSample: false,
    isResearchActive: true,
    statusLabel: "MT5 read-only research active"
  },
  hypothesisStatus: "walk_forward_passed",
  replayResult: {
    generatedAt: "2026-06-11T12:00:00.000Z",
    verdict: "passed",
    reason: "Replay passed."
  },
  walkForwardResult: {
    generatedAt: "2026-06-11T12:05:00.000Z",
    verdict: "needs_more_data",
    warningFlags: ["small_sample"],
    reason: "Needs more data but not failed."
  },
  evidenceQuality: {
    generatedAt: "2026-06-11T12:10:00.000Z",
    evidenceQualityScore: 64,
    maturityScore: 61,
    detail: "Evidence and maturity summaries present."
  },
  paperDemoChecklistImpact: "checklist_present",
  nextAction: "Monitor manually.",
  blockers: [],
  createdAt: "2026-06-11T12:00:00.000Z",
  updatedAt: "2026-06-11T12:10:00.000Z",
  executionIntent: "none",
  authority: authorityNone,
  safety: {
    rawCandlesExcluded: true,
    rawSnapshotsExcluded: true,
    accountDataExcluded: true,
    orderDataExcluded: true,
    positionDataExcluded: true,
    secretsExcluded: true
  }
};

async function main() {
  compileForNode();
  installLocalStorage();
  const mod = await import(pathToFileURL(path.join(outRoot, "index.mjs")).href);

  const eligibleCandidate = mod.buildPaperDemoCandidateFromContext({
    source,
    validationChain,
    checklist: {
      paperDemoCandidate: false
    },
    timestamp: "2026-06-11T12:30:00.000Z"
  });
  const eligibility = mod.buildPaperDemoEligibility(eligibleCandidate);
  assert.equal(eligibility.eligible, true, "eligible candidate should pass with warning");
  assert.equal(eligibility.status, "eligible_with_warning");
  assert.match(eligibility.warnings.join(" "), /more data|CFD\/proxy/i);

  const mockCandidate = mod.buildPaperDemoCandidateFromContext({
    source: { ...source, sourceProvider: "mock", sourceStatus: "mock_sample", isMockOrSample: true },
    validationChain,
    checklist: { paperDemoCandidate: false }
  });
  assert.equal(mod.buildPaperDemoEligibility(mockCandidate).eligible, false, "mock/sample source must be blocked");

  const missingChainCandidate = mod.buildPaperDemoCandidateFromContext({
    source,
    checklist: { paperDemoCandidate: false }
  });
  assert.equal(mod.buildPaperDemoEligibility(missingChainCandidate).eligible, false, "missing validation chain blocks candidate");
  assert.match(mod.buildPaperDemoEligibility(missingChainCandidate).blockers.join(" "), /Validation chain/i);

  const unsafeCandidate = { ...eligibleCandidate, authority: { ...authorityNone, executionAuthority: "trade" } };
  assert.equal(mod.buildPaperDemoEligibility(unsafeCandidate).eligible, false, "unsafe authority blocks candidate");

  const watchlistCandidate = mod.toPaperDemoWatchlistStatus(eligibleCandidate);
  assert.equal(watchlistCandidate.status, "watchlist");
  assert.equal(watchlistCandidate.executionIntent, "none");
  assert.deepEqual(watchlistCandidate.authority, authorityNone);

  let state = mod.upsertPaperDemoCandidate(watchlistCandidate);
  assert.equal(state.candidates.length, 1);
  state = mod.updatePaperDemoCandidateStatus(watchlistCandidate.id, "monitoring");
  assert.equal(state.candidates[0].status, "monitoring");
  assert.equal(state.candidates[0].executionIntent, "none");

  const checklist = mod.latestPaperDemoDailyChecklist(state);
  assert.equal(checklist.items.length, 11);
  state = mod.savePaperDemoDailyChecklist({
    ...checklist,
    items: checklist.items.map((item, index) => ({ ...item, completed: index < 2 }))
  });
  assert.equal(mod.latestPaperDemoDailyChecklist(state).items.filter((item) => item.completed).length, 2);

  state = mod.appendPaperDemoSessionJournalEntry({
    id: "journal_1",
    createdAt: "2026-06-11T13:00:00.000Z",
    symbol: "MNQ",
    setup: "CMD paper watchlist",
    observation: "Manual research note only.",
    watchedCondition: "Watch for validation continuation.",
    invalidation: "Invalid if structure breaks.",
    evidenceNeeded: "More OOS samples.",
    operatorConfidence: "medium",
    researchOnly: true,
    authority: authorityNone
  });
  assert.equal(state.journalEntries.length, 1);

  const report = mod.buildPaperDemoReport(state);
  assert.equal(report.monitoringCount, 1);
  assert.equal(report.authority.executionAuthority, "none");
  assert.match(mod.formatPaperDemoReport(report), /Research-only paper-demo operations/i);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /rawCandles|"candles"\s*:|rawRuntimeSnapshot|apiKey|token|password/i);
  assert.doesNotMatch(serialized, /account(Data|Number)?|order(Data|Id|Route)?|position(Data|Id)?/i);
  assert.doesNotMatch(serialized, /executionAuthority":"(?!none)/i);

  assert.throws(
    () =>
      mod.savePaperDemoOperationsState({
        ...state,
        candidates: [{ ...watchlistCandidate, rawCandles: [{ close: 1 }] }]
      }),
    /unsafe raw payload/i,
    "raw candle-like fields must be rejected before storage"
  );

  console.log("Paper-Demo Operations tests passed.");
  console.log(
    JSON.stringify(
      {
        eligibleStatus: eligibility.status,
        candidates: report.candidateCount,
        monitoring: report.monitoringCount,
        checklist: report.checklistStatus,
        authority: report.authority,
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
