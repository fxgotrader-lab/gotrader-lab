#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_ADVISORY_TIMEOUT_MS = 20_000;

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
  },
  {
    agentId: "llm-session-levels-reviewer",
    agentName: "LLM Session Levels Reviewer",
    role: "Review prior day/week/month, overnight, Globex, and opening-range levels for meaningful futures liquidity sweeps."
  },
  {
    agentId: "llm-auction-volume-profile-reviewer",
    agentName: "LLM Auction/Volume Profile Reviewer",
    role: "Review VWAP, anchored VWAP, VPOC, VAH, VAL, and acceptance/rejection evidence."
  },
  {
    agentId: "llm-macro-event-risk-reviewer",
    agentName: "LLM Macro Event Risk Reviewer",
    role: "Review scheduled macro risk, Fed speakers, and event proximity that can distort normal ICT behavior."
  },
  {
    agentId: "llm-intermarket-confirmation-reviewer",
    agentName: "LLM Intermarket Confirmation Reviewer",
    role: "Review ES/NQ, YM/ES, VIX, DXY, yields, bonds, crude, and gold context for confirmation or conflict."
  },
  {
    agentId: "llm-positioning-gamma-reviewer",
    agentName: "LLM Positioning/Gamma Reviewer",
    role: "Review COT, put/call, gamma levels, dealer gamma flip, and higher-timeframe positioning risk."
  },
  {
    agentId: "llm-volatility-regime-reviewer",
    agentName: "LLM Volatility Regime Reviewer",
    role: "Review VIX, ATR/range expansion, realized volatility, stop assumptions, and target expectations."
  },
  {
    agentId: "llm-order-flow-planning-reviewer",
    agentName: "LLM Order Flow Planning Reviewer",
    role: "Review missing DOM, footprint, delta, cumulative delta, and large-print evidence as planned later context only."
  }
];

const allowedBiases = new Set(["bullish", "bearish", "neutral", "no_opinion"]);
const allowedRecommendations = new Set([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);
const unsafeTextMatchers = [
  { reason: "direct trade execution", pattern: /\b(?:execute|place|send)\s+(?:a\s+|an\s+|the\s+)?(?:trade|order)s?\b/i },
  { reason: "position control", pattern: /\b(?:open|close)\s+(?:a\s+|an\s+|the\s+)?position\b/i },
  { reason: "broker connection or control", pattern: /\b(?:connect|route|submit|control)\s+(?:to\s+)?(?:a\s+)?broker\b/i },
  { reason: "broker connection or control", pattern: /\bbroker\s+(?:connection|control|execution|routing)\b/i },
  { reason: "readiness bypass", pattern: /\b(?:bypass|override|ignore|skip)\s+(?:the\s+)?readiness\b/i },
  { reason: "readiness bypass", pattern: /\breadiness\s+(?:bypass|override)\b/i },
  { reason: "approval authority", pattern: /\bapprove\s+(?:the\s+)?(?:trade|order|paper|demo|live|execution)\b/i },
  { reason: "trading enablement", pattern: /\benable\s+(?:paper\s+|demo\s+|live\s+)?trading\b/i },
  { reason: "API key handling", pattern: /\b(?:api\s*key|secret\s+key|openai_api_key)\b/i }
];

class ProviderValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProviderValidationError";
    this.details = details;
  }
}

