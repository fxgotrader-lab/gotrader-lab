#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-session-model-recognition-test");
const sourceFiles = [
  "ictStrategySuiteTypes.ts",
  "ictAdvisorTypes.ts",
  "ictSessionNarrativeTypes.ts",
  "ictGrinchModelTypes.ts",
  "ictStrategySuiteHelpers.ts",
  "ictSessionNarrative.ts",
  "ictApprovedSetupProfileTypes.ts",
  "ictReplayValidationTypes.ts",
  "ictIndexSmtTypes.ts",
  "ictNewsSessionRiskTypes.ts",
  "ictApprovedSetupProfile.ts",
  "ictCurrentReadTypes.ts",
  "ictCurrentRead.ts",
  "ictSignalContractTypes.ts",
  "ictSignalContract.ts"
];

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const compileSuiteForNode = () => {
  fs.rmSync(outRoot, { recursive: true, force: true });
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
      .replace(/from\s+"..\/types"/g, 'from "./typesStub.mjs"')
      .replace(/from\s+'..\/types'/g, "from './typesStub.mjs'")
      .replace(/from\s+"..\/runtime"/g, 'from "./runtimeStub.mjs"')
      .replace(/from\s+'..\/runtime'/g, "from './runtimeStub.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
  fs.writeFileSync(path.join(outRoot, "typesStub.mjs"), "export {};\n", "utf8");
  fs.writeFileSync(path.join(outRoot, "runtimeStub.mjs"), "export {};\n", "utf8");
  fs.writeFileSync(
    path.join(outRoot, "ictAdvisorEngine.mjs"),
    "export const buildIctAdvisorPacketFromRuntime = async () => undefined;\n",
    "utf8"
  );
};

const importCompiled = async (file) => import(pathToFileURL(path.join(outRoot, file)));

const isoNy = (localDate, hhmm) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0)).toISOString();
};

const candle = (id, localDate, hhmm, open, high, low, close) => ({
  id,
  symbol: "MNQ",
  timeframe: "15m",
  timestamp: isoNy(localDate, hhmm),
  open,
  high,
  low,
  close,
  volume: 1000
});

const modelAFixture = [
  candle("a_asia_0", "2026-06-04", "20:00", 100, 103, 96, 101),
  candle("a_asia_1", "2026-06-04", "20:15", 101, 104, 94, 98),
  candle("a_asia_2", "2026-06-04", "20:30", 98, 102, 92, 95),
  candle("a_asia_3", "2026-06-04", "21:00", 95, 101, 90, 97),
  candle("a_asia_4", "2026-06-04", "22:00", 97, 105, 91, 104),
  candle("a_asia_5", "2026-06-04", "23:45", 104, 106, 95, 99),
  candle("a_midnight", "2026-06-05", "00:00", 100, 101, 98, 99),
  candle("a_london_0", "2026-06-05", "02:00", 99, 101, 91, 95),
  candle("a_london_1", "2026-06-05", "02:15", 95, 100, 90.8, 96),
  candle("a_london_2", "2026-06-05", "02:30", 96, 102, 91.2, 101),
  candle("a_london_3", "2026-06-05", "03:00", 101, 104, 94, 103),
  candle("a_manip_0", "2026-06-05", "04:15", 103, 107, 98, 106),
  candle("a_manip_1", "2026-06-05", "04:30", 106, 109, 99, 101),
  candle("a_manip_2", "2026-06-05", "05:00", 101, 108, 97, 105),
  candle("a_pre_ny", "2026-06-05", "08:45", 105, 106, 99, 100),
  candle("a_ny_0", "2026-06-05", "09:30", 100, 105, 96, 98),
  candle("a_ny_1", "2026-06-05", "09:45", 98, 101, 88, 90),
  candle("a_ny_2", "2026-06-05", "10:00", 90, 92, 82, 85),
  candle("a_ny_3", "2026-06-05", "10:15", 85, 87, 78, 80)
];

