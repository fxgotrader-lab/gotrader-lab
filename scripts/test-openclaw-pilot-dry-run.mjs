#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "openclawPilot");
const outRoot = path.join(projectRoot, ".gotrader", "openclaw-pilot-dry-run-test");
const sourceFiles = ["openclawPilotTypes.ts", "openclawProgram.ts", "openclawPilotDryRun.ts"];

function rewriteImports(source) {
  return source
    .replace(/from\s+"@\/lib\/openclawPilot\/([^"]+)"/g, 'from "./$1.mjs"')
    .replace(/from\s+'@\/lib\/openclawPilot\/([^']+)'/g, "from './$1.mjs'")
    .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
    .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'")
    .replace(/\.mjs\.mjs/g, ".mjs");
}

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
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewriteImports(transpiled), "utf8");
  }
}

const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const safePacket = () => ({
  packetId: "pilot_packet_safe_1",
  timestamp: "2026-06-11T17:30:00.000Z",
  source: "gotrader_ai_lab",
  sourceProvider: "mt5_read_only",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  sourceFingerprint: "mt5_read_only|MNQ|USTECH|5m|1000|first|last",
  compactSummary: "CMD research hypothesis needs replay validation before any paper-watchlist review.",
  selfImprovementProposalIntent: {
    createProposal: true,
    proposalTitle: "Review CMD paper-watchlist context",
    targetSubsystem: "ICT Strategy Suite",
    candidateFamilies: ["ict_hypothesis_validation"],
    requiresWalkForward: true,
    autoApplyAllowed: false
  },
  sourceContext: {
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    timeframe: "5m",
    candleCount: 1000,
    warning: "USTECH is CFD/proxy data for MNQ-style research.",
    authority: authorityNone
  },
  safety: {
    ...authorityNone,
    constraints: [
      "OpenClaw is advisory only.",
      "GoTrader deterministic gates own readiness.",
      "No raw market data is included."
    ]
  },
  excludedLargeSections: [
    "raw candles",
    "raw runtime snapshot",
    "account data",
    "order data",
    "position data",
    "secrets"
  ]
});

const cloneWith = (patch) => ({
  ...safePacket(),
  ...patch
});

const assertBlocked = (audit, pattern, label) => {
  assert.equal(audit.validationResult.valid, false, `${label} should fail validation`);
  assert.equal(audit.eventType, "dry_run_rejected");
  assert.ok(
    audit.validationResult.blockedFields.some((field) => pattern.test(field)),
    `${label} should include blocked field matching ${pattern}`
  );
  assert.deepEqual(audit.authority, authorityNone);
};

