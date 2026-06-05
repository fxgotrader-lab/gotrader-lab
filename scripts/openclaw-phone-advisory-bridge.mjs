#!/usr/bin/env node
import http from "node:http";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const host = process.env.OPENCLAW_PHONE_BRIDGE_HOST?.trim() || "0.0.0.0";
const port = Number(process.env.OPENCLAW_PHONE_BRIDGE_PORT || 8797);
const token = process.env.OPENCLAW_PHONE_BRIDGE_TOKEN?.trim();
const openClawAgentEndpoint = process.env.OPENCLAW_AGENT_ENDPOINT?.trim();
const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};
const openClawAgentTimeoutMs = parsePositiveInteger(process.env.OPENCLAW_AGENT_TIMEOUT_MS, 15_000);
const advisoryStatus = openClawAgentEndpoint ? "connected" : "stub";

const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);

const forbiddenStructuralKeys = new Set([
  "accountMutation",
  "brokerCommand",
  "brokerExecution",
  "buyMarket",
  "cancelOrder",
  "cancelPendingOrder",
  "closePosition",
  "connectLiveBroker",
  "enableLiveTrading",
  "executionIntent",
  "liveTrading",
  "modifyOrder",
  "mt5Credentials",
  "orderMutation",
  "orderPlacement",
  "orderRoute",
  "placeMarketOrder",
  "placeOrder",
  "positionMutation",
  "sellMarket"
]);

const unsafeQuestionPattern =
  /\b(place|send|submit|execute|buy|sell|open|close|modify|cancel|route|enable)\b.*\b(trade|order|position|live|broker|market)\b/i;

const now = () => new Date().toISOString();

const writeJson = (response, statusCode, payload, origin) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(origin)
  });
  response.end(JSON.stringify(payload, null, 2));
};

const corsHeaders = (origin) => {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : undefined;
  return {
    ...(allowedOrigin ? { "access-control-allow-origin": allowedOrigin } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "600",
    "vary": "Origin"
  };
};

const readRequestBody = (request, maxBytes = 250_000) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body exceeded ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const parseJsonBody = async (request) => {
  const body = await readRequestBody(request);
  if (!body.trim()) {
    return {};
  }
  return JSON.parse(body);
};

const tokenAuthorized = (request) => {
  if (!token) {
    return true;
  }
  const header = request.headers.authorization;
  return header === `Bearer ${token}`;
};

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asStringArray = (value, limit = 8) =>
  Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, limit) : [];

const truncateText = (value, maxLength = 2_000) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const endpointHostLabel = (endpoint) => {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint ? "custom endpoint" : "not configured";
  }
};

const findForbiddenKeys = (value, path = []) => {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...findForbiddenKeys(item, [...path, String(index)])));
    return findings;
  }
  if (!isPlainObject(value)) {
    return findings;
  }
  for (const [key, nested] of Object.entries(value)) {
    const keyPath = [...path, key];
    if (forbiddenStructuralKeys.has(key)) {
      findings.push(keyPath.join("."));
    }
    findings.push(...findForbiddenKeys(nested, keyPath));
  }
  return findings;
};

