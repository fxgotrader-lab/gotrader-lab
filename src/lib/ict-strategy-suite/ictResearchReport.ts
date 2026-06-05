import type { IctManualReplayReviewResult } from "./ictManualReplayReviewTypes";
import type { IctMarketScorecard } from "./ictMarketScorecardTypes";
import type {
  IctResearchReport,
  IctResearchReportJournalEvent,
  IctResearchReportSaveResult,
  IctResearchReportSource
} from "./ictResearchReportTypes";

const ICT_RESEARCH_REPORT_STORAGE_KEY = "gotrader.ict-research-reports.v1";
const ICT_RESEARCH_REPORT_JOURNAL_STORAGE_KEY = "gotrader.ict-research-report-saved.journal.v1";
const MAX_ICT_RESEARCH_REPORTS = 50;
const MAX_ICT_RESEARCH_REPORT_JOURNAL_EVENTS = 100;

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

const createId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const rr = (value?: number) => (typeof value === "number" ? `${value.toFixed(2)}R` : "n/a");
const valueOrNull = <T extends string | number | boolean | undefined>(value: T): Exclude<T, undefined> | null =>
  value === undefined ? null : (value as Exclude<T, undefined>);
const compactList = (values: string[], fallback = "none") => (values.length ? values.join(", ") : fallback);
const generatedNow = () => new Date().toISOString();

const provenance = (generatedAt: string) => ({
  methodology: "ICT" as const,
  sourceSet: "ICT Mentorship Core Content" as const,
  researchOnly: true as const,
  generatedAt
});

export const buildManualReplayResearchReport = (result: IctManualReplayReviewResult): IctResearchReport =>
  sanitizeResearchReport({
    reportId: createId("ict_replay_report"),
    title: `Manual ICT Replay Review - ${result.requestedSymbol} ${result.primaryTimeframe}`,
    source: "manual_replay_review",
    generatedAt: result.generatedAt,
    savedAt: generatedNow(),
    researchOnly: true,
    summary: {
      requestedSymbols: [result.requestedSymbol],
      brokerSymbols: [result.brokerSymbol],
      primaryTimeframe: result.primaryTimeframe,
      htfTimeframes: result.htfTimeframes,
      totalSignals: result.totalSignals,
      approvedCount: result.approvedProfileCounts.totalApproved,
      watchlistCount: result.approvedProfileCounts.totalWatchlist,
      rejectedCount: result.approvedProfileCounts.totalRejected,
      noTradeCount: result.approvedProfileCounts.totalNoTrade,
      targetFirstRate: result.targetFirstRate,
      approvedTargetFirstRate: result.approvedTargetFirstRate,
      averageRr: result.averageRrAchieved,
      approvedAverageRr: result.approvedAverageRr
    },
    sections: [
      {
        heading: "Replay Scope",
        items: [
          { label: "Status", value: result.status },
          { label: "Requested Symbol", value: result.requestedSymbol },
          { label: "Broker Symbol", value: result.brokerSymbol },
          { label: "Primary Timeframe", value: result.primaryTimeframe },
          { label: "HTF Timeframes", value: result.htfTimeframes.join(", ") },
          { label: "Total Windows", value: result.totalWindows },
          { label: "Total Signals", value: result.totalSignals },
          { label: "Total No-Trades", value: result.totalNoTrades }
        ]
      },
      {
        heading: "Approved Profile Performance",
        items: [
          { label: "Approved", value: result.approvedProfileCounts.totalApproved },
          { label: "Watchlist", value: result.approvedProfileCounts.totalWatchlist },
          { label: "Rejected", value: result.approvedProfileCounts.totalRejected },
          { label: "No-Trade", value: result.approvedProfileCounts.totalNoTrade },
          { label: "Target-First Rate", value: pct(result.targetFirstRate) },
          { label: "Approved Target-First Rate", value: pct(result.approvedTargetFirstRate) },
          { label: "Average RR", value: rr(result.averageRrAchieved) },
          { label: "Approved Average RR", value: rr(result.approvedAverageRr) },
          { label: "Best Setup", value: result.bestSetup?.key ?? null },
          { label: "Worst Setup", value: result.worstSetup?.key ?? null }
        ]
      },
      {
        heading: "Main Reasons",
        items: [
          { label: "No-Trade Reasons", value: result.mostCommonNoTradeReasons.map((item) => `${item.reason} (${item.count})`).join("; ") || "none" },
          {
            label: "Top Rejection Reasons",
            value: result.approvedProfileComparison
              .flatMap((profile) => profile.topRejectionReasons.map((item) => `${profile.label}: ${item.reason} (${item.count})`))
              .slice(0, 6)
              .join("; ") || "none"
          },
          { label: "SMT Confirmation", value: result.smtSummary.confirmation.map((item) => `${item.key} (${item.totalSignals})`).join("; ") || "none" },
          { label: "SMT Rejection", value: result.smtSummary.rejection.map((item) => `${item.key} (${item.totalSignals})`).join("; ") || "none" },
          { label: "News/Session Risk", value: result.newsSessionRiskSummary.riskGovernorActions.map((item) => `${item.key} (${item.total})`).join("; ") || "none" }
        ]
      },
      {
        heading: "Safety",
        items: [
          { label: "Research Only", value: true },
          { label: "Authority", value: "none/none/none" },
          { label: "Raw Candles Saved", value: false },
          { label: "Raw Snapshots Saved", value: false },
          { label: "Account/Order/Position Data Saved", value: false }
        ]
      }
    ],
    notes: [
      result.unavailableReason ? `Replay unavailable reason: ${result.unavailableReason}` : "",
      ...result.warnings.slice(0, 5),
      "Report is compact and research-only. No raw candles, snapshots, secrets, account, order, or position data are saved."
    ].filter(Boolean),
    authority,
    safety,
    provenance: provenance(result.generatedAt)
  });

