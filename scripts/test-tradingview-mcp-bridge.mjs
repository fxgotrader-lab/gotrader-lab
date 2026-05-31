const bridgeUrl = (process.env.TRADINGVIEW_MCP_BRIDGE_URL || "http://127.0.0.1:7331").replace(/\/$/, "");
const symbol = process.env.TRADINGVIEW_MCP_TEST_SYMBOL || "MNQ";
const timeframe = process.env.TRADINGVIEW_MCP_TEST_TIMEFRAME || "5m";
const timeoutMs = 2500;

const authority = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const fetchWithTimeout = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
};

const checks = [];

for (const endpoint of ["health", "status", ""]) {
  const url = `${bridgeUrl}/${endpoint}`.replace(/\/$/, "");
  try {
    checks.push({ endpoint: endpoint || "/", url, ...(await fetchWithTimeout(url)) });
  } catch (error) {
    checks.push({
      endpoint: endpoint || "/",
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

try {
  checks.push({
    endpoint: "POST /evidence",
    url: `${bridgeUrl}/evidence`,
    ...(await fetchWithTimeout(`${bridgeUrl}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol, timeframe })
    }))
  });
} catch (error) {
  checks.push({
    endpoint: "POST /evidence",
    url: `${bridgeUrl}/evidence`,
    ok: false,
    status: "error",
    payload: error instanceof Error ? error.message : String(error)
  });
}

const connected = checks.some((check) => check.ok);

console.log(
  JSON.stringify(
    {
      bridgeUrl,
      symbol,
      timeframe,
      connected,
      mode: "read_only_analysis",
      note: connected
        ? "Bridge responded. Verify evidence remains advisory-only."
        : "Bridge did not respond. This is expected unless the local wrapper is running.",
      ...authority,
      checks
    },
    null,
    2
  )
);

process.exitCode = 0;
