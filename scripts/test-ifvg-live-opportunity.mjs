#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const outRoot = path.join(projectRoot, ".gotrader", "ifvg-live-opportunity-test");
const sourceFiles = [
  {
    root: path.join(projectRoot, "src", "lib", "currentOpportunity"),
    files: ["currentOpportunityTypes.ts", "buildCurrentOpportunityContext.ts", "detectCurrentOpportunities.ts"]
  },
  {
    root: path.join(projectRoot, "src", "lib", "ict-strategy-suite"),
    files: ["ictTradeConstructionTypes.ts", "ictTradeConstruction.ts"]
  },
  {
    root: path.join(projectRoot, "src", "lib", "validationChain"),
    files: ["validationChainTypes.ts", "buildValidationChain.ts"]
  }
];

function compileForNode() {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const group of sourceFiles) {
    for (const file of group.files) {
      const sourcePath = path.join(group.root, file);
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
        .replace(/from\s+"..\/ict-strategy-suite\/([^"]+)"/g, 'from "./$1.mjs"')
        .replace(/from\s+'..\/ict-strategy-suite\/([^']+)'/g, "from './$1.mjs'");
      fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
    }
  }
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const basePacket = {
  generatedAt: "2026-06-14T14:30:00.000Z",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  htfTimeframes: ["15m", "1h", "4h", "1d"],
  activeSource: {
    provider: "mt5_read_only",
    candleCount: 17799,
    sourceFingerprint: "mt5|MNQ|USTECH|5m|17799|88.95d",
    sourceLabel: "MT5 read-only USTECH",
    sourceStatus: {
      isMockOrSample: false,
      isResearchActive: true,
      isProxyInstrument: true,
      statusLabel: "MT5 read-only research active"
    }
  },
  marketAnalysisContext: {
    analysisDepthStatus: "sufficient",
    analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
    missingTimeframes: [],
    analysisTimeframes: [
      { timeframe: "M5", candleCount: 17799, availableLookbackDays: 88.95 },
      { timeframe: "M15", candleCount: 5933, availableLookbackDays: 88.95 },
      { timeframe: "H1", candleCount: 1484, availableLookbackDays: 88.95 },
      { timeframe: "H4", candleCount: 371, availableLookbackDays: 88.95 },
      { timeframe: "D1", candleCount: 90, availableLookbackDays: 88.95 }
    ]
  },
  compactSummary: {
    analysisDepthStatus: "sufficient",
    availableLookbackDays: 88.95,
    analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
    weeklyBiasDirection: "bearish",
    htfAlignment: {
      alignmentStatus: "aligned",
      conflictReason: ""
    }
  },
  recommendedSignal: {
    setup: "IFVG filtered v2 - clean retest displacement",
    side: "short",
    confidence: 0.68,
    summary: "Filtered IFVG v2 clean retest with displacement confirmation.",
    noTradeReasons: [],
    entryZone: {
      low: 30505,
      high: 30515,
      midpoint: 30510,
      type: "ifvg_retest"
    },
    target: 30440,
    invalidation: 30540,
    rrEstimate: 2.33
  },
  approvedProfileDecision: { status: "watchlist" }
};

const validIfvgRead = {
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "5m",
  packetSource: "live_mt5",
  dataStatus: "ready",
  candleCount: 17799,
  side: "short",
  bestSetup: "IFVG filtered v2 - clean retest displacement",
  modelQualityLane: "paper_watchlist",
  modelName: "ifvg_filtered_v2_research",
  modelState: "candidate",
  opportunityDetected: true,
  opportunityType: "filtered_ifvg_clean_retest_displacement",
  opportunityStage: "candidate",
  opportunityQuality: "high",
  opportunityDirection: "bearish",
  opportunityNextAction: "Queue replay validation.",
  opportunityMissingEvidence: [],
  opportunityBlockers: [],
  topReasons: [
    "IFVG full inversion confirmed.",
    "Clean retest respected the inverted FVG.",
    "Displacement confirmation after retest.",
    "External liquidity target defined."
  ],
  analysisTimeframesUsed: ["W1", "D1", "H4", "H1", "M15", "M5"],
  missingTimeframes: [],
  analysisDepthStatus: "sufficient",
  availableLookbackDays: 88.95,
  htfAlignment: {
    alignmentStatus: "aligned",
    conflictReason: ""
  },
  weeklyBiasDirection: "bearish",
  sessionNarrativeProfile: "ny_open_delivery",
  sessionDirectionalRead: "bearish",
  fvgStatus: "IFVG full inversion clean retest respected",
  displacementStatus: "bearish displacement confirmation",
  liquiditySwept: "buyside sweep before IFVG inversion",
  drawOnLiquidity: "external sell-side liquidity",
  entryZone: "30505-30515",
  target: 30440,
  invalidation: 30540,
  rrEstimate: 2.33,
  confidence: 0.68,
  debug: {
    lastEvaluationAt: "2026-06-14T14:30:00.000Z",
    sourceFingerprint: "mt5|MNQ|USTECH|5m|17799|88.95d"
  }
};