export const buildMarketScorecardResearchReport = (scorecard: IctMarketScorecard): IctResearchReport =>
  sanitizeResearchReport({
    reportId: createId("ict_scorecard_report"),
    title: `ICT Market Scorecard - ${scorecard.config.primaryTimeframe}`,
    source: "market_scorecard",
    generatedAt: scorecard.generatedAt,
    savedAt: generatedNow(),
    researchOnly: true,
    summary: {
      requestedSymbols: scorecard.config.requestedSymbols,
      brokerSymbols: scorecard.symbols.map((symbol) => symbol.brokerSymbol),
      primaryTimeframe: scorecard.config.primaryTimeframe,
      htfTimeframes: scorecard.config.htfTimeframes,
      totalSignals: scorecard.symbols.reduce((total, symbol) => total + symbol.totalSignals, 0),
      approvedCount: scorecard.symbols.reduce((total, symbol) => total + symbol.approvedCount, 0),
      watchlistCount: scorecard.symbols.reduce((total, symbol) => total + symbol.watchlistCount, 0),
      rejectedCount: scorecard.symbols.reduce((total, symbol) => total + symbol.rejectedCount, 0),
      noTradeCount: scorecard.symbols.reduce((total, symbol) => total + symbol.noTradeCount, 0),
      researchPreferredSymbols: scorecard.summary.researchPreferredSymbols,
      watchlistOnlySymbols: scorecard.summary.watchlistOnlySymbols,
      noisySymbols: scorecard.summary.noisySymbols,
      bestApprovedTargetFirstSymbol: scorecard.summary.bestApprovedTargetFirstSymbol,
      bestApprovedRrSymbol: scorecard.summary.bestApprovedRrSymbol
    },
    sections: [
      {
        heading: "Scorecard Summary",
        items: [
          { label: "Completed Symbols", value: scorecard.summary.completedSymbols },
          { label: "Unavailable Symbols", value: scorecard.summary.unavailableSymbols },
          { label: "Research-Preferred", value: compactList(scorecard.summary.researchPreferredSymbols) },
          { label: "Watchlist-Only", value: compactList(scorecard.summary.watchlistOnlySymbols) },
          { label: "Noisy", value: compactList(scorecard.summary.noisySymbols) },
          { label: "Best Approved Target-First", value: valueOrNull(scorecard.summary.bestApprovedTargetFirstSymbol) },
          { label: "Best Approved RR", value: valueOrNull(scorecard.summary.bestApprovedRrSymbol) },
          { label: "Cleanest Symbol", value: valueOrNull(scorecard.summary.cleanestSymbol) }
        ]
      },
      {
        heading: "Per-Market Compact Results",
        items: scorecard.symbols.flatMap((symbol) => [
          {
            label: `${symbol.requestedSymbol} Status`,
            value: `${symbol.status}: ${symbol.statusReason}`
          },
          {
            label: `${symbol.requestedSymbol} Approved Metrics`,
            value: `${symbol.approvedCount} approved / ${pct(symbol.approvedTargetFirstRate)} target-first / ${rr(symbol.approvedAverageRr)}`
          },
          {
            label: `${symbol.requestedSymbol} Risk/SMT`,
            value: `SMT ${pct(symbol.smtConfirmRate)} confirms, ${pct(symbol.smtRejectRate)} rejects; ${symbol.newsBlockedCount ?? 0} blocked, ${symbol.newsCautionCount ?? 0} caution`
          }
        ])
      },
      {
        heading: "Main Reasons",
        items: scorecard.symbols.map((symbol) => ({
          label: `${symbol.requestedSymbol} No-Trade / Setup`,
          value: [
            symbol.topSetup ? `top ${symbol.topSetup}` : "top n/a",
            symbol.worstSetup ? `worst ${symbol.worstSetup}` : "worst n/a",
            symbol.mostCommonNoTradeReasons[0] ? `${symbol.mostCommonNoTradeReasons[0].reason} (${symbol.mostCommonNoTradeReasons[0].count})` : "no no-trade reason"
          ].join("; ")
        }))
      },
      {
        heading: "Safety",
        items: [
          { label: "Research Only", value: true },
          { label: "Authority", value: "none/none/none" },
          { label: "Raw Candles Saved", value: false },
          { label: "Raw Snapshots Saved", value: false },
          { label: "Account/Order/Position Data Saved", value: false }
        ]
      }
    ],
    notes: [
      "Market classifications are research labels only, not trading recommendations.",
      "Report is compact and research-only. No raw candles, snapshots, secrets, account, order, or position data are saved."
    ],
    authority,
    safety,
    provenance: provenance(scorecard.generatedAt)
  });

