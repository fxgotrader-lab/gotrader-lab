const bridgeUrl = (process.env.TRADINGVIEW_MCP_BRIDGE_URL || "http://127.0.0.1:7331").replace(/\/$/, "");
const timeoutMs = 2500;

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
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

const endpoints = ["health", "status", ""];
const results = [];

for (const endpoint of endpoints) {
  const url = `${bridgeUrl}/${endpoint}`.replace(/\/$/, "");
  try {
    const result = await fetchWithTimeout(url);
    results.push({ endpoint: endpoint || "/", url, ...result });
    if (result.ok) {
      break;
    }
  } catch (error) {
    results.push({
      endpoint: endpoint || "/",
      url,
      ok: false,
      status: "error",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

const connected = results.some((result) => result.ok);
const report = {
  bridgeUrl,
  connected,
  mode: "read_only_analysis",
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none",
  results
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = 0;