function printHelp() {
  process.stdout.write(`GoTrader AI Lab GPT-5.5 LLM agent provider

Reads a restricted research context JSON packet from stdin, calls the OpenAI Responses API,
and prints validated advisory-only LLM agent response JSON to stdout.

Usage:
  node scripts/gpt55-llm-agent-provider.mjs
  node scripts/gpt55-llm-agent-provider.mjs --input-file llm/requests/latest-llm-context.json --output-file llm/responses/latest-llm-response.json
  node scripts/gpt55-llm-agent-provider.mjs --validate-response-file docs/sample-llm-agent-response.json
  node scripts/gpt55-llm-agent-provider.mjs --debug-validation --validate-response-file docs/sample-llm-agent-response-unsafe.json
  node scripts/gpt55-llm-agent-provider.mjs --dry-run
  node scripts/gpt55-llm-agent-provider.mjs --help

Environment:
  OPENAI_API_KEY             Required. Never commit this value.
  GOTRADER_LLM_MODEL         Optional. Defaults to ${DEFAULT_MODEL}.
  LLM_ADVISORY_TIMEOUT_MS    Optional. Defaults to ${DEFAULT_ADVISORY_TIMEOUT_MS}.

Safety:
  Advisory only. No execution authority. No broker control. No readiness override.
`);
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run"),
    debugValidation: argv.includes("--debug-validation"),
    inputFile: valueAfter("--input-file"),
    outputFile: valueAfter("--output-file"),
    validateResponseFile: valueAfter("--validate-response-file")
  };
}

function sanitizeError(value) {
  return String(value ?? "Unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9._\-]{16,}\b/g, "sk-[redacted]");
}

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 2_000 ? Math.round(value) : fallback;
}

const advisoryTimeoutMs = () => positiveIntegerEnv("LLM_ADVISORY_TIMEOUT_MS", DEFAULT_ADVISORY_TIMEOUT_MS);

function fail(message) {
  process.stderr.write(`GPT-5.5 LLM provider error: ${sanitizeError(message)}\n`);
  process.exitCode = 1;
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

async function readRequestInput(args) {
  if (args.inputFile) {
    return fs.readFile(args.inputFile, "utf8");
  }
  return readStdin();
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeProviderOutput(args, responses) {
  if (args.outputFile) {
    await writeJsonFile(args.outputFile, responses);
    process.stderr.write(`Wrote validated advisory response JSON to ${args.outputFile}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(responses, null, 2)}\n`);
}

async function removeOutputFile(args) {
  if (!args?.outputFile) {
    return;
  }
  await fs.rm(args.outputFile, { force: true }).catch(() => {});
}

async function writeProviderError(args, error) {
  const message = error?.message ?? error;
  const shouldWriteErrorFile = Boolean(
    args?.outputFile || args?.debugValidation || error?.name === "ProviderValidationError"
  );
  if (!shouldWriteErrorFile) {
    return;
  }

  const timestamp = new Date().toISOString();
  const safeBase = path
    .basename(args.inputFile ?? args.validateResponseFile ?? "stdin-request", ".json")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  const errorPath = path.join("llm", "errors", `${safeBase}-error-${Date.now()}.json`);
  await writeJsonFile(errorPath, {
    errorId: `llm_provider_error_${Date.now()}`,
    timestamp,
    provider: "gpt55_llm_agent_provider",
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    inputFile: args.inputFile ?? "stdin",
    outputFile: args.outputFile,
    message: sanitizeError(message),
    validationDetails: error?.details
      ? {
          ...error.details,
          rawModelResponse:
            args?.debugValidation && error.details.rawModelResponse
              ? sanitizeError(error.details.rawModelResponse)
              : undefined
        }
      : undefined,
    safetyNotice: "Advisory-only provider error. No broker control. No execution authority. No readiness override."
  });
  process.stderr.write(`Wrote sanitized provider error JSON to ${errorPath}\n`);
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

function freeTextFieldsFor(response) {
  const fields = [];
  if (typeof response.reasoningSummary === "string") {
    fields.push(["reasoningSummary", response.reasoningSummary]);
  }
  for (const field of ["riskWarnings", "missingEvidence", "suggestedCalibration", "safetyNotes"]) {
    const value = response[field];
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "string") {
          fields.push([`${field}[${index}]`, item]);
        }
      });
    }
  }
  return fields;
}

function isSafelyNegated(text, matchIndex) {
  const prefix = text.slice(Math.max(0, matchIndex - 32), matchIndex).toLowerCase();
  return /\b(?:no|not|cannot|can not|must not|do not|does not|without)\s+[\w\s-]*$/.test(prefix);
}

