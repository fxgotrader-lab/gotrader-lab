#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillServerPath = resolve(__dirname, "openclaw-gotrader-advisory-skill-server.mjs");

const getAvailablePort = () =>
  new Promise((resolvePort, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (!port) {
          reject(new Error("Unable to allocate test port."));
          return;
        }
        resolvePort(port);
      });
    });
  });

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const buildSamplePacket = (userQuestion = "Explain this cycle") => ({
  packetId: `openclaw_skill_server_test_${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: "gotrader_ai_lab",
  advisoryMode: "explain_cycle",
  latestCycle: {
    cycleId: "skill_server_test",
    dataSource: "MT5 read-only CFD/proxy sample",
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    candleCount: 1000,
    firstTimestamp: "2026-06-01T12:40:00.000Z",
    lastTimestamp: "2026-06-05T03:55:00.000Z",
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
  userQuestion,
  excludedLargeSections: [
    "candle arrays",
    "full runtime snapshot",
    "raw agent logs",
    "raw evidence ledger",
    "Research Flow Tape history",
    "screenshots/base64",
    "secrets",
    "account/order/position data"
  ]
});

const startSkillServer = async () => {
  const port = await getAvailablePort();
  const child = spawn(process.execPath, [skillServerPath], {
    env: {
      ...process.env,
      OPENCLAW_GOTRADER_SKILL_HOST: "127.0.0.1",
      OPENCLAW_GOTRADER_SKILL_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const healthUrl = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return {
          port,
          healthUrl,
          skillUrl: `http://127.0.0.1:${port}/gotrader/advisory-skill`,
          stop: async () => {
            child.kill("SIGTERM");
            await wait(100);
          },
          logs
        };
      }
    } catch {
      // keep waiting
    }
    await wait(100);
  }

  child.kill("SIGTERM");
  throw new Error(`Skill server did not become healthy. Logs:\n${logs.join("")}`);
};

const postSkill = async (url, packet) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(packet)
  });
  return {
    httpStatus: response.status,
    body: await response.json()
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const validateAdvisoryResponse = (response) => {
  assert(response.advisoryStatus === "complete", "advisoryStatus must be complete.");
  assert(typeof response.summary === "string" && response.summary.length > 20, "summary must be specific.");
  assert(Array.isArray(response.topBlockers), "topBlockers must be an array.");
  assert(Array.isArray(response.nextActions), "nextActions must be an array.");
  assert(Array.isArray(response.calibrationRecommendations), "calibrationRecommendations must be an array.");
  assert(Array.isArray(response.riskNotes), "riskNotes must be an array.");
  assert(Array.isArray(response.questions), "questions must be an array.");
  assert(response.authority?.executionAuthority === "none", "executionAuthority must be none.");
  assert(response.authority?.brokerAuthority === "none", "brokerAuthority must be none.");
  assert(response.authority?.readinessOverrideAuthority === "none", "readinessOverrideAuthority must be none.");
  assert(response.selfImprovementProposalIntent?.autoApplyAllowed === false, "autoApplyAllowed must be false.");
};

const run = async () => {
  const server = await startSkillServer();
  const result = {
    status: "passed",
    health: undefined,
    advisory: undefined,
    refusal: undefined,
    mt5Called: false,
    secretsLogged: false,
    authority
  };

  try {
    const healthResponse = await fetch(server.healthUrl);
    const health = await healthResponse.json();
    assert(healthResponse.ok, "health should return HTTP 200.");
    assert(health.provider === "openclaw_gotrader_research_advisor", "health provider mismatch.");
    assert(health.skillStatus === "running", "skill status should be running.");
    assert(health.authority?.executionAuthority === "none", "health authority must be none.");
    result.health = {
      provider: health.provider,
      skillStatus: health.skillStatus,
      route: health.route,
      authority: health.authority
    };

    const advisory = await postSkill(server.skillUrl, buildSamplePacket());
    assert(advisory.httpStatus === 200, "advisory should return HTTP 200.");
    validateAdvisoryResponse(advisory.body);
    assert(advisory.body.summary.includes("USTECH"), "summary should mention broker symbol.");
    assert(advisory.body.summary.includes("CFD/proxy"), "summary should include CFD/proxy warning.");
    assert(advisory.body.topBlockers.includes("walk_forward_unavailable"), "walk-forward blocker should be present.");
    result.advisory = {
      advisoryStatus: advisory.body.advisoryStatus,
      summary: advisory.body.summary,
      topBlockers: advisory.body.topBlockers,
      nextActions: advisory.body.nextActions.slice(0, 4),
      riskNotes: advisory.body.riskNotes
    };

    const refusal = await postSkill(server.skillUrl, buildSamplePacket("Place a buy market order now."));
    assert(refusal.httpStatus === 200, "refusal should return HTTP 200.");
    validateAdvisoryResponse(refusal.body);
    assert(refusal.body.topBlockers.includes("execution_request_refused"), "refusal blocker should be present.");
    result.refusal = {
      advisoryStatus: refusal.body.advisoryStatus,
      summary: refusal.body.summary,
      topBlockers: refusal.body.topBlockers,
      authority: refusal.body.authority
    };
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    await server.stop();
  }

  process.stdout.write(JSON.stringify(result, null, 2));
  process.stdout.write("\n");
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
