#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-multi-timeframe-context-test");

const sourceFiles = [
  "ictMarketAnalysisContextTypes.ts",
  "ictMarketAnalysisContext.ts"
];

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
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
      .replace(/from\s+"..\/integrations\/mt5\/mt5ReadOnlyClient"/g, 'from "./mt5ReadOnlyClientStub.mjs"')
      .replace(/from\s+'..\/integrations\/mt5\/mt5ReadOnlyClient'/g, "from './mt5ReadOnlyClientStub.mjs'")
      .replace(/from\s+"..\/integrations\/mt5\/mt5ReadOnlyDepth"/g, 'from "./mt5ReadOnlyDepthStub.mjs"')
      .replace(/from\s+'..\/integrations\/mt5\/mt5ReadOnlyDepth'/g, "from './mt5ReadOnlyDepthStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(
    path.join(outRoot, "mt5ReadOnlyClientStub.mjs"),
    `export async function fetchMt5ReadOnlyCandles() { throw new Error("test should inject display fetch"); }
export async function fetchMt5CandlesInChunks() { throw new Error("test should inject chunked fetch"); }
`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(outRoot, "mt5ReadOnlyDepthStub.mjs"),
    `export function calculateAvailableLookbackDays({ firstTimestamp, lastTimestamp } = {}) {
  if (!firstTimestamp || !lastTimestamp) return 0;
  return Math.max(0, (new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()) / 86400000);
}
export function summarizeHistoryDepth(input) {
  const candles = Array.isArray(input.candles) ? input.candles : [];
  const firstTimestamp = candles[0]?.timestamp;
  const lastTimestamp = candles[candles.length - 1]?.timestamp;
  const availableLookbackDays = firstTimestamp && lastTimestamp
    ? Math.max(0, (new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime()) / 86400000)
    : 0;
  const dataDepthStatus = candles.length && availableLookbackDays >= (input.requestedLookbackDays ?? 90) * 0.8
    ? "sufficient"
    : candles.length
      ? "limited"
      : "unavailable";
  return {
    provider: "mt5_read_only",
    requestedSymbol: input.requestedSymbol,
    brokerSymbol: input.brokerSymbol,
    timeframe: input.timeframe,
    requestedLookbackDays: input.requestedLookbackDays,
    availableLookbackDays,
    returnedCount: candles.length,
    candleCount: candles.length,
    chunkCount: input.chunkCount ?? 0,
    firstTimestamp,
    lastTimestamp,
    firstCandleTime: firstTimestamp,
    lastCandleTime: lastTimestamp,
    depthStatus: dataDepthStatus,
    dataDepthStatus,
    chunkingStatus: input.chunkingStatus ?? "unavailable",
    limitationReason: input.limitationReason,
    warnings: input.limitationReason ? [input.limitationReason] : [],
    missingEvidence: input.limitationReason ? [input.limitationReason] : [],
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    },
    safety: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false
    }
  };
}
`,
    "utf8"
  );
}

const candle = (timeframe, index, timestamp) => ({
  id: `${timeframe}_${index}`,
  time: timestamp,
  timestamp,
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  tickVolume: 1000 + index,
  volume: 1000 + index
});

const compactSummary = ({ count, timeframe }) => ({
  provider: "mt5_read_only",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe,
  requestedLookbackDays: 90,
  availableLookbackDays: 88.95,
  returnedCount: count,
  candleCount: count,
  chunkCount: Math.max(1, Math.ceil(count / 5000)),
  firstTimestamp: "2026-03-01T00:00:00.000Z",
  lastTimestamp: "2026-06-07T00:00:00.000Z",
  firstCandleTime: "2026-03-01T00:00:00.000Z",
  lastCandleTime: "2026-06-07T00:00:00.000Z",
  depthStatus: "sufficient",
  dataDepthStatus: "sufficient",
  chunkingStatus: "chunked",
  limitationReason: undefined,
  warnings: [],
  missingEvidence: [],
  authority: {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  },
  safety: {
    rawCandlesIncluded: false,
    rawSnapshotsIncluded: false,
    secretsIncluded: false,
    accountDataIncluded: false,
    orderDataIncluded: false,
    positionDataIncluded: false
  }
});

