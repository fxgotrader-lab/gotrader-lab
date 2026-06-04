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

const healthPayload = () => ({
  provider: "openclaw_phone",
  bridgeStatus: "running",
  advisoryStatus,
  host,
  port,
  tokenRequired: Boolean(token),
  openClawAgentEndpointConfigured: Boolean(openClawAgentEndpoint),
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

  // Future live OpenClaw/Hermes routing belongs here. The stub intentionally
  // does not call MT5, brokers, accounts, orders, positions, or readiness gates.
  writeJson(response, 200, buildStubResponse(packet), origin);
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
  console.log("[openclaw-phone] authority: execution none, broker none, readiness override none");
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
