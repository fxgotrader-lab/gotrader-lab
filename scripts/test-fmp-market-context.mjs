#!/usr/bin/env node

import {
  MARKET_CONTEXT_CONTRACT_VERSION,
  buildMacroRiskFlags,
  buildMarketContextSnapshot,
  buildOpenClawMarketContextPacket,
  getFmpEnvironmentStatus
} from "./services/fmp-market-context-service.mjs";

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    live: argv.includes("--live"),
    symbol: argv[argv.indexOf("--symbol") + 1] ?? "EUR/USD"
  };
}

function printHelp() {
  process.stdout.write(`GoTrader FMP market-context contract smoke test

Usage:
  npm run test:fmp-market-context
  npm run test:fmp-market-context -- --live --symbol XAU/USD

Default mode uses deterministic dry-run market context when FMP_API_KEY is not configured.
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
  const apiKey = process.env.FMP_API_KEY;
  assert(!serialized.includes("FMP_API_KEY"), "Output contains FMP_API_KEY label");
  assert(!/apikey\s*=|apikey%3d|api_key\s*=|api_key%3d/i.test(serialized), "Output contains an API key query parameter");
  assert(!/broker\s*password|broker\s*secret|mt5\s*password|brokerCredentialValue/i.test(serialized), "Output contains broker credential text");
  if (apiKey) {
    assert(!serialized.includes(apiKey), "Output contains the FMP API key value");
  }
}

function validateEconomicEvent(event) {
  requireString(event.eventId, "economicEvent.eventId");
  assert(event.provider === "fmp", "economicEvent.provider must be fmp");
  requireString(event.eventName, "economicEvent.eventName");
  assert(["low", "medium", "high", "unknown"].includes(event.impact), "economicEvent.impact invalid");
  requireString(event.scheduledAt, "economicEvent.scheduledAt");
  requireString(event.sourceFingerprint, "economicEvent.sourceFingerprint");
  requireString(event.generatedAt, "economicEvent.generatedAt");
}

function validateNewsItem(item) {
  requireString(item.newsId, "newsItem.newsId");
  assert(item.provider === "fmp", "newsItem.provider must be fmp");
  assert(["general", "stock", "forex", "crypto"].includes(item.category), "newsItem.category invalid");
  assert(Array.isArray(item.symbols), "newsItem.symbols must be an array");
  requireString(item.headline, "newsItem.headline");
  requireString(item.publishedAt, "newsItem.publishedAt");
  requireString(item.source, "newsItem.source");
  requireString(item.sourceFingerprint, "newsItem.sourceFingerprint");
  requireString(item.generatedAt, "newsItem.generatedAt");
}

function validateMacroRiskFlag(flag) {
  requireString(flag.flagId, "macroRiskFlag.flagId");
  assert(["block", "reduce_risk", "monitor"].includes(flag.severity), "macroRiskFlag.severity invalid");
  requireString(flag.reason, "macroRiskFlag.reason");
  requireString(flag.eventId, "macroRiskFlag.eventId");
  assert(Array.isArray(flag.appliesToSymbols), "macroRiskFlag.appliesToSymbols must be an array");
  requireString(flag.generatedAt, "macroRiskFlag.generatedAt");
}

function validateSnapshot(snapshot, { dryRun }) {
  requireString(snapshot.sentimentSnapshotId, "snapshot.sentimentSnapshotId");
  assert(snapshot.provider === "fmp", "snapshot.provider must be fmp");
  requireString(snapshot.symbol, "snapshot.symbol");
  requireString(snapshot.generatedAt, "snapshot.generatedAt");
  assert(Array.isArray(snapshot.economicEvents), "snapshot.economicEvents must be an array");
  assert(Array.isArray(snapshot.newsItems), "snapshot.newsItems must be an array");
  assert(Array.isArray(snapshot.macroRiskFlags), "snapshot.macroRiskFlags must be an array");
  assert(snapshot.providerPayloadIncluded === false, "providerPayloadIncluded must always be false");
  assert(snapshot.decisionVersion === MARKET_CONTEXT_CONTRACT_VERSION, "snapshot.decisionVersion mismatch");
  requireString(snapshot.sentimentPolicyVersion, "snapshot.sentimentPolicyVersion");
  requireString(snapshot.sourceFingerprint, "snapshot.sourceFingerprint");
  assert(snapshot.boundedEvidence.economicEvents.length <= 10, "boundedEvidence must include at most 10 economic events");
  assert(snapshot.boundedEvidence.newsItems.length <= 5, "boundedEvidence must include at most 5 news items");
  assert(snapshot.boundedEvidence.macroRiskFlags.length <= 3, "boundedEvidence must include at most 3 macro risk flags");
  snapshot.economicEvents.forEach(validateEconomicEvent);
  snapshot.newsItems.forEach(validateNewsItem);
  snapshot.macroRiskFlags.forEach(validateMacroRiskFlag);
  assert(["bullish", "bearish", "neutral", "mixed", "unknown"].includes(snapshot.newsSentiment.bias), "newsSentiment.bias invalid");
  requireNumber(snapshot.newsSentiment.confidence, "newsSentiment.confidence");
  if (dryRun) {
    assert(snapshot.economicEvents.some((event) => event.impact === "high" && event.currency === "USD"), "dry-run snapshot must include one high-impact USD event");
    assert(snapshot.economicEvents.some((event) => event.impact === "medium" && event.currency === "USD"), "dry-run snapshot must include one medium-impact USD event");
    assert(snapshot.newsItems.some((item) => item.category === "forex"), "dry-run snapshot must include one forex news item");
    assert(snapshot.newsItems.some((item) => item.category === "stock"), "dry-run snapshot must include one index/stock news item");
    assert(snapshot.newsItems.some((item) => item.category === "crypto"), "dry-run snapshot must include one crypto news item");
    assert(snapshot.macroRiskFlags.some((flag) => flag.severity === "block"), "dry-run high-impact event must create a blocking macro risk flag");
  }
}

function validateOpenClawPacket(packet, snapshot) {
  requireString(packet.packetId, "openClawPacket.packetId");
  assert(packet.source === "gotrader_market_context_service", "OpenClaw market context source mismatch");
  assert(packet.mode === "advisory_only", "OpenClaw packet must be advisory_only");
  assert(packet.executionAuthority === "none", "OpenClaw executionAuthority must be none");
  assert(packet.brokerAuthority === "none", "OpenClaw brokerAuthority must be none");
  assert(packet.readinessOverrideAuthority === "none", "OpenClaw readinessOverrideAuthority must be none");
  assert(packet.sentimentSnapshotId === snapshot.sentimentSnapshotId, "OpenClaw packet must reference snapshot id");
  assert(packet.topMacroRiskFlags.length <= 3, "OpenClaw packet must include at most 3 macro risk flags");
  assert(packet.boundedNewsSummaries.length <= 5, "OpenClaw packet must include at most 5 news summaries");
  assert(packet.safetyLocks.apiKeysIncluded === false, "OpenClaw packet must state no API keys included");
  assert(packet.safetyLocks.rawProviderPayloadIncluded === false, "OpenClaw packet must state no raw provider payload included");
  assert(packet.safetyLocks.executionPermissionGranted === false, "OpenClaw packet must not grant execution permission");
  assert(packet.safetyLocks.riskManagerBypassIncluded === false, "OpenClaw packet must not include Risk Manager bypass");
}

function validateSyntheticHighImpactFlag(symbol) {
  const scheduledAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const [flag] = buildMacroRiskFlags(
    [
      {
        eventId: "synthetic_high_impact_event",
        provider: "fmp",
        country: "US",
        currency: "USD",
        eventName: "Synthetic High Impact Event",
        category: "test",
        impact: "high",
        scheduledAt,
        actual: null,
        forecast: null,
        previous: null,
        sourceFingerprint: "synthetic",
        generatedAt: new Date().toISOString()
      }
    ],
    { symbol }
  );
  validateMacroRiskFlag(flag);
  assert(flag.severity === "block", "high-impact active event must produce a blocking MacroRiskFlag");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = getFmpEnvironmentStatus();
  if (args.live && !env.hasApiKey) {
    throw new Error("Live FMP test requested, but FMP_API_KEY is not configured.");
  }
  const dryRun = args.live ? false : !env.hasApiKey;
  const result = await buildMarketContextSnapshot({
    dryRun,
    symbol: args.symbol
  });
  assert(result.ok, result.error?.message ?? "Market context snapshot failed");
  const snapshot = result.data;
  const openClawPacket = buildOpenClawMarketContextPacket(snapshot);

  validateSnapshot(snapshot, { dryRun });
  validateOpenClawPacket(openClawPacket, snapshot);
  validateSyntheticHighImpactFlag(args.symbol);
  assertNoSecrets(snapshot);
  assertNoSecrets(openClawPacket);

  process.stdout.write("GoTrader FMP market-context contract smoke test passed.\n");
  process.stdout.write(`Mode: ${dryRun ? "dry-run deterministic mock" : "FMP live normalized context"}\n`);
  process.stdout.write(`Symbol: ${snapshot.symbol}\n`);
  process.stdout.write(`Economic events: ${snapshot.economicEvents.length}\n`);
  process.stdout.write(`News items: ${snapshot.newsItems.length}\n`);
  process.stdout.write(`Macro risk flags: ${snapshot.macroRiskFlags.length}\n`);
  process.stdout.write(`Blocking flags: ${snapshot.macroRiskFlags.filter((flag) => flag.severity === "block").length}\n`);
  process.stdout.write(`News sentiment: ${snapshot.newsSentiment.bias} (${snapshot.newsSentiment.confidence})\n`);
  process.stdout.write(`OpenClaw packet mode: ${openClawPacket.mode}\n`);
  process.stdout.write(`Execution authority: ${openClawPacket.executionAuthority}\n`);
}

main().catch((error) => {
  process.stderr.write(`FMP market-context contract smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
