import type { IctCurrentRead } from "./ictCurrentReadTypes";
import type { IctResearchSignal } from "./ictSignalContractTypes";

export type IctActivateMarketStepId =
  | "resolve_symbol"
  | "check_mt5_readonly"
  | "fetch_primary_candles"
  | "fetch_htf_context"
  | "normalize_candles"
  | "build_current_read"
  | "detect_session_model"
  | "run_phase_one"
  | "run_phase_two"
  | "run_smt"
  | "run_news_session_risk"
  | "apply_approved_profile"
  | "build_signal_contract"
  | "build_operator_workflow"
  | "check_cmd_paper_eligibility"
  | "save_latest_state"
  | "complete";

export type IctActivateMarketStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export type IctActivateMarketStatus =
  | "idle"
  | "running"
  | "completed"
  | "partial"
  | "unavailable"
  | "failed";

export interface IctActivateMarketStep {
  id: IctActivateMarketStepId;
  label: string;
  status: IctActivateMarketStepStatus;
  message?: string;
  warning?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface IctActivateMarketOperatorWorkflow {
  recommendedAction: string;
  reason: string;
  heavyActionDeferred: true;
  autoStarted: false;
  executionAllowed: false;
}

export interface IctActivateMarketLatestSummary {
  activationTimestamp: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  modelName?: string;
  modelLane?: string;
  nextAction?: string;
  executionAllowed: false;
  researchOnly: true;
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

export interface IctActivateMarketResult {
  researchOnly: true;
  status: IctActivateMarketStatus;
  generatedAt: string;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  steps: IctActivateMarketStep[];

  currentRead?: IctCurrentRead;
  signalContract?: IctResearchSignal;
  operatorWorkflow?: IctActivateMarketOperatorWorkflow;

  cmdPaperEligibility?: {
    eligible: boolean;
    reason: string;
  };

  summary: {
    dataStatus: string;
    modelDetected: boolean;
    modelName?: string;
    modelState?: string;
    modelLane?: string;
    nextAction?: string;
    executionAllowed: false;
  };

  warnings: string[];
  errors: string[];

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

export interface IctActivateMarketCallbacks {
  onStepUpdate?: (step: IctActivateMarketStep, allSteps: IctActivateMarketStep[]) => void;
}