const modelBFixture = [
  candle("b_prior_range_low", "2026-06-02", "09:30", 125, 130, 90, 112),
  candle("b_prior_fvg_left", "2026-06-03", "06:00", 150, 154, 148, 152),
  candle("b_prior_fvg_mid", "2026-06-03", "06:15", 152, 158, 151, 156),
  candle("b_prior_fvg_right", "2026-06-03", "06:30", 170, 190, 170, 184),
  candle("b_asia_0", "2026-06-03", "20:00", 128, 132, 122, 130),
  candle("b_asia_1", "2026-06-03", "20:15", 130, 134, 121, 126),
  candle("b_asia_2", "2026-06-03", "21:00", 126, 135, 120, 132),
  candle("b_asia_3", "2026-06-03", "23:45", 132, 134, 123, 129),
  candle("b_midnight", "2026-06-04", "00:00", 130, 131, 126, 128),
  candle("b_london_sweep", "2026-06-04", "02:00", 128, 139, 126, 137),
  candle("b_london_reject", "2026-06-04", "02:15", 137, 138, 124, 126),
  candle("b_london_drive_0", "2026-06-04", "03:00", 126, 128, 118, 120),
  candle("b_london_drive_1", "2026-06-04", "04:15", 120, 121, 112, 115),
  candle("b_preopen_0", "2026-06-04", "08:00", 115, 120, 113, 118),
  candle("b_preopen_1", "2026-06-04", "08:30", 118, 121, 114, 117),
  candle("b_preopen_2", "2026-06-04", "09:00", 117, 120, 114, 116),
  candle("b_ny_sweep", "2026-06-04", "09:30", 116, 122, 108, 119),
  candle("b_ny_drive_0", "2026-06-04", "09:45", 119, 136, 118, 134),
  candle("b_ny_drive_1", "2026-06-04", "10:00", 134, 156, 132, 150)
];

const canonicalEventAliases = {
  buyside_sweep: "buy_side_liquidity_swept",
  sellside_sweep: "sell_side_liquidity_swept",
  ny_open_mitigation: "ny_open_mitigation_tap",
  bearish_expansion: "ny_bearish_expansion",
  bullish_expansion: "ny_bullish_expansion",
  ny_open_consolidation_low_sweep: "ny_open_consolidation_low_swept",
  ny_open_consolidation_high_sweep: "ny_open_consolidation_high_swept"
};

const eventAliasSet = (narrative) =>
  new Set(
    narrative.events.flatMap((event) => [
      event.eventType,
      canonicalEventAliases[event.eventType]
    ]).filter(Boolean)
  );

const hasForbiddenPayloadFields = (value, depth = 0) => {
  if (!value || typeof value !== "object" || depth > 8) return false;
  const forbidden = /rawCandles|candles|rawSnapshot|snapshot|secret|password|api[_-]?key|account|order|position|executionIntent/i;
  return Object.entries(value).some(([key, child]) => {
    if (/Included|Excluded|Authority$/i.test(key) && (typeof child === "boolean" || child === "none")) return false;
    return forbidden.test(key) || hasForbiddenPayloadFields(child, depth + 1);
  });
};