const buildSafeAgentPacket = (packet) => ({
  packetId: truncateText(packet.packetId, 160),
  timestamp: truncateText(packet.timestamp, 80) ?? now(),
  source: "gotrader_ai_lab",
  advisoryMode: truncateText(packet.advisoryMode, 80) ?? "explain_cycle",
  latestCycle: {
    cycleId: truncateText(packet.latestCycle?.cycleId, 160),
    dataSource: truncateText(packet.latestCycle?.dataSource, 240) ?? "unknown",
    provider: truncateText(packet.latestCycle?.provider, 80) ?? "unknown",
    requestedSymbol: truncateText(packet.latestCycle?.requestedSymbol, 80),
    brokerSymbol: truncateText(packet.latestCycle?.brokerSymbol, 80),
    candleCount: Number(packet.latestCycle?.candleCount ?? 0),
    firstTimestamp: truncateText(packet.latestCycle?.firstTimestamp, 80),
    lastTimestamp: truncateText(packet.latestCycle?.lastTimestamp, 80),
    regime: {
      label: truncateText(packet.latestCycle?.regime?.label, 80) ?? "unknown",
      confidence: Number(packet.latestCycle?.regime?.confidence ?? 0),
      dataQuality: truncateText(packet.latestCycle?.regime?.dataQuality, 80) ?? "unknown",
      transitionPending: Boolean(packet.latestCycle?.regime?.transitionPending)
    },
    ictThesis: truncateText(packet.latestCycle?.ictThesis, 240),
    grinchProfile: truncateText(packet.latestCycle?.grinchProfile, 160),
    grinchBlocker: truncateText(packet.latestCycle?.grinchBlocker, 160),
    trades: Number(packet.latestCycle?.trades ?? 0),
    winRate: Number(packet.latestCycle?.winRate ?? 0),
    averageR: Number(packet.latestCycle?.averageR ?? 0),
    drawdown: Number(packet.latestCycle?.drawdown ?? 0),
    profitFactor:
      packet.latestCycle?.profitFactor === null || packet.latestCycle?.profitFactor === undefined
        ? null
        : Number(packet.latestCycle.profitFactor),
    readiness: truncateText(packet.latestCycle?.readiness, 160) ?? "unknown",
    evidenceScore: Number(packet.latestCycle?.evidenceScore ?? 0),
    maturityScore: Number(packet.latestCycle?.maturityScore ?? 0),
    walkForwardVerdict: truncateText(packet.latestCycle?.walkForwardVerdict, 160),
    blockers: asStringArray(packet.latestCycle?.blockers)
  },
  layerContribution: {
    ictFoundationCandidates: Number(packet.layerContribution?.ictFoundationCandidates ?? 0),
    grinchQualifiedCandidates: Number(packet.layerContribution?.grinchQualifiedCandidates ?? 0),
    grinchBlockedCandidates: Number(packet.layerContribution?.grinchBlockedCandidates ?? 0),
    profileInvalidBlocks: Number(packet.layerContribution?.profileInvalidBlocks ?? 0),
    timingExpiredBlocks: Number(packet.layerContribution?.timingExpiredBlocks ?? 0),
    pdArrayInvalidBlocks: Number(packet.layerContribution?.pdArrayInvalidBlocks ?? 0),
    entryConfirmationFailures: Number(packet.layerContribution?.entryConfirmationFailures ?? 0),
    fullStackSetups: Number(packet.layerContribution?.fullStackSetups ?? 0),
    layerContributionSummary:
      truncateText(packet.layerContribution?.layerContributionSummary, 500) ??
      "Layer contribution summary unavailable."
  },
  sourceContext: {
    activeResearchSource: truncateText(packet.sourceContext?.activeResearchSource, 240) ?? "unknown",
    provider: truncateText(packet.sourceContext?.provider, 80) ?? "unknown",
    requestedSymbol: truncateText(packet.sourceContext?.requestedSymbol, 80),
    brokerSymbol: truncateText(packet.sourceContext?.brokerSymbol, 80),
    candleCount: Number(packet.sourceContext?.candleCount ?? 0),
    warning: truncateText(packet.sourceContext?.warning, 500) ?? "",
    authority
  },
  safety: {
    ...authority,
    constraints: asStringArray(packet.safety?.constraints, 12)
  },
  userQuestion: truncateText(packet.userQuestion, 800),
  excludedLargeSections: [
    ...new Set([
      ...asStringArray(packet.excludedLargeSections, 20),
      "candle arrays",
      "full runtime snapshot",
      "raw agent logs",
      "raw evidence ledger",
      "screenshots/base64",
      "secrets",
      "MT5 credentials",
      "account data",
      "order data",
      "position data"
    ])
  ]
});

