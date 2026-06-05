export type IctResearchReportSource =
  | "manual_replay_review"
  | "market_scorecard";

export type IctResearchReportStatus =
  | "saved"
  | "failed"
  | "unavailable";

export type IctResearchReportItemValue = string | number | boolean | null;

export interface IctResearchReport {
  reportId: string;
  title: string;
  source: IctResearchReportSource;
  generatedAt: string;
  savedAt: string;
  researchOnly: true;
  summary: {
    requestedSymbols: string[];
    brokerSymbols: string[];
    primaryTimeframe?: string;
    htfTimeframes?: string[];
    totalSignals?: number;
    approvedCount?: number;
    watchlistCount?: number;
    rejectedCount?: number;
    noTradeCount?: number;
    targetFirstRate?: number;
    approvedTargetFirstRate?: number;
    averageRr?: number;
    approvedAverageRr?: number;
    researchPreferredSymbols?: string[];
    watchlistOnlySymbols?: string[];
    noisySymbols?: string[];
    bestApprovedTargetFirstSymbol?: string;
    bestApprovedRrSymbol?: string;
  };
  sections: Array<{
    heading: string;
    items: Array<{
      label: string;
      value: IctResearchReportItemValue;
    }>;
  }>;
  notes: string[];
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
  provenance: {
    methodology: "ICT";
    sourceSet: "ICT Mentorship Core Content";
    researchOnly: true;
    generatedAt: string;
  };
}

export interface IctResearchReportSaveResult {
  status: IctResearchReportStatus;
  reportId?: string;
  path?: string;
  message: string;
  researchOnly: true;
}

export interface IctResearchReportJournalEvent {
  eventType: "ict_research_report_saved";
  journalEventId: string;
  reportId: string;
  source: IctResearchReportSource;
  title: string;
  generatedAt: string;
  savedAt: string;
  requestedSymbols: string[];
  brokerSymbols: string[];
  totalSignals?: number;
  approvedTargetFirstRate?: number;
  approvedAverageRr?: number;
  researchPreferredSymbols?: string[];
  watchlistOnlySymbols?: string[];
  noisySymbols?: string[];
  researchOnly: true;
  authority: IctResearchReport["authority"];
  safety: IctResearchReport["safety"];
}
