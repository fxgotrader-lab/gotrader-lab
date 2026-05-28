#!/usr/bin/env node

import {
  STRATEGY_CONTEXT_STRATEGY_VERSION,
  evaluateStrategyRiskContext,
  runStrategyRiskContextFlow
} from "./services/strategy-risk-context-evaluator.mjs";

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    symbol: argv[argv.indexOf("--symbol") + 1] ?? "EUR/USD",
    interval: argv[argv.indexOf("--interval") + 1] ?? "5min"
  };
}

function printHelp() {
  process.stdout.write(`GoTrader Strategy/Risk Context Evaluator smoke test

Usage:
  npm run test:strategy-risk-context
  npm run test:strategy-risk-context -- --symbol XAU/USD --interval 5min

The test uses deterministic dry-run market data and market context. It does not trade,
connect MT5, write Supabase, or expose provider keys.
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireString(value, field) {
  assert(typeof value === "string" && value.length > 0, `${field} must be a non-empty string`);
}

function assertNoSecrets(payload) {
  const serialized = JSON.stringify(payload);
  for (const envName of ["TWELVE_DATA_API_KEY", "FMP_API_KEY"]) {
    const value = process.env[envName];
    assert(!serialized.includes(envName), `Output contains ${envName} label`);
    if (value) {
      assert(!serialized.includes(value), `Output contains ${envName} value`);
    }
  }
  assert(!/apikey\s*=|apikey%3d|api_key\s*=|api_key%3d/i.test(serialized), "Output contains an API key query parameter");
  assert(!/broker\s*password|broker\s*secret|mt5\s*password|brokerCredentialValue/i.test(serialized), "Output contains broker credential text");
  assert(!/supabase\.co|metatrader|order_placement|execution_intent/i.test(serialized), "Output contains future execution or persistence handoff text");
}

function validateCandidate(candidate, expectedSetup) {
  requireString(candidate.signalId, "candidate.signalId");
  assert(candidate.side === "flat", "StrategyCandidate side must remain flat");
  assert(["no_trade", "research_only"].includes(candidate.setup), "StrategyCandidate setup invalid");
  if (expectedSetup) {
    assert(candidate.setup === expectedSetup, `StrategyCandidate setup must be ${expectedSetup}`);
  }
  assert(candidate.entry === null, "StrategyCandidate entry must be null");
  assert(candidate.stop_loss === null, "StrategyCandidate stop_loss must be null");
  assert(candidate.take_profit === null, "StrategyCandidate take_profit must be null");
  assert(candidate.confidence === 0, "StrategyCandidate confidence must remain 0 in this phase");
  assert(candidate.strategyVersion === STRATEGY_CONTEXT_STRATEGY_VERSION, "StrategyCandidate strategy version mismatch");
  assert(Array.isArray(candidate.evidence) && candidate.evidence.length > 0, "StrategyCandidate must include explanatory evidence");
}

function validateRiskDecision(riskDecision, candidate) {
  requireString(riskDecision.riskDecisionId, "riskDecision.riskDecisionId");
  assert(riskDecision.signalId === candidate.signalId, "RiskDecision signalId must match candidate");
  assert(riskDecision.approved === false, "RiskDecision approved must remain false");
  assert(riskDecision.executionAllowed === false, "RiskDecision executionAllowed must remain false");
  assert(riskDecision.mode === "paper", "RiskDecision mode must be paper");
  assert(Array.isArray(riskDecision.rejectReasons) && riskDecision.rejectReasons.length > 0, "RiskDecision must include reject reasons");
}

function validateJournalEvent(event, candidate, riskDecision) {
  requireString(event.journalEntryId, "journalEvent.journalEntryId");
  assert(["rejected", "failed"].includes(event.status), "JournalEvent must be rejected or failed in this phase");
  assert(event.signalId === candidate.signalId, "JournalEvent signalId must match candidate");
  assert(event.riskDecisionId === riskDecision.riskDecisionId, "JournalEvent riskDecisionId must match risk decision");
  assert(event.marketSnapshotId === candidate.marketSnapshotId, "JournalEvent must preserve marketSnapshotId");
  assert(event.riskPolicyVersion === riskDecision.riskPolicyVersion, "JournalEvent must preserve riskPolicyVersion");
  assert(Array.isArray(event.agentChain), "JournalEvent must include agentChain");
}

function validateOpenClawPacket(packet, riskDecision) {
  requireString(packet.packetId, "openClawPacket.packetId");
  assert(packet.mode === "advisory_only", "OpenClaw packet must be advisory_only");
  assert(packet.executionAuthority === "none", "OpenClaw executionAuthority must be none");
  assert(packet.brokerAuthority === "none", "OpenClaw brokerAuthority must be none");
  assert(packet.readinessOverrideAuthority === "none", "OpenClaw readinessOverrideAuthority must be none");
  assert(packet.riskDecisionSummary.riskDecisionId === riskDecision.riskDecisionId, "OpenClaw risk summary must match risk decision");
  assert(packet.riskDecisionSummary.executionAllowed === false, "OpenClaw packet must not grant execution permission");
  assert(packet.boundedNormalizedEvidence.latestCandles.length <= 5, "OpenClaw packet must bound candles to latest 5");
  if (packet.marketContextSummary) {
    assert(packet.marketContextSummary.topMacroRiskFlags.length <= 3, "OpenClaw context must bound macro flags to 3");
    assert(packet.marketContextSummary.boundedNewsSummaries.length <= 5, "OpenClaw context must bound news to 5");
    assert(packet.marketContextSummary.safetyLocks.rawProviderPayloadIncluded === false, "OpenClaw context must not include raw provider payloads");
  }
  assert(packet.safetyLocks.apiKeysIncluded === false, "OpenClaw packet must not include API keys");
  assert(packet.safetyLocks.rawProviderPayloadIncluded === false, "OpenClaw packet must not include raw provider payloads");
  assert(packet.safetyLocks.executionPermissionGranted === false, "OpenClaw packet must not grant execution");
  assert(packet.safetyLocks.riskManagerBypassIncluded === false, "OpenClaw packet must not include Risk Manager bypass");
}

function validateEvaluation(evaluation, expectedStatus, expectedSetup) {
  assert(evaluation.status === expectedStatus, `Evaluation status must be ${expectedStatus}`);
  validateCandidate(evaluation.candidate, expectedSetup);
  validateRiskDecision(evaluation.riskDecision, evaluation.candidate);
  validateJournalEvent(evaluation.journalEvent, evaluation.candidate, evaluation.riskDecision);
  validateOpenClawPacket(evaluation.openClawPacket, evaluation.riskDecision);
  assertNoSecrets(evaluation);
}

function safeContextFrom(context) {
  return {
    ...context,
    macroRiskFlags: [],
    boundedEvidence: {
      ...context.boundedEvidence,
      macroRiskFlags: []
    }
  };
}

function invalidMarketSnapshotFrom(snapshot) {
  return {
    ...snapshot,
    snapshotId: "invalid_market_snapshot",
    candles: [],
    latestQuote: null,
    dataQuality: {
      status: "error",
      candleCount: 0,
      hasQuote: false,
      missingVolumeCount: 0,
      warnings: ["Synthetic missing market data test."],
      providerStatus: "error"
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const flow = await runStrategyRiskContextFlow({
    dryRun: true,
    symbol: args.symbol,
    interval: args.interval,
    outputsize: 8
  });

  const normalEvaluation = evaluateStrategyRiskContext({
    gotraderMode: "paper",
    marketContext: safeContextFrom(flow.marketContext),
    marketSnapshot: flow.marketSnapshot,
    scannerOutput: flow.scannerOutput
  });
  validateEvaluation(normalEvaluation, "research_only", "research_only");
  assert(normalEvaluation.riskDecision.rejectReasons.some((reason) => /research-only|no executable setup/i.test(reason)), "normal flow must explain research-only rejection");

  validateEvaluation(flow.evaluation, "macro_blocked", "no_trade");
  assert(flow.evaluation.riskDecision.rejectReasons.some((reason) => /High-impact macro risk/i.test(reason)), "macro-blocked flow must include high-impact reject reason");

  const invalidSnapshot = invalidMarketSnapshotFrom(flow.marketSnapshot);
  const invalidScan = {
    ...flow.scannerOutput,
    scanId: "invalid_scan",
    snapshotId: invalidSnapshot.snapshotId,
    marketSnapshotId: invalidSnapshot.snapshotId,
    latest_close: 0,
    reason: "Synthetic invalid market data test."
  };
  const invalidEvaluation = evaluateStrategyRiskContext({
    gotraderMode: "paper",
    marketContext: safeContextFrom(flow.marketContext),
    marketSnapshot: invalidSnapshot,
    scannerOutput: invalidScan
  });
  validateEvaluation(invalidEvaluation, "failed_data_quality", "no_trade");
  assert(invalidEvaluation.journalEvent.status === "failed", "invalid market data must produce failed journal event");

  const nonPaperEvaluation = evaluateStrategyRiskContext({
    gotraderMode: "live",
    marketContext: safeContextFrom(flow.marketContext),
    marketSnapshot: flow.marketSnapshot,
    scannerOutput: flow.scannerOutput
  });
  validateEvaluation(nonPaperEvaluation, "environment_blocked", "no_trade");

  process.stdout.write("GoTrader Strategy/Risk Context Evaluator smoke test passed.\n");
  process.stdout.write(`Normal status: ${normalEvaluation.status}\n`);
  process.stdout.write(`Macro status: ${flow.evaluation.status}\n`);
  process.stdout.write(`Invalid data status: ${invalidEvaluation.status}\n`);
  process.stdout.write(`Candidate side: ${flow.evaluation.candidate.side}\n`);
  process.stdout.write(`Risk approved: ${flow.evaluation.riskDecision.approved}\n`);
  process.stdout.write(`Execution allowed: ${flow.evaluation.riskDecision.executionAllowed}\n`);
  process.stdout.write(`Journal status: ${flow.evaluation.journalEvent.status}\n`);
  process.stdout.write(`OpenClaw packet mode: ${flow.evaluation.openClawPacket.mode}\n`);
}

main().catch((error) => {
  process.stderr.write(`Strategy/Risk Context Evaluator smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