const baseSignal = (overrides = {}) => ({
  strategyId: "ict-fvg-displacement",
  phase: "phase_1",
  symbol: "MNQ",
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "15m",
  htfTimeframes: ["15m", "1h"],
  side: "short",
  decision: "research_only",
  confidence: 0.76,
  bias: { primary: "bearish", htf: { "15m": "bearish", "1h": "bearish" }, composite: "bearish" },
  dealingRange: { high: 109, low: 78, midpoint: 93.5, currentLocation: "premium", sourceTimeframe: "15m" },
  liquiditySwept: { type: "equal_highs", price: 106, timeframe: "15m", swept: true, distanceFromCurrent: 26 },
  drawOnLiquidity: { type: "previous_day_low", price: 78, timeframe: "daily", swept: false, distanceFromCurrent: -2 },
  displacement: { direction: "bearish", candleTime: isoNy("2026-06-05", "09:45"), impulseHigh: 101, impulseLow: 88, bodySize: 8, createdFvg: true },
  fairValueGap: { direction: "bearish", high: 99, low: 96, midpoint: 97.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-05", "09:45") },
  entryZone: { type: "fair_value_gap", high: 99, low: 96, midpoint: 97.5 },
  invalidation: 110,
  target: 78,
  rrEstimate: 2.1,
  setup: "fvg_retracement",
  summary: "Synthetic bearish FVG setup.",
  noTradeReasons: [],
  riskNotes: ["Research-only. No broker execution authority."],
  provenance: {
    methodology: "ICT",
    phase: "phase_1",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true,
    generatedAt: new Date().toISOString()
  },
  ...overrides
});

const signalWithNarrative = (narrative, overrides = {}) =>
  baseSignal({
    sessionNarrativeProfile: narrative.profile,
    sessionDirectionalRead: narrative.directionalRead,
    sessionNarrativeConfidence: narrative.confidence,
    sessionMitigationContext: narrative.mitigationContext,
    fvgTargetDetected: narrative.fvgTarget?.detected,
    fvgTargetDirection: narrative.fvgTarget?.direction,
    dataDepthStatus: narrative.dataDepth.status,
    availableLookbackDays: narrative.dataDepth.availableLookbackDays,
    requestedLookbackDays: narrative.dataDepth.requestedLookbackDays,
    sessionTopReasons: narrative.topReasons,
    ...overrides
  });

const advisorPacketFor = (narrative, signal, approvedProfileDecision) => ({
  packetId: `fixture_packet_${narrative.profile}`,
  source: "gotrader_ict_strategy_suite",
  mode: "advisory_only",
  generatedAt: new Date().toISOString(),
  requestedSymbol: "MNQ",
  brokerSymbol: "USTECH",
  primaryTimeframe: "15m",
  htfTimeframes: ["15m", "1h"],
  activeSource: {
    provider: "mt5_read_only",
    candleCount: 1000,
    firstTimestamp: narrative.events[0]?.timestamp,
    lastTimestamp: narrative.events.at(-1)?.timestamp,
    sourceFingerprint: `fixture_${narrative.profile}`,
    sourceLabel: "MT5 read-only CFD/proxy"
  },
  signals: [signal],
  recommendedSignal: signal,
  sessionNarrative: narrative,
  compactSummary: {
    compositeBias: signal.bias.composite,
    drawOnLiquidity: signal.drawOnLiquidity?.type,
    setup: signal.setup,
    decision: signal.decision,
    side: signal.side,
    confidence: signal.confidence,
    approvedProfileStatus: approvedProfileDecision.status,
    approvalScore: approvedProfileDecision.approvalScore,
    sessionNarrativeProfile: narrative.profile,
    sessionDirectionalRead: narrative.directionalRead,
    sessionNarrativeConfidence: narrative.confidence,
    sessionMitigationDetected: narrative.mitigationContext.detected,
    fvgTargetDetected: narrative.fvgTarget?.detected,
    fvgTargetDirection: narrative.fvgTarget?.direction,
    sessionTopReasons: narrative.topReasons,
    dataDepthStatus: narrative.dataDepth.status,
    availableLookbackDays: narrative.dataDepth.availableLookbackDays,
    requestedLookbackDays: narrative.dataDepth.requestedLookbackDays,
    noTradeReasonCount: signal.noTradeReasons.length
  },
  approvedProfileDecision,
  journalEvents: [],
  indexSmtJournalEvents: [],
  newsSessionRiskJournalEvents: [],
  journalStatus: "memory_only",
  safetyLocks: {
    rawCandlesIncluded: false,
    rawSnapshotsIncluded: false,
    secretsIncluded: false,
    accountDataIncluded: false,
    orderDataIncluded: false,
    positionDataIncluded: false
  },
  authority
});

const assertModelA = (suite) => {
  const narrative = suite.buildIctSessionNarrative(modelAFixture, {
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "15m",
    requestedLookbackDays: 90
  });
  const aliases = eventAliasSet(narrative);
  assert.equal(narrative.profile, "consolidation_manipulation_distribution");
  assert.equal(narrative.directionalRead, "bearish");
  assert.equal(narrative.mitigationContext.detected, true);
  assert.equal(narrative.mitigationContext.expansionConfirmed, true);
  assert.ok(aliases.has("buy_side_liquidity_swept"));
  assert.ok(aliases.has("ny_open_mitigation_tap"));
  assert.ok(aliases.has("ny_bearish_expansion"));
  assert.match(narrative.topReasons.join(" "), /distribution|bearish expansion|buy-side sweep/i);
  assert.equal(suite.assertIctSessionNarrativeIsCompact(narrative).ok, true);
  assert.equal(narrative.researchOnly, true);
  assert.deepEqual(narrative.authority, authority);
  return narrative;
};

const assertModelB = (suite) => {
  const narrative = suite.buildIctSessionNarrative(modelBFixture, {
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    primaryTimeframe: "15m",
    requestedLookbackDays: 90,
    tradingDate: "2026-06-04"
  });
  const aliases = eventAliasSet(narrative);
  assert.equal(narrative.profile, "ny_session_reversal_to_premium_fvg");
  assert.equal(narrative.directionalRead, "bullish");
  assert.equal(narrative.fvgTarget?.detected, true);
  assert.equal(narrative.fvgTarget?.direction, "premium");
  assert.ok(aliases.has("london_swept_asia_high") || aliases.has("midnight_open_reclaim"));
  assert.ok(aliases.has("sell_side_liquidity_swept"));
  assert.ok(aliases.has("ny_preopen_consolidation"));
  assert.ok(aliases.has("ny_open_consolidation_low_swept"));
  assert.ok(aliases.has("ny_reversal_higher"));
  assert.match(narrative.topReasons.join(" "), /premium FVG|reversal/i);
  assert.equal(suite.assertIctSessionNarrativeIsCompact(narrative).ok, true);
  assert.equal(narrative.researchOnly, true);
  assert.deepEqual(narrative.authority, authority);
  return narrative;
};

const assertApprovedProfileInfluence = (suite, modelA, modelB) => {
  const profile = suite.getDefaultApprovedSetupProfiles()[1];
  const supportiveShort = signalWithNarrative(modelA);
  const supportiveShortDecision = suite.evaluateApprovedSetupProfile(supportiveShort, profile);
  assert.ok(supportiveShortDecision.approvedReasons.some((reason) => /Session narrative confirms short candidate/i.test(reason)));

  const conflictingLongDecision = suite.evaluateApprovedSetupProfile(
    signalWithNarrative(modelA, {
      side: "long",
      bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "bullish" }, composite: "bullish" },
      dealingRange: { high: 109, low: 78, midpoint: 93.5, currentLocation: "discount", sourceTimeframe: "15m" },
      liquiditySwept: { type: "equal_lows", price: 90, timeframe: "15m", swept: true, distanceFromCurrent: -10 },
      drawOnLiquidity: { type: "previous_day_high", price: 110, timeframe: "daily", swept: false, distanceFromCurrent: 30 },
      displacement: { direction: "bullish", candleTime: isoNy("2026-06-05", "09:45"), impulseHigh: 101, impulseLow: 88, bodySize: 8, createdFvg: true },
      fairValueGap: { direction: "bullish", high: 99, low: 96, midpoint: 97.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-05", "09:45") },
      target: 110,
      invalidation: 88
    }),
    profile
  );
  assert.ok(conflictingLongDecision.watchlistReasons.some((reason) => /bearish read conflicts with long candidate/i.test(reason)));
  assert.ok(supportiveShortDecision.approvalScore > conflictingLongDecision.approvalScore);

  const supportiveLong = signalWithNarrative(modelB, {
    side: "long",
    bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "bullish" }, composite: "bullish" },
    dealingRange: { high: 190, low: 90, midpoint: 140, currentLocation: "discount", sourceTimeframe: "15m" },
    liquiditySwept: { type: "equal_lows", price: 108, timeframe: "15m", swept: true, distanceFromCurrent: -10 },
    drawOnLiquidity: { type: "previous_day_high", price: 190, timeframe: "daily", swept: false, distanceFromCurrent: 40 },
    displacement: { direction: "bullish", candleTime: isoNy("2026-06-04", "09:45"), impulseHigh: 156, impulseLow: 118, bodySize: 15, createdFvg: true },
    fairValueGap: { direction: "bullish", high: 170, low: 151, midpoint: 160.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-03", "06:30") },
    entryZone: { type: "fair_value_gap", high: 170, low: 151, midpoint: 160.5 },
    invalidation: 108,
    target: 190,
    rrEstimate: 2.2
  });
  const supportiveLongDecision = suite.evaluateApprovedSetupProfile(supportiveLong, profile);
  assert.ok(supportiveLongDecision.approvedReasons.some((reason) => /Session narrative confirms long candidate/i.test(reason)));
  const longWithoutSessionDecision = suite.evaluateApprovedSetupProfile(
    {
      ...supportiveLong,
      sessionDirectionalRead: undefined,
      sessionNarrativeProfile: undefined,
      fvgTargetDetected: false,
      fvgTargetDirection: "unknown"
    },
    profile
  );
  assert.ok(
    supportiveLongDecision.approvalScore > longWithoutSessionDecision.approvalScore,
    "bullish session read and premium FVG target should increase approved-profile score"
  );
  assert.equal(supportiveLong.fvgTargetDetected, true);
  assert.equal(supportiveLong.fvgTargetDirection, "premium");

  const riskBlockedDecision = suite.evaluateApprovedSetupProfile(
    {
      ...supportiveLong,
      newsSessionRisk: {
        newsRiskLevel: "blocked",
        sessionRiskState: "avoid",
        riskGovernorAction: "reject_candidate",
        riskGovernorConfidenceAdjustment: -0.25,
        blockingEventsCount: 1,
        cautionEventsCount: 0,
        newsSessionRiskNotes: ["Fixture risk block must override supportive narrative."]
      }
    },
    profile
  );
  assert.equal(riskBlockedDecision.status, "rejected_candidate");

  const flatDecision = suite.evaluateApprovedSetupProfile(
    signalWithNarrative(modelB, {
      side: "flat",
      decision: "no_trade",
      confidence: 0.9,
      rrEstimate: 4,
      noTradeReasons: ["Fixture proves session narrative does not create a standalone trade."]
    }),
    profile
  );
  assert.equal(flatDecision.status, "no_trade");

  return { supportiveShortDecision, supportiveLongDecision, riskBlockedDecision, flatDecision };
};

