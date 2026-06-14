import {
  SOURCE_STATUS_AUTHORITY,
  type SourceStatusInputs,
  type SourceStatusLevel,
  type SourceStatusDepth,
  type SourceDepthMode,
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

const resolveDepthMode = (input: {
  candleCount: number;
  rangeHistoryAvailable?: boolean;
  availableLookbackDays?: number;
  depthMode?: SourceDepthMode;
}): SourceDepthMode => {
  if (input.depthMode) return input.depthMode;
  if (input.rangeHistoryAvailable && (input.availableLookbackDays ?? 0) >= 60) return "validation_context";
  if ((input.availableLookbackDays ?? 0) >= 5) return "swing_context";
  if (input.candleCount >= 400) return "tactical_only";
  return "unavailable";
};

const resolveDepthLabel = (depth: SourceStatusDepth) => {
  if (depth.depthLabel) return depth.depthLabel;
  switch (depth.depthMode) {
    case "validation_context":
      return `90-day analysis context ready${typeof depth.availableLookbackDays === "number" ? ` (${depth.availableLookbackDays.toFixed(2)}d)` : ""}`;
    case "swing_context":
      return `Swing context available${typeof depth.availableLookbackDays === "number" ? ` (${depth.availableLookbackDays.toFixed(2)}d)` : ""}`;
    case "tactical_only":
      return "Tactical chart window only; run Activate Market for 90-day analysis context.";
    default:
      return "Source depth unavailable.";
  }
};

const buildSourceDepth = (inputs: SourceStatusInputs): SourceStatusDepth => {
  const chartCandleCount = inputs.sourceDepth?.chartCandleCount ?? inputs.candleCount;
  const chartTimeframe = inputs.sourceDepth?.chartTimeframe ?? inputs.primaryTimeframe ?? "n/a";
  const analysisTimeframes = inputs.sourceDepth?.analysisTimeframes ?? [];
  const missingAnalysisTimeframes = inputs.sourceDepth?.missingAnalysisTimeframes ?? [];
  const rangeHistoryAvailable = inputs.sourceDepth?.rangeHistoryAvailable ?? false;
  const availableLookbackDays = inputs.sourceDepth?.availableLookbackDays;
  const depthMode = resolveDepthMode({
    candleCount: chartCandleCount,
    rangeHistoryAvailable,
    availableLookbackDays,
    depthMode: inputs.sourceDepth?.depthMode
  });
  const warning =
    inputs.sourceDepth?.warning ??
    (depthMode === "tactical_only"
      ? "The chart uses the latest tactical candles; deeper validation context is explicit and manual."
      : depthMode === "unavailable"
        ? "No usable candle depth is available."
        : undefined);
  const depth = {
    chartCandleCount,
    chartTimeframe,
    analysisCandleCount: inputs.sourceDepth?.analysisCandleCount,
    analysisTimeframes,
    missingAnalysisTimeframes,
    availableLookbackDays,
    requestedLookbackDays: inputs.sourceDepth?.requestedLookbackDays,
    rangeHistoryAvailable,
    depthMode,
    depthLabel: inputs.sourceDepth?.depthLabel ?? "",
    warning
  };
  return {
    ...depth,
    depthLabel: resolveDepthLabel(depth)
  };
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
  const sourceDepth = buildSourceDepth(inputs);

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
    sourceDepth,
    authority: SOURCE_STATUS_AUTHORITY
  };
};
