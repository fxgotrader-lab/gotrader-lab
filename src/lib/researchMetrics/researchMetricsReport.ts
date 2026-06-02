import type { AutoResearchCycle } from "@/lib/autoResearch";
import type { AutoResearchGrinchLayerBenchmark } from "@/lib/autoResearch/autoResearchTypes";
import { defaultBrokerRiskControls } from "@/lib/brokers";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";

export type ResearchMetricReadoutRow = {
  detail?: string;
  label: string;
  value: string;
};

export type LayerMetricsLike = {
  entryConfirmationFailures: number;
  fullStackAverageR: number;
  fullStackSetups: number;
  fullStackWinRate: number;
  grinchBlockedCandidates: number;
  grinchQualifiedCandidates: number;
  ictFoundationCandidates: number;
  pdArrayInvalidBlocks: number;
  profileInvalidBlocks: number;
  timingExpiredBlocks: number;
};

export const formatNullableNumber = (value?: number | null, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";

export const formatR = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}R` : "n/a";

export const formatPercentMetric = (value?: number | null, digits = 0) =>
  typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";

const formatToken = (value?: string) => (value ?? "idle").replace(/_/g, " ");

export function buildExpandedResearchMetricRows(snapshot?: ResearchRuntimeSnapshot): ResearchMetricReadoutRow[] {
  const metrics = snapshot?.performance.canonicalPerformanceMetrics;
  const totalFalsePositiveDenominator = (metrics?.totalTrades ?? 0) + (metrics?.falsePositiveCount ?? 0);
  const falsePositiveRate = metrics && totalFalsePositiveDenominator > 0 ? metrics.falsePositiveCount / totalFalsePositiveDenominator : undefined;
  const drawdownRecovery =
    metrics && metrics.maxDrawdownR > 0 ? Math.max(0, metrics.realizedR) / Math.max(0.01, metrics.maxDrawdownR) : undefined;
  const grinch = snapshot?.latestResearchCycle.activeGrinchProfileSummary;
  const profileBlocks = grinch?.weakProfileBlocks ?? 0;
  const expiredBlocks = grinch?.expiredTimingBlocks ?? 0;
  const setupDenominator = Math.max(1, (grinch?.reversalCandidates ?? 0) + (grinch?.consolidationCandidates ?? 0) + profileBlocks + expiredBlocks);
  const walkForwardPassRate =
    snapshot && snapshot.walkForward.windowsTested > 0 ? snapshot.walkForward.outOfSampleWindowsPassed / snapshot.walkForward.windowsTested : undefined;

  return [
    { label: "Net R", value: formatR(metrics?.realizedR), detail: metrics?.sourceCycleId ?? "No latest cycle" },
    { label: "Average R", value: formatR(metrics?.averageR), detail: "Expectancy proxy" },
    { label: "Median R", value: "not computed", detail: "Trade distribution storage required" },
    { label: "Profit factor", value: formatNullableNumber(metrics?.profitFactor), detail: "Gross win/loss ratio when available" },
    { label: "Expectancy", value: formatR(metrics?.averageR), detail: "Average simulated R per trade" },
    { label: "Average winner", value: "not computed", detail: "Per-trade winner distribution not exposed" },
    { label: "Average loser", value: "not computed", detail: "Per-trade loser distribution not exposed" },
    { label: "Payoff ratio", value: "not computed", detail: "Needs average winner / average loser" },
    { label: "Max drawdown", value: formatR(metrics?.maxDrawdownR), detail: metrics ? `$${metrics.maxDrawdownDollars.toLocaleString()} simulated` : "n/a" },
    { label: "Max loss streak", value: "not computed", detail: "Per-trade sequence not exposed" },
    { label: "Recovery factor", value: formatNullableNumber(drawdownRecovery), detail: "Net positive R / max drawdown" },
    { label: "Downside deviation", value: "planned", detail: "Needs downside return distribution" },
    { label: "Risk of ruin", value: "planned", detail: "Monte Carlo engine not wired yet" },
    { label: "Win rate", value: formatPercentMetric(metrics?.winRate), detail: `${metrics?.winningTrades ?? 0}W / ${metrics?.losingTrades ?? 0}L` },
    { label: "False-positive rate", value: formatPercentMetric(falsePositiveRate), detail: `${metrics?.falsePositiveCount ?? 0} estimated false positives` },
    { label: "Sample size", value: String(metrics?.totalTrades ?? 0), detail: metrics?.candleWindow ?? "No completed cycle" },
    { label: "Trade frequency", value: metrics ? `${metrics.totalTrades} trades` : "n/a", detail: metrics?.candleWindow ?? "Candle window unavailable" },
    { label: "Timing validity", value: expiredBlocks ? formatPercentMetric(1 - expiredBlocks / setupDenominator) : "not computed", detail: `${expiredBlocks} expired-timing blocks` },
    { label: "Profile validity", value: profileBlocks ? formatPercentMetric(1 - profileBlocks / setupDenominator) : "not computed", detail: `${profileBlocks} weak-profile blocks` },
    { label: "WF pass rate", value: formatPercentMetric(walkForwardPassRate), detail: `${snapshot?.walkForward.outOfSampleWindowsPassed ?? 0}/${snapshot?.walkForward.windowsTested ?? 0} OOS windows` },
    { label: "OOS average R", value: formatR(snapshot?.walkForward.stability?.worstWindowAverageR), detail: "Worst-window OOS average R" },
    { label: "OOS drawdown", value: formatR(snapshot?.walkForward.stability?.worstWindowDrawdownR), detail: "Worst-window OOS drawdown" },
    {
      label: "Regime consistency",
      value: snapshot?.walkForward.stability?.regimeSegments?.length ? `${snapshot.walkForward.stability.regimeSegments.length} segment(s)` : "not enough data",
      detail: snapshot?.regime.label.replace(/_/g, " ") ?? "Regime pending"
    },
    {
      label: "Session consistency",
      value: formatNullableNumber(snapshot?.walkForward.stability?.tradeCountConsistency, 0),
      detail: "Walk-forward stability score when available"
    }
  ];
}

export function buildLayerContributionRows(metrics?: LayerMetricsLike): ResearchMetricReadoutRow[] {
  if (!metrics) {
    return [
      { label: "ICT foundation candidates", value: "awaiting data", detail: "Run Auto Research" },
      { label: "PD/liquidity aligned", value: "awaiting data", detail: "Benchmark matrix not computed" },
      { label: "Grinch-qualified ICT setups", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Grinch-blocked ICT setups", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Profile invalid blocks", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Timing expired blocks", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "PD array invalid blocks", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Entry confirmation failures", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Full-stack setups", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Full-stack win rate", value: "awaiting data", detail: "No layer metrics yet" },
      { label: "Full-stack average R", value: "awaiting data", detail: "No layer metrics yet" }
    ];
  }
  return [
    { label: "ICT foundation candidates", value: String(metrics.ictFoundationCandidates), detail: "Foundation layer" },
    { label: "PD/liquidity aligned", value: String(Math.max(0, metrics.ictFoundationCandidates - metrics.pdArrayInvalidBlocks)), detail: `${metrics.pdArrayInvalidBlocks} PD-array blocks` },
    { label: "Grinch-qualified ICT setups", value: String(metrics.grinchQualifiedCandidates), detail: "Refinement layer passed" },
    { label: "Grinch-blocked ICT setups", value: String(metrics.grinchBlockedCandidates), detail: "Filtered low-quality ICT setups" },
    { label: "Profile invalid blocks", value: String(metrics.profileInvalidBlocks), detail: "Weak/invalid profile gate" },
    { label: "Timing expired blocks", value: String(metrics.timingExpiredBlocks), detail: "Expired timing gate" },
    { label: "PD array invalid blocks", value: String(metrics.pdArrayInvalidBlocks), detail: "Liquidity hierarchy gate" },
    { label: "Entry confirmation failures", value: String(metrics.entryConfirmationFailures), detail: "Entry confirmation layer" },
    { label: "Full-stack setups", value: String(metrics.fullStackSetups), detail: "ICT + full Grinch stack" },
    { label: "Full-stack win rate", value: formatPercentMetric(metrics.fullStackWinRate), detail: "Layered setup result" },
    { label: "Full-stack average R", value: formatR(metrics.fullStackAverageR), detail: "Layered setup result" }
  ];
}

export function buildBenchmarkDisplayRows(
  benchmarkMatrix: AutoResearchGrinchLayerBenchmark[],
  autoResearch?: AutoResearchCycle
) {
  return benchmarkMatrix.map((layer) => {
    const candidateId = layer.candidate?.candidateId;
    const result = candidateId ? autoResearch?.candidateResults.find((candidate) => candidate.candidateId === candidateId) : undefined;
    return {
      layerId: layer.layerId,
      label: layer.label,
      candidates: layer.candidate ? "1" : "n/a",
      trades: result ? String(result.metrics.totalTrades) : layer.candidate ? "not exposed" : "n/a",
      winRate: result ? formatPercentMetric(result.metrics.winRate) : layer.candidate ? "not exposed" : "n/a",
      averageR: result ? formatR(result.metrics.averageR) : layer.score !== undefined ? `${Math.round(layer.score)}/100 score` : "n/a",
      maxDrawdown: result ? formatR(result.metrics.maxDrawdown) : "n/a",
      readinessImpact: result
        ? `${formatToken(result.resultCategory)} / ${result.promotionEligible ? "promotion eligible" : result.rejectionReasons[0] ?? "guarded"}`
        : layer.note
    };
  });
}

export function buildSourceContextRows(snapshot?: ResearchRuntimeSnapshot): ResearchMetricReadoutRow[] {
  const source = snapshot?.marketData.activeResearchSource;
  const mt5 = snapshot?.mt5ReadOnly;
  const sourceLabel =
    source?.provider === "mt5_read_only"
      ? "MT5 read-only CFD/proxy"
      : source?.provider === "tradingview_mcp"
        ? "TradingView MCP evidence"
        : source?.provider === "imported_historical"
          ? "Imported historical"
          : source?.provider?.replace(/_/g, " ") ?? "not resolved";
  return [
    { label: "Research source", value: sourceLabel, detail: snapshot?.marketData.activeResearchSourceLabel ?? "No active source" },
    { label: "Provider", value: source?.provider?.replace(/_/g, " ") ?? "n/a", detail: source?.sourceId ?? "No source ID" },
    { label: "Requested symbol", value: snapshot?.marketData.symbol ?? "n/a", detail: snapshot?.marketData.timeframe ?? "n/a" },
    { label: "Broker symbol", value: mt5?.brokerSymbol ?? source?.provenance.providerSymbol ?? "n/a", detail: source?.provider === "mt5_read_only" ? "CFD/proxy, not CME futures truth" : "Not broker truth" },
    { label: "Candle count", value: String(source?.candleCount ?? 0), detail: `${source?.firstTimestamp ?? "n/a"} to ${source?.lastTimestamp ?? "n/a"}` },
    { label: "Data quality", value: source?.dataQuality ?? "unknown", detail: source?.eligibilityReasons[0] ?? "Eligibility reason pending" },
    { label: "Authority", value: "none", detail: "No execution, broker, or readiness override authority" },
    { label: "Metric status", value: snapshot?.performance.canonicalPerformanceMetrics ? "real latest-cycle" : "insufficient", detail: snapshot?.performance.canonicalPerformanceMetrics?.metricSourceLabel ?? "Run a research cycle" }
  ];
}

export function buildRiskReportRows(snapshot?: ResearchRuntimeSnapshot): ResearchMetricReadoutRow[] {
  const metrics = snapshot?.performance.canonicalPerformanceMetrics;
  return [
    { label: "Max daily loss policy", value: String(defaultBrokerRiskControls.maxDailyLoss), detail: "Locked at zero in research mode" },
    { label: "Max trades/day policy", value: String(defaultBrokerRiskControls.maxTradesPerDay), detail: "Locked at zero in research mode" },
    { label: "Risk per trade policy", value: String(defaultBrokerRiskControls.maxRiskPerTrade), detail: "Execution risk disabled" },
    { label: "Position sizing", value: defaultBrokerRiskControls.positionSizing, detail: "No broker account sizing" },
    { label: "Drawdown recovery", value: metrics && metrics.maxDrawdownR > 0 ? formatNullableNumber(Math.max(0, metrics.realizedR) / metrics.maxDrawdownR) : "n/a", detail: "Research simulation metric" },
    { label: "Paper/live readiness", value: "locked", detail: "Future explicit gate required" },
    { label: "Current risk blockers", value: String(snapshot?.readiness.actualBlockers.length ?? 0), detail: snapshot?.readiness.actualBlockers[0] ?? "No readiness blocker in snapshot" },
    { label: "Execution authority", value: "none", detail: "No orders, no positions, no account mutation" }
  ];
}

export function buildProposalImpactRows(snapshot?: ResearchRuntimeSnapshot): ResearchMetricReadoutRow[] {
  const proposal = snapshot?.proposal.latestProposal;
  const before = proposal?.metricsSnapshot?.beforeMetrics ?? proposal?.beforeMetrics;
  const after = proposal?.metricsSnapshot?.afterMetrics ?? proposal?.afterMetrics;
  const comparison = proposal?.metricsSnapshot?.comparisonResult ?? proposal?.comparisonResult;
  return [
    { label: "Before metrics", value: before ? `${before.totalTrades} trades` : "n/a", detail: before ? `Win ${formatPercentMetric(before.winRate)} / avg ${formatR(before.averageR)}` : "No proposal snapshot" },
    { label: "After metrics", value: after ? `${after.totalTrades} trades` : "not tested", detail: after ? `Win ${formatPercentMetric(after.winRate)} / avg ${formatR(after.averageR)}` : "Run proposal simulation test" },
    { label: "Delta average R", value: before && after ? formatR(after.averageR - before.averageR) : "n/a", detail: "After minus before" },
    { label: "Delta drawdown", value: before && after ? formatR(after.maxDrawdown - before.maxDrawdown) : "n/a", detail: "Lower is better" },
    { label: "Regression warnings", value: String(comparison?.criticalRegressions.length ?? 0), detail: comparison?.criticalRegressions[0] ?? "No proposal comparison" },
    { label: "Regime effect", value: "not segmented", detail: "Regime-specific proposal impact is planned" },
    { label: "Walk-forward effect", value: snapshot?.walkForward.proposalValidated ? "validated" : "not validated", detail: snapshot?.walkForward.recommendedNextAction ?? "Run walk-forward" },
    { label: "Auto-apply effect", value: proposal?.autoApplyStatus?.replace(/_/g, " ") ?? "not evaluated", detail: proposal?.autoApplyBlockedReasons?.[0] ?? "Manual approval remains required" }
  ];
}
