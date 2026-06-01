import {
  type TradingViewMcpBridgeEvidenceResponse,
  type TradingViewMcpBridgeRequest,
  type TradingViewMcpBridgeSettings,
  type TradingViewMcpStatusCheck
} from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import { loadTradingViewMcpSettings } from "@/lib/integrations/tradingview/tradingViewMcpSettings";

const REQUEST_TIMEOUT_MS = 2500;

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const now = () => new Date().toISOString();

const disconnectedStatus = (
  settings: TradingViewMcpBridgeSettings,
  message = "TradingView MCP read-only bridge is not connected.",
  warnings: string[] = []
): TradingViewMcpStatusCheck => ({
  checkedAt: now(),
  bridgeUrl: settings.bridgeUrl,
  connectionStatus: "disconnected",
  analysisAvailable: false,
  evidenceAvailable: false,
  wrapperRunning: false,
  tradingViewDesktopCdpConnected: false,
  message,
  warnings,
  ...authority
});

const normalizeEndpoint = (bridgeUrl: string, endpoint: string) =>
  `${bridgeUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const statusFromPayload = (
  settings: TradingViewMcpBridgeSettings,
  payload: Record<string, unknown>,
  endpoint: string
): TradingViewMcpStatusCheck => {
  const rawStatus = String(payload.status ?? payload.connectionStatus ?? payload.state ?? "connected").toLowerCase();
  const connected = ["ok", "ready", "connected", "running", "healthy"].some((token) => rawStatus.includes(token));
  const upstream = payload.upstream && typeof payload.upstream === "object" ? payload.upstream as Record<string, unknown> : undefined;
  const upstreamPayload =
    upstream?.payload && typeof upstream.payload === "object" ? upstream.payload as Record<string, unknown> : undefined;
  const tradingViewDesktopCdpConnected = Boolean(upstreamPayload?.cdp_connected);
  return {
    checkedAt: now(),
    bridgeUrl: settings.bridgeUrl,
    connectionStatus: connected ? "connected_analysis_only" : "disconnected",
    analysisAvailable: connected,
    evidenceAvailable: connected,
    wrapperRunning: true,
    tradingViewDesktopCdpConnected,
    chartSymbol: typeof upstreamPayload?.chart_symbol === "string" ? upstreamPayload.chart_symbol : undefined,
    chartResolution: typeof upstreamPayload?.chart_resolution === "string" ? upstreamPayload.chart_resolution : undefined,
    message: String(payload.message ?? `TradingView MCP bridge responded at ${endpoint}.`),
    warnings: connected
      ? ["TradingView MCP is chart evidence only. It does not provide broker truth or execution authority."]
      : [`TradingView MCP bridge responded at ${endpoint} but did not report a connected state.`],
    ...authority
  };
};

export async function checkTradingViewMcpBridgeStatus(
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
): Promise<TradingViewMcpStatusCheck> {
  if (!settings.enabled) {
    return disconnectedStatus(settings, "TradingView MCP bridge is disabled in local settings.", [
      "Enable the local bridge in Settings before checking connection."
    ]);
  }

  const endpoints = ["health", "status", ""];
  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson<Record<string, unknown>>(normalizeEndpoint(settings.bridgeUrl, endpoint));
      return statusFromPayload(settings, payload, endpoint || "/");
    } catch {
      // Try the next common local bridge endpoint.
    }
  }

  return disconnectedStatus(settings, "TradingView MCP bridge did not respond.", [
    "Start the local TradingView MCP bridge and ensure CORS allows this app origin.",
    "If port 7331 is occupied but disconnected, run npm.cmd run tradingview:mcp-diagnose-port, then npm.cmd run tradingview:mcp-stop if it is a stale GoTrader wrapper.",
    "No TradingView evidence was imported."
  ]);
}

export async function requestTradingViewMcpEvidence(
  request: TradingViewMcpBridgeRequest,
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
): Promise<{ status: TradingViewMcpStatusCheck; payload?: TradingViewMcpBridgeEvidenceResponse }> {
  const status = await checkTradingViewMcpBridgeStatus(settings);
  if (status.connectionStatus !== "connected_analysis_only") {
    return { status };
  }

  try {
    const payload = await fetchJson<TradingViewMcpBridgeEvidenceResponse>(normalizeEndpoint(settings.bridgeUrl, "evidence"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    return { status, payload };
  } catch {
    try {
      const params = new URLSearchParams({
        symbol: request.symbol,
        timeframe: request.timeframe
      });
      const payload = await fetchJson<TradingViewMcpBridgeEvidenceResponse>(
        `${normalizeEndpoint(settings.bridgeUrl, "evidence")}?${params.toString()}`
      );
      return { status, payload };
    } catch {
      return {
        status: {
          ...status,
          connectionStatus: "error",
          evidenceAvailable: false,
          message: "TradingView MCP bridge responded, but evidence request failed.",
          warnings: [
            ...status.warnings,
            "Expected a read-only /evidence endpoint returning bounded chart evidence."
          ]
        }
      };
    }
  }
}
