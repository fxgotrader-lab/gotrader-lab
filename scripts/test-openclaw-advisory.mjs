const DEFAULT_TIMEOUT_MS = 30_000;

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};

const endpointHostLabel = (endpoint) => {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint ? "custom endpoint" : "not configured";
  }
};

const buildSamplePacket = () => ({
  packetId: `openclaw_phone_diagnostic_${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: "gotrader_ai_lab",
  advisoryMode: "explain_cycle",
  latestCycle: {
    cycleId: "diagnostic_sample",
    dataSource: "MT5 read-only CFD/proxy sample",
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    candleCount: 1000,
    firstTimestamp: "2026-06-01T09:40:00.000Z",
    lastTimestamp: "2026-06-04T23:55:00.000Z",
    regime: {
      label: "range_high_vol",
      confidence: 0.64,
      dataQuality: "sufficient",
      transitionPending: true
    },
    ictThesis: "bullish research thesis sample",
    grinchProfile: "none/not_present",
    grinchBlocker: "grinch_timing_expired",
    trades: 6,
    winRate: 0.167,
    averageR: 0.49,
    drawdown: 0.18,
    profitFactor: 3.17,
    readiness: "Research Ready",
    evidenceScore: 45,
    maturityScore: 45,
    walkForwardVerdict: "unavailable",
    blockers: [
      "research_quality_below_candidate_threshold",
      "walk_forward_unavailable",
      "source_is_mt5_read_only_cfd_proxy"
    ]
  },
  layerContribution: {
    ictFoundationCandidates: 16,
    grinchQualifiedCandidates: 0,
    grinchBlockedCandidates: 16,
    profileInvalidBlocks: 7,
    timingExpiredBlocks: 9,
    pdArrayInvalidBlocks: 1,
    entryConfirmationFailures: 3,
    fullStackSetups: 0,
    layerContributionSummary:
      "ICT foundation remains the base; Grinch refinement is currently blocking the full-stack setup."
  },
  sourceContext: {
    activeResearchSource: "MT5 read-only candle feed - no execution authority",
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    candleCount: 1000,
    warning: "MT5 read-only USTECH is CFD/proxy data for MNQ/NQ-style research, not CME MNQ futures truth.",
    authority
  },
  safety: {
    ...authority,
    constraints: [
      "OpenClaw advisory is explanation and calibration guidance only.",
      "OpenClaw cannot change thresholds directly.",
      "OpenClaw cannot auto-apply self-improvement proposals.",
      "OpenClaw cannot approve readiness.",
      "OpenClaw cannot place trades or call broker/order/account/position tools."
    ]
  },
  userQuestion: "Explain this diagnostic GoTrader cycle and identify safe next research steps.",
  excludedLargeSections: [
    "candle arrays",
    "full runtime snapshot",
    "full canonical source objects",
    "raw agent logs",
    "raw evidence ledger",
    "Research Flow Tape history",
    "raw JSON diagnostics",
    "screenshots/base64",
    "imported OHLCV arrays",
    "secrets",
    "account/order/position data"
  ]
});

const normalizeResponse = (payload) => {
  const candidate = payload?.response ?? payload;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return candidate;
};

const validateResponse = (response) => {
  const errors = [];
  if (!["complete", "unavailable", "error", "timeout"].includes(response.advisoryStatus)) {
    errors.push("advisoryStatus must be complete, unavailable, error, or timeout.");
  }
  if (typeof response.summary !== "string" || !response.summary.trim()) {
    errors.push("summary must be a non-empty string.");
  }
  for (const key of ["topBlockers", "nextActions", "calibrationRecommendations", "riskNotes", "questions"]) {
    if (!Array.isArray(response[key])) {
      errors.push(`${key} must be an array.`);
    }
  }
  if (response.authority?.executionAuthority !== "none") {
    errors.push("authority.executionAuthority must be none.");
  }
  if (response.authority?.brokerAuthority !== "none") {
    errors.push("authority.brokerAuthority must be none.");
  }
  if (response.authority?.readinessOverrideAuthority !== "none") {
    errors.push("authority.readinessOverrideAuthority must be none.");
  }
  if (response.selfImprovementProposalIntent?.autoApplyAllowed !== undefined && response.selfImprovementProposalIntent.autoApplyAllowed !== false) {
    errors.push("selfImprovementProposalIntent.autoApplyAllowed must be false when present.");
  }
  return errors;
};

const run = async () => {
  const endpoint = process.env.OPENCLAW_ADVISORY_URL?.trim();
  const timeoutMs = parsePositiveInteger(process.env.OPENCLAW_ADVISORY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const token = process.env.OPENCLAW_ADVISORY_TOKEN?.trim();

  if (!endpoint) {
    process.stdout.write(JSON.stringify({
      status: "not_configured",
      message: "OPENCLAW_ADVISORY_URL is not set. Configure the phone LAN endpoint to run this diagnostic.",
      example: "http://192.168.x.x:8797/gotrader/advisory",
      mt5Called: false,
      secretsLogged: false,
      authority
    }, null, 2));
    process.stdout.write("\n");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const packet = buildSamplePacket();
  let response;
  let payload;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(packet),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    process.stdout.write(JSON.stringify({
      status: timedOut ? "timeout" : "offline",
      endpointHost: endpointHostLabel(endpoint),
      timeoutMs,
      message: timedOut
        ? `OpenClaw phone advisory endpoint timed out after ${timeoutMs}ms.`
        : "OpenClaw phone advisory endpoint is unreachable. Deterministic GoTrader research remains available.",
      mt5Called: false,
      tokenConfigured: Boolean(token),
      tokenLogged: false,
      authority
    }, null, 2));
    process.stdout.write("\n");
    return;
  } finally {
    clearTimeout(timer);
  }

  try {
    payload = await response.json();
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: "invalid_response",
      endpointHost: endpointHostLabel(endpoint),
      httpStatus: response.status,
      message: "OpenClaw endpoint returned non-JSON.",
      mt5Called: false,
      tokenConfigured: Boolean(token),
      tokenLogged: false,
      authority
    }, null, 2));
    process.stdout.write("\n");
    process.exitCode = 1;
    return;
  }

  const advisoryResponse = normalizeResponse(payload);
  const errors = advisoryResponse ? validateResponse(advisoryResponse) : ["Response body did not contain an advisory response object."];
  const result = {
    status: errors.length ? "failed_contract_validation" : "passed",
    endpointHost: endpointHostLabel(endpoint),
    httpStatus: response.status,
    timeoutMs,
    advisoryStatus: advisoryResponse?.advisoryStatus,
    summary: advisoryResponse?.summary,
    topBlockers: Array.isArray(advisoryResponse?.topBlockers) ? advisoryResponse.topBlockers.slice(0, 5) : [],
    nextActions: Array.isArray(advisoryResponse?.nextActions) ? advisoryResponse.nextActions.slice(0, 5) : [],
    calibrationRecommendations: Array.isArray(advisoryResponse?.calibrationRecommendations)
      ? advisoryResponse.calibrationRecommendations.slice(0, 5)
      : [],
    selfImprovementProposalIntent: advisoryResponse?.selfImprovementProposalIntent
      ? {
          createProposal: Boolean(advisoryResponse.selfImprovementProposalIntent.createProposal),
          proposalTitle: advisoryResponse.selfImprovementProposalIntent.proposalTitle,
          autoApplyAllowed: false
        }
      : undefined,
    riskNotes: Array.isArray(advisoryResponse?.riskNotes) ? advisoryResponse.riskNotes.slice(0, 5) : [],
    questions: Array.isArray(advisoryResponse?.questions) ? advisoryResponse.questions.slice(0, 5) : [],
    errors,
    mt5Called: false,
    candleArraysSent: false,
    secretsSentInBody: false,
    tokenConfigured: Boolean(token),
    tokenLogged: false,
    authority: advisoryResponse?.authority ?? authority
  };

  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write("\n");

  if (!response.ok || errors.length) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
