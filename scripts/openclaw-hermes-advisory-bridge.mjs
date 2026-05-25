#!/usr/bin/env node
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const requestDir = path.join(repoRoot, "advisory", "requests");
const responseDir = path.join(repoRoot, "advisory", "responses");
const processedDir = path.join(repoRoot, "advisory", "processed");
const errorDir = path.join(repoRoot, "advisory", "errors");
const latestRequestPath = path.join(requestDir, "latest-advisory-request.json");
const latestResponsePath = path.join(responseDir, "latest-advisory-response.json");
const allowedRecommendations = new Set([
  "continue_research",
  "rerun_validation",
  "paper_demo_candidate_review"
]);
const validAgents = new Set(["OpenClaw", "Hermes", "openclaw_hermes_local_bridge_mock"]);
const providers = new Set(["mock", "local-command"]);

function logSafetyBanner() {
  console.warn("Advisory-only bridge. No execution authority. No broker control.");
  console.warn("No live OpenClaw/Hermes API call is made by this script.");
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const options = {
    mode: argv.includes("--watch") ? "watch" : "once",
    provider: "mock",
    fallbackMock: argv.includes("--fallback-mock"),
    dryRun: argv.includes("--dry-run")
  };

  const providerIndex = argv.indexOf("--provider");
  if (providerIndex >= 0) {
    options.provider = argv[providerIndex + 1] ?? "";
  }

  if (!providers.has(options.provider)) {
    throw new Error(`Unsupported provider "${options.provider}". Use "mock" or "local-command".`);
  }

  return options;
}

function splitCommandLine(commandLine) {
  const parts = [];
  let current = "";
  let quote = "";

  for (const char of commandLine.trim()) {
    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  if (quote) {
    throw new Error("GOTRADER_ADVISORY_COMMAND contains an unterminated quote.");
  }

  return parts;
}

async function ensureDirectories() {
  await Promise.all([requestDir, responseDir, processedDir, errorDir].map((dir) => mkdir(dir, { recursive: true })));
}

async function findRequestFile() {
  const names = await readdir(requestDir);
  const jsonFiles = names.filter((name) => name.toLowerCase().endsWith(".json"));
  if (!jsonFiles.length) {
    return undefined;
  }

  const withStats = await Promise.all(
    jsonFiles.map(async (name) => {
      const filePath = path.join(requestDir, name);
      return {
        filePath,
        mtimeMs: (await stat(filePath)).mtimeMs
      };
    })
  );

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0]?.filePath;
}

