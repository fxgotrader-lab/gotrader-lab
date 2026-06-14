export type IctReferenceLevelType =
  | "twelve_am_open"
  | "sunday_open"
  | "previous_day_high"
  | "previous_day_low"
  | "swing_high"
  | "swing_low"
  | "consolidation_high"
  | "consolidation_low"
  | "equilibrium"
  | "fair_value_gap";

export interface IctReferenceCandleLike {
  id?: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IctReferenceLevel {
  type: IctReferenceLevelType;
  label: string;
  price?: number;
  high?: number;
  low?: number;
  midpoint?: number;
  timestamp?: string;
  localTimestamp?: string;
  sourceTimeframe: string;
  sourceMethod: string;
  confidence: number;
}

export interface IctDealingRangeReference {
  high: number;
  low: number;
  equilibrium: number;
  currentLocation: "premium" | "discount" | "equilibrium";
  sourceTimeframe: string;
}

export interface IctReferenceAccuracyReport {
  generatedAt: string;
  timeZone: string;
  sourceTimeframe: string;
  candleCount: number;
  twelveAmOpen?: IctReferenceLevel;
  sundayOpen?: IctReferenceLevel;
  previousDayHigh?: IctReferenceLevel;
  previousDayLow?: IctReferenceLevel;
  latestSwingHigh?: IctReferenceLevel;
  latestSwingLow?: IctReferenceLevel;
  consolidationHigh?: IctReferenceLevel;
  consolidationLow?: IctReferenceLevel;
  dealingRange?: IctDealingRangeReference;
  pdArrayReferences: IctReferenceLevel[];
  warnings: string[];
  safety: {
    rawCandlesExcluded: true;
    rawSnapshotsExcluded: true;
    accountDataExcluded: true;
    orderDataExcluded: true;
    positionDataExcluded: true;
    secretsExcluded: true;
  };
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}
