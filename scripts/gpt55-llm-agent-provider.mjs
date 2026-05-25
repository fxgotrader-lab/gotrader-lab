#!/usr/bin/env node

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

const requiredAgents = [
  {
    agentId: "llm-ict-liquidity-reviewer",
    agentName: "LLM ICT Liquidity Reviewer",
    role: "Review liquidity sweeps, target liquidity, missing liquidity context, and sweep quality."
  },
  {
    agentId: "llm-market-structure-reviewer",
    agentName: "LLM Market Structure Reviewer",
    role: "Review market structure shift, break of structure, displacement, and higher-timeframe bias evidence."
  },
  {
    agentId: "llm-session-timing-reviewer",
    agentName: "LLM Session Timing Reviewer",
    role: "Review session tag, ICT kill zone, time-of-day quality, and session-specific fragility."
  },
  {
    agentId: "llm-risk-reward-reviewer",
    agentName: "LLM Risk/Reward Reviewer",
    role: "Review invalidation, target, average R, drawdown pressure, and stop-model quality."
  },
  {
    agentId: "llm-validation-reviewer",
    agentName: "LLM Validation Reviewer",
    role: "Review validation results, conservative scenario stability, false positives, and confidence calibration."
  },
  {
    agentId: "llm-self-improvement-reviewer",
    agentName: "LLM Self-Improvement Reviewer",
    role: "Suggest calibration improvements that stay simulation-only and change one variable or small grouped set."
  },
  {
    agentId: "llm-cio-synthesis-reviewer",
    agentName: "LLM CIO Synthesis Reviewer",
    role: "Synthesize the advisory review without approving execution or bypassing readiness."
  }
];

const allowedBiases = new Set(["bullish", "bearish", "neutral", "no_opinion"]);
const allowedRecommendations = new Set([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);
const unsafePatterns = [
  /place\s+(an\s+)?order/i,
  /execute\s+(the\s+)?trade/i,
  /send\s+(the\s+)?order/i,
  /connect\s+to\s+(a\s+)?broker/i,
  /bypass\s+(the\s+)?readiness/i,
  /override\s+(the\s+)?readiness/i,
  /approve\s+(paper|demo|live)/i,
  /enable\s+(paper|demo|live)\s+trading/i,
  /modify\s+broker/i,
  /increase\s+contracts/i,
  /api\s*key/i
];

function printHelp() {
  process.stdout.write(`GoTrader AI Lab GPT-5.5 LLM agent provider

Reads a restricted research context JSON packet from stdin, calls the OpenAI Responses API,
and prints validated advisory-only LLM agent response JSON to stdout.

Usage:
  node scripts/gpt55-llm-agent-provider.mjs
  node scripts/gpt55-llm-agent-provider.mjs --dry-run
  node scripts/gpt55-llm-agent-provider.mjs --help

Environment:
  OPENAI_API_KEY             Required. Never commit this value.
  GOTRADER_LLM_MODEL         Optional. Defaults to ${DEFAULT_MODEL}.

Safety:
  Advisory only. No execution authority. No broker control. No readiness override.
`);
}

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run")
  };
}

function sanitizeError(value) {
  return String(value ?? "Unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._\-]+/g, "sk-[redacted]");
}

function fail(message, exitCode = 1) {
  process.stderr.write(`GPT-5.5 LLM provider error: ${sanitizeError(message)}\n`);
  process.exit(exitCode);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(raw));
  });
}

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Set it in your shell environment; do not commit it.");
  }
  return apiKey;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function ensureArrayOfStrings(value, label, errors) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(`${label} must be an array of strings`);
  }
}

function validateRequestPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    errors.push("request packet must be a JSON object");
  } else {
    if (packet.mode !== "advisory_only") {
      errors.push('request mode must be "advisory_only"');
    }
    if (packet.executionAuthority !== "none") {
      errors.push('request executionAuthority must be "none"');
    }
    if (packet.brokerAuthority !== "none") {
      errors.push('request brokerAuthority must be "none"');
    }
    if (packet.readinessOverrideAuthority !== "none") {
      errors.push('request readinessOverrideAuthority must be "none"');
    }
    if (packet.source !== "gotrader_ai_lab") {
      errors.push('request source must be "gotrader_ai_lab"');
    }
    if (!packet.packetId) {
      errors.push("request packetId is required");
    }
    if (!Array.isArray(packet.safetyConstraints)) {
      errors.push("request safetyConstraints must be present");
    }
  }

  if (errors.length > 0) {
    throw new Error(`request validation failed: ${errors.join("; ")}`);
  }
}

function includesUnsafeLanguage(response) {
  const text = JSON.stringify(response).toLowerCase();
  return unsafePatterns.some((pattern) => pattern.test(text));
}

function validateAgentResponse(response) {
  const errors = [];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return ["response must be a JSON object"];
  }
  if (!response.agentId) {
    errors.push("agentId is required");
  }
  if (!response.agentName) {
    errors.push("agentName is required");
  }
  if (response.mode !== "advisory_only") {
    errors.push('mode must be "advisory_only"');
  }
  if (response.executionAuthority !== "none") {
    errors.push('executionAuthority must be "none"');
  }
  if (response.brokerAuthority !== "none") {
    errors.push('brokerAuthority must be "none"');
  }
  if (response.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must be "none"');
  }
  if (!allowedBiases.has(response.bias)) {
    errors.push("bias must be bullish, bearish, neutral, or no_opinion");
  }
  if (typeof response.confidence !== "number" || !Number.isFinite(response.confidence)) {
    errors.push("confidence must be a finite number");
  } else if (response.confidence < 0 || response.confidence > 1) {
    errors.push("confidence must be between 0 and 1");
  }
  if (
    response.agreesWithBaseline !== true &&
    response.agreesWithBaseline !== false &&
    response.agreesWithBaseline !== null
  ) {
    errors.push("agreesWithBaseline must be true, false, or null");
  }
  if (typeof response.reasoningSummary !== "string" || response.reasoningSummary.trim().length === 0) {
    errors.push("reasoningSummary is required");
  }
  ensureArrayOfStrings(response.riskWarnings, "riskWarnings", errors);
  ensureArrayOfStrings(response.missingEvidence, "missingEvidence", errors);
  ensureArrayOfStrings(response.suggestedCalibration, "suggestedCalibration", errors);
  if (!allowedRecommendations.has(response.proceedRecommendation)) {
    errors.push("proceedRecommendation must be advisory-only");
  }
  ensureArrayOfStrings(response.safetyNotes, "safetyNotes", errors);
  if (includesUnsafeLanguage(response)) {
    errors.push("response suggests execution, broker control, key handling, or readiness bypass");
  }
  return errors;
}

function validateProviderResponses(responses) {
  if (!Array.isArray(responses)) {
    throw new Error("model output must contain a responses array");
  }
  const requiredIds = new Set(requiredAgents.map((agent) => agent.agentId));
  const seenIds = new Set();
  const errors = [];

  for (const response of responses) {
    const responseErrors = validateAgentResponse(response);
    if (responseErrors.length > 0) {
      errors.push(`${response?.agentId ?? "unknown"}: ${responseErrors.join(", ")}`);
    }
    if (typeof response?.agentId === "string") {
      seenIds.add(response.agentId);
    }
  }

  for (const requiredId of requiredIds) {
    if (!seenIds.has(requiredId)) {
      errors.push(`${requiredId}: required agent response is missing`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`response validation failed: ${errors.join("; ")}`);
  }
}

function normalizeModelOutput(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed?.responses)) {
    return parsed.responses;
  }
  if (Array.isArray(parsed?.agentResponses)) {
    return parsed.agentResponses;
  }
  if (parsed?.agentId) {
    return [parsed];
  }
  throw new Error("model output did not include advisory responses");
}