const validateAuthority = (packet) => {
  const errors = [];
  const safety = packet?.safety;
  const sourceAuthority = packet?.sourceContext?.authority;
  for (const [label, candidate] of [
    ["safety", safety],
    ["sourceContext.authority", sourceAuthority]
  ]) {
    if (!candidate) {
      continue;
    }
    if (candidate.executionAuthority !== undefined && candidate.executionAuthority !== "none") {
      errors.push(`${label}.executionAuthority must be none.`);
    }
    if (candidate.brokerAuthority !== undefined && candidate.brokerAuthority !== "none") {
      errors.push(`${label}.brokerAuthority must be none.`);
    }
    if (candidate.readinessOverrideAuthority !== undefined && candidate.readinessOverrideAuthority !== "none") {
      errors.push(`${label}.readinessOverrideAuthority must be none.`);
    }
  }
  if (packet?.selfImprovementProposalIntent?.autoApplyAllowed === true) {
    errors.push("selfImprovementProposalIntent.autoApplyAllowed cannot be true.");
  }
  return errors;
};

const validateAdvisoryPacket = (packet) => {
  const errors = [];
  if (!isPlainObject(packet)) {
    return ["Request body must be a JSON object."];
  }
  if (packet.source !== "gotrader_ai_lab") {
    errors.push("source must be gotrader_ai_lab.");
  }
  if (!packet.safety) {
    errors.push("safety authority object is required.");
  }
  errors.push(...validateAuthority(packet));
  const forbiddenKeys = findForbiddenKeys(packet);
  if (forbiddenKeys.length) {
    errors.push(`Forbidden execution/account/order/position fields found: ${forbiddenKeys.slice(0, 6).join(", ")}.`);
  }
  if (typeof packet.userQuestion === "string" && unsafeQuestionPattern.test(packet.userQuestion)) {
    errors.push("userQuestion appears to request execution/order/broker action.");
  }
  return errors;
};

const deriveBlockers = (packet) => {
  const blockers = packet?.latestCycle?.blockers;
  if (Array.isArray(blockers) && blockers.length) {
    return blockers.map(String).filter(Boolean).slice(0, 8);
  }
  const grinchBlocker = packet?.latestCycle?.grinchBlocker;
  return grinchBlocker ? [String(grinchBlocker)] : ["openclaw_skill_routing_not_wired"];
};

const buildStubResponse = (packet) => {
  const requestedSymbol = packet?.latestCycle?.requestedSymbol ?? packet?.sourceContext?.requestedSymbol ?? "unknown";
  const brokerSymbol = packet?.latestCycle?.brokerSymbol ?? packet?.sourceContext?.brokerSymbol ?? "unknown";
  const provider = packet?.latestCycle?.provider ?? packet?.sourceContext?.provider ?? "unknown";
  const candleCount = Number(packet?.latestCycle?.candleCount ?? packet?.sourceContext?.candleCount ?? 0);
  return {
    advisoryStatus: "complete",
    summary:
      `Phone OpenClaw bridge received the GoTrader research packet for ${requestedSymbol} via ${brokerSymbol} (${provider}, ${candleCount.toLocaleString()} candles). ` +
      "OpenClaw skill routing is not wired yet, so this is a safe stub advisory.",
    topBlockers: deriveBlockers(packet),
    nextActions: [
      "Wire the bridge to the OpenClaw advisory skill.",
      "Keep deterministic GoTrader gates authoritative.",
      "Use GoTrader walk-forward, evidence, maturity, and readiness gates before treating any recommendation as useful."
    ],
    calibrationRecommendations: [],
    selfImprovementProposalIntent: {
      createProposal: false,
      candidateFamilies: [],
      requiresWalkForward: true,
      autoApplyAllowed: false
    },
    riskNotes: [
      "Advisory only; no execution authority.",
      "Phone bridge does not call MT5, brokers, orders, accounts, or positions.",
      "Readiness cannot be approved or overridden by OpenClaw."
    ],
    questions: [
      "Which OpenClaw advisory skill should this bridge call when live routing is enabled?"
    ],
    authority
  };
};