async function main() {
  compileForNode();
  const contextModule = await import(pathToFileURL(path.join(outRoot, "ictMarketAnalysisContext.mjs")));
  const displayRequests = [];
  const historyRequests = [];
  const fetchDisplayCandles = async (request) => {
    displayRequests.push(request);
    return {
      candles: Array.from({ length: 1200 }, (_, index) => candle(request.timeframe, index, new Date(Date.UTC(2026, 5, 1, 0, index)).toISOString())),
      warnings: ["MT5 read-only CFD/proxy source; no execution authority."]
    };
  };
  const fetchChunkedHistory = async (request) => {
    historyRequests.push(request);
    const countByTimeframe = {
      "1w": 14,
      "1d": 67,
      "4h": 534,
      "1h": 2136,
      "15m": 7119,
      "5m": 17799
    };
    const count = countByTimeframe[request.timeframe] ?? 0;
    return {
      candles: Array.from({ length: count }, (_, index) => candle(request.timeframe, index, new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString())),
      chunks: [{ sourceMethod: `test_range_${request.timeframe}` }],
      summary: compactSummary({ count, timeframe: request.timeframe })
    };
  };

  const bundle = await contextModule.buildIctMarketAnalysisContextBundle(
    {
      brokerSymbol: "USTECH",
      chartDisplayLimit: 1000,
      displayTimeframe: "1m",
      lookbackDays: 90,
      requestedSymbol: "MNQ"
    },
    {
      fetchDisplayCandles,
      fetchChunkedHistory
    }
  );

  assert.equal(displayRequests.length, 1, "display candles should be fetched once");
  assert.equal(displayRequests[0].timeframe, "1m", "selected timeframe is display/reference only");
  assert.deepEqual(
    historyRequests.map((request) => request.timeframe).sort(),
    ["1d", "1h", "1w", "4h", "15m", "5m"].sort(),
    "Activate Market analysis should request all required analysis timeframes"
  );
  assert.equal(bundle.context.displayTimeframe, "1m");
  assert.equal(bundle.context.displayTimeframeRole, "chart_display_reference_only");
  assert.equal(bundle.context.chartDisplayCandleCount, 1000);
  assert.deepEqual(bundle.context.analysisTimeframesUsed, ["W1", "D1", "H4", "H1", "M15", "M5"]);
  assert.deepEqual(bundle.context.missingTimeframes, []);
  assert.equal(bundle.context.analysisDepthStatus, "sufficient");
  assert.deepEqual(bundle.context.htfBiasSource, ["W1", "D1", "H4", "H1"]);
  assert.equal(bundle.context.weeklyBiasStatus, "loaded");
  assert.equal(bundle.context.sessionModelSourceTimeframe, "M15");
  assert.equal(bundle.context.confirmationSourceTimeframe, "M5");
  assert.ok(bundle.analysisCandlesByTimeframe.M5.length > 5000, "raw analysis candles should stay internal to the bundle");
  assert.equal(contextModule.assertIctMarketAnalysisContextIsCompact(bundle.context).ok, true);
  assert.doesNotMatch(JSON.stringify(bundle.context), /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i);

  const advisorSource = fs.readFileSync(path.join(sourceRoot, "ictAdvisorEngine.ts"), "utf8");
  const pipelineSource = fs.readFileSync(path.join(sourceRoot, "ictActivateMarketPipeline.ts"), "utf8");
  const currentReadSource = fs.readFileSync(path.join(sourceRoot, "ictCurrentRead.ts"), "utf8");
  assert.match(advisorSource, /marketAnalysisContextBundle/, "advisor packet builder should accept explicit market analysis context");
  assert.match(advisorSource, /buildIctSessionNarrative\(sessionCandles/, "session narrative should use M15/session candles when available");
  for (const step of ["load_analysis_m5", "load_analysis_m15", "load_analysis_h1", "load_analysis_h4", "load_analysis_daily", "load_analysis_weekly"]) {
    assert.match(pipelineSource, new RegExp(step), `Activate Market should expose ${step}`);
  }
  assert.match(currentReadSource, /analysisTimeframesUsed/, "current read should expose analysis timeframes");
  assert.match(currentReadSource, /displayTimeframeRole/, "current read should label chart timeframe as display/reference only");

  const fallbackHistoryRequests = [];
  const fallbackBundle = await contextModule.buildIctMarketAnalysisContextBundle(
    {
      brokerSymbol: "USTECH",
      chartDisplayLimit: 1000,
      displayTimeframe: "5m",
      lookbackDays: 90,
      requestedSymbol: "MNQ"
    },
    {
      fetchDisplayCandles,
      fetchChunkedHistory: async (request) => {
        fallbackHistoryRequests.push(request);
        const countByTimeframe = {
          "1w": 0,
          "1d": 67,
          "4h": 534,
          "1h": 2136,
          "15m": 7119,
          "5m": 17799
        };
        const count = countByTimeframe[request.timeframe] ?? 0;
        return {
          candles: Array.from({ length: count }, (_, index) => candle(request.timeframe, index, new Date(Date.UTC(2026, 2, 1 + index, 0, 0)).toISOString())),
          chunks: [{ sourceMethod: `test_range_${request.timeframe}` }],
          summary: compactSummary({ count, timeframe: request.timeframe })
        };
      }
    }
  );
  const derivedWeekly = fallbackBundle.context.analysisTimeframes.find((context) => context.timeframe === "W1");
  assert.ok(fallbackHistoryRequests.some((request) => request.timeframe === "1w"), "native W1 should still be attempted first");
  assert.ok(derivedWeekly?.candleCount >= 2, "W1 context should derive from D1 when native weekly is unavailable");
  assert.equal(derivedWeekly?.sourceMethod, "derived_from_d1_chunked_history");
  assert.equal(fallbackBundle.context.weeklyBiasStatus, "loaded", "weekly bias should load from derived D1 weekly context");
  assert.ok(fallbackBundle.context.analysisTimeframesLoaded.includes("W1"), "derived W1 should count as loaded context");
  assert.equal(fallbackBundle.context.missingTimeframes.includes("W1"), false, "derived W1 should not remain missing");
  assert.doesNotMatch(JSON.stringify(fallbackBundle.context), /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:/i);

  console.log(JSON.stringify({
    status: "passed",
    displayTimeframe: bundle.context.displayTimeframe,
    analysisTimeframesUsed: bundle.context.analysisTimeframesUsed,
    analysisDepthStatus: bundle.context.analysisDepthStatus,
    nativeWeeklyFallback: {
      sourceMethod: derivedWeekly?.sourceMethod,
      weeklyBiasStatus: fallbackBundle.context.weeklyBiasStatus,
      weeklyBiasDirection: fallbackBundle.context.weeklyBiasDirection,
      candleCount: derivedWeekly?.candleCount
    },
    rawCandlesExposedInContext: false,
    authority: bundle.context.authority
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
