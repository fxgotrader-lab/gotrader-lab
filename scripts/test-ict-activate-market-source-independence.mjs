#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-activate-market-source-independence-test");

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  const sourcePath = path.join(sourceRoot, "ictActivateMarketSourceActivation.ts");
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
    .replace(/from\s+"@\/lib\/integrations\/mt5"/g, 'from "./mt5Stub.mjs"')
    .replace(/from\s+'@\/lib\/integrations\/mt5'/g, "from './mt5Stub.mjs'")
    .replace(/from\s+"@\/lib\/integrations\/mt5\/mt5MultiTimeframe"/g, 'from "./mt5MultiTimeframeStub.mjs"')
    .replace(/from\s+'@\/lib\/integrations\/mt5\/mt5MultiTimeframe'/g, "from './mt5MultiTimeframeStub.mjs'")
    .replace(/from\s+"@\/lib\/integrations\/mt5\/mt5SymbolSettings"/g, 'from "./mt5SymbolSettingsStub.mjs"')
    .replace(/from\s+'@\/lib\/integrations\/mt5\/mt5SymbolSettings'/g, "from './mt5SymbolSettingsStub.mjs'")
    .replace(/from\s+"@\/lib\/runtime"/g, 'from "./runtimeStub.mjs"')
    .replace(/from\s+'@\/lib\/runtime'/g, "from './runtimeStub.mjs'");
  fs.writeFileSync(path.join(outRoot, "ictActivateMarketSourceActivation.mjs"), rewritten, "utf8");
  fs.writeFileSync(
    path.join(outRoot, "mt5Stub.mjs"),
    `export function loadMt5ReadOnlySettings() { return {}; }
export function saveMt5ReadOnlySettings(settings) { return settings; }
export async function checkMt5ReadOnlyStatus() { throw new Error("test injects checkStatus"); }
export async function fetchMt5ReadOnlySymbols() { throw new Error("test injects fetchSymbols"); }
export async function fetchMt5ReadOnlyQuote() { throw new Error("test injects fetchQuote"); }
export async function fetchAndStoreMt5ReadOnlyCandleFeed() { throw new Error("test injects fetchCandleFeed"); }
`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(outRoot, "mt5MultiTimeframeStub.mjs"),
    `export async function fetchAndStoreMt5HigherTimeframeSources() { return []; }
`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(outRoot, "mt5SymbolSettingsStub.mjs"),
    `export function displayLabelForMt5Mapping({ brokerSymbol, displayLabel, requestedSymbol } = {}) {
  return displayLabel || (brokerSymbol && requestedSymbol ? requestedSymbol + " via " + brokerSymbol : "MNQ via USTECH");
}
export function sanitizeMt5ReadOnlyTimeframe(value) {
  return ["1m", "5m", "15m", "30m", "1h", "4h", "1d"].includes(value) ? value : "5m";
}
export function sanitizeMt5HigherTimeframes(values) {
  const allowed = new Set(["5m", "15m", "30m", "1h", "4h", "1d"]);
  const list = Array.isArray(values) ? values : ["15m", "1h"];
  const sanitized = list.map(String).filter((value) => allowed.has(value) && value !== "1m");
  return [...new Set(sanitized.length ? sanitized : ["15m", "1h"])];
}
`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(outRoot, "runtimeStub.mjs"),
    `export async function resolveResearchRuntimeSnapshot() { throw new Error("test injects resolveSnapshot"); }
`,
    "utf8"
  );
}

const settings = {
  bridgeUrl: "http://127.0.0.1:7341",
  enabled: false,
  requestedSymbol: "MNQ",
  brokerSymbolOverride: "USTECH",
  displayLabel: "MNQ via USTECH",
  timeframe: "5m",
  higherTimeframes: ["15m", "1h"],
  candleLimit: 1000
};

