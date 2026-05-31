import { scoreEvidenceQuality } from "@/lib/evidence/evidenceQualityScore";
import type {
  EvidenceCategory,
  EvidenceLedgerEntry,
  EvidenceLedgerInput,
  EvidenceLedgerSummary,
  EvidenceSourceClass,
  EvidenceSourceCounts
} from "@/lib/evidence/evidenceTypes";
import { uid } from "@/lib/utils";

const now = () => new Date().toISOString();
const ratio = (value: number, max: number) => Math.max(0, Math.min(1, max > 0 ? value / max : 0));

const emptyCounts = (): EvidenceSourceCounts => ({
  real_imported: 0,
  derived_from_real: 0,
  manual: 0,
  mock: 0,
  planned: 0,
  unavailable: 0
});

const entry = ({
  category,
  label,
  sourceType,
  completeness,
  freshness,
  reliability,
  coverage,
  timestamp,
  notes,
  limitations
}: Omit<EvidenceLedgerEntry, "entryId" | "qualityScore">): EvidenceLedgerEntry => ({
  entryId: uid("evidence"),
  category,
  label,
  sourceType,
  completeness,
  freshness,
  reliability,
  coverage,
  qualityScore: scoreEvidenceQuality({ sourceType, completeness, freshness, reliability, coverage }),
  timestamp,
  notes,
  limitations
});

const derivedSource = (input: EvidenceLedgerInput): EvidenceSourceClass =>
  input.dataMode === "imported" ? "derived_from_real" : input.dataMode === "mock" ? "mock" : "planned";

const resultSource = (input: EvidenceLedgerInput, exists: boolean): EvidenceSourceClass => {
  if (!exists) {
    return "unavailable";
  }
  return input.dataMode === "imported" ? "derived_from_real" : "mock";
};

const plannedOrUnavailable = (label: string, available = false): EvidenceSourceClass =>
  available ? "manual" : label === "order flow" ? "unavailable" : "planned";

