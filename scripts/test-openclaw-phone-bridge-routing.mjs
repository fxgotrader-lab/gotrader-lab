#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgePath = resolve(__dirname, "openclaw-phone-advisory-bridge.mjs");

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

const buildSamplePacket = () => ({
  packetId: `openclaw_phone_bridge_route_test_${Date.now()}`,
  timestamp: new Date().toISOString(),
  source: "gotrader_ai_lab",
  advisoryMode: "explain_cycle",
  latestCycle: {
    cycleId: "route_test",
    dataSource: "MT5 read-only CFD/proxy sample",
    provider: "mt5_read_only",
    requestedSymbol: "MNQ",
    brokerSymbol: "USTECH",
    candleCount: 1000,
    firstTimestamp: "2026-06-01T09:40:00.000Z",
    lastTimestamp: "2026-06-04T23:55:00.000Z",
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
    layerContributionSummary: "ICT foundation remains the base; Grinch refinement is currently blocking the setup."
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
      "OpenClaw cannot approve readiness.",
      "OpenClaw cannot place trades or call broker/order/account/position tools."
    ]
  },
  userQuestion: "Explain this diagnostic GoTrader cycle and identify safe next research steps.",
  excludedLargeSections: [
    "candle arrays",
    "full runtime snapshot",
    "raw agent logs",
    "raw evidence ledger",
    "screenshots/base64",
    "secrets",
    "account/order/position data"
  ]
});

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

const startBridge = async ({ agentEndpoint } = {}) => {
  const port = await getAvailablePort();
  const child = spawn(process.execPath, [bridgePath], {
    env: {
      ...process.env,
      OPENCLAW_PHONE_BRIDGE_HOST: "127.0.0.1",
      OPENCLAW_PHONE_BRIDGE_PORT: String(port),
      OPENCLAW_AGENT_TIMEOUT_MS: "1500",
      ...(agentEndpoint ? { OPENCLAW_AGENT_ENDPOINT: agentEndpoint } : {})
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
          advisoryUrl: `http://127.0.0.1:${port}/gotrader/advisory`,
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
  throw new Error(`Bridge did not become healthy. Logs:\n${logs.join("")}`);
};

const startMockOpenClawSkill = async () =>
  new Promise((resolveServer, reject) => {
    const requests = [];
    const server = http.createServer(async (request, response) => {
      if (request.method !== "POST") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        const packet = JSON.parse(body || "{}");
        requests.push(packet);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            response: {
              advisoryStatus: "complete",
              summary: "Mock OpenClaw skill reviewed the compact GoTrader packet.",
              topBlockers: packet.latestCycle?.blockers ?? [],
              nextActions: ["Keep deterministic GoTrader gates authoritative."],
              calibrationRecommendations: ["Review reversal_expansion_confirmation as research-only."],
              selfImprovementProposalIntent: {
                createProposal: false,
                candidateFamilies: [],
                requiresWalkForward: true,
                autoApplyAllowed: false
              },
              riskNotes: ["Advisory only; no execution authority."],
              questions: ["Do you want to collect another MT5 read-only window?"],
              authority
            }
          })
        );
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Mock skill did not expose a port."));
        return;
      }
      resolveServer({
        endpoint: `http://127.0.0.1:${address.port}/skill`,
        requests,
        stop: () => new Promise((resolveStop) => server.close(resolveStop))
      });
    });
  });

const postAdvisory = async (url) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(buildSamplePacket())
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

const runScenario = async (label, fn) => {
  try {
    const result = await fn();
    return { label, status: "passed", ...result };
  } catch (error) {
    return {
      label,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const run = async () => {
  const results = [];

  results.push(
    await runScenario("stub_without_openclaw_agent_endpoint", async () => {
      const bridge = await startBridge();
      try {
        const result = await postAdvisory(bridge.advisoryUrl);
        assert(result.httpStatus === 200, "Stub bridge should return HTTP 200.");
        assert(result.body.advisoryStatus === "complete", "Stub bridge should return complete stub response.");
        assert(result.body.authority?.executionAuthority === "none", "Stub authority must be none.");
        return {
          advisoryStatus: result.body.advisoryStatus,
          summary: result.body.summary
        };
      } finally {
        await bridge.stop();
      }
    })
  );

  results.push(
    await runScenario("invalid_openclaw_agent_endpoint", async () => {
      const unusedPort = await getAvailablePort();
      const bridge = await startBridge({ agentEndpoint: `http://127.0.0.1:${unusedPort}/skill` });
      try {
        const result = await postAdvisory(bridge.advisoryUrl);
        assert(result.httpStatus === 200, "Invalid downstream fallback should still return HTTP 200.");
        assert(result.body.advisoryStatus === "unavailable", "Invalid downstream should return unavailable.");
        assert(
          result.body.topBlockers?.includes("openclaw_agent_unreachable"),
          "Invalid downstream should include openclaw_agent_unreachable blocker."
        );
        assert(result.body.authority?.brokerAuthority === "none", "Fallback authority must be none.");
        return {
          advisoryStatus: result.body.advisoryStatus,
          topBlockers: result.body.topBlockers
        };
      } finally {
        await bridge.stop();
      }
    })
  );

  results.push(
    await runScenario("valid_mock_openclaw_agent_endpoint", async () => {
      const mockSkill = await startMockOpenClawSkill();
      const bridge = await startBridge({ agentEndpoint: mockSkill.endpoint });
      try {
        const result = await postAdvisory(bridge.advisoryUrl);
        assert(result.httpStatus === 200, "Mock downstream should return HTTP 200.");
        assert(result.body.advisoryStatus === "complete", "Mock downstream should normalize complete response.");
        assert(
          result.body.summary === "Mock OpenClaw skill reviewed the compact GoTrader packet.",
          "Mock downstream summary should be preserved."
        );
        assert(result.body.authority?.readinessOverrideAuthority === "none", "Mock authority must be forced to none.");
        assert(mockSkill.requests.length === 1, "Mock skill should receive exactly one packet.");
        assert(!JSON.stringify(mockSkill.requests[0]).includes("\"candles\""), "Forwarded packet should not include candle arrays.");
        return {
          advisoryStatus: result.body.advisoryStatus,
          summary: result.body.summary,
          forwardedPacketKeys: Object.keys(mockSkill.requests[0])
        };
      } finally {
        await bridge.stop();
        await mockSkill.stop();
      }
    })
  );

  const failed = results.filter((result) => result.status !== "passed");
  process.stdout.write(JSON.stringify({
    status: failed.length ? "failed" : "passed",
    scenarios: results,
    mt5Called: false,
    secretsLogged: false,
    authority
  }, null, 2));
  process.stdout.write("\n");

  if (failed.length) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