const assertCurrentReadAndSignalContract = (currentReadModule, signalModule, modelB, supportiveLongDecision) => {
  const recommendedSignal = signalWithNarrative(modelB, {
    side: "long",
    bias: { primary: "bullish", htf: { "15m": "bullish", "1h": "bullish" }, composite: "bullish" },
    dealingRange: { high: 190, low: 90, midpoint: 140, currentLocation: "discount", sourceTimeframe: "15m" },
    liquiditySwept: { type: "equal_lows", price: 108, timeframe: "15m", swept: true, distanceFromCurrent: -10 },
    drawOnLiquidity: { type: "previous_day_high", price: 190, timeframe: "daily", swept: false, distanceFromCurrent: 40 },
    displacement: { direction: "bullish", candleTime: isoNy("2026-06-04", "09:45"), impulseHigh: 156, impulseLow: 118, bodySize: 15, createdFvg: true },
    fairValueGap: { direction: "bullish", high: 170, low: 151, midpoint: 160.5, timeframe: "15m", mitigated: false, createdAt: isoNy("2026-06-03", "06:30") },
    entryZone: { type: "fair_value_gap", high: 170, low: 151, midpoint: 160.5 },
    invalidation: 108,
    target: 190,
    rrEstimate: 2.2,
    approvedProfileDecision: supportiveLongDecision
  });
  const packet = advisorPacketFor(modelB, recommendedSignal, supportiveLongDecision);
  assert.equal(hasForbiddenPayloadFields(packet), false);
  const currentRead = currentReadModule.buildIctCurrentReadFromPacket(packet);
  assert.equal(currentRead.packetSource, "live_mt5");
  assert.equal(currentRead.sessionNarrativeProfile, modelB.profile);
  assert.equal(currentRead.sessionDirectionalRead, "bullish");
  assert.equal(currentRead.fvgTargetDetected, true);
  assert.equal(currentRead.fvgTargetDirection, "premium");
  assert.equal(currentRead.authority.executionAuthority, "none");

  const signal = signalModule.buildIctResearchSignalFromCurrentRead(currentRead);
  assert.equal(signal.researchOnly, true);
  assert.equal(signal.executionAllowed, false);
  assert.equal(signal.authority.executionAuthority, "none");
  assert.equal(signal.authority.brokerAuthority, "none");
  assert.equal(signal.authority.readinessOverrideAuthority, "none");
  assert.equal(signal.sessionNarrativeProfile, modelB.profile);
  assert.equal(signal.sessionDirectionalRead, "bullish");
  assert.equal(signal.fvgTargetDirection, "premium");
  assert.equal(hasForbiddenPayloadFields(signal), false);
  return { packet, currentRead, signal };
};