export const sanitizeResearchReport = (report: IctResearchReport): IctResearchReport => {
  const sanitized = JSON.parse(JSON.stringify(report)) as IctResearchReport;
  sanitized.researchOnly = true;
  sanitized.authority = authority;
  sanitized.safety = safety;
  sanitized.provenance = {
    ...sanitized.provenance,
    methodology: "ICT",
    sourceSet: "ICT Mentorship Core Content",
    researchOnly: true
  };
  sanitized.sections = sanitized.sections.map((section) => ({
    heading: section.heading,
    items: section.items.slice(0, 50).map((item) => ({
      label: String(item.label),
      value: typeof item.value === "number" ? round(item.value, 4) : item.value
    }))
  }));
  sanitized.notes = sanitized.notes.map(String).slice(0, 20);
  return sanitized;
};

export const buildIctResearchReportSavedJournalEvent = (report: IctResearchReport): IctResearchReportJournalEvent => ({
  eventType: "ict_research_report_saved",
  journalEventId: createId("ict_research_report_saved_journal"),
  reportId: report.reportId,
  source: report.source,
  title: report.title,
  generatedAt: report.generatedAt,
  savedAt: report.savedAt,
  requestedSymbols: report.summary.requestedSymbols,
  brokerSymbols: report.summary.brokerSymbols,
  totalSignals: report.summary.totalSignals,
  approvedTargetFirstRate: report.summary.approvedTargetFirstRate,
  approvedAverageRr: report.summary.approvedAverageRr,
  researchPreferredSymbols: report.summary.researchPreferredSymbols,
  watchlistOnlySymbols: report.summary.watchlistOnlySymbols,
  noisySymbols: report.summary.noisySymbols,
  researchOnly: true,
  authority,
  safety
});

export const appendIctResearchReportSavedJournalEvent = (event: IctResearchReportJournalEvent) => {
  const sanitized = { ...event, researchOnly: true as const, authority, safety };
  if (!isBrowser()) {
    return { ok: true, storage: "memory_unavailable" as const, event: sanitized };
  }
  const current = readIctResearchReportSavedJournalEvents();
  const next = [...current, sanitized].slice(-MAX_ICT_RESEARCH_REPORT_JOURNAL_EVENTS);
  window.localStorage.setItem(ICT_RESEARCH_REPORT_JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return { ok: true, storage: "localStorage" as const, event: sanitized, totalEvents: next.length };
};

export const readIctResearchReportSavedJournalEvents = (): IctResearchReportJournalEvent[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_RESEARCH_REPORT_JOURNAL_STORAGE_KEY) ?? "[]") as IctResearchReportJournalEvent[];
    return Array.isArray(parsed)
      ? parsed.filter((event) => event.eventType === "ict_research_report_saved" && event.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const listIctResearchReports = (): IctResearchReport[] => {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ICT_RESEARCH_REPORT_STORAGE_KEY) ?? "[]") as IctResearchReport[];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeResearchReport).filter((report) => report.researchOnly === true)
      : [];
  } catch {
    return [];
  }
};

