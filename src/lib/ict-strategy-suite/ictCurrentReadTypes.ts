import type { IctBias, IctLocation, IctSide } from "./ictAdvisorTypes";
import type { IctApprovedCandidateStatus } from "./ictApprovedSetupProfileTypes";

export type IctCurrentReadPacketSource =
  | "live_mt5"
  | "manual_replay"
  | "scorecard"
  | "default"
  | "unavailable";

export type IctCurrentReadDataStatus = "ready" | "missing" | "stale" | "unavailable";

export interface IctCurrentRead {
  researchOnly: true;
  packetSource: IctCurrentReadPacketSource;
  requestedSymbol: string;
  brokerSymbol: string;
  primaryTimeframe: string;
  htfTimeframes: string[];
  dataStatus: IctCurrentReadDataStatus;
  candleCount?: number;
  htfStatus?: Record<string, "ready" | "missing" | "unavailable">;
  bestPhase1Setup?: string;
  bestPhase2Setup?: string;
  bestSetup?: string;
  side: IctSide;
  approvedStatus: IctApprovedCandidateStatus;
  confidence?: number;
  rrEstimate?: number;
  target?: number;
  invalidation?: number;
  bias?: IctBias;
  smtStatus?: string;
  riskStatus?: string;
  dealingRangeLocation?: IctLocation;
  drawOnLiquidity?: string;
  liquiditySwept?: string;
  fvgStatus?: string;
  displacementStatus?: string;
  entryZone?: string;
  topReasons: string[];
  nextAction: string;
  debug: {
    candleCount: number;
    primaryTimeframeAvailable: boolean;
    htfTimeframesAvailable: string[];
    phase1SignalCount: number;
    phase2SignalCount: number;
    approvedStatus: IctApprovedCandidateStatus;
    rejectionReasonsCount: number;
    noTradeReasonsCount: number;
    lastEvaluationAt: string;
    packetSource: IctCurrentReadPacketSource;
    sourceFingerprint?: string;
    journalStatus?: string;
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