async function main() {
  compileForNode();
  const {
    loadOpenClawPilotProgram,
    validateOpenClawPilotProgram,
    summarizeOpenClawPilotProgram
  } = await import(pathToFileURL(path.join(outRoot, "openclawProgram.mjs")).href);
  const {
    runOpenClawPilotDryRun,
    validateOpenClawPilotDryRunPacket,
    openClawPilotDryRunAuditIsSafe
  } = await import(pathToFileURL(path.join(outRoot, "openclawPilotDryRun.mjs")).href);

  const program = loadOpenClawPilotProgram();
  const programValidation = validateOpenClawPilotProgram(program);
  assert.equal(programValidation.valid, true, programValidation.errors.join("; "));
  const programSummary = summarizeOpenClawPilotProgram(program);
  assert.equal(programSummary.authority.executionAuthority, "none");
  assert.equal(programSummary.autoApplyAllowed, false);
  assert.ok(programSummary.allowedProposalFamilies.includes("ict_hypothesis_validation"));
  assert.ok(programSummary.requiredValidationGates.includes("Walk-forward"));

  const safe = runOpenClawPilotDryRun(safePacket(), { timestamp: "2026-06-11T17:30:00.000Z" });
  assert.equal(safe.validationResult.valid, true);
  assert.equal(safe.validationResult.status, "passed");
  assert.equal(safe.eventType, "dry_run_passed");
  assert.equal(safe.requestedSymbol, "MNQ");
  assert.equal(safe.brokerSymbol, "USTECH");
  assert.equal(safe.sourceProvider, "mt5_read_only");
  assert.equal(safe.validationResult.autoApplyAllowed, false);
  assert.deepEqual(safe.authority, authorityNone);
  assert.equal(openClawPilotDryRunAuditIsSafe(safe), true);
  const safeSerialized = JSON.stringify(safe);
  assert.doesNotMatch(safeSerialized, /"candles"\s*:/i, "safe audit must not contain raw candle arrays");
  assert.doesNotMatch(safeSerialized, /super-secret|sk-test|password123/i, "safe audit must not contain secrets");

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        selfImprovementProposalIntent: {
          ...safePacket().selfImprovementProposalIntent,
          autoApplyAllowed: true
        }
      })
    ),
    /autoApply/i,
    "autoApplyAllowed true"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        safety: { ...authorityNone, executionAuthority: "paper", constraints: [] }
      })
    ),
    /executionAuthority_not_none/i,
    "executionAuthority non-none"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        safety: { ...authorityNone, brokerAuthority: "orders", constraints: [] }
      })
    ),
    /brokerAuthority_not_none/i,
    "brokerAuthority non-none"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        safety: { ...authorityNone, readinessOverrideAuthority: "allowed", constraints: [] }
      })
    ),
    /readinessOverrideAuthority_not_none/i,
    "readinessOverrideAuthority non-none"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        rawCandles: [{ timestamp: "2026-06-11T00:00:00Z", open: 1, high: 2, low: 0.5, close: 1.5 }],
        candles: [{ time: 1, open: 1, high: 2, low: 0, close: 1 }]
      })
    ),
    /rawCandles|candleArrays/i,
    "rawCandles/candles arrays"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        placeOrder: true,
        buyMarket: "buy market now",
        sellMarket: "sell market now",
        orderRoute: "/orders"
      })
    ),
    /executionRequest|orderData/i,
    "placeOrder/buyMarket/sellMarket/orderRoute"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        accountData: { accountNumber: "123" },
        orderData: { orderId: "abc" },
        positionData: { positionId: "xyz" }
      })
    ),
    /accountData|orderData|positionData/i,
    "account/order/position fields"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        proposedAction: "Call applyCalibration, approveCalibrationProposal, then mutate active_calibration."
      })
    ),
    /applyCalibration|approveCalibrationProposal|activeCalibrationMutation/i,
    "active calibration mutation language"
  );

  assertBlocked(
    runOpenClawPilotDryRun(
      cloneWith({
        apiKey: "sk-test-super-secret",
        token: "super-secret-token",
        password: "password123"
      })
    ),
    /apiKeys|tokensPasswords|secrets/i,
    "secrets/API keys/tokens"
  );

  const validationOnly = validateOpenClawPilotDryRunPacket(
    cloneWith({
      authority: {
        executionAuthority: "none",
        brokerAuthority: "none",
        readinessOverrideAuthority: "override"
      }
    })
  );
  assert.equal(validationOnly.valid, false);
  assert.deepEqual(validationOnly.authority, authorityNone);

  console.log("OpenClaw pilot dry-run tests passed.");
  console.log(
    JSON.stringify(
      {
        safeAuditId: safe.id,
        safeEventType: safe.eventType,
        testCases: [
          "safe proposal intent passes",
          "autoApplyAllowed true fails",
          "executionAuthority non-none fails",
          "brokerAuthority non-none fails",
          "readinessOverrideAuthority non-none fails",
          "rawCandles/candles/candle arrays fail",
          "placeOrder/buyMarket/sellMarket/orderRoute fails",
          "account/order/position fields fail",
          "active calibration mutation language fails",
          "secrets/API keys/tokens fail",
          "safe audit packet contains no raw candles/secrets",
          "authority remains none"
        ],
        authority: safe.authority,
        program: programSummary
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