function validateRequest(request) {
  const errors = [];

  if (request?.mode !== "advisory_only") {
    errors.push('mode must be "advisory_only"');
  }
  if (request?.executionAuthority !== "none") {
    errors.push('executionAuthority must be "none"');
  }
  if (request?.brokerAuthority !== "none") {
    errors.push('brokerAuthority must be "none"');
  }
  if (request?.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must be "none"');
  }
  if (!request?.packetId) {
    errors.push("packetId is required");
  }
  if (!request?.thesisId) {
    errors.push("thesisId is required");
  }
  if (!request?.symbol) {
    errors.push("symbol is required");
  }
  if (!request?.timeframe) {
    errors.push("timeframe is required");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateResponse(response, expectedPacketId) {
  const errors = [];
  const warnings = [];

  if (!response?.packetId) {
    errors.push("packetId is required");
  } else if (expectedPacketId && response.packetId !== expectedPacketId) {
    errors.push(`packetId must match request packetId "${expectedPacketId}"`);
  }

  if (!response?.responseId) {
    errors.push("responseId is required");
  }

  if (!response?.timestamp) {
    errors.push("timestamp is required");
  }

  if (!validAgents.has(response?.advisoryAgent ?? "")) {
    errors.push('advisoryAgent must be "OpenClaw", "Hermes", or "openclaw_hermes_local_bridge_mock"');
  }

  if (response?.mode !== "advisory_only") {
    errors.push('mode must remain "advisory_only"');
  }

  if (response?.executionAuthority !== "none") {
    errors.push('executionAuthority must remain "none"');
  }

  if (response?.brokerAuthority !== "none") {
    errors.push('brokerAuthority must remain "none"');
  }

  if (response?.readinessOverrideAuthority !== "none") {
    errors.push('readinessOverrideAuthority must remain "none"');
  }

  if (!allowedRecommendations.has(response?.proceedRecommendation)) {
    errors.push(
      "proceedRecommendation must be advisory-only: continue_research, rerun_validation, or paper_demo_candidate_review"
    );
  }

  if (typeof response?.advisoryConfidence !== "number" || !Number.isFinite(response.advisoryConfidence)) {
    errors.push("advisoryConfidence is required");
  } else if (response.advisoryConfidence < 0 || response.advisoryConfidence > 1) {
    errors.push("advisoryConfidence must be between 0 and 1");
  }

  if (
    response?.agreeWithThesis !== true &&
    response?.agreeWithThesis !== false &&
    response?.agreeWithThesis !== null
  ) {
    errors.push("agreeWithThesis must be true, false, or null");
  }

  if (!Array.isArray(response?.riskWarnings)) {
    errors.push("riskWarnings must be an array");
  } else if (!response.riskWarnings.length) {
    warnings.push("riskWarnings is empty; advisory review may be shallow");
  }

  if (!Array.isArray(response?.missingEvidence)) {
    errors.push("missingEvidence must be an array");
  }

  if (!Array.isArray(response?.recommendedCalibration)) {
    errors.push("recommendedCalibration must be an array");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function buildMockResponse(request) {
  const now = new Date();
  const confluenceScore = Number(request?.ictContextSummary?.confluenceScore ?? 0);
  const cioConfidence = Number(request?.cioThesis?.confidence ?? 0);
  const readinessState = request?.readinessStatus?.state ?? "unknown";
  const failedRequirements = request?.readinessStatus?.failedRequirements ?? [];
  const readinessScore = Number(request?.validationSummary?.readinessScore ?? 0);
  const falsePositiveCount = Number(request?.researchQualityGrade?.falsePositiveCount ?? 0);
  const weakEvidence = failedRequirements.length > 0 || readinessState !== "Paper-Demo Candidate";

  let proceedRecommendation = "continue_research";
  if (weakEvidence || readinessScore < 65 || falsePositiveCount > 0) {
    proceedRecommendation = "rerun_validation";
  }
  if (!weakEvidence && confluenceScore >= 0.7 && cioConfidence >= 0.7 && readinessScore >= 75) {
    proceedRecommendation = "paper_demo_candidate_review";
  }
  if (!allowedRecommendations.has(proceedRecommendation)) {
    proceedRecommendation = "continue_research";
  }

  const agreeWithThesis = confluenceScore >= 0.6 && cioConfidence >= 0.6 && failedRequirements.length === 0;
  const advisoryConfidence = Math.max(0.35, Math.min(0.88, (confluenceScore + cioConfidence) / 2));

  const riskWarnings = uniqueStrings([
    "Advisory-only bridge response. No trades can be executed from this file.",
    failedRequirements.length ? `Readiness gate still has ${failedRequirements.length} failed requirement(s).` : "",
    falsePositiveCount > 0 ? `Research quality review reports ${falsePositiveCount} estimated false positive(s).` : "",
    readinessState !== "Paper-Demo Candidate" ? `Readiness state is ${readinessState}; keep research validation active.` : "",
    request?.riskNotes ? `Original risk notes: ${request.riskNotes}` : ""
  ]);

  const missingEvidence = uniqueStrings([
    !request?.validationSummary ? "Validation summary is missing from request packet." : "",
    !request?.researchQualityGrade ? "Research quality grade is missing from request packet." : "",
    !request?.readinessStatus ? "Readiness gate status is missing from request packet." : "",
    failedRequirements.length ? `Unresolved readiness requirements: ${failedRequirements.join("; ")}` : "",
    confluenceScore < 0.6 ? "Confluence score is below the preferred advisory review threshold." : ""
  ]);

  const recommendedCalibration = uniqueStrings([
    proceedRecommendation === "rerun_validation"
      ? "Rerun validation with conservative thresholds before considering paper-demo review."
      : "",
    confluenceScore < 0.6 ? "Increase minimum confluence or narrow session filters, then rerun validation." : "",
    falsePositiveCount > 0 ? "Review false-positive patterns and compare stop models before changing target R." : "",
    "Keep execution authority, broker authority, and readiness override authority set to none."
  ]);

  return {
    responseId: `advisory_response_${timestampSlug(now)}`,
    packetId: request.packetId,
    timestamp: now.toISOString(),
    advisoryAgent: "openclaw_hermes_local_bridge_mock",
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    agreeWithThesis,
    advisoryConfidence: Number(advisoryConfidence.toFixed(2)),
    riskWarnings,
    missingEvidence,
    recommendedCalibration,
    proceedRecommendation,
    notes:
      "Mock local bridge advisory response only. No live OpenClaw/Hermes call, broker execution, order placement, or readiness override occurred."
  };
}

async function writeErrorFile(sourcePath, errors) {
  const baseName = path.basename(sourcePath, ".json");
  const errorPath = path.join(errorDir, `${baseName}-error-${timestampSlug()}.json`);
  const errorPayload = {
    timestamp: new Date().toISOString(),
    sourceFile: path.relative(repoRoot, sourcePath),
    mode: "advisory_only",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    errors
  };
  await writeFile(errorPath, `${JSON.stringify(errorPayload, null, 2)}\n`, "utf8");
  console.error(`Advisory bridge error file written: ${path.relative(repoRoot, errorPath)}`);
}

function runLocalCommand(request) {
  const commandLine = process.env.GOTRADER_ADVISORY_COMMAND;
  if (!commandLine) {
    return Promise.reject(new Error("GOTRADER_ADVISORY_COMMAND is required for local-command provider."));
  }

  const [command, ...args] = splitCommandLine(commandLine);
  if (!command) {
    return Promise.reject(new Error("GOTRADER_ADVISORY_COMMAND is empty."));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Local advisory command timed out after 30 seconds."));
    }, 30000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Local advisory command exited with ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Local advisory command stdout was not valid JSON."));
      }
    });

    child.stdin.end(`${JSON.stringify(request, null, 2)}\n`);
  });
}

