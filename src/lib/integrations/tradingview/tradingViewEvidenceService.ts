import { recordCommunicationMessage } from "@/lib/communications/communicationSpec";
import {
  requestTradingViewMcpEvidence,
  checkTradingViewMcpBridgeStatus
} from "@/lib/integrations/tradingview/tradingViewMcpClient";
import type {
  TradingViewMcpBridgeRequest,
  TradingViewMcpBridgeSettings,
  TradingViewMcpStatusCheck,
  TradingViewEvidenceServiceResult
} from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";
import { loadTradingViewMcpSettings } from "@/lib/integrations/tradingview/tradingViewMcpSettings";
import {
  createUnavailableTradingViewEvidence,
  normalizeTradingViewEvidence
} from "@/lib/integrations/tradingview/tradingViewEvidenceNormalizer";
import type {
  RawTradingViewMcpEvidence,
  TradingViewEvidence
} from "@/lib/integrations/tradingview/tradingViewMcpTypes";

export const TRADINGVIEW_MCP_STATUS_STORAGE_KEY = "gotrader-ai-lab-tradingview-mcp-status";
export const TRADINGVIEW_MCP_EVIDENCE_STORAGE_KEY = "gotrader-ai-lab-tradingview-mcp-latest-evidence";
export const TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT = "gotrader-ai-lab-tradingview-mcp-evidence-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const defaultStatusFor = (settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()): TradingViewMcpStatusCheck => ({
  checkedAt: new Date().toISOString(),
  bridgeUrl: settings.bridgeUrl,
  connectionStatus: "disconnected",
  analysisAvailable: false,
  evidenceAvailable: false,
  message: settings.enabled
    ? "TradingView MCP evidence bridge has not been checked yet."
    : "TradingView MCP evidence bridge is disabled.",
  warnings: ["TradingView MCP is read-only chart evidence. It is not a live broker feed or execution source."],
  ...authority
});

export const createTradingViewBridgeRequest = ({
  symbol,
  timeframe
}: {
  symbol: string;
  timeframe: string;
}): TradingViewMcpBridgeRequest => ({
  symbol,
  timeframe,
  requestedEvidence: ["chart_state", "ohlcv_summary", "indicator_values", "levels", "patterns", "screenshot"],
  mode: "research",
  executionAuthority: "none",
  brokerAuthority: "none"
});

const extractRawEvidence = (
  payload: Awaited<ReturnType<typeof requestTradingViewMcpEvidence>>["payload"]
): RawTradingViewMcpEvidence | undefined =>
  payload?.evidence ?? payload?.data ?? payload?.chart;

export function loadTradingViewMcpBridgeStatus(): TradingViewMcpStatusCheck {
  if (!isBrowser()) {
    return defaultStatusFor();
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_STATUS_STORAGE_KEY);
  if (!raw) {
    return defaultStatusFor();
  }
  try {
    return JSON.parse(raw) as TradingViewMcpStatusCheck;
  } catch {
    return defaultStatusFor();
  }
}

export function saveTradingViewMcpBridgeStatus(status: TradingViewMcpStatusCheck) {
  if (isBrowser()) {
    window.localStorage.setItem(TRADINGVIEW_MCP_STATUS_STORAGE_KEY, JSON.stringify(status));
    window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, { detail: status }));
  }
  return status;
}

export function loadLatestTradingViewEvidence(): TradingViewEvidence | undefined {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_EVIDENCE_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as TradingViewEvidence;
  } catch {
    return undefined;
  }
}

export function saveLatestTradingViewEvidence(evidence: TradingViewEvidence) {
  if (isBrowser()) {
    window.localStorage.setItem(TRADINGVIEW_MCP_EVIDENCE_STORAGE_KEY, JSON.stringify(evidence));
    window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_EVIDENCE_UPDATED_EVENT, { detail: evidence }));
  }
  return evidence;
}

export async function checkAndStoreTradingViewMcpStatus(
  settings: TradingViewMcpBridgeSettings = loadTradingViewMcpSettings()
) {
  const status = await checkTradingViewMcpBridgeStatus(settings);
  saveTradingViewMcpBridgeStatus(status);
  recordCommunicationMessage({
    source: "openclaw_research_supervisor",
    agentName: "TradingView MCP Evidence Bridge",
    category: "research_note",
    severity: status.connectionStatus === "connected_analysis_only" ? "info" : "warning",
    title: "TradingView MCP evidence status checked",
    summary: status.message,
    body: [
      `Bridge URL: ${status.bridgeUrl}.`,
      `Connection: ${status.connectionStatus}.`,
      "Authority: analysis only; execution none; broker authority none; readiness override none."
    ].join(" "),
    actionRequired: false,
    resolved: status.connectionStatus === "connected_analysis_only"
  });
  return status;
}

export async function fetchAndStoreTradingViewEvidence({
  settings = loadTradingViewMcpSettings(),
  symbol,
  timeframe
}: {
  settings?: TradingViewMcpBridgeSettings;
  symbol: string;
  timeframe: string;
}): Promise<TradingViewEvidenceServiceResult> {
  const result = await requestTradingViewMcpEvidence(createTradingViewBridgeRequest({ symbol, timeframe }), settings);
  saveTradingViewMcpBridgeStatus(result.status);
  const rawEvidence = extractRawEvidence(result.payload);
  const evidence = rawEvidence
    ? normalizeTradingViewEvidence(
        {
          ...rawEvidence,
          symbol: rawEvidence.symbol ?? symbol,
          timeframe: rawEvidence.timeframe ?? timeframe,
          warnings: [...(rawEvidence.warnings ?? []), ...(result.payload?.warnings ?? [])]
        },
        { symbol, timeframe }
      )
    : result.status.connectionStatus === "connected_analysis_only"
      ? createUnavailableTradingViewEvidence({ symbol, timeframe })
      : undefined;

  if (evidence) {
    saveLatestTradingViewEvidence(evidence);
    recordCommunicationMessage({
      source: "openclaw_research_supervisor",
      agentName: "TradingView MCP Evidence Bridge",
      category: "research_note",
      severity: result.status.connectionStatus === "connected_analysis_only" ? "info" : "warning",
      title: "TradingView chart evidence checked",
      summary: `${symbol} ${timeframe}: ${evidence.chartBias} bias, confidence ${evidence.confidence.toFixed(2)}.`,
      body: [
        evidence.technicalSummary,
        `Evidence ${evidence.evidenceId} stored as bounded chart evidence.`,
        "TradingView evidence is supporting context only and cannot approve risk, readiness, or execution."
      ].join(" "),
      actionRequired: false,
      resolved: true
    });
  }

  return { status: result.status, evidence };
}
