import type {
  RawTradingViewMcpEvidence,
  TradingViewBias,
  TradingViewEvidence
} from "@/lib/integrations/tradingview/tradingViewMcpTypes";

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const clampConfidence = (value?: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const normalizeBias = (bias?: RawTradingViewMcpEvidence["bias"]): { bias: TradingViewBias; warning?: string } => {
  if (bias === "buy") {
    return {
      bias: "bullish",
      warning: "TradingView MCP returned buy language; normalized to advisory bullish bias only."
    };
  }
  if (bias === "sell") {
    return {
      bias: "bearish",
      warning: "TradingView MCP returned sell language; normalized to advisory bearish bias only."
    };
  }
  return { bias: bias ?? "unknown" };
};

const authorityWarnings = (raw: RawTradingViewMcpEvidence): string[] => {
  const warnings: string[] = [];
  if (raw.executionAuthority && raw.executionAuthority !== "none") {
    warnings.push("TradingView MCP output claimed execution authority; downgraded to none.");
  }
  if (raw.brokerAuthority && raw.brokerAuthority !== "none") {
    warnings.push("TradingView MCP output claimed broker authority; downgraded to none.");
  }
  if (raw.readinessOverrideAuthority && raw.readinessOverrideAuthority !== "none") {
    warnings.push("TradingView MCP output claimed readiness override authority; downgraded to none.");
  }
  if (raw.rawProviderPayloadIncluded) {
    warnings.push("Raw TradingView payload is not accepted into GoTrader journal or OpenClaw advisory packets.");
  }
  return warnings;
};

export const normalizeTradingViewEvidence = (
  raw: RawTradingViewMcpEvidence,
  fallback: { symbol: string; timeframe: string }
): TradingViewEvidence => {
  const normalizedBias = normalizeBias(raw.bias);
  const warnings = [
    ...(raw.warnings ?? []),
    ...authorityWarnings(raw),
    ...(normalizedBias.warning ? [normalizedBias.warning] : [])
  ];
  return {
    evidenceId: createId("tradingview_evidence"),
    symbol: raw.symbol ?? fallback.symbol,
    timeframe: raw.timeframe ?? fallback.timeframe,
    chartUrl: raw.chartUrl,
    source: "tradingview_mcp",
    technicalSummary: raw.technicalSummary ?? "TradingView MCP evidence pending. Adapter is analysis-only.",
    detectedLevels: raw.levels?.slice(0, 20) ?? [],
    trendState: raw.trendState ?? "unclear",
    supportResistance: raw.supportResistance?.slice(0, 20) ?? [],
    indicators: raw.indicators?.slice(0, 20) ?? [],
    patterns: raw.patterns?.slice(0, 10) ?? [],
    bias: normalizedBias.bias,
    confidence: clampConfidence(raw.confidence),
    warnings,
    missingEvidence: raw.missingEvidence ?? ["TradingView MCP is not connected in Phase 1."],
    timestamp: new Date().toISOString(),
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  };
};

export const createUnavailableTradingViewEvidence = ({
  symbol,
  timeframe
}: {
  symbol: string;
  timeframe: string;
}): TradingViewEvidence =>
  normalizeTradingViewEvidence(
    {
      symbol,
      timeframe,
      technicalSummary: "TradingView MCP is planned as a chart-analysis layer but is not connected.",
      trendState: "unclear",
      bias: "unknown",
      confidence: 0,
      warnings: ["Chart analysis unavailable. Do not treat missing TradingView evidence as broker truth."],
      missingEvidence: ["TradingView Desktop MCP connection not configured."]
    },
    { symbol, timeframe }
  );
