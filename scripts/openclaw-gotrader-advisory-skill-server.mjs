#!/usr/bin/env node
import http from "node:http";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const host = process.env.OPENCLAW_GOTRADER_SKILL_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.OPENCLAW_GOTRADER_SKILL_PORT || 8798);
const route = "/gotrader/advisory-skill";

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

const corsHeaders = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "600"
});

const writeJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  response.end(JSON.stringify(payload, null, 2));
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

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asStringArray = (value, limit = 8) =>
  Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, limit) : [];

const truncateText = (value, maxLength = 1_500) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const formatPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "unknown";
};

const formatScore = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(Math.round(number)) : "not reported";
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

const validateAuthority = (candidate, label) => {
  const errors = [];
  if (!candidate) {
    return errors;
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
  return errors;
};

const validatePacket = (packet) => {
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
  errors.push(...validateAuthority(packet.safety, "safety"));
  errors.push(...validateAuthority(packet.sourceContext?.authority, "sourceContext.authority"));
  if (packet.selfImprovementProposalIntent?.autoApplyAllowed === true) {
    errors.push("selfImprovementProposalIntent.autoApplyAllowed cannot be true.");
  }
  const forbiddenKeys = findForbiddenKeys(packet);
  if (forbiddenKeys.length) {
    errors.push(`Forbidden execution/account/order/position fields found: ${forbiddenKeys.slice(0, 8).join(", ")}.`);
  }
  return errors;
};

const uniqueStrings = (values, limit = 8) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = truncateText(value, 160);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
};

const sourceInfo = (packet) => {
  const latest = packet.latestCycle ?? {};
  const source = packet.sourceContext ?? {};
  const provider = latest.provider ?? source.provider ?? "unknown";
  const requestedSymbol = latest.requestedSymbol ?? source.requestedSymbol ?? "unknown";
  const brokerSymbol = latest.brokerSymbol ?? source.brokerSymbol ?? "unknown";
  const candleCount = Number(latest.candleCount ?? source.candleCount ?? 0);
  return { latest, source, provider, requestedSymbol, brokerSymbol, candleCount };
};

const isMt5ProxyForMnq = ({ provider, requestedSymbol, brokerSymbol }) =>
  provider === "mt5_read_only" &&
  String(requestedSymbol).toUpperCase() === "MNQ" &&
  String(brokerSymbol).toUpperCase() === "USTECH";

const blockersFor = (packet) => {
  const { latest, provider, requestedSymbol, brokerSymbol } = sourceInfo(packet);
  const blockers = [
    ...asStringArray(latest.blockers, 12),
    latest.grinchBlocker,
    String(latest.walkForwardVerdict ?? "").toLowerCase().includes("unavailable") ? "walk_forward_unavailable" : undefined,
    String(latest.walkForwardVerdict ?? "").toLowerCase().includes("insufficient") ? "walk_forward_insufficient" : undefined,
    Number(latest.evidenceScore ?? 0) > 0 && Number(latest.evidenceScore ?? 0) < 60 ? "evidence_score_below_candidate_threshold" : undefined,
    Number(latest.maturityScore ?? 0) > 0 && Number(latest.maturityScore ?? 0) < 60 ? "maturity_score_below_candidate_threshold" : undefined,
    isMt5ProxyForMnq({ provider, requestedSymbol, brokerSymbol }) ? "source_is_mt5_read_only_cfd_proxy" : undefined
  ];
  return uniqueStrings(blockers, 8);
};

const candidateFamiliesFor = (packet) =>
  uniqueStrings([
    ...asStringArray(packet.selfImprovementProposalIntent?.candidateFamilies),
    ...asStringArray(packet.latestCycle?.candidateFamilies),
    ...asStringArray(packet.calibrationRecommendations)
  ]);

const buildRefusalResponse = () => ({
  advisoryStatus: "complete",
  summary:
    "Execution and readiness override are disabled. I can only provide research advisory guidance from the GoTrader packet.",
  topBlockers: ["execution_request_refused"],
  nextActions: [
    "Return to deterministic GoTrader research, evidence, maturity, walk-forward, runbook, and risk gates."
  ],
  calibrationRecommendations: [],
  riskNotes: [
    "OpenClaw has no execution, broker, MT5, account, order, position, live trading, or readiness override authority."
  ],
  questions: [],
  selfImprovementProposalIntent: {
    createProposal: false,
    proposalTitle: "",
    targetSubsystem: "",
    candidateFamilies: [],
    requiresWalkForward: true,
    autoApplyAllowed: false
  },
  authority
});

