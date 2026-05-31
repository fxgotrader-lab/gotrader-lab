import type { TradingViewEvidence, TradingViewMcpAdapterPlan, TradingViewMcpConnectionStatus } from "@/lib/integrations/tradingview/tradingViewMcpTypes";

export const TRADINGVIEW_MCP_POLICY_VERSION = "tradingview_mcp_analysis_only_v1" as const;

export const tradingViewMcpAdapterPlan: TradingViewMcpAdapterPlan = {
  status: "planned_not_connected",
  role: "chart_analysis_only",
  allowedUses: [
    "Read chart state, OHLCV summaries, indicator values, annotations, and screenshots.",
    "Provide technical confirmation and chart evidence references.",
    "Support replay/practice analysis without execution authority."
  ],
  forbiddenUses: [
    "Place, modify, cancel, or close orders.",
    "Approve risk, readiness, paper-demo state, or live execution.",
    "Act as broker truth for account, margin, fills, or positions.",
    "Bypass GoTrader evaluator, Risk Manager, broker router, or journal."
  ],
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

export const tradingViewConnectionLabel = (status: TradingViewMcpConnectionStatus) =>
  status.replace(/_/g, " ");

export const validateTradingViewEvidenceAuthority = (evidence: TradingViewEvidence): string[] => {
  const errors: string[] = [];
  if (evidence.executionAuthority !== "none") errors.push("TradingView evidence must have no execution authority.");
  if (evidence.brokerAuthority !== "none") errors.push("TradingView evidence must have no broker authority.");
  if (evidence.readinessOverrideAuthority !== "none") errors.push("TradingView evidence must have no readiness override authority.");
  return errors;
};