const fetchWithTimeout = async (url, timeoutMs = 4500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
};

const nyDateFor = (timestamp) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const runOptionalMt5Scan = async (suite) => {
  const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
  const brokerSymbol = process.env.MT5_READONLY_BROKER_SYMBOL || "USTECH";
  const requestedSymbol = process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ";
  const timeframe = "15m";
  const endpoint = `${bridgeUrl}/candles?requestedSymbol=${encodeURIComponent(requestedSymbol)}&symbol=${encodeURIComponent(brokerSymbol)}&timeframe=${timeframe}&limit=1000`;
  try {
    const response = await fetchWithTimeout(endpoint);
    if (!response.ok || !Array.isArray(response.payload?.candles)) {
      return {
        status: "unavailable",
        bridgeUrl,
        reason: `MT5 wrapper returned ${response.status}`,
        authority
      };
    }
    const candles = response.payload.candles.map((raw, index) => ({
      id: raw.id ?? `mt5_15m_${index}`,
      symbol: requestedSymbol,
      timeframe,
      timestamp: raw.timestamp ?? raw.time,
      open: Number(raw.open),
      high: Number(raw.high),
      low: Number(raw.low),
      close: Number(raw.close),
      volume: Number(raw.volume ?? raw.tickVolume ?? 0)
    })).filter((c) => c.timestamp && [c.open, c.high, c.low, c.close].every(Number.isFinite));
    const dates = [...new Set(candles.map((c) => nyDateFor(c.timestamp)))].slice(-7);
    const counts = {};
    const samples = [];
    for (const tradingDate of dates) {
      const narrative = suite.buildIctSessionNarrative(candles, {
        requestedSymbol,
        brokerSymbol,
        primaryTimeframe: timeframe,
        requestedLookbackDays: 90,
        tradingDate
      });
      counts[narrative.profile] = (counts[narrative.profile] ?? 0) + 1;
      samples.push({
        tradingDate,
        profile: narrative.profile,
        directionalRead: narrative.directionalRead,
        confidence: narrative.confidence,
        topReason: narrative.topReasons[0]
      });
    }
    return {
      status: "scanned",
      bridgeUrl,
      requestedSymbol,
      brokerSymbol,
      timeframe,
      candleCount: candles.length,
      daysScanned: dates.length,
      profileCounts: counts,
      samples,
      note: "Live MT5 scan is diagnostic only and does not fail when no model appears.",
      authority
    };
  } catch (error) {
    return {
      status: "unavailable",
      bridgeUrl,
      reason: error instanceof Error ? error.message : String(error),
      note: "Optional live MT5 scan skipped because the read-only wrapper is offline or timed out.",
      authority
    };
  }
};