const buildUnavailableResponse = (packet, reason, detail) => ({
  advisoryStatus: "unavailable",
  summary:
    `Phone OpenClaw bridge could not complete live OpenClaw skill routing (${reason}). ` +
    "Returning a safe advisory-unavailable response; deterministic GoTrader research remains authoritative.",
  topBlockers: [reason, ...deriveBlockers(packet)].slice(0, 8),
  nextActions: [
    "Check the OPENCLAW_AGENT_ENDPOINT service on the phone.",
    "Keep deterministic GoTrader gates authoritative.",
    "Use the safe stub response until the OpenClaw advisory skill endpoint is healthy."
  ],
  calibrationRecommendations: [],
  selfImprovementProposalIntent: {
    createProposal: false,
    candidateFamilies: [],
    requiresWalkForward: true,
    autoApplyAllowed: false
  },
  riskNotes: [
    "Advisory unavailable; no execution authority was granted.",
    "Phone bridge did not call MT5, brokers, orders, accounts, or positions.",
    ...(detail ? [truncateText(detail, 240)] : [])
  ],
  questions: [
    "Is the OpenClaw advisory skill endpoint running and returning OpenClawAdvisoryResponse JSON?"
  ],
  authority
});

const unsafeResponse = (summary, blockers = ["unsafe_request_rejected"]) => ({
  advisoryStatus: "error",
  summary,
  topBlockers: blockers,
  nextActions: ["Return to deterministic GoTrader research and remove execution/account/order/position fields."],
  calibrationRecommendations: [],
  riskNotes: ["Rejected by phone OpenClaw bridge safety boundary."],
  questions: [],
  authority
});

const normalizeAgentResponse = (payload) => {
  const candidate = payload?.response ?? payload;
  if (!isPlainObject(candidate)) {
    return { errors: ["OpenClaw agent response must be a JSON object."] };
  }

  const forbiddenKeys = findForbiddenKeys(candidate);
  const errors = [];
  if (forbiddenKeys.length) {
    errors.push(`Forbidden execution/account/order/position fields found in response: ${forbiddenKeys.slice(0, 6).join(", ")}.`);
  }

  if (!["complete", "unavailable", "error", "timeout"].includes(candidate.advisoryStatus)) {
    errors.push("advisoryStatus must be complete, unavailable, error, or timeout.");
  }
  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) {
    errors.push("summary must be a non-empty string.");
  }
  for (const key of ["topBlockers", "nextActions", "calibrationRecommendations", "riskNotes", "questions"]) {
    if (!Array.isArray(candidate[key])) {
      errors.push(`${key} must be an array.`);
    }
  }
  if (
    candidate.authority?.executionAuthority !== "none" ||
    candidate.authority?.brokerAuthority !== "none" ||
    candidate.authority?.readinessOverrideAuthority !== "none"
  ) {
    errors.push("authority fields must all be none.");
  }
  if (
    candidate.selfImprovementProposalIntent?.autoApplyAllowed !== undefined &&
    candidate.selfImprovementProposalIntent.autoApplyAllowed !== false
  ) {
    errors.push("selfImprovementProposalIntent.autoApplyAllowed must be false when present.");
  }

  if (errors.length) {
    return { errors };
  }

  return {
    response: {
      advisoryStatus: candidate.advisoryStatus,
      summary: truncateText(candidate.summary, 1_500) ?? "OpenClaw advisory response received.",
      topBlockers: asStringArray(candidate.topBlockers),
      nextActions: asStringArray(candidate.nextActions),
      calibrationRecommendations: asStringArray(candidate.calibrationRecommendations),
      selfImprovementProposalIntent: isPlainObject(candidate.selfImprovementProposalIntent)
        ? {
            createProposal: Boolean(candidate.selfImprovementProposalIntent.createProposal),
            proposalTitle: truncateText(candidate.selfImprovementProposalIntent.proposalTitle, 160),
            targetSubsystem: truncateText(candidate.selfImprovementProposalIntent.targetSubsystem, 160),
            candidateFamilies: asStringArray(candidate.selfImprovementProposalIntent.candidateFamilies),
            requiresWalkForward: Boolean(candidate.selfImprovementProposalIntent.requiresWalkForward),
            autoApplyAllowed: false
          }
        : undefined,
      riskNotes: asStringArray(candidate.riskNotes),
      questions: asStringArray(candidate.questions),
      authority
    }
  };
};