export const readIctResearchReport = (reportId: string): IctResearchReport | undefined =>
  listIctResearchReports().find((report) => report.reportId === reportId);

export const saveIctResearchReport = (reportInput: IctResearchReport): IctResearchReportSaveResult => {
  const report = sanitizeResearchReport(reportInput);
  if (!assertIctResearchReportOutputIsCompact({ report }).ok) {
    return {
      status: "failed",
      reportId: report.reportId,
      message: "Research report failed compact safety checks and was not saved.",
      researchOnly: true
    };
  }
  if (!isBrowser()) {
    return {
      status: "unavailable",
      reportId: report.reportId,
      path: ".gotrader/reports/",
      message: "Browser local report storage is unavailable in this runtime; report was not persisted.",
      researchOnly: true
    };
  }
  try {
    const current = listIctResearchReports().filter((existing) => existing.reportId !== report.reportId);
    const next = [report, ...current].slice(0, MAX_ICT_RESEARCH_REPORTS);
    window.localStorage.setItem(ICT_RESEARCH_REPORT_STORAGE_KEY, JSON.stringify(next));
    appendIctResearchReportSavedJournalEvent(buildIctResearchReportSavedJournalEvent(report));
    window.dispatchEvent(new CustomEvent("gotrader:ict-research-report-saved", { detail: { reportId: report.reportId } }));
    return {
      status: "saved",
      reportId: report.reportId,
      path: `localStorage:${ICT_RESEARCH_REPORT_STORAGE_KEY}`,
      message: "Saved compact ICT research report locally. No raw candles, snapshots, secrets, account, order, or position data were saved.",
      researchOnly: true
    };
  } catch (error) {
    return {
      status: "failed",
      reportId: report.reportId,
      message: error instanceof Error ? error.message : String(error),
      researchOnly: true
    };
  }
};

export const assertIctResearchReportOutputIsCompact = (output: {
  journalEvent?: IctResearchReportJournalEvent;
  report?: IctResearchReport;
}) => {
  const withoutSafety = {
    journalEvent: output.journalEvent ? { ...output.journalEvent, safety: undefined } : undefined,
    report: output.report ? { ...output.report, safety: undefined } : undefined
  };
  const serialized = JSON.stringify(withoutSafety);
  return {
    ok:
      (output.report?.researchOnly ?? true) === true &&
      (output.journalEvent?.researchOnly ?? true) === true &&
      (output.report?.authority.executionAuthority ?? "none") === "none" &&
      (output.report?.authority.brokerAuthority ?? "none") === "none" &&
      (output.report?.authority.readinessOverrideAuthority ?? "none") === "none" &&
      !/"candles"\s*:/i.test(serialized) &&
      !/"windows"\s*:/i.test(serialized) &&
      !/"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data)?"\s*:|"position(Data|s)?"\s*:|"order(Data|s)?"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:/i.test(serialized),
    serializedBytes: new Blob([serialized]).size
  };
};

export const summarizeIctResearchReport = (report: IctResearchReport) => {
  if (report.source === "market_scorecard") {
    return [
      compactList(report.summary.researchPreferredSymbols ?? [], "no research-preferred markets"),
      compactList(report.summary.watchlistOnlySymbols ?? [], "no watchlist markets")
    ].join(" / ");
  }
  return [
    report.summary.requestedSymbols[0] ?? "n/a",
    report.summary.primaryTimeframe ?? "n/a",
    `${report.summary.totalSignals ?? 0} signals`,
    `${pct(report.summary.approvedTargetFirstRate)} approved target-first`,
    `${rr(report.summary.approvedAverageRr)} approved RR`
  ].join(" / ");
};

export const researchReportSourceLabel = (source: IctResearchReportSource) =>
  source === "market_scorecard" ? "Market Scorecard" : "Manual Replay Review";
