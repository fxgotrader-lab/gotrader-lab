import type { IctSide } from "./ictAdvisorTypes";

export type IctEntryModelType =
  | "fvg"
  | "ifvg"
  | "order_block"
  | "mitigation"
  | "breaker"
  | "liquidity_retest"
  | "generic";

export type IctTradeConstructionBlocker =
  | "entry_missing"
  | "target_missing"
  | "invalidation_missing"
  | "structure_bounds_missing"
  | "rr_unavailable"
  | "rr_below_minimum"
  | "target_too_close"
  | "stop_too_wide"
  | "stop_not_beyond_structure"
  | "invalid_price_order"
  | "unrealistic_rr"
  | "source_missing"
  | "authority_not_none";

export type IctTradeConstructionWarning =
  | "preferred_rr_not_reached"
  | "point_size_missing_using_raw_price_distance"
  | "structure_bounds_not_required_for_generic"
  | "max_stop_distance_inferred_from_symbol";

export interface IctRiskModel {
  minimumRR?: number;
  preferredRR?: number;
  maximumRR?: number;
  maxStopDistance?: number;
  pointValue?: number;
  pointSize?: number;
  strategyId?: string;
}

export interface IctTradeStructureBounds {
  fvgLow?: number;
  fvgHigh?: number;
  ifvgLow?: number;
  ifvgHigh?: number;
  orderBlockLow?: number;
  orderBlockHigh?: number;
  mitigationLow?: number;
  mitigationHigh?: number;
  breakerLow?: number;
  breakerHigh?: number;
  sweptLow?: number;
  sweptHigh?: number;
  structureLow?: number;
  structureHigh?: number;
  rangeLow?: number;
  rangeHigh?: number;
}

export interface IctTradeConstructionAuthorityInput {
  executionAuthority?: string;
  brokerAuthority?: string;
  readinessOverrideAuthority?: string;
}

export interface IctTradeConstructionInput extends IctRiskModel {
  side: IctSide;
  entry?: number;
  stop?: number;
  invalidation?: number;
  target?: number;
  entryModelType: IctEntryModelType;
  structureBounds?: IctTradeStructureBounds;
  symbol?: string;
  brokerSymbol?: string;
  timeframe?: string;
  sourceFingerprint?: string;
  authority?: IctTradeConstructionAuthorityInput;
}

export interface IctTradeConstructionResult {
  valid: boolean;
  side: IctSide;
  entryModelType: IctEntryModelType;
  entry?: number;
  stop?: number;
  target?: number;
  rr?: number;
  riskDistance?: number;
  targetDistance?: number;
  minimumRR: number;
  preferredRR: number;
  maximumRR: number;
  maxStopDistance?: number;
  blockers: IctTradeConstructionBlocker[];
  warnings: IctTradeConstructionWarning[];
  nextAction: string;
  sourceFingerprint?: string;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
}
