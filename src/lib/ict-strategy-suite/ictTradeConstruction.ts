import type {
  IctEntryModelType,
  IctRiskModel,
  IctTradeConstructionBlocker,
  IctTradeConstructionInput,
  IctTradeConstructionResult,
  IctTradeConstructionWarning,
  IctTradeStructureBounds
} from "./ictTradeConstructionTypes";

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const safety = {
  rawCandlesExcluded: true as const,
  rawSnapshotsExcluded: true as const,
  accountDataExcluded: true as const,
  orderDataExcluded: true as const,
  positionDataExcluded: true as const,
  secretsExcluded: true as const
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const rounded = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const unique = <T extends string>(values: T[]) => Array.from(new Set(values));

const defaultRiskModelFor = (input: IctTradeConstructionInput): Required<Pick<IctRiskModel, "minimumRR" | "preferredRR" | "maximumRR">> & Pick<IctRiskModel, "maxStopDistance" | "pointSize" | "pointValue" | "strategyId"> => {
  const id = input.strategyId?.toLowerCase() ?? "";
  const symbol = `${input.symbol ?? ""} ${input.brokerSymbol ?? ""}`.toUpperCase();
  const minimumRR =
    input.minimumRR ??
    (id.includes("turtle") ? 2.5 : id.includes("cameron") || id.includes("amd") || id.includes("power_of_three") ? 3 : 2);
  const preferredRR = input.preferredRR ?? (minimumRR >= 3 ? 3 : 3);
  const maximumRR = input.maximumRR ?? 20;
  const maxStopDistance =
    input.maxStopDistance ??
    (symbol.includes("USTECH") || symbol.includes("MNQ") || symbol.includes("NQ") || symbol.includes("US100") ? 50 : undefined);
  return {
    minimumRR,
    preferredRR,
    maximumRR,
    maxStopDistance,
    pointSize: input.pointSize,
    pointValue: input.pointValue,
    strategyId: input.strategyId
  };
};

const stopBoundaryFor = (
  side: IctTradeConstructionInput["side"],
  entryModelType: IctEntryModelType,
  bounds?: IctTradeStructureBounds
) => {
  if (!bounds || entryModelType === "generic") return undefined;
  if (entryModelType === "fvg" || entryModelType === "ifvg") {
    const low = entryModelType === "ifvg" ? bounds.ifvgLow ?? bounds.fvgLow : bounds.fvgLow ?? bounds.ifvgLow;
    const high = entryModelType === "ifvg" ? bounds.ifvgHigh ?? bounds.fvgHigh : bounds.fvgHigh ?? bounds.ifvgHigh;
    return side === "long"
      ? [low, bounds.sweptLow].filter(finite).sort((left, right) => left - right)[0]
      : [high, bounds.sweptHigh].filter(finite).sort((left, right) => right - left)[0];
  }
  const structureLow =
    bounds.structureLow ??
    bounds.orderBlockLow ??
    bounds.mitigationLow ??
    bounds.breakerLow ??
    bounds.rangeLow;
  const structureHigh =
    bounds.structureHigh ??
    bounds.orderBlockHigh ??
    bounds.mitigationHigh ??
    bounds.breakerHigh ??
    bounds.rangeHigh;
  return side === "long" ? structureLow : structureHigh;
};

const requiresStructureBounds = (entryModelType: IctEntryModelType) => entryModelType !== "generic" && entryModelType !== "liquidity_retest";

const authorityIsNone = (input?: IctTradeConstructionInput["authority"]) =>
  !input ||
  ((input.executionAuthority ?? "none") === "none" &&
    (input.brokerAuthority ?? "none") === "none" &&
    (input.readinessOverrideAuthority ?? "none") === "none");

const maxStopDistanceAsPrice = (risk: ReturnType<typeof defaultRiskModelFor>, symbolText: string) => {
  if (!finite(risk.maxStopDistance)) return undefined;
  const looksForex = /^[A-Z]{6}(\.PRO)?$/i.test(symbolText.replace(/\s+/g, "")) || /EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD/i.test(symbolText);
  if (looksForex && finite(risk.pointSize)) return risk.maxStopDistance * risk.pointSize;
  return risk.maxStopDistance;
};

const nextActionFor = (blockers: IctTradeConstructionBlocker[]) => {
  if (blockers.includes("entry_missing")) return "Define a compact entry reference before calculating RR.";
  if (blockers.includes("target_missing")) return "Define the draw-on-liquidity target before calling the target too close.";
  if (blockers.includes("invalidation_missing")) return "Define a structure-based stop or invalidation before calculating RR.";
  if (blockers.includes("structure_bounds_missing")) return "Attach compact FVG/OB/mitigation/breaker structure bounds before validating stop placement.";
  if (blockers.includes("stop_not_beyond_structure")) return "Move invalidation beyond the compact structure boundary.";
  if (blockers.includes("stop_too_wide")) return "Wait for a tighter structure stop; do not widen the candidate arbitrarily.";
  if (blockers.includes("rr_below_minimum") || blockers.includes("target_too_close")) return "Wait for a cleaner target or tighter invalidation so RR meets the model minimum.";
  if (blockers.includes("invalid_price_order")) return "Rebuild entry, target, and invalidation with the correct directional price order.";
  if (blockers.includes("source_missing")) return "Use an active canonical research source with a fingerprint before validation.";
  if (blockers.includes("authority_not_none")) return "Reject non-research authority; GoTrader keeps execution, broker, and readiness override authority as none.";
  return "Trade construction is complete; queue deterministic replay validation before any progression.";
};

export const resolveIctTradeRiskModel = (input: IctTradeConstructionInput) => defaultRiskModelFor(input);

export const validateIctTradeConstruction = (input: IctTradeConstructionInput): IctTradeConstructionResult => {
  const risk = defaultRiskModelFor(input);
  const blockers: IctTradeConstructionBlocker[] = [];
  const warnings: IctTradeConstructionWarning[] = [];
  const stop = input.stop ?? input.invalidation;
  const symbolText = `${input.symbol ?? ""} ${input.brokerSymbol ?? ""}`.trim();

  if (input.side !== "long" && input.side !== "short") blockers.push("invalid_price_order");
  if (!finite(input.entry)) blockers.push("entry_missing");
  if (!finite(input.target)) blockers.push("target_missing");
  if (!finite(stop)) blockers.push("invalidation_missing");
  if (!input.sourceFingerprint) blockers.push("source_missing");
  if (!authorityIsNone(input.authority)) blockers.push("authority_not_none");

  const boundary = stopBoundaryFor(input.side, input.entryModelType, input.structureBounds);
  if (requiresStructureBounds(input.entryModelType) && !finite(boundary)) blockers.push("structure_bounds_missing");

  if (finite(stop) && finite(boundary)) {
    if (input.side === "long" && stop >= boundary) blockers.push("stop_not_beyond_structure");
    if (input.side === "short" && stop <= boundary) blockers.push("stop_not_beyond_structure");
  }

  let riskDistance: number | undefined;
  let targetDistance: number | undefined;
  let rr: number | undefined;
  if (finite(input.entry) && finite(input.target) && finite(stop)) {
    riskDistance = input.side === "long" ? input.entry - stop : stop - input.entry;
    targetDistance = input.side === "long" ? input.target - input.entry : input.entry - input.target;
    if (riskDistance <= 0 || targetDistance <= 0) {
      blockers.push("invalid_price_order");
    } else {
      riskDistance = rounded(riskDistance);
      targetDistance = rounded(targetDistance);
      rr = rounded(targetDistance / riskDistance);
      const maxStopDistance = maxStopDistanceAsPrice(risk, symbolText);
      if (finite(maxStopDistance) && riskDistance > maxStopDistance) blockers.push("stop_too_wide");
      if (finite(maxStopDistance) && input.maxStopDistance === undefined) warnings.push("max_stop_distance_inferred_from_symbol");
      if (finite(risk.maxStopDistance) && !finite(input.pointSize) && /EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD/i.test(symbolText)) {
        warnings.push("point_size_missing_using_raw_price_distance");
      }
      if (rr < risk.minimumRR) {
        blockers.push("rr_below_minimum");
        blockers.push("target_too_close");
      }
      if (rr > risk.maximumRR) blockers.push("unrealistic_rr");
      if (rr < risk.preferredRR && rr >= risk.minimumRR) warnings.push("preferred_rr_not_reached");
    }
  } else {
    blockers.push("rr_unavailable");
  }

  if (input.entryModelType === "generic" && input.structureBounds) warnings.push("structure_bounds_not_required_for_generic");

  const compactBlockers = unique(blockers);
  return {
    valid: compactBlockers.length === 0,
    side: input.side,
    entryModelType: input.entryModelType,
    entry: input.entry,
    stop,
    target: input.target,
    rr,
    riskDistance,
    targetDistance,
    minimumRR: risk.minimumRR,
    preferredRR: risk.preferredRR,
    maximumRR: risk.maximumRR,
    maxStopDistance: risk.maxStopDistance,
    blockers: compactBlockers,
    warnings: unique(warnings),
    nextAction: nextActionFor(compactBlockers),
    sourceFingerprint: input.sourceFingerprint,
    authority,
    safety
  };
};

export const buildIctTradeConstruction = validateIctTradeConstruction;

export const summarizeIctTradeConstruction = (result: IctTradeConstructionResult) =>
  result.valid
    ? `${result.entryModelType} ${result.side} construction valid: ${result.rr?.toFixed(2) ?? "n/a"}R.`
    : `${result.entryModelType} ${result.side} construction blocked: ${result.blockers.join(", ")}.`;