const buildErrorResponse = (summary, blockers) => ({
  advisoryStatus: "error",
  summary,
  topBlockers: blockers,
  nextActions: [
    "Fix the advisory packet shape and retry through the GoTrader phone bridge.",
    "Keep deterministic GoTrader gates authoritative."
  ],
  calibrationRecommendations: [],
  riskNotes: [
    "Request rejected by the GoTrader Research Advisor skill safety boundary."
  ],
  questions: [],
  selfImprovementProposalIntent: {
    createProposal: false,
    proposalTitle: "",
    targetSubsystem: "",
    candidateFamilies: [],
    requiresWalkForward: true,
    autoApplyAllowed: false
  },
  authority
});

const summaryFor = (packet) => {
  const { latest, provider, requestedSymbol, brokerSymbol, candleCount } = sourceInfo(packet);
  const regime = latest.regime ?? {};
  const grinchProfile = latest.grinchProfile ?? "not reported";
  const grinchBlocker = latest.grinchBlocker ?? "not reported";
  const readiness = latest.readiness ?? "not reported";
  const walkForward = latest.walkForwardVerdict ?? "not reported";
  const evidenceScore = formatScore(latest.evidenceScore);
  const maturityScore = formatScore(latest.maturityScore);
  const confidence = formatPercent(regime.confidence);
  const proxyWarning = isMt5ProxyForMnq({ provider, requestedSymbol, brokerSymbol })
    ? " USTECH is MT5 CFD/proxy data for MNQ-style research, not CME MNQ futures truth."
    : "";
  const readinessLine = String(readiness).toLowerCase().includes("paper")
    ? "OpenClaw is only restating GoTrader readiness context and cannot approve readiness."
    : "The cycle may be Research Ready for analysis, but Paper-Demo Candidate status still depends on GoTrader validation gates.";

  return [
    `GoTrader Research Advisor reviewed ${requestedSymbol} using ${provider}${brokerSymbol !== "unknown" ? ` / ${brokerSymbol}` : ""} with ${candleCount.toLocaleString()} candles.`,
    proxyWarning.trim(),
    `Regime is ${regime.label ?? "unknown"} at ${confidence} confidence with data quality ${regime.dataQuality ?? "unknown"}${regime.transitionPending ? " and transition pending" : ""}.`,
    `ICT thesis is ${latest.ictThesis ?? "not reported"}. Grinch profile is ${grinchProfile}; blocker is ${grinchBlocker}.`,
    `Readiness is ${readiness}; evidence score ${evidenceScore}; maturity score ${maturityScore}; walk-forward verdict ${walkForward}.`,
    readinessLine
  ].filter(Boolean).join(" ");
};

const nextActionsFor = (packet) => {
  const { latest } = sourceInfo(packet);
  const question = String(packet.userQuestion ?? "").toLowerCase();
  const actions = [];
  if (question.includes("test next")) {
    actions.push("Test the smallest deterministic blocker first instead of changing thresholds.");
  }
  if (String(latest.grinchProfile ?? "").toLowerCase().includes("none") || String(latest.grinchBlocker ?? "").toLowerCase()) {
    actions.push("Review Grinch profile diagnostics and expansion replay before proposing calibration changes.");
  }
  if (String(latest.walkForwardVerdict ?? "").toLowerCase().includes("unavailable") || String(latest.walkForwardVerdict ?? "").toLowerCase().includes("insufficient")) {
    actions.push("Collect enough valid setups for walk-forward before treating the result as candidate evidence.");
  }
  if (Number(latest.evidenceScore ?? 0) > 0 && Number(latest.evidenceScore ?? 0) < 60) {
    actions.push("Improve independent evidence coverage before candidate review.");
  }
  if (Number(latest.maturityScore ?? 0) > 0 && Number(latest.maturityScore ?? 0) < 60) {
    actions.push("Complete maturity and runbook evidence before Paper-Demo Candidate review.");
  }
  actions.push("Keep GoTrader readiness, evidence, maturity, walk-forward, and risk gates authoritative.");
  return uniqueStrings(actions, 6);
};

