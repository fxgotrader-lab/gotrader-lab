#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src", "lib", "llm", "advisorProviderStatus.ts");
const outRoot = path.join(projectRoot, ".gotrader", "openclaw-bridge-status-test");

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
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
  const outPath = path.join(outRoot, "advisorProviderStatus.mjs");
  fs.writeFileSync(outPath, transpiled, "utf8");
  return outPath;
}

async function main() {
  const outPath = compileForNode();
  const {
    ADVISOR_PROVIDER_AUTHORITY,
    advisorProviderStatusInfo,
    classifyOpenClawAdvisoryOutcome,
    openClawHealthUrlFor
  } = await import(pathToFileURL(outPath).href);

  const endpoint = "http://10.0.0.188:8797/gotrader/advisory";
  assert.equal(openClawHealthUrlFor(endpoint), "http://10.0.0.188:8797/health");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint: "" }), "openclaw_not_configured");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint, healthOpenClawAgentEndpointConfigured: false }), "openclaw_bridge_stub");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint, healthAdvisoryStatus: "stub" }), "openclaw_bridge_stub");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint, healthOpenClawAgentEndpointConfigured: true, healthAdvisoryStatus: "connected" }), "openclaw_skill_routed");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint, unavailableReason: "timeout" }), "openclaw_timeout");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint, unavailableReason: "unsafe_response" }), "unsafe_response_rejected");
  assert.equal(advisorProviderStatusInfo("openclaw_bridge_stub").isOrdinarySuccess, false);
  assert.equal(advisorProviderStatusInfo("openclaw_skill_routed").isOrdinarySuccess, true);
  assert.deepEqual(ADVISOR_PROVIDER_AUTHORITY, {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  });

  console.log("test-openclaw-bridge-status: all assertions passed.");
  console.log(JSON.stringify({
    healthUrl: openClawHealthUrlFor(endpoint),
    stubIsOrdinarySuccess: advisorProviderStatusInfo("openclaw_bridge_stub").isOrdinarySuccess,
    skillRoutedIsOrdinarySuccess: advisorProviderStatusInfo("openclaw_skill_routed").isOrdinarySuccess,
    authority: ADVISOR_PROVIDER_AUTHORITY
  }, null, 2));
}

main().catch((error) => {
  console.error("test-openclaw-bridge-status failed:", error);
  process.exitCode = 1;
});