const safeFeed = (patch = {}) => ({
  feedId: "mt5_read_only:MNQ:USTECH:5m",
  provider: "mt5_read_only",
  dataMode: "mt5_read_only",
  activeForChart: true,
  activeForResearch: true,
  symbol: "USTECH",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "5m",
  requestedTimeframe: "5m",
  candles: [
    { timestamp: "2026-06-07T12:00:00.000Z", open: 1, high: 2, low: 1, close: 2, source: "mt5_read_only", symbol: "USTECH", timeframe: "5m" }
  ],
  candleCount: 1000,
  requestedLimit: 1000,
  returnedCount: 1000,
  firstTimestamp: "2026-06-01T00:00:00.000Z",
  lastTimestamp: "2026-06-07T12:00:00.000Z",
  latestClose: 28769.03,
  connectionStatus: "connected",
  depthStatus: "full",
  usageMode: "research_source",
  researchEligibility: {
    state: "eligible_for_research_cycle",
    reasons: [],
    visualEligible: true,
    quickAnalysisEligible: true,
    researchCycleEligible: true,
    walkForwardEligible: true,
    symbolMatch: true,
    timeframeMatch: true,
    monotonicTimestamps: true,
    candleCount: 1000,
    minimumVisualCandles: 50,
    minimumQuickAnalysisCandles: 120,
    minimumResearchCycleCandles: 240,
    minimumWalkForwardCandles: 500
  },
  sourceLabel: "MT5 read-only USTECH 5m",
  sourceMethod: "upstream_http:/api/v1/market/candles/latest",
  matchState: "equivalent_symbol",
  matchReason: "USTECH maps to MNQ research.",
  candleFingerprint: "mt5_ustech_5m_fingerprint",
  fetchedAt: "2026-06-07T12:00:00.000Z",
  storedAt: "2026-06-07T12:00:00.000Z",
  storageBackend: "indexeddb",
  candlesPersisted: true,
  storageWarnings: [],
  warnings: ["CFD/proxy data, read-only."],
  missingEvidence: [],
  ...authority,
  ...patch
});

const runtimeSnapshot = () => ({
  marketData: {
    activeResearchSource: {
      provider: "mt5_read_only",
      symbol: "MNQ",
      timeframe: "5m",
      candleCount: 1000,
      fingerprint: "mt5_ustech_5m_fingerprint",
      provenance: { providerSymbol: "USTECH" },
      authority
    }
  },
  mt5ReadOnly: {
    brokerSymbol: "USTECH",
    higherTimeframes: ["15m", "1h"]
  }
});