const main = async () => {
  compileSuiteForNode();
  const narrativeModule = await importCompiled("ictSessionNarrative.mjs");
  const approvedModule = await importCompiled("ictApprovedSetupProfile.mjs");
  const currentReadModule = await importCompiled("ictCurrentRead.mjs");
  const signalModule = await importCompiled("ictSignalContract.mjs");
  const suite = { ...narrativeModule, ...approvedModule };

  const modelA = assertModelA(suite);
  const modelB = assertModelB(suite);
  const profileChecks = assertApprovedProfileInfluence(suite, modelA, modelB);
  const contractChecks = assertCurrentReadAndSignalContract(
    currentReadModule,
    signalModule,
    modelB,
    profileChecks.supportiveLongDecision
  );
  const mt5Scan = await runOptionalMt5Scan(suite);

  const output = {
    status: "passed",
    modelA: {
      profile: modelA.profile,
      directionalRead: modelA.directionalRead,
      mitigationDetected: modelA.mitigationContext.detected,
      expansionConfirmed: modelA.mitigationContext.expansionConfirmed,
      eventAliases: [...eventAliasSet(modelA)],
      topReasons: modelA.topReasons
    },
    modelB: {
      profile: modelB.profile,
      directionalRead: modelB.directionalRead,
      fvgTargetDetected: modelB.fvgTarget?.detected,
      fvgTargetDirection: modelB.fvgTarget?.direction,
      eventAliases: [...eventAliasSet(modelB)],
      topReasons: modelB.topReasons
    },
    propagation: {
      currentReadProfile: contractChecks.currentRead.sessionNarrativeProfile,
      currentReadSource: contractChecks.currentRead.packetSource,
      signalStatus: contractChecks.signal.status,
      signalProfile: contractChecks.signal.sessionNarrativeProfile,
      signalExecutionAllowed: contractChecks.signal.executionAllowed,
      approvedShortScore: profileChecks.supportiveShortDecision.approvalScore,
      approvedLongScore: profileChecks.supportiveLongDecision.approvalScore,
      riskBlockedStatus: profileChecks.riskBlockedDecision.status,
      flatStatus: profileChecks.flatDecision.status
    },
    packetSafety: {
      rawCandlesIncluded: false,
      rawSnapshotsIncluded: false,
      secretsIncluded: false,
      accountDataIncluded: false,
      orderDataIncluded: false,
      positionDataIncluded: false,
      authority
    },
    mt5Scan
  };
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