const assertSafe = (scan) => {
  assert.equal(scan.researchOnly, true);
  assert.equal(scan.authority.executionAuthority, "none");
  assert.equal(scan.authority.brokerAuthority, "none");
  assert.equal(scan.authority.readinessOverrideAuthority, "none");
  const serialized = JSON.stringify(scan);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);
  assert.doesNotMatch(serialized, /"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:/i);
  assert.doesNotMatch(serialized, /"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:|"mt5Credentials"\s*:/i);
};

const findIfvg = (scan) => scan.opportunities.find((item) => item.strategyId === "ifvg_filtered_v2_research");

async function main() {
  compileForNode();
  const contextBuilder = await import(pathToFileURL(path.join(outRoot, "buildCurrentOpportunityContext.mjs")).href);
  const detector = await import(pathToFileURL(path.join(outRoot, "detectCurrentOpportunities.mjs")).href);
  const current = { ...contextBuilder, ...detector };
  const validation = await import(pathToFileURL(path.join(outRoot, "buildValidationChain.mjs")).href);

  const validContext = current.buildCurrentOpportunityContext({ packet: basePacket, currentRead: validIfvgRead });
  const validScan = current.detectCurrentOpportunities(validContext);
  const validIfvg = findIfvg(validScan);
  assert.ok(validIfvg, "IFVG filtered v2 opportunity should be emitted");
  assert.equal(validIfvg.status, "valid_candidate");
  assert.equal(validIfvg.setupName, "IFVG filtered v2 - clean retest displacement");
  assert.deepEqual(validIfvg.requiredValidation, [
    "replay_required",
    "walk_forward_required",
    "evidence_required",
    "paper_demo_gate_required"
  ]);
  assert.equal(validIfvg.executionIntentCreated, false);
  assert.equal(validIfvg.authority.executionAuthority, "none");
  assert.match(validIfvg.nextAction, /Queue replay validation/i);
  assert.equal(validScan.summary.validCandidateCount > 0, true);
  assertSafe(validScan);

  const queued = validation.queueValidationChainEntry({
    recognitionId: "ifvg_filtered_v2_live_test",
    recognitionType: "full_model",
    setupLabel: validIfvg.setupName,
    symbol: validIfvg.symbol,
    brokerSymbol: validIfvg.brokerSymbol,
    timeframe: validIfvg.timeframe,
    htfContext: validIfvg.contextTimeframes,
    sourceFingerprint: validScan.summary.sourceFingerprint,
    sourceStatus: {
      sourceProvider: validScan.summary.sourceProvider,
      isMockOrSample: false,
      isResearchActive: true,
      statusLabel: "MT5 read-only research active"
    },
    generatedAt: validScan.generatedAt
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.entry.hypothesisStatus, "replay_required");
  assert.equal(queued.entry.candidateFamily, "ifvg");
  assert.equal(queued.entry.sourceFingerprint, basePacket.activeSource.sourceFingerprint);
  assert.match(queued.entry.nextAction, /IFVG filtered v2/i);
  assert.match(queued.entry.paperDemoChecklistImpact, /Blocked for Paper-Demo/i);
  assert.equal(queued.entry.executionIntent, "none");
  assert.deepEqual(queued.entry.authority, authorityNone);

  const noRetestScan = current.detectCurrentOpportunities(
    current.buildCurrentOpportunityContext({
      packet: basePacket,
      currentRead: {
        ...validIfvgRead,
        fvgStatus: "IFVG full inversion no clean retest",
        topReasons: ["IFVG full inversion detected.", "no_clean_retest"],
        opportunityMissingEvidence: ["no_clean_retest"]
      }
    })
  );
  const noRetest = findIfvg(noRetestScan);
  assert.equal(noRetest.status, "forming");
  assert.ok(noRetest.missingConditions.includes("no_clean_retest"));
  assert.match(noRetest.nextAction, /clean IFVG retest/i);
  assertSafe(noRetestScan);

  const noDisplacementScan = current.detectCurrentOpportunities(
    current.buildCurrentOpportunityContext({
      packet: basePacket,
      currentRead: {
        ...validIfvgRead,
        displacementStatus: "missing_displacement",
        topReasons: ["IFVG clean retest present.", "no_displacement_confirmation"],
        opportunityMissingEvidence: ["no_displacement_confirmation"]
      }
    })
  );
  const noDisplacement = findIfvg(noDisplacementScan);
  assert.equal(noDisplacement.status, "forming");
  assert.ok(noDisplacement.missingConditions.includes("no_displacement_confirmation"));
  assert.match(noDisplacement.nextAction, /displacement confirmation/i);
  assertSafe(noDisplacementScan);

  const missingTargetPacket = {
    ...basePacket,
    recommendedSignal: {
      ...basePacket.recommendedSignal,
      target: undefined,
      rrEstimate: undefined
    }
  };
  const missingTargetScan = current.detectCurrentOpportunities(
    current.buildCurrentOpportunityContext({
      packet: missingTargetPacket,
      currentRead: {
        ...validIfvgRead,
        target: undefined,
        rrEstimate: undefined
      }
    })
  );
  const missingTarget = findIfvg(missingTargetScan);
  assert.equal(missingTarget.status, "near_miss");
  assert.ok(missingTarget.missingConditions.includes("target_missing"));
  assert.ok(missingTarget.missingConditions.includes("rr_unavailable"));
  assert.equal(missingTarget.blockers.includes("target_too_close"), false);
  assert.match(missingTarget.nextAction, /draw-on-liquidity target/i);
  assertSafe(missingTargetScan);

  const mockPacket = {
    ...basePacket,
    activeSource: {
      ...basePacket.activeSource,
      provider: "mock",
      sourceFingerprint: "mock|sample",
      sourceStatus: {
        isMockOrSample: true,
        isResearchActive: false,
        isProxyInstrument: false,
        statusLabel: "mock/sample"
      }
    }
  };
  const mockScan = current.detectCurrentOpportunities(
    current.buildCurrentOpportunityContext({
      packet: mockPacket,
      currentRead: {
        ...validIfvgRead,
        packetSource: "mock",
        debug: {
          ...validIfvgRead.debug,
          sourceFingerprint: "mock|sample"
        }
      }
    })
  );
  const mockIfvg = findIfvg(mockScan);
  assert.equal(mockIfvg.status, "rejected");
  assert.ok(mockIfvg.blockers.some((blocker) => /mock\/sample|source_mock_sample/i.test(blocker)));
  assert.equal(mockScan.summary.validCandidateCount, 0);
  assertSafe(mockScan);

  const compactAdvisorPayload = {
    currentOpportunitySummary: validScan.summary,
    currentOpportunityTop: {
      strategyId: validIfvg.strategyId,
      setupName: validIfvg.setupName,
      status: validIfvg.status,
      nextAction: validIfvg.nextAction
    }
  };
  assert.doesNotMatch(JSON.stringify(compactAdvisorPayload), /"candles"\s*:|"rawCandles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i);

  console.log(JSON.stringify({
    ok: true,
    validIfvg: {
      status: validIfvg.status,
      requiredValidation: validIfvg.requiredValidation,
      nextAction: validIfvg.nextAction
    },
    validationChain: {
      candidateFamily: queued.entry.candidateFamily,
      hypothesisStatus: queued.entry.hypothesisStatus,
      paperDemoChecklistImpact: queued.entry.paperDemoChecklistImpact
    },
    forming: {
      noRetest: noRetest.missingConditions,
      noDisplacement: noDisplacement.missingConditions
    },
    missingTarget: missingTarget.missingConditions,
    mockStatus: mockIfvg.status,
    authority: authorityNone
  }, null, 2));
}

main().catch((error) => {
  console.error("IFVG live opportunity tests failed:", error);
  process.exitCode = 1;
});
