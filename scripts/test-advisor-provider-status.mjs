#!/usr/bin/env node

/**
 * Unit tests for the Advisor provider status model
 * (src/lib/llm/advisorProviderStatus.ts).
 *
 * Covers:
 * - unset URL -> openclaw_not_configured
 * - bridge stub markers / health -> openclaw_bridge_stub (never ordinary success)
 * - skill-routed response -> openclaw_skill_routed
 * - timeout -> openclaw_timeout
 * - offline / invalid / request failures -> openclaw_bridge_offline
 * - unsafe authority -> unsafe_response_rejected
 * - local LLM capability mapping
 * - authority remains none
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "src", "lib", "llm", "advisorProviderStatus.ts");
const outRoot = path.join(projectRoot, ".gotrader", "advisor-provider-status-test");

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
    classifyLocalLlmCapability,
    classifyOpenClawAdvisoryOutcome,
    OPENCLAW_STUB_BLOCKER_MARKER,
    OPENCLAW_STUB_SETUP_STEPS,
    openClawHealthUrlFor,
    openClawResponseLooksLikeStub
  } = await import(pathToFileURL(outPath).href);

  // 1. Unset URL -> openclaw_not_configured (not an app failure).
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint: "" }), "openclaw_not_configured");
  assert.equal(classifyOpenClawAdvisoryOutcome({ endpoint: "   " }), "openclaw_not_configured");
  assert.equal(classifyOpenClawAdvisoryOutcome({}), "openclaw_not_configured");
  assert.equal(
    classifyOpenClawAdvisoryOutcome({ endpoint: "http://127.0.0.1:8797/gotrader/advisory", unavailableReason: "not_configured" }),
    "openclaw_not_configured"
  );

  // 2. Bridge stub -> openclaw_bridge_stub, never ordinary success.
  const stubBySummary = classifyOpenClawAdvisoryOutcome({
    endpoint: "http://127.0.0.1:8797/gotrader/advisory",
    responseSummary:
      "Phone OpenClaw bridge received the GoTrader research packet. OpenClaw skill routing is not wired yet, so this is a safe stub advisory."
  });
  assert.equal(stubBySummary, "openclaw_bridge_stub");
  const stubByBlocker = classifyOpenClawAdvisoryOutcome({
    endpoint: "http://127.0.0.1:8797/gotrader/advisory",
    responseTopBlockers: [OPENCLAW_STUB_BLOCKER_MARKER]
  });
  assert.equal(stubByBlocker, "openclaw_bridge_stub");
  const stubByHealth = classifyOpenClawAdvisoryOutcome({
    endpoint: "http://127.0.0.1:8797/gotrader/advisory",
    healthOpenClawAgentEndpointConfigured: false
  });
  assert.equal(stubByHealth, "openclaw_bridge_stub");
  const stubByHealthStatus = classifyOpenClawAdvisoryOutcome({
    endpoint: "http://127.0.0.1:8797/gotrader/advisory",
    healthAdvisoryStatus: "stub"
  });
  assert.equal(stubByHealthStatus, "openclaw_bridge_stub");
  assert.equal(advisorProviderStatusInfo("openclaw_bridge_stub").isOrdinarySuccess, false);
  assert.equal(advisorProviderStatusInfo("openclaw_bridge_stub").tone, "warning");
  assert.ok(
    openClawResponseLooksLikeStub({ responseTopBlockers: ["openclaw_skill_routing_not_wired"] }),
    "stub blocker marker must be detected"
  );

  // 3. Skill-routed response -> openclaw_skill_routed (ordinary success).
  const routed = classifyOpenClawAdvisoryOutcome({
    endpoint: "http://127.0.0.1:8797/gotrader/advisory",
    responseSummary: "OpenClaw advisory review of the latest deterministic research cycle.",
    responseTopBlockers: ["walk_forward_unavailable"],
    healthOpenClawAgentEndpointConfigured: true,
    healthAdvisoryStatus: "connected"
  });
  assert.equal(routed, "openclaw_skill_routed");
  assert.equal(advisorProviderStatusInfo("openclaw_skill_routed").isOrdinarySuccess, true);

  // 4. Timeout -> openclaw_timeout.
  assert.equal(
    classifyOpenClawAdvisoryOutcome({ endpoint: "http://127.0.0.1:8797/gotrader/advisory", unavailableReason: "timeout" }),
    "openclaw_timeout"
  );
  assert.equal(advisorProviderStatusInfo("openclaw_timeout").isOrdinarySuccess, false);

  // 5. Offline / invalid / request failures -> openclaw_bridge_offline.
  for (const reason of ["offline", "invalid_response", "request_failed"]) {
    assert.equal(
      classifyOpenClawAdvisoryOutcome({ endpoint: "http://127.0.0.1:8797/gotrader/advisory", unavailableReason: reason }),
      "openclaw_bridge_offline",
      `reason ${reason} should map to openclaw_bridge_offline`
    );
  }

  // 6. Unsafe authority -> unsafe_response_rejected; blocked from proposal/validation state.
  assert.equal(
    classifyOpenClawAdvisoryOutcome({ endpoint: "http://127.0.0.1:8797/gotrader/advisory", unavailableReason: "unsafe_response" }),
    "unsafe_response_rejected"
  );
  const unsafeInfo = advisorProviderStatusInfo("unsafe_response_rejected");
  assert.equal(unsafeInfo.isOrdinarySuccess, false);
  assert.equal(unsafeInfo.tone, "danger");
  assert.ok(/cannot influence proposal or validation state/i.test(unsafeInfo.detail));

  // 7. Disabled.
  assert.equal(
    classifyOpenClawAdvisoryOutcome({ endpoint: "http://127.0.0.1:8797/gotrader/advisory", unavailableReason: "disabled" }),
    "disabled"
  );

  // 8. Local LLM capability mapping.
  assert.equal(classifyLocalLlmCapability("ready"), "local_llm_online");
  assert.equal(classifyLocalLlmCapability("timeout"), "local_llm_timeout");
  assert.equal(classifyLocalLlmCapability("config_missing"), "local_llm_config_missing");
  assert.equal(classifyLocalLlmCapability(undefined), "local_llm_config_missing");
  assert.equal(advisorProviderStatusInfo("local_llm_online").isOrdinarySuccess, true);
  assert.equal(advisorProviderStatusInfo("local_llm_timeout").isOrdinarySuccess, false);
  assert.equal(advisorProviderStatusInfo("deterministic_local").isOrdinarySuccess, false);

  // 9. Authority remains none.
  assert.equal(ADVISOR_PROVIDER_AUTHORITY.executionAuthority, "none");
  assert.equal(ADVISOR_PROVIDER_AUTHORITY.brokerAuthority, "none");
  assert.equal(ADVISOR_PROVIDER_AUTHORITY.readinessOverrideAuthority, "none");

  // 10. Stub setup helper content stays advisory-only and complete.
  assert.equal(OPENCLAW_STUB_SETUP_STEPS.length, 2);
  assert.ok(OPENCLAW_STUB_SETUP_STEPS[0].command.includes("openclaw-gotrader-advisory-skill-server.mjs"));
  assert.ok(OPENCLAW_STUB_SETUP_STEPS[1].command.includes("OPENCLAW_AGENT_ENDPOINT"));
  assert.ok(OPENCLAW_STUB_SETUP_STEPS[1].command.includes("openclaw-phone-advisory-bridge.mjs"));

  // 11. Health URL derivation.
  assert.equal(
    openClawHealthUrlFor("http://127.0.0.1:8797/gotrader/advisory"),
    "http://127.0.0.1:8797/health"
  );
  assert.equal(openClawHealthUrlFor("not a url"), undefined);

  console.log("test-advisor-provider-status: all assertions passed.");
  console.log("- unset URL -> openclaw_not_configured");
  console.log("- bridge stub markers/health -> openclaw_bridge_stub (not ordinary success)");
  console.log("- skill-routed response -> openclaw_skill_routed");
  console.log("- timeout -> openclaw_timeout; offline/invalid/request_failed -> openclaw_bridge_offline");
  console.log("- unsafe authority -> unsafe_response_rejected (blocked from proposal/validation state)");
  console.log("- authority remains none/none/none");
}

main().catch((error) => {
  console.error("test-advisor-provider-status failed:", error);
  process.exitCode = 1;
});
