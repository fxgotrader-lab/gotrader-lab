export type IctCmdIndependentDateGateStatus =
  | "passed"
  | "overfit_risk"
  | "needs_more_independent_dates"
  | "insufficient_sample"
  | "oos_degraded"
  | "source_blocked"
  | "not_cmd";

export type IctCmdRobustnessClassification =
  | "robust"
  | "promising_but_small_sample"
  | "unstable"
  | "overfit_risk"
  | "insufficient_data"
  | "unknown";

export interface IctCmdIndependentDateGateOptions {
  minUniqueTradingDates: number;
  minActiveRollingWindows: number;
  minCandidateCount: number;
  minTargetFirstRate: number;
  maxInvalidationFirstRate: number;
  minAverageRr: number;
}

export interface IctCmdIndependentDateEvidence {
  modelName?: string;
  side?: string;
  sourceProvider?: string;
  sourceFingerprint?: string;
  timeframe?: string;
  isMockOrSample?: boolean;
  candidateCount?: number;
  uniqueTradingDates?: number;
  activeRollingWindows?: number;
  targetFirstRate?: number;
  invalidationFirstRate?: number;
  averageRr?: number;
  robustnessClassification?: IctCmdRobustnessClassification | string;
  oosVerdict?: string;
  tradingDates?: string[];
}

export interface IctCmdPaperWatchlistNarrowProfile {
  profileId: "cmd_strict_paper_watchlist_independent_date_v1";
  researchOnly: true;
  modelName: "consolidation_manipulation_distribution";
  side: "short";
  requiredConditions: string[];
  minimumRr: number;
  sourceProvider: string;
  sourceFingerprint: string;
  timeframe: string;
  mockSourceAllowed: false;
  promotionRequiresIndependentDates: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}

export interface IctCmdIndependentDateGateResult {
  gateId: "cmd_independent_date_gate_v1";
  researchOnly: true;
  status: IctCmdIndependentDateGateStatus;
  passed: boolean;
  paperDemoEligible: boolean;
  blockerReason?: string;
  nextAction: string;
  evidenceSummary: string;
  options: IctCmdIndependentDateGateOptions;
  metrics: {
    candidateCount: number;
    uniqueTradingDates: number;
    activeRollingWindows: number;
    targetFirstRate?: number;
    invalidationFirstRate?: number;
    averageRr?: number;
    robustnessClassification: IctCmdRobustnessClassification | string;
    oosVerdict?: string;
  };
  source: {
    provider: string;
    sourceFingerprint: string;
    timeframe: string;
    mockOrSample: boolean;
  };
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