const callOpenClawAgent = async (packet) => {
  if (!openClawAgentEndpoint) {
    return { routed: false, response: buildStubResponse(packet) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openClawAgentTimeoutMs);
  let agentResponse;
  try {
    agentResponse = await fetch(openClawAgentEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(buildSafeAgentPacket(packet)),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      routed: true,
      response: buildUnavailableResponse(
        packet,
        timedOut ? "openclaw_agent_timeout" : "openclaw_agent_unreachable",
        timedOut
          ? `OpenClaw agent endpoint timed out after ${openClawAgentTimeoutMs}ms.`
          : "OpenClaw agent endpoint was unreachable."
      )
    };
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await agentResponse.json();
  } catch {
    return {
      routed: true,
      response: buildUnavailableResponse(packet, "openclaw_agent_non_json_response", "OpenClaw agent returned non-JSON.")
    };
  }

  if (!agentResponse.ok) {
    return {
      routed: true,
      response: buildUnavailableResponse(
        packet,
        "openclaw_agent_http_error",
        `OpenClaw agent returned HTTP ${agentResponse.status}.`
      )
    };
  }

  const normalized = normalizeAgentResponse(payload);
  if (normalized.errors?.length) {
    return {
      routed: true,
      response: buildUnavailableResponse(
        packet,
        "openclaw_agent_invalid_response",
        normalized.errors.slice(0, 4).join(" ")
      )
    };
  }

  return { routed: true, response: normalized.response };
};

const healthPayload = () => ({
  provider: "openclaw_phone",
  bridgeStatus: "running",
  advisoryStatus,
  host,
  port,
  tokenRequired: Boolean(token),
  openClawAgentEndpointConfigured: Boolean(openClawAgentEndpoint),
  openClawAgentEndpointHost: openClawAgentEndpoint ? endpointHostLabel(openClawAgentEndpoint) : undefined,
  openClawAgentTimeoutMs,
  timestamp: now(),
  authority
});

const handleAdvisory = async (request, response, origin) => {
  if (!tokenAuthorized(request)) {
    writeJson(response, 401, {
      provider: "openclaw_phone",
      advisoryStatus: "error",
      summary: "Unauthorized.",
      authority
    }, origin);
    return;
  }

  let packet;
  try {
    packet = await parseJsonBody(request);
  } catch (error) {
    writeJson(response, 400, unsafeResponse("Invalid JSON request body.", ["invalid_json"]), origin);
    return;
  }

  const validationErrors = validateAdvisoryPacket(packet);
  if (validationErrors.length) {
    writeJson(
      response,
      400,
      unsafeResponse("GoTrader advisory packet rejected by phone bridge safety checks.", validationErrors),
      origin
    );
    return;
  }

  const routed = await callOpenClawAgent(packet);
  writeJson(response, 200, routed.response, origin);
};

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, healthPayload(), origin);
    return;
  }

  if (request.method === "POST" && url.pathname === "/gotrader/advisory") {
    await handleAdvisory(request, response, origin);
    return;
  }

  writeJson(response, 404, {
    provider: "openclaw_phone",
    bridgeStatus: "running",
    advisoryStatus: "error",
    summary: "Route not found. Available routes: GET /health, POST /gotrader/advisory.",
    authority
  }, origin);
});

server.listen(port, host, () => {
  const printableHost = host === "0.0.0.0" ? "0.0.0.0" : host;
  console.log(`[openclaw-phone] listening on http://${printableHost}:${port}`);
  console.log("[openclaw-phone] routes: GET /health, POST /gotrader/advisory");
  console.log(`[openclaw-phone] advisoryStatus=${advisoryStatus}; tokenRequired=${Boolean(token)}`);
  if (openClawAgentEndpoint) {
    console.log(`[openclaw-phone] agent endpoint: ${endpointHostLabel(openClawAgentEndpoint)}; timeoutMs=${openClawAgentTimeoutMs}`);
  }
  console.log("[openclaw-phone] authority: execution none, broker none, readiness override none");
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
