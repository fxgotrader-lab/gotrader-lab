#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const advisorViewPath = path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx");
const outRoot = path.join(projectRoot, ".gotrader", "research-advisor-stability-test");

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safety = {
  rawCandlesExcluded: true,
  rawSnapshotsExcluded: true,
  accountDataExcluded: true,
  orderDataExcluded: true,
  positionDataExcluded: true,
  secretsExcluded: true
};

function compileForNode(files) {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
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
    const rewritten = transpiled
      .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

function installWindow(localStorage) {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.window = {
    localStorage,
    dispatchEvent: () => true
  };
}

const malformedThrowingStorage = () => ({
  getItem: () => "{malformed_json",
  setItem: () => {
    throw new Error("localStorage quota exceeded");
  },
  removeItem: () => {
    throw new Error("localStorage remove blocked");
  }
});

const validCompactReport = () => ({
  reportId: "stability_report_fixture",
  title: "Research Advisor Stability Fixture",
  source: "manual_replay_review",
  generatedAt: "2026-06-05T18:00:00.000Z",
  savedAt: "2026-06-05T18:01:00.000Z",
  researchOnly: true,
  summary: {
    requestedSymbols: ["MNQ"],
    brokerSymbols: ["USTECH"],
    primaryTimeframe: "5m",
    htfTimeframes: ["15m", "1h"],
    totalSignals: 0,
    approvedCount: 0,
    watchlistCount: 0,
    rejectedCount: 0,
    noTradeCount: 0,
    targetFirstRate: 0,
    approvedTargetFirstRate: 0,
    averageRr: 0,
    approvedAverageRr: 0
  },
  sections: [
    {
      heading: "Safety",
      items: [
        { label: "Research Only", value: true },
        { label: "Authority", value: "none/none/none" }
      ]
    }
  ],
  notes: ["Compact stability fixture."],
  authority,
  safety,
  provenance: {
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: "2026-06-05T18:00:00.000Z"
  }
});

function assertAdvisorViewSource() {
  const source = fs.readFileSync(advisorViewPath, "utf8");
  assert.match(source, /ResearchPanelErrorBoundary/, "Research Advisor should have a local panel error boundary");
  assert.match(source, /Panel unavailable\. See console\/logs\. Research safety preserved\./, "Panel fallback should be visible and safety-preserving");
  assert.match(source, /deepResearchActionRunning/, "Manual actions should share an in-flight guard");
  assert.match(source, /disabled=\{deepResearchActionRunning/, "Deep panels should receive disabled state while another action runs");
  assert.match(source, /Replay report save failed/, "Replay report save should fail gracefully");
  assert.match(source, /Scorecard report save failed/, "Scorecard report save should fail gracefully");
  assert.match(source, /safeList/, "Advisor render should guard list-shaped values");
  assert.match(source, /safeCount/, "Advisor render should guard numeric counts");
  assert.doesNotMatch(
    source,
    /<Button[^>]*>\s*(Place Order|Buy Market|Sell Market|Enable Live Trading|Connect Live Broker)/i,
    "Research Advisor must not expose execution controls"
  );
  assert.match(source, /saveIctResearchReport\(buildManualReplayResearchReport\(manualReplayResult\)\)/, "Replay report save should use the compact report builder");
  assert.match(source, /saveIctResearchReport\(buildMarketScorecardResearchReport\(marketScorecard\)\)/, "Scorecard report save should use the compact report builder");
}

async function assertReportPersistenceFailsSafely() {
  const reports = await import(pathToFileURL(path.join(outRoot, "ictResearchReport.mjs")));
  const circular = { reportId: "circular_report" };
  circular.self = circular;

  installWindow(malformedThrowingStorage());
  assert.equal(reports.listIctResearchReports().length, 0, "Malformed saved reports should return an empty list");
  const circularSave = reports.saveIctResearchReport(circular);
  assert.equal(circularSave.status, "failed", "Circular report input should fail without throwing");
  assert.equal(circularSave.researchOnly, true, "Failed save result should remain research-only");

  const throwingSave = reports.saveIctResearchReport(validCompactReport());
  assert.equal(throwingSave.status, "failed", "Unavailable localStorage should return a failed save result");
  assert.equal(throwingSave.researchOnly, true, "Storage failure result should remain research-only");

  const compact = reports.assertIctResearchReportOutputIsCompact({ report: validCompactReport() });
  assert.equal(compact.ok, true, "Compact report fixture should pass safety checks");
}

async function assertLatestResearchStateFailsSafely() {
  const latest = await import(pathToFileURL(path.join(outRoot, "ictLatestResearchState.mjs")));
  installWindow(malformedThrowingStorage());

  assert.equal(latest.readLatestResearchState(), undefined, "Malformed latest-state storage should not throw");
  const savedState = latest.saveLatestResearchStatePatch(
    {
      latestReplay: {
        generatedAt: "2026-06-05T18:05:00.000Z",
        requestedSymbol: "MNQ",
        brokerSymbol: "USTECH",
        primaryTimeframe: "5m",
        totalSignals: 0,
        targetFirstRate: 0,
        approvedTargetFirstRate: 0,
        averageRrAchieved: 0,
        approvedAverageRr: 0,
        researchOnly: true
      }
    },
    "manual_replay_review"
  );
  assert.equal(savedState.researchOnly, true, "Latest-state patch should preserve research-only");
  assert.equal(savedState.authority.executionAuthority, "none", "Latest-state patch should preserve execution authority none");
  assert.equal(latest.assertIctLatestResearchStateIsCompact(savedState).ok, true, "Latest-state patch must remain compact");
  assert.doesNotThrow(() => latest.clearLatestResearchState(), "Clearing latest state should not throw if storage remove fails");
}

async function main() {
  compileForNode([
    "ictResearchReportTypes.ts",
    "ictResearchReport.ts",
    "ictLatestResearchStateTypes.ts",
    "ictLatestResearchState.ts"
  ]);
  assertAdvisorViewSource();
  await assertReportPersistenceFailsSafely();
  await assertLatestResearchStateFailsSafely();

  process.stdout.write("Research Advisor stability smoke test passed.\n");
  process.stdout.write("Manual actions: guarded/non-overlapping.\n");
  process.stdout.write("Storage failures: handled without throwing into React.\n");
  process.stdout.write(`Authority: ${authority.executionAuthority}/${authority.brokerAuthority}/${authority.readinessOverrideAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`Research Advisor stability smoke test failed: ${error?.stack ?? error?.message ?? error}\n`);
  process.exitCode = 1;
});