function responseSchema() {
  const agentResponseSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "agentId",
      "agentName",
      "mode",
      "executionAuthority",
      "brokerAuthority",
      "readinessOverrideAuthority",
      "bias",
      "confidence",
      "agreesWithBaseline",
      "reasoningSummary",
      "riskWarnings",
      "missingEvidence",
      "suggestedCalibration",
      "proceedRecommendation",
      "safetyNotes"
    ],
    properties: {
      agentId: { type: "string", enum: requiredAgents.map((agent) => agent.agentId) },
      agentName: { type: "string" },
      mode: { type: "string", enum: ["advisory_only"] },
      executionAuthority: { type: "string", enum: ["none"] },
      brokerAuthority: { type: "string", enum: ["none"] },
      readinessOverrideAuthority: { type: "string", enum: ["none"] },
      bias: { type: "string", enum: [...allowedBiases] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      agreesWithBaseline: { type: ["boolean", "null"] },
      reasoningSummary: { type: "string" },
      riskWarnings: { type: "array", items: { type: "string" } },
      missingEvidence: { type: "array", items: { type: "string" } },
      suggestedCalibration: { type: "array", items: { type: "string" } },
      proceedRecommendation: { type: "string", enum: [...allowedRecommendations] },
      safetyNotes: { type: "array", items: { type: "string" } }
    }
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["responses"],
    properties: {
      responses: {
        type: "array",
        minItems: requiredAgents.length,
        maxItems: requiredAgents.length,
        items: agentResponseSchema
      }
    }
  };
}

function buildSystemPrompt() {
  return [
    "You are the GPT-5.5 advisory provider for GoTrader AI Lab.",
    "You review simulation-only trading research context and return structured JSON only.",
    "You have no execution authority, no broker authority, and no readiness override authority.",
    "You must not place trades, approve trades, call brokers, ask for API keys, or change execution settings.",
    "Return one response for each required LLM agent.",
    "Prefer stability and evidence quality over profit-only conclusions.",
    "If evidence is missing, recommend continue_research or rerun_validation.",
    "",
    "Required agents:",
    ...requiredAgents.map((agent) => `- ${agent.agentId}: ${agent.agentName}. ${agent.role}`),
    "",
    "Every response must include mode advisory_only and all authority fields set to none."
  ].join("\n");
}

function buildResponsesPayload(model, packet) {
  return {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt() }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(packet, null, 2) }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "gotrader_llm_advisory_responses",
        strict: true,
        schema: responseSchema()
      }
    },
    store: false
  };
}

function extractOutputText(apiResponse) {
  if (typeof apiResponse.output_text === "string" && apiResponse.output_text.trim()) {
    return apiResponse.output_text;
  }

  const chunks = [];
  for (const item of apiResponse.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  const text = chunks.join("").trim();
  if (!text) {
    throw new Error("OpenAI response did not include output text");
  }
  return text;
}

async function callOpenAI(apiKey, model, packet) {
  if (typeof fetch !== "function") {
    throw new Error("native fetch is required. Use Node 18 or newer.");
  }

  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildResponsesPayload(model, packet))
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI Responses API request failed with status ${response.status}. ${sanitizeError(body)}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apiKey = requireApiKey();
  const raw = await readStdin();
  if (!raw.trim()) {
    throw new Error("request JSON must be provided on stdin");
  }

  const packet = parseJson(raw, "request");
  validateRequestPacket(packet);

  const model = process.env.GOTRADER_LLM_MODEL || DEFAULT_MODEL;

  if (args.dryRun) {
    process.stderr.write(
      `Dry run passed. Provider would call ${OPENAI_RESPONSES_ENDPOINT} with model ${model}. No response was written.\n`
    );
    return;
  }

  const apiResponse = await callOpenAI(apiKey, model, packet);
  const outputText = extractOutputText(apiResponse);
  const parsedOutput = parseJson(outputText, "model output");
  const responses = normalizeModelOutput(parsedOutput);
  validateProviderResponses(responses);

  process.stdout.write(`${JSON.stringify(responses, null, 2)}\n`);
}

main().catch((error) => fail(error?.message ?? error));
