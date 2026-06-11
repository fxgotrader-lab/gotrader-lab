import {
  SOURCE_STATUS_AUTHORITY,
  type SourceStatusInputs,
  type SourceStatusLevel,
  type SourceStatusSnapshot
} from "./sourceStatusTypes";

const MOCK_WARNING =
  "Mock/sample data - not MT5 research-active. Sample-only, not research evidence.";

const resolveStatusLevel = (inputs: SourceStatusInputs): SourceStatusLevel => {
  if (inputs.candleCount <= 0) {
    return "unavailable";
  }
  switch (inputs.provider) {
    case "mt5_read_only":
      return inputs.researchEligible ? "mt5_research_active" : "mt5_visual_only";
    case "imported_historical":
    case "imported":
      return "imported_research";
    case "tradingview_mcp":
    case "tradingview_mcp_chart":
      return "tradingview_chart";
    case "mock":
      return "mock_sample";
    default:
      return "unavailable";
  }
};

const resolveWarningLabel = (
  status: SourceStatusLevel,
  isProxyInstrument: boolean,
  inputs: SourceStatusInputs
): string | undefined => {
  if (status === "mock_sample") {
    return MOCK_WARNING;
  }
  if (status === "unavailable") {
    return "No active candle source resolved. Activate MT5 research mode or import historical data.";
  }
  if (status === "mt5_visual_only") {
    return "MT5 read-only candles are chart-only; research eligibility has not passed.";
  }
  if (isProxyInstrument) {
    return `MT5 ${inputs.brokerSymbol} is CFD/proxy market data for ${inputs.requestedSymbol}, not broker truth.`;
  }
  return inputs.warnings?.[0];
};

/**
 * Pure derivation from already-loaded source facts to the shared
 * page-level status snapshot. Keep this file free of value imports
 * outside the sourceStatus module so script tests can transpile it
 * standalone (see scripts/test-source-status.mjs).
 */
export const buildSourceStatusSnapshot = (inputs: SourceStatusInputs): SourceStatusSnapshot => {
  const sourceStatus = resolveStatusLevel(inputs);
  const requestedSymbol = inputs.requestedSymbol ?? "MNQ";
  const isProxyInstrument = Boolean(
    inputs.brokerSymbol && inputs.requestedSymbol && inputs.brokerSymbol !== inputs.requestedSymbol
  );
  const isMockOrSample = sourceStatus === "mock_sample" || sourceStatus === "unavailable";

  return {
    sourceProvider: inputs.provider,
    sourceStatus,
    requestedSymbol,
    brokerSymbol: inputs.brokerSymbol,
    displayLabel: inputs.sourceLabel,
    primaryTimeframe: inputs.primaryTimeframe ?? "n/a",
    higherTimeframes: (inputs.higherTimeframes ?? []).map(
      (source) => `${source.timeframe}:${source.candleCount}`
    ),
    candleCount: inputs.candleCount,
    sourceFingerprint: inputs.fingerprint ?? "no fingerprint",
    lastUpdated: inputs.lastUpdated,
    isResearchActive: sourceStatus === "mt5_research_active",
    isMockOrSample,
    isProxyInstrument,
    warningLabel: resolveWarningLabel(sourceStatus, isProxyInstrument, inputs),
    authority: SOURCE_STATUS_AUTHORITY
  };
};