async function buildProviderResponse(request, provider) {
  if (provider === "local-command") {
    return runLocalCommand(request);
  }

  return buildMockResponse(request);
}

async function processRequestFile(filePath, options) {
  const raw = await readFile(filePath, "utf8");
  let request;

  try {
    request = JSON.parse(raw);
  } catch {
    if (options.dryRun) {
      console.error("Dry run failed request validation: Request JSON could not be parsed");
    } else {
      await writeErrorFile(filePath, ["Request JSON could not be parsed"]);
    }
    return false;
  }

  const validation = validateRequest(request);
  if (!validation.valid) {
    if (options.dryRun) {
      console.error(`Dry run failed request validation: ${validation.errors.join("; ")}`);
    } else {
      await writeErrorFile(filePath, validation.errors);
    }
    return false;
  }

  if (options.dryRun) {
    console.log(`Dry run: request ${request.packetId} is valid.`);
    console.log(`Dry run: provider=${options.provider}`);
    if (options.provider === "local-command") {
      console.log("Dry run: would pass request JSON to GOTRADER_ADVISORY_COMMAND through stdin.");
    } else {
      const mockValidation = validateResponse(buildMockResponse(request), request.packetId);
      console.log(`Dry run: mock response validation=${mockValidation.valid ? "valid" : "invalid"}`);
    }
    console.log("Dry run: no response, processed copy, or error JSON was written.");
    return true;
  }

  let response;
  try {
    response = await buildProviderResponse(request, options.provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeErrorFile(filePath, [`Provider ${options.provider} failed: ${message}`]);
    if (!options.fallbackMock) {
      return false;
    }
    console.warn("Local command failed; --fallback-mock enabled, generating mock advisory response.");
    response = buildMockResponse(request);
  }

  const responseValidation = validateResponse(response, request.packetId);
  if (!responseValidation.valid) {
    await writeErrorFile(filePath, responseValidation.errors);
    if (!options.fallbackMock || options.provider !== "local-command") {
      return false;
    }
    console.warn("Local command returned invalid response; --fallback-mock enabled, generating mock advisory response.");
    response = buildMockResponse(request);
  }

  await writeFile(latestResponsePath, `${JSON.stringify(response, null, 2)}\n`, "utf8");

  const processedName = `${path.basename(filePath, ".json")}-processed-${timestampSlug()}.json`;
  await copyFile(filePath, path.join(processedDir, processedName));

  console.log(`Advisory response written: ${path.relative(repoRoot, latestResponsePath)}`);
  console.log(`Processed request copied: ${path.join("advisory", "processed", processedName)}`);
  return true;
}

async function runOnce() {
  await ensureDirectories();
  logSafetyBanner();
  const options = parseArgs(process.argv.slice(2));

  const requestFile = await findRequestFile();
  if (!requestFile) {
    console.warn("No advisory request JSON found in advisory/requests.");
    return;
  }

  console.log(`Processing advisory request: ${path.relative(repoRoot, requestFile)}`);
  await processRequestFile(requestFile, options);
}

async function runWatch() {
  await ensureDirectories();
  logSafetyBanner();
  const options = parseArgs(process.argv.slice(2));
  console.log("Watching advisory/requests for advisory-only JSON files.");

  let processing = false;
  let pending = false;

  const processLatest = async () => {
    if (processing) {
      pending = true;
      return;
    }

    processing = true;
    try {
      const requestFile = await findRequestFile();
      if (requestFile) {
        await processRequestFile(requestFile, options);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      processing = false;
      if (pending) {
        pending = false;
        setTimeout(processLatest, 250);
      }
    }
  };

  await processLatest();
  watch(requestDir, { persistent: true }, (_eventType, filename) => {
    if (filename && filename.toLowerCase().endsWith(".json")) {
      setTimeout(processLatest, 250);
    }
  });
}

const args = new Set(process.argv.slice(2));

if (args.has("--watch")) {
  await runWatch();
} else {
  await runOnce();
}