const calibrationRecommendationsFor = (packet) => {
  const families = candidateFamiliesFor(packet);
  const recommendations = families.map((family) => `Treat ${family} as draft-only and research-only until GoTrader validation gates pass.`);
  if (String(packet.latestCycle?.grinchBlocker ?? "").toLowerCase().includes("expansion")) {
    recommendations.push("Use reversal_expansion_confirmation only if expansion replay evidence supports it.");
  }
  if (String(packet.latestCycle?.grinchBlocker ?? "").toLowerCase().includes("timing")) {
    recommendations.push("Review timing-window evidence without changing production thresholds.");
  }
  recommendations.push("Do not loosen production thresholds from this packet alone.");
  return uniqueStrings(recommendations, 6);
};

const riskNotesFor = (packet) => {
  const { provider, requestedSymbol, brokerSymbol } = sourceInfo(packet);
  const notes = [
    "Advisory only; no execution authority.",
    "OpenClaw cannot approve readiness or bypass GoTrader gates.",
    isMt5ProxyForMnq({ provider, requestedSymbol, brokerSymbol })
      ? "MT5 USTECH is CFD/proxy data for MNQ-style research, not CME MNQ futures truth."
      : undefined,
    "No MT5, broker, account, order, or position calls were made by this skill server."
  ];
  return uniqueStrings(notes, 6);
};

const questionsFor = (packet) => {
  const { latest } = sourceInfo(packet);
  const questions = [];
  if (!latest.walkForwardVerdict || String(latest.walkForwardVerdict).toLowerCase().includes("unavailable")) {
    questions.push("Do you want to collect a larger MT5 read-only window before retesting walk-forward?");
  }
  if (String(latest.grinchBlocker ?? "").toLowerCase()) {
    questions.push("Should the next diagnostic focus on the Grinch blocker before testing candidate families?");
  }
  if (!questions.length) {
    questions.push("Which deterministic validation gate should OpenClaw review next?");
  }
  return uniqueStrings(questions, 4);
};

const buildAdvisoryResponse = (packet) => ({
  advisoryStatus: "complete",
  summary: summaryFor(packet),
  topBlockers: blockersFor(packet),
  nextActions: nextActionsFor(packet),
  calibrationRecommendations: calibrationRecommendationsFor(packet),
  riskNotes: riskNotesFor(packet),
  questions: questionsFor(packet),
  selfImprovementProposalIntent: {
    createProposal: false,
    proposalTitle: "",
    targetSubsystem: "",
    candidateFamilies: [],
    requiresWalkForward: true,
    autoApplyAllowed: false
  },
  authority
});

const healthPayload = () => ({
  provider: "openclaw_gotrader_research_advisor",
  skillStatus: "running",
  host,
  port,
  route,
  timestamp: now(),
  authority
});

const handleSkillRequest = async (request, response) => {
  let packet;
  try {
    packet = await parseJsonBody(request);
  } catch {
    writeJson(response, 400, buildErrorResponse("Invalid JSON request body.", ["invalid_json"]));
    return;
  }

  const validationErrors = validatePacket(packet);
  if (validationErrors.length) {
    writeJson(
      response,
      400,
      buildErrorResponse("GoTrader advisory packet rejected by Research Advisor safety checks.", validationErrors)
    );
    return;
  }

  if (typeof packet.userQuestion === "string" && unsafeQuestionPattern.test(packet.userQuestion)) {
    writeJson(response, 200, buildRefusalResponse());
    return;
  }

  writeJson(response, 200, buildAdvisoryResponse(packet));
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, healthPayload());
    return;
  }

  if (request.method === "POST" && url.pathname === route) {
    await handleSkillRequest(request, response);
    return;
  }

  writeJson(response, 404, {
    provider: "openclaw_gotrader_research_advisor",
    skillStatus: "running",
    advisoryStatus: "error",
    summary: "Route not found. Available routes: GET /health, POST /gotrader/advisory-skill.",
    authority
  });
});

server.listen(port, host, () => {
  console.log(`[openclaw-skill] GoTrader Research Advisor listening on http://${host}:${port}`);
  console.log("[openclaw-skill] routes: GET /health, POST /gotrader/advisory-skill");
  console.log("[openclaw-skill] authority: execution none, broker none, readiness override none");
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
