#!/usr/bin/env node
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

function logSafetyBanner() {
  console.warn("Advisory-only bridge. No execution authority. No broker control.");
  console.warn("No live OpenClaw/Hermes API call is made by this script.");
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
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
  console.error(`Invalid advisory request. Error file written: ${path.relative(repoRoot, errorPath)}`);
}

async function processRequestFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  let request;

  try {
    request = JSON.parse(raw);
  } catch {
    await writeErrorFile(filePath, ["Request JSON could not be parsed"]);
    return false;
  }

  const validation = validateRequest(request);
  if (!validation.valid) {
    await writeErrorFile(filePath, validation.errors);
    return false;
  }

  const response = buildMockResponse(request);
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

  const requestFile = await findRequestFile();
  if (!requestFile) {
    console.warn("No advisory request JSON found in advisory/requests.");
    return;
  }

  console.log(`Processing advisory request: ${path.relative(repoRoot, requestFile)}`);
  await processRequestFile(requestFile);
}

async function runWatch() {
  await ensureDirectories();
  logSafetyBanner();
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
        await processRequestFile(requestFile);
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
