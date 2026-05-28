#!/usr/bin/env node

import {
  AGENT_BRIDGE_CONTRACT_VERSION,
  AGENT_BRIDGE_RISK_POLICY_VERSION,
  buildJournalEvent,
  buildPlaceholderRiskDecision,
  runMarketScannerBridgeFlow
} from "./services/agent-bridge-adapter.mjs";
import { getTwelveDataEnvironmentStatus } from "./services/twelve-data-service.mjs";

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    live: argv.includes("--live"),
    symbol: argv[argv.indexOf("--symbol") + 1] ?? "EUR/USD",
    interval: argv[argv.indexOf("--interval") + 1] ?? "5min"
  };
}

function printHelp() {
  process.stdout.write(`GoTrader Agent Bridge contract smoke test

Usage:
  npm run test:agent-bridge-contracts
  npm run test:agent-bridge-contracts -- --live --symbol XAU/USD --interval 5min

Default mode uses dry-run contract data when no Twelve Data API key is configured.
This test does not trade, connect MT5, write Supabase, or expose provider keys.
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

function requireNumber(value, field) {
  assert(typeof value === "number" && Number.isFinite(value), `${field} must be a finite number`);
}

function assertNoSecrets(payload) {
  const serialized = JSON.stringify(payload);
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  assert(!serialized.includes("TWELVE_DATA_API_KEY"), "Output contains TWELVE_DATA_API_KEY label");
  assert(!/apikey\s*=|apikey%3d/i.test(serialized), "Output contains an API key query parameter");
  assert(!/broker\s*password|broker\s*secret|mt5\s*password|brokerCredentialValue/i.test(serialized), "Output contains broker credential text");
  if (apiKey) {
    assert(!serialized.includes(apiKey), "Output contains the Twelve Data API key value");
  }
}

function validateMarketSnapshot(snapshot) {
  requireString(snapshot.snapshotId, "snapshot.snapshotId");
  assert(snapshot.provider === "twelve_data", "snapshot.provider must be twelve_data");
  requireString(snapshot.symbol, "snapshot.symbol");
  requireString(snapshot.providerSymbol, "snapshot.providerSymbol");
  assert(Array.isArray(snapshot.brokerSymbolCandidates), "snapshot.brokerSymbolCandidates must be an array");
  requireString(snapshot.timeframe, "snapshot.timeframe");
  assert(Array.isArray(snapshot.candles), "snapshot.candles must be an array");
  assert(snapshot.candles.length > 0, "snapshot.candles must include normalized candles");
  assert(snapshot.candles.every((candle) => typeof candle.datetime === "string"), "candles must include datetime");
  assert(snapshot.candles.every((candle) => ["open", "high", "low", "close", "volume"].every((key) => typeof candle[key] === "number")), "candles must be numeric");
  assert(snapshot.dataQuality && typeof snapshot.dataQuality === "object", "snapshot.dataQuality is required");
  requireString(snapshot.generatedAt, "snapshot.generatedAt");
  requireString(snapshot.sourceFingerprint, "snapshot.sourceFingerprint");
  assert(snapshot.aliasMappingVersion === "twelve_data_alias_map_v1", "snapshot.aliasMappingVersion mismatch");
}

function validateScan(scan, snapshot) {
  requireString(scan.scanId, "scan.scanId");
  assert(scan.snapshotId === snapshot.snapshotId, "scan.snapshotId must match snapshot");
  requireNumber(scan.latest_close, "scan.latest_close");
  assert(["bullish", "bearish", "neutral"].includes(scan.trend), "scan.trend invalid");
  assert(scan.setup === "no_trade", "scan.setup must remain no_trade");
  assert(scan.confidence === 0, "scan.confidence must remain 0 while strategy rules are disabled");
  assert(scan.dataProvider === "twelve_data", "scan.dataProvider must be twelve_data");
  assert(scan.decisionVersion === AGENT_BRIDGE_CONTRACT_VERSION, "scan.decisionVersion mismatch");
}

function validateCandidate(candidate, scan) {
  requireString(candidate.signalId, "candidate.signalId");
  assert(candidate.scanId === scan.scanId, "candidate.scanId must match scan");
  assert(candidate.side === "flat", "placeholder strategy candidate must be flat");
  assert(candidate.entry === null, "candidate.entry must be null");
  assert(candidate.stop_loss === null, "candidate.stop_loss must be null");
  assert(candidate.take_profit === null, "candidate.take_profit must be null");
  assert(Array.isArray(candidate.evidence), "candidate.evidence must be an array");
}

function validateRiskDecision(riskDecision, candidate) {
  requireString(riskDecision.riskDecisionId, "riskDecision.riskDecisionId");
  assert(riskDecision.signalId === candidate.signalId, "riskDecision.signalId must match candidate");
  assert(riskDecision.approved === false, "RiskDecision must default to approved=false");
  assert(riskDecision.executionAllowed === false, "RiskDecision must default to executionAllowed=false");
  assert(riskDecision.mode === "paper", "RiskDecision mode must be paper");
  assert(riskDecision.riskPolicyVersion === AGENT_BRIDGE_RISK_POLICY_VERSION, "riskPolicyVersion mismatch");
  assert(Array.isArray(riskDecision.rejectReasons) && riskDecision.rejectReasons.length > 0, "RiskDecision must include rejectReasons");
}

function validateJournalEvent(event, candidate, riskDecision) {
  requireString(event.journalEntryId, "journalEvent.journalEntryId");
  assert(event.signalId === candidate.signalId, "journalEvent.signalId must match candidate");
  assert(event.riskDecisionId === riskDecision.riskDecisionId, "journalEvent.riskDecisionId must match risk decision");
  assert(["rejected", "approved", "submitted", "filled", "failed"].includes(event.status), "journalEvent.status invalid");
  assert(event.status === "rejected", "placeholder journal event should be rejected");
  requireString(event.reason, "journalEvent.reason");
  assert(Array.isArray(event.agentChain) && event.agentChain.length > 0, "journalEvent.agentChain is required");
}

function validateOpenClawPacket(packet, scan, riskDecision) {
  requireString(packet.packetId, "openClawPacket.packetId");
  assert(packet.source === "gotrader_agent_bridge", "OpenClaw packet source mismatch");
  assert(packet.mode === "advisory_only", "OpenClaw packet must remain advisory_only");
  assert(packet.executionAuthority === "none", "OpenClaw executionAuthority must be none");
  assert(packet.brokerAuthority === "none", "OpenClaw brokerAuthority must be none");
  assert(packet.readinessOverrideAuthority === "none", "OpenClaw readinessOverrideAuthority must be none");
  assert(packet.scanSummary.scanId === scan.scanId, "OpenClaw scan summary must match scan");
  assert(packet.riskDecisionSummary.riskDecisionId === riskDecision.riskDecisionId, "OpenClaw risk summary must match risk decision");
  assert(packet.riskDecisionSummary.executionAllowed === false, "OpenClaw packet must not grant execution permission");
  assert(packet.safetyLocks.apiKeysIncluded === false, "OpenClaw packet must state no API keys included");
  assert(packet.safetyLocks.rawProviderPayloadIncluded === false, "OpenClaw packet must state no raw provider payload included");
  assert(packet.boundedNormalizedEvidence.latestCandles.length <= 5, "OpenClaw bounded evidence must include at most 5 candles");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = getTwelveDataEnvironmentStatus();
  const dryRun = args.live ? false : !env.hasApiKey;
  const flow = await runMarketScannerBridgeFlow({
    dryRun,
    symbol: args.symbol,
    interval: args.interval,
    outputsize: 8
  });

  validateMarketSnapshot(flow.snapshot);
  validateScan(flow.scan, flow.snapshot);
  validateCandidate(flow.candidate, flow.scan);
  validateRiskDecision(flow.riskDecision, flow.candidate);
  validateJournalEvent(flow.journalEvent, flow.candidate, flow.riskDecision);
  validateOpenClawPacket(flow.openClawPacket, flow.scan, flow.riskDecision);

  const noTradeRiskDecision = buildPlaceholderRiskDecision(flow.candidate, ["No trade setup. Journal no_trade rejection smoke test."]);
  const noTradeJournalEvent = buildJournalEvent({
    candidate: flow.candidate,
    riskDecision: noTradeRiskDecision,
    reason: "No trade setup recorded as rejected journal event."
  });
  const failedDataQualityJournalEvent = buildJournalEvent({
    candidate: flow.candidate,
    riskDecision: noTradeRiskDecision,
    status: "failed",
    reason: "Failed data quality check recorded without execution."
  });
  validateRiskDecision(noTradeRiskDecision, flow.candidate);
  validateJournalEvent(noTradeJournalEvent, flow.candidate, noTradeRiskDecision);
  assert(failedDataQualityJournalEvent.status === "failed", "Journal builder must support failed data quality events");
  assert(failedDataQualityJournalEvent.riskDecisionId === noTradeRiskDecision.riskDecisionId, "Failed journal event must retain risk decision provenance");

  assertNoSecrets(flow);
  assertNoSecrets(noTradeJournalEvent);
  assertNoSecrets(failedDataQualityJournalEvent);

  process.stdout.write("GoTrader Agent Bridge contract smoke test passed.\n");
  process.stdout.write(`Mode: ${flow.mode}\n`);
  process.stdout.write(`Data path: ${dryRun ? "dry-run normalized candles" : "Twelve Data live normalized candles"}\n`);
  process.stdout.write(`Snapshot: ${flow.snapshot.snapshotId} ${flow.snapshot.symbol} ${flow.snapshot.timeframe}\n`);
  process.stdout.write(`Provider symbol: ${flow.snapshot.providerSymbol}\n`);
  process.stdout.write(`Candles: ${flow.snapshot.candles.length}\n`);
  process.stdout.write(`Risk approved: ${flow.riskDecision.approved}\n`);
  process.stdout.write(`Execution allowed: ${flow.riskDecision.executionAllowed}\n`);
  process.stdout.write(`Journal status: ${flow.journalEvent.status}\n`);
  process.stdout.write(`OpenClaw packet mode: ${flow.openClawPacket.mode}\n`);
}

main().catch((error) => {
  process.stderr.write(`Agent Bridge contract smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