async function runHelperSuccessTest(module) {
  const calls = [];
  const result = await module.ensureMt5CanonicalResearchSource(
    { requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "5m", candleLimit: 1000, higherTimeframes: ["15m", "1h"] },
    {
      loadSettings: () => settings,
      saveSettings: (nextSettings) => {
        calls.push(["saveSettings", nextSettings]);
        return { ...settings, ...nextSettings };
      },
      checkStatus: async () => {
        calls.push(["checkStatus"]);
        return { provider: "mt5_read_only", connectionStatus: "connected", message: "connected", warnings: [], ...authority };
      },
      fetchSymbols: async () => {
        calls.push(["fetchSymbols"]);
        return { provider: "mt5_read_only", connectionStatus: "connected", symbols: ["USTECH"], warnings: [], missingEvidence: [], ...authority };
      },
      fetchQuote: async () => {
        calls.push(["fetchQuote"]);
        return { provider: "mt5_read_only", symbol: "USTECH", requestedSymbol: "MNQ", brokerSymbol: "USTECH", mid: 28769.03, connectionStatus: "connected", warnings: [], missingEvidence: [], ...authority };
      },
      fetchCandleFeed: async (request) => {
        calls.push(["fetchCandleFeed", request]);
        return safeFeed();
      },
      fetchHigherTimeframes: async (request) => {
        calls.push(["fetchHigherTimeframes", request]);
        return [
          { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "15m", candleCount: 1000, fingerprint: "m15", eligibilityState: "eligible_for_research_cycle" },
          { provider: "mt5_read_only", requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "1h", candleCount: 1000, fingerprint: "h1", eligibilityState: "eligible_for_research_cycle" }
        ];
      },
      resolveSnapshot: async () => {
        calls.push(["resolveSnapshot"]);
        return runtimeSnapshot();
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "activated");
  assert.equal(result.source.provider, "mt5_read_only");
  assert.equal(result.source.requestedSymbol, "MNQ");
  assert.equal(result.source.brokerSymbol, "USTECH");
  assert.equal(result.source.activeForChart, true);
  assert.equal(result.source.activeForResearch, true);
  assert.equal(result.source.sourceFingerprint, "mt5_ustech_5m_fingerprint");
  assert.deepEqual(result.higherTimeframes.loadedTimeframes.sort(), ["15m", "1h"].sort());
  assert.equal(result.snapshot.marketData.activeResearchSource.provider, "mt5_read_only");
  assert.deepEqual(result.authority, authority);
  assert.equal(result.safety.rawCandlesExcluded, true);
  assert.doesNotMatch(JSON.stringify(result), /"candles"\s*:|"rawSnapshot"\s*:|"account"\s*:|"order"\s*:|"position"\s*:|"password"\s*:|"secret"\s*:/i);
  assert.deepEqual(calls.map(([name]) => name), [
    "saveSettings",
    "checkStatus",
    "fetchSymbols",
    "fetchQuote",
    "fetchCandleFeed",
    "fetchHigherTimeframes",
    "resolveSnapshot"
  ]);
}

async function runHelperBlockedTest(module) {
  const result = await module.ensureMt5CanonicalResearchSource(
    { requestedSymbol: "MNQ", brokerSymbol: "USTECH", timeframe: "5m", candleLimit: 1000 },
    {
      loadSettings: () => settings,
      saveSettings: (nextSettings) => ({ ...settings, ...nextSettings }),
      checkStatus: async () => ({ provider: "mt5_read_only", connectionStatus: "connected", message: "connected", warnings: [], ...authority }),
      fetchSymbols: async () => ({ provider: "mt5_read_only", connectionStatus: "connected", symbols: ["USTECH"], warnings: [], missingEvidence: [], ...authority }),
      fetchQuote: async () => ({ provider: "mt5_read_only", symbol: "USTECH", requestedSymbol: "MNQ", brokerSymbol: "USTECH", mid: 28769.03, connectionStatus: "connected", warnings: [], missingEvidence: [], ...authority }),
      fetchCandleFeed: async () => safeFeed({
        activeForResearch: false,
        researchEligibility: {
          ...safeFeed().researchEligibility,
          state: "ineligible_low_candle_count",
          reasons: ["minimum research candle count not met"]
        }
      }),
      fetchHigherTimeframes: async () => [],
      resolveSnapshot: async () => runtimeSnapshot()
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.failedStep, "research_activation");
  assert.equal(result.source.provider, "mt5_read_only");
  assert.deepEqual(result.authority, authority);
  assert.doesNotMatch(JSON.stringify(result), /"candles"\s*:|"rawSnapshot"\s*:|"account"\s*:|"order"\s*:|"position"\s*:|"password"\s*:|"secret"\s*:/i);
}

function assertUiUsesSharedHelper() {
  const advisorSource = fs.readFileSync(path.join(projectRoot, "src", "components", "advisor", "ResearchAdvisorView.tsx"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(projectRoot, "src", "components", "dashboard", "MissionControlShell.tsx"), "utf8");
  assert.match(advisorSource, /ensureMt5CanonicalResearchSource/, "Research Advisor Activate Market should call the shared MT5 source helper");
  assert.match(dashboardSource, /ensureMt5CanonicalResearchSource/, "Dashboard Activate Market should call the shared MT5 source helper");
  assert.match(advisorSource, /const sourceActivation = await ensureMt5CanonicalResearchSource\(/, "Advisor should activate MT5 before running the pipeline");
  assert.match(dashboardSource, /const sourceActivation = await ensureMt5CanonicalResearchSource\(/, "Dashboard should activate MT5 through the same helper");
}

async function main() {
  compileForNode();
  const module = await import(pathToFileURL(path.join(outRoot, "ictActivateMarketSourceActivation.mjs")));
  await runHelperSuccessTest(module);
  await runHelperBlockedTest(module);
  assertUiUsesSharedHelper();
  console.log(JSON.stringify({
    status: "passed",
    helper: "ensureMt5CanonicalResearchSource",
    dashboardUsesSharedHelper: true,
    advisorUsesSharedHelper: true,
    rawCandlesExposed: false,
    authority
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