function unsafeLanguageFindings(response) {
  const findings = [];
  for (const [field, text] of freeTextFieldsFor(response)) {
    for (const matcher of unsafeTextMatchers) {
      matcher.pattern.lastIndex = 0;
      const match = matcher.pattern.exec(text);
      if (match && !isSafelyNegated(text, match.index)) {
        findings.push({
          field,
          phrase: match[0],
          reason: matcher.reason,
          message: `${field} contains unsafe phrase "${match[0]}" (${matcher.reason})`
        });
      }
    }
  }
  return findings;
}

function validateAgentResponse(response) {
  const errors = [];
  const rejectedFields = [];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { errors: ["response must be a JSON object"], rejectedFields };
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
  const unsafeFindings = unsafeLanguageFindings(response);
  if (unsafeFindings.length > 0) {
    rejectedFields.push(...unsafeFindings);
    errors.push(...unsafeFindings.map((finding) => finding.message));
  }
  return { errors, rejectedFields };
}

function validateProviderResponses(responses, debugContext = {}) {
  if (!Array.isArray(responses)) {
    throw new ProviderValidationError("model output must contain a responses array", debugContext);
  }
  const requiredIds = new Set(requiredAgents.map((agent) => agent.agentId));
  const seenIds = new Set();
  const errors = [];
  const rejectedFields = [];

  for (const response of responses) {
    const responseValidation = validateAgentResponse(response);
    if (responseValidation.errors.length > 0) {
      errors.push(`${response?.agentId ?? "unknown"}: ${responseValidation.errors.join(", ")}`);
      rejectedFields.push(
        ...responseValidation.rejectedFields.map((finding) => ({
          agentId: response?.agentId ?? "unknown",
          ...finding
        }))
      );
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
    throw new ProviderValidationError(`response validation failed: ${errors.join("; ")}`, {
      ...debugContext,
      errors,
      rejectedFields
    });
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
    "Avoid free-text words and phrases such as execute, place trade, open position, close position, send order, broker control, override readiness, or approve trade.",
    "Use proceedRecommendation only as one of: continue_research, rerun_validation, paper_demo_candidate_review.",
    "paper_demo_candidate_review means review readiness only. It is not approval to trade, execute, route, or enable paper/demo/live trading.",
    `Return exactly ${requiredAgents.length} responses, one response for each required LLM agent ID listed below.`,
    "Do not omit futures market-context reviewers.",
    "Order-flow planning reviewer is planning/advisory only. It should flag missing order-flow evidence and must not require live DOM, footprint, delta, cumulative delta, or large-print feeds.",
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

  const timeoutMs = advisoryTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildResponsesPayload(model, packet)),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenAI advisory request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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

  await removeOutputFile(args);

  if (args.validateResponseFile) {
    const rawResponse = await fs.readFile(args.validateResponseFile, "utf8");
    const parsedResponse = parseJson(rawResponse, "response file");
    const responses = normalizeModelOutput(parsedResponse);
    validateProviderResponses(responses, {
      source: "validate-response-file",
      responseFile: args.validateResponseFile,
      rawModelResponse: rawResponse
    });
    if (args.outputFile) {
      await writeProviderOutput(args, responses);
    } else {
      process.stderr.write(`Response file validation passed: ${args.validateResponseFile}\n`);
    }
    return;
  }

  const apiKey = requireApiKey();
  const raw = await readRequestInput(args);
  if (!raw.trim()) {
    throw new Error("request JSON must be provided on stdin or with --input-file");
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
  validateProviderResponses(responses, {
    source: "openai_response",
    rawModelResponse: outputText
  });

  await writeProviderOutput(args, responses);
}

const cliArgs = parseArgs(process.argv.slice(2));

main().catch(async (error) => {
  const message = error?.message ?? error;
  await writeProviderError(cliArgs, error).catch((writeError) => {
    process.stderr.write(`GPT-5.5 LLM provider error: failed to write error JSON: ${sanitizeError(writeError?.message ?? writeError)}\n`);
  });
  fail(message);
});