export function buildEvidenceLedger(input: EvidenceLedgerInput): EvidenceLedgerSummary {
  const generatedAt = now();
  const imported = input.dataMode === "imported";
  const ohlcvCoverage = imported
    ? Math.min(1, input.processedCandleCount / 400)
    : input.dataMode === "mock"
      ? Math.min(0.4, input.processedCandleCount / 500)
      : 0.1;
  const ohlcvSource: EvidenceSourceClass = imported ? "real_imported" : input.dataMode === "mock" ? "mock" : "unavailable";
  const derived = derivedSource(input);
  const resultCoverage = ratio(input.processedCandleCount, imported ? 400 : 250);

  const entries: EvidenceLedgerEntry[] = [
    entry({
      category: "OHLCV candles",
      label: input.sourceLabel,
      sourceType: ohlcvSource,
      completeness: imported ? 0.9 : input.dataMode === "mock" ? 0.45 : 0.05,
      freshness: imported ? 0.72 : input.dataMode === "mock" ? 0.35 : 0.05,
      reliability: imported ? 0.9 : input.dataMode === "mock" ? 0.35 : 0.05,
      coverage: ohlcvCoverage,
      timestamp: input.latestCycleTimestamp ?? generatedAt,
      notes: imported
        ? `${input.rawCandleCount.toLocaleString()} raw candles available; ${input.processedCandleCount.toLocaleString()} processed candles used.`
        : "Bundled mock candles support UI and deterministic flow testing only.",
      limitations: imported
        ? ["Historical import only; no live feed, DOM, or broker stream."]
        : ["Mock candles cannot confirm live market behavior."]
    }),
    entry({
      category: "ICT structure",
      label: "Derived ICT facts",
      sourceType: derived,
      completeness: imported ? 0.82 : 0.42,
      freshness: imported ? 0.7 : 0.35,
      reliability: imported ? 0.78 : 0.36,
      coverage: resultCoverage,
      timestamp: input.latestCycleTimestamp,
      notes: imported ? "ICT structure is derived from imported OHLCV." : "ICT facts are derived from mock candles.",
      limitations: ["Derived facts inherit the limits of the active candle window."]
    }),
    entry({
      category: "session levels",
      label: "Session and range levels",
      sourceType: derived,
      completeness: imported ? 0.72 : 0.36,
      freshness: imported ? 0.68 : 0.32,
      reliability: imported ? 0.74 : 0.34,
      coverage: resultCoverage,
      timestamp: input.latestCycleTimestamp,
      notes: "Prior/session ranges are computed from available candle history.",
      limitations: ["Opening range and Globex levels are approximated until dedicated session-level imports exist."]
    }),
    entry({
      category: "VWAP / volume profile",
      label: "Auction and profile context",
      sourceType: imported ? "derived_from_real" : "mock",
      completeness: imported ? 0.58 : 0.28,
      freshness: imported ? 0.62 : 0.28,
      reliability: imported ? 0.62 : 0.3,
      coverage: resultCoverage,
      timestamp: input.latestCycleTimestamp,
      notes: "VWAP/profile context is calculated locally from available candles.",
      limitations: ["No dedicated volume-profile provider yet; profile quality depends on candle volume fidelity."]
    }),
    entry({
      category: "macro calendar",
      label: "Scheduled macro events",
      sourceType: plannedOrUnavailable("macro calendar"),
      completeness: 0.1,
      freshness: 0.1,
      reliability: 0.12,
      coverage: 0.08,
      notes: "Macro calendar adapter is planned.",
      limitations: ["FOMC/CPI/NFP/PPI/retail sales are not confirmed by a real provider yet."]
    }),
    entry({
      category: "VIX / DXY / yields",
      label: "Macro market series",
      sourceType: "planned",
      completeness: 0.08,
      freshness: 0.08,
      reliability: 0.1,
      coverage: 0.08,
      notes: "VIX, DXY, and yield adapters are roadmap items.",
      limitations: ["No real VIX/DXY/2-year/10-year confirmation currently feeds readiness."]
    }),
    entry({
      category: "intermarket context",
      label: input.smtState ? `SMT / intermarket divergence (${input.smtState})` : "ES/NQ, YM/ES, bonds, crude, gold",
      sourceType:
        input.smtState === "unavailable"
          ? "unavailable"
          : input.smtState && input.smtState !== "none"
            ? derived
            : "planned",
      completeness: input.smtState === "unavailable" ? 0.04 : input.smtState && input.smtState !== "none" ? 0.42 : 0.08,
      freshness: input.smtState === "unavailable" ? 0.04 : input.smtState && input.smtState !== "none" ? 0.38 : 0.08,
      reliability: input.smtState === "unavailable" ? 0.04 : input.smtState && input.smtState !== "none" ? 0.44 : 0.1,
      coverage: input.smtState === "unavailable" ? 0.04 : input.smtState && input.smtState !== "none" ? resultCoverage : 0.08,
      notes:
        input.smtState === "unavailable"
          ? "SMT is unavailable because correlated NQ/ES/YM candle evidence is missing."
          : input.smtState && input.smtState !== "none"
            ? "SMT is derived from correlated candle windows and must be treated as confirmation only."
            : "Intermarket adapter interfaces exist, but no real provider is active.",
      limitations:
        input.smtState === "unavailable"
          ? ["SMT unavailable - correlated instruments missing.", "Unavailable SMT must not be treated as confirmation."]
          : ["Intermarket confirmation is a confidence filter only and cannot create standalone bias or execution authority."]
    }),
    entry({
      category: "COT / positioning",
      label: "Positioning context",
      sourceType: "planned",
      completeness: 0.08,
      freshness: 0.05,
      reliability: 0.1,
      coverage: 0.06,
      notes: "COT/manual positioning import is planned.",
      limitations: ["No current positioning evidence should be treated as confirmation."]
    }),
    entry({
      category: "gamma levels",
      label: "Dealer gamma context",
      sourceType: "planned",
      completeness: 0.06,
      freshness: 0.05,
      reliability: 0.08,
      coverage: 0.05,
      notes: "Gamma levels require manual import or a future paid provider.",
      limitations: ["No dealer gamma flip evidence is available."]
    }),
    entry({
      category: "order flow",
      label: "DOM, footprint, delta",
      sourceType: "unavailable",
      completeness: 0.02,
      freshness: 0.02,
      reliability: 0.04,
      coverage: 0.02,
      notes: "Order flow is later/advanced only.",
      limitations: ["No DOM, footprint, cumulative delta, or large-print feed is active."]
    }),
    entry({
      category: "LLM advisory review",
      label: input.latestLLMRunId ? `LLM run ${input.latestLLMRunId}` : "No valid LLM advisory run",
      sourceType: input.llmAdvisoryPassed ? resultSource(input, true) : "unavailable",
      completeness: input.llmAdvisoryPassed ? 0.86 : 0.05,
      freshness: input.llmAdvisoryPassed ? 0.82 : 0.05,
      reliability: input.llmAdvisoryPassed ? 0.76 : 0.05,
      coverage: input.llmAdvisoryPassed ? 0.8 : 0.05,
      timestamp: input.latestCycleTimestamp,
      notes: input.llmAdvisoryPassed ? "Required LLM advisory reviewers passed validation." : "LLM advisory review is missing or did not pass.",
      limitations: ["LLM review remains advisory-only and cannot approve readiness."]
    }),
    entry({
      category: "agent debate",
      label: input.debateSessionId ? `Debate ${input.debateSessionId}` : "No debate session",
      sourceType: input.debateSessionId ? derived : "unavailable",
      completeness: input.debateSessionId ? 0.72 : 0.05,
      freshness: input.debateSessionId ? 0.68 : 0.05,
      reliability: input.debateSessionId ? 0.68 : 0.05,
      coverage: input.debateSessionId ? 0.66 : 0.05,
      timestamp: input.latestCycleTimestamp,
      notes: "Debate interprets immutable deterministic facts.",
      limitations: ["Debate quality depends on the underlying evidence quality."]
    }),
    entry({
      category: "backtest results",
      label: input.latestCycleId ? `Backtest in cycle ${input.latestCycleId}` : "No backtest cycle",
      sourceType: resultSource(input, Boolean(input.latestCycleId)),
      completeness: input.latestCycleId ? 0.76 : 0.05,
      freshness: input.latestCycleId ? 0.72 : 0.05,
      reliability: input.latestCycleId ? 0.7 : 0.05,
      coverage: input.latestCycleId ? resultCoverage : 0.05,
      timestamp: input.latestCycleTimestamp,
      notes: input.latestCycleId ? "Backtest metrics are available for the latest research cycle." : "Run AI Research Cycle to create backtest evidence.",
      limitations: ["Backtests are simulation-only and must not be treated as execution permission."]
    }),
    entry({
      category: "validation results",
      label: input.validationId ? `Validation ${input.validationId}` : "No validation report",
      sourceType: resultSource(input, Boolean(input.validationId)),
      completeness: input.validationId ? 0.78 : 0.05,
      freshness: input.validationId ? 0.74 : 0.05,
      reliability: input.validationId ? 0.72 : 0.05,
      coverage: input.validationId ? resultCoverage : 0.05,
      timestamp: input.latestCycleTimestamp,
      notes: input.validationId ? "Validation scenarios are available." : "Validation has not been run against current evidence.",
      limitations: ["Validation inherits the active data source and candle-window limitations."]
    }),
    entry({
      category: "readiness inputs",
      label: input.readinessState ? `Readiness ${input.readinessState}` : "No readiness snapshot",
      sourceType: resultSource(input, Boolean(input.readinessState)),
      completeness: input.readinessState ? 0.78 : 0.05,
      freshness: input.readinessState ? 0.72 : 0.05,
      reliability: input.readinessState ? 0.7 : 0.05,
      coverage: input.readinessState ? 0.72 : 0.05,
      timestamp: input.latestCycleTimestamp,
      notes: input.readinessState ? "Readiness gate inputs are available." : "Readiness inputs are incomplete.",
      limitations: ["Evidence quality can warn or block confidence, but cannot approve readiness by itself."]
    })
  ];

  const sourceCounts = entries.reduce((counts, item) => {
    counts[item.sourceType] += 1;
    return counts;
  }, emptyCounts());
  const overallScore = Math.round(entries.reduce((sum, item) => sum + item.qualityScore, 0) / Math.max(1, entries.length));
  const realEvidenceCount = sourceCounts.real_imported + sourceCounts.derived_from_real + sourceCounts.manual;
  const realEvidenceCoverage = Math.round((realEvidenceCount / Math.max(1, entries.length)) * 100);
  const weakEntries = entries
    .filter((item) => item.qualityScore < 45 || item.sourceType === "planned" || item.sourceType === "unavailable")
    .sort((a, b) => a.qualityScore - b.qualityScore);
  const strongestRealEvidence = entries
    .filter((item) => item.sourceType === "real_imported" || item.sourceType === "derived_from_real")
    .sort((a, b) => b.qualityScore - a.qualityScore)[0];
  const weakestEvidenceArea = weakEntries[0] ?? entries.sort((a, b) => a.qualityScore - b.qualityScore)[0];
  const mockPlannedUnavailableCount = sourceCounts.mock + sourceCounts.planned + sourceCounts.unavailable;
  const readinessEvidenceWarnings = [
    overallScore < 60 ? "Evidence quality insufficient for Paper-Demo Candidate." : undefined,
    mockPlannedUnavailableCount > entries.length / 2
      ? "Too many evidence inputs are mock, planned, or unavailable for high-confidence readiness."
      : undefined,
    !imported ? "Active OHLCV is mock; imported historical data is recommended before readiness progression." : undefined,
    sourceCounts.unavailable > 0 ? "Unavailable evidence areas reduce confidence and should be shown to LLM reviewers." : undefined
  ].filter((warning): warning is string => Boolean(warning));

  return {
    generatedAt,
    overallScore,
    realEvidenceCoverage,
    sourceCounts,
    mockPlannedUnavailableCount,
    strongestRealEvidence,
    weakestEvidenceArea,
    weakestEvidenceCategories: weakEntries.slice(0, 5).map((item) => item.category),
    readinessEvidenceWarnings,
    llmContextImpact:
      readinessEvidenceWarnings.length > 0
        ? "LLM context must treat planned/unavailable market context as missing evidence, not confirmation."
        : "LLM context can use the current evidence ledger as supporting research context.",
    nextDataImprovement:
      weakestEvidenceArea?.sourceType === "unavailable"
        ? `Add or import ${weakestEvidenceArea.category.toLowerCase()} evidence when available.`
        : weakestEvidenceArea
          ? `Improve ${weakestEvidenceArea.category.toLowerCase()} coverage or freshness.`
          : "Maintain imported OHLCV and validation evidence.",
    entries,
    safetyNotice: "Evidence quality can reduce readiness confidence, but cannot approve readiness or enable execution."
  };
}

export function compactEvidenceQualitySummary(summary: EvidenceLedgerSummary) {
  return {
    overallScore: summary.overallScore,
    realEvidenceCoverage: summary.realEvidenceCoverage,
    weakestEvidenceCategories: summary.weakestEvidenceCategories,
    readinessEvidenceWarnings: summary.readinessEvidenceWarnings,
    entries: summary.entries.map((item) => ({
      category: item.category,
      sourceType: item.sourceType,
      qualityScore: item.qualityScore,
      limitations: item.limitations.slice(0, 2)
    }))
  };
}
