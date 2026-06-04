import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import { researchDecisionAuthorityNone } from "@/lib/researchDecisionLog";
import { safeTopN, uid } from "@/lib/utils";

import type {
  PaperDemoChecklistItem,
  PaperDemoChecklistItemId,
  PaperDemoChecklistItemStatus,
  PaperDemoChecklistSummary
} from "./paperDemoChecklistTypes";

const MIN_RESEARCH_CANDLES = 400;
const MIN_TRADE_SAMPLE = 30;
const MIN_EVIDENCE_SCORE = 60;
const MIN_MATURITY_SCORE = 60;
const MAX_FALSE_POSITIVE_RATE = 0.25;

const formatToken = (value?: string) => (value ?? "unknown").replace(/_/g, " ");
const countLabel = (value?: number | null) => (typeof value === "number" && Number.isFinite(value) ? String(value) : "unavailable");
const scoreLabel = (value?: number | null) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}/100` : "unavailable");
const pctLabel = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "unavailable";

type PaperDemoChecklistItemInput = Omit<PaperDemoChecklistItem, "proposalEligible"> & {
  proposalEligible?: boolean;
};

const item = ({
  id,
  label,
  status,
  currentValue,
  requiredValue,
  blockerReason,
  nextAction,
  proposalEligible = status === "fail" || status === "warning"
}: PaperDemoChecklistItemInput): PaperDemoChecklistItem => ({
  id,
  label,
  status,
  currentValue,
  requiredValue,
  blockerReason,
  nextAction,
  proposalEligible
});

const statusFor = (passed: boolean, warning = false): PaperDemoChecklistItemStatus =>
  passed ? "pass" : warning ? "warning" : "fail";

const requirementPassed = (snapshot: ResearchRuntimeSnapshot, id: string) =>
  snapshot.readiness.readinessSnapshot.passedRequirements.some((requirement) => requirement.id === id);

const requirementFailed = (snapshot: ResearchRuntimeSnapshot, id: string) =>
  snapshot.readiness.readinessSnapshot.failedRequirements.find((requirement) => requirement.id === id);

const activeResearchSource = (snapshot: ResearchRuntimeSnapshot) => snapshot.marketData.activeResearchSource;

const mt5ProxyWarning = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.mt5ReadOnly.brokerSymbol
    ? `${snapshot.mt5ReadOnly.brokerSymbol} is MT5 read-only CFD/proxy data for ${snapshot.marketData.symbol}, not CME futures broker truth.`
    : "MT5 read-only is CFD/proxy data, not broker truth.";

const totalOosTrades = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.walkForward.stability?.evidenceSummary?.totalOosTrades ??
  snapshot.walkForward.latestRun?.windows.reduce((sum, window) => sum + (window.metricsBySplit.out_of_sample?.totalTrades ?? 0), 0) ??
  0;

const minimumTotalOosTrades = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.walkForward.stability?.evidenceSummary?.minimumTotalOosTrades ?? 20;

const walkForwardPassRate = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.walkForward.windowsTested > 0
    ? snapshot.walkForward.outOfSampleWindowsPassed / Math.max(1, snapshot.walkForward.windowsTested)
    : 0;

const latestTradeSample = (snapshot: ResearchRuntimeSnapshot) =>
  snapshot.latestResearchCycle.latestBacktestSummary?.totalTrades ??
  snapshot.performance.canonicalPerformanceMetrics?.totalTrades ??
  0;

const latestFalsePositiveRate = (snapshot: ResearchRuntimeSnapshot) => {
  const metrics = snapshot.performance.canonicalPerformanceMetrics;
  const trades = metrics?.totalTrades ?? latestTradeSample(snapshot);
  const falsePositives = metrics?.falsePositiveCount;
  return typeof falsePositives === "number" && trades > 0 ? falsePositives / trades : undefined;
};

const sourceQualityItem = (snapshot: ResearchRuntimeSnapshot) => {
  const source = activeResearchSource(snapshot);
  const pass =
    source.provider !== "mock" &&
    source.eligibility.researchCycle &&
    source.roles.includes("research") &&
    source.candleCount >= MIN_RESEARCH_CANDLES &&
    Boolean(source.fingerprint);

  return item({
    id: "source_quality_valid",
    label: "Source quality valid",
    status: statusFor(pass),
    currentValue: `${formatToken(source.provider)}; ${source.candleCount.toLocaleString()} candles; research=${source.eligibility.researchCycle ? "yes" : "no"}`,
    requiredValue: `non-mock active research source, >= ${MIN_RESEARCH_CANDLES} candles, fingerprint recorded`,
    blockerReason: pass ? "Active research source is eligible." : "Active research source is missing, shallow, mock, or not selected for research.",
    nextAction: pass ? "Keep the source pinned to the cycle." : "Activate MT5 Research Mode or select another eligible canonical research source."
  });
};

const sourceProviderItem = (snapshot: ResearchRuntimeSnapshot) => {
  const source = activeResearchSource(snapshot);
  const isMt5 = source.provider === "mt5_read_only";
  const hasBrokerSymbol = !isMt5 || Boolean(snapshot.mt5ReadOnly.brokerSymbol ?? source.provenance.providerSymbol);
  const pass = hasBrokerSymbol && source.authority.executionAuthority === "none";

  return item({
    id: "source_provider_labeled",
    label: "MT5/source provider labeled correctly",
    status: statusFor(pass),
    currentValue: isMt5
      ? `MT5 read-only ${snapshot.mt5ReadOnly.brokerSymbol ?? source.provenance.providerSymbol ?? "missing broker symbol"} -> ${source.symbol}`
      : formatToken(source.provider),
    requiredValue: "provider, requested symbol, broker/proxy symbol when applicable, CFD/proxy warning, authority none",
    blockerReason: pass ? "Provider labeling is explicit." : "Provider or broker/proxy labeling is incomplete.",
    nextAction: pass ? "Keep labels visible on research surfaces." : "Set the MT5 broker symbol and preserve CFD/proxy source warnings."
  });
};

const minimumTradeSampleItem = (snapshot: ResearchRuntimeSnapshot) => {
  const trades = latestTradeSample(snapshot);
  const pass = trades >= MIN_TRADE_SAMPLE;

  return item({
    id: "minimum_trade_sample",
    label: "Minimum trade sample reached",
    status: statusFor(pass),
    currentValue: `${trades} simulated trade(s)`,
    requiredValue: `>= ${MIN_TRADE_SAMPLE} simulated trades`,
    blockerReason: pass ? "Latest cycle sample is large enough for candidate review." : "Latest simulated trade sample is too small for Paper-Demo Candidate review.",
    nextAction: pass ? "Keep sample provenance attached." : "Collect more eligible cycles or broaden validation before candidate review."
  });
};

const walkForwardOosTradesItem = (snapshot: ResearchRuntimeSnapshot) => {
  const current = totalOosTrades(snapshot);
  const required = minimumTotalOosTrades(snapshot);
  const pass = current >= required && required > 0;

  return item({
    id: "walk_forward_oos_trade_count",
    label: "Walk-forward OOS trade count reached",
    status: statusFor(pass, snapshot.walkForward.windowsTested > 0 && current > 0),
    currentValue: `${current} OOS trade(s)`,
    requiredValue: `>= ${required} OOS trades`,
    blockerReason: pass ? "Walk-forward OOS trade sample is sufficient." : "Walk-forward has not produced enough out-of-sample trades.",
    nextAction: pass ? "Review pass rate and regime segmentation." : "Run walk-forward with enough eligible source depth and candidate trades."
  });
};

const walkForwardPassRateItem = (snapshot: ResearchRuntimeSnapshot) => {
  const passRate = walkForwardPassRate(snapshot);
  const verdict = snapshot.walkForward.verdict;
  const pass = verdict === "paper_demo_review_candidate" || (snapshot.walkForward.windowsTested >= 3 && passRate >= 0.67);

  return item({
    id: "walk_forward_pass_rate",
    label: "Walk-forward pass rate acceptable",
    status: statusFor(pass, snapshot.walkForward.windowsTested > 0),
    currentValue: `${snapshot.walkForward.outOfSampleWindowsPassed}/${snapshot.walkForward.windowsTested} OOS windows, verdict ${formatToken(verdict)}`,
    requiredValue: ">= 67% OOS windows passed or paper_demo_review_candidate verdict",
    blockerReason: pass ? "Walk-forward pass rate supports review." : "Walk-forward stability is not strong enough for Paper-Demo Candidate review.",
    nextAction: pass ? "Keep walk-forward report linked." : snapshot.walkForward.recommendedNextAction
  });
};

const evidenceItem = (snapshot: ResearchRuntimeSnapshot) => {
  const score = snapshot.evidence.evidenceQualityScore;
  const pass = score >= MIN_EVIDENCE_SCORE;

  return item({
    id: "evidence_score_threshold",
    label: "Evidence score threshold reached",
    status: statusFor(pass, score >= 45),
    currentValue: scoreLabel(score),
    requiredValue: `>= ${MIN_EVIDENCE_SCORE}/100`,
    blockerReason: pass ? "Evidence quality clears the candidate threshold." : "Independent evidence coverage is still too weak.",
    nextAction: pass ? "Keep evidence ledger attached." : snapshot.evidence.evidenceLedgerSummary.nextDataImprovement
  });
};

const maturityItem = (snapshot: ResearchRuntimeSnapshot) => {
  const score = snapshot.maturity.maturityScore;
  const pass = score >= MIN_MATURITY_SCORE;

  return item({
    id: "maturity_score_threshold",
    label: "Maturity score threshold reached",
    status: statusFor(pass, score >= 45),
    currentValue: `${scoreLabel(score)} (${formatToken(snapshot.maturity.maturityGrade)})`,
    requiredValue: `>= ${MIN_MATURITY_SCORE}/100`,
    blockerReason: pass ? "Research maturity clears the candidate threshold." : "Research maturity is not high enough for Paper-Demo Candidate review.",
    nextAction: pass ? "Keep maturity record attached." : snapshot.maturity.nextMaturityRequirement
  });
};

const regimeItem = (snapshot: ResearchRuntimeSnapshot) => {
  const pass = snapshot.regime.dataQuality === "sufficient" && snapshot.regime.current.missingInputs.length === 0;
  const warning = snapshot.regime.dataQuality === "sufficient";

  return item({
    id: "regime_evidence_sufficient",
    label: "Regime evidence sufficient",
    status: statusFor(pass, warning),
    currentValue: `${formatToken(snapshot.regime.label)}; data quality ${formatToken(snapshot.regime.dataQuality)}; missing ${snapshot.regime.current.missingInputs.length}`,
    requiredValue: "sufficient regime evidence with no critical missing inputs",
    blockerReason: pass ? "Regime evidence is sufficient." : "Regime context is limited or missing confirmation inputs.",
    nextAction: pass ? "Keep regime fingerprint attached." : "Add missing macro/intermarket inputs or treat regime as conservative context only."
  });
};

const grinchIctItem = (snapshot: ResearchRuntimeSnapshot) => {
  const profile = snapshot.latestResearchCycle.activeGrinchProfileSummary;
  const grinch = snapshot.latestResearchCycle.grinchStrategyScore;
  const pass = Boolean(profile && profile.profile !== "none" && !profile.noValidProfile && grinch?.setupQuality !== "blocked");
  const warning = Boolean(profile && profile.profile !== "none");
  const blocker = profile?.hardGateReason ?? profile?.primaryRuleBlock ?? grinch?.hardGateReason;

  return item({
    id: "grinch_ict_profile_evidence",
    label: "Grinch/ICT profile evidence sufficient",
    status: statusFor(pass, warning),
    currentValue: `${profile?.profile ?? "none"}; ${profile?.state ?? "not present"}; blocker ${formatToken(blocker)}`,
    requiredValue: "valid ICT foundation plus Grinch refinement profile, no hard gate blocker",
    blockerReason: pass ? "Full-stack ICT/Grinch evidence is present." : "Grinch refinement evidence is not sufficient for candidate review.",
    nextAction: pass ? "Keep profile diagnostics attached." : profile?.detail ?? "Wait for a cleaner Grinch profile or run diagnostic-only calibration."
  });
};

const conservativeScenarioItem = (snapshot: ResearchRuntimeSnapshot) => {
  const failed = requirementFailed(snapshot, "conservative-stability");
  const pass = requirementPassed(snapshot, "conservative-stability");

  return item({
    id: "conservative_scenario_stable",
    label: "Conservative scenario stable",
    status: statusFor(pass),
    currentValue: failed?.currentValue ?? snapshot.readiness.readinessSnapshot.validationSnapshot?.conservativeScenario?.readiness ?? "unavailable",
    requiredValue: failed?.requiredValue ?? "green; >= 5 trades; avg R >= 0.15; max DD <= 4.00R",
    blockerReason: pass ? "Conservative validation is stable." : failed?.detail ?? "Conservative validation has not passed.",
    nextAction: pass ? "Keep conservative validation report attached." : failed?.suggestedFix ?? "Rerun validation with conservative scenario enabled."
  });
};

const runbookItem = (snapshot: ResearchRuntimeSnapshot) => {
  const runbook = snapshot.readiness.readinessSnapshot.runbookSnapshot;
  const pass = requirementPassed(snapshot, "runbook-complete");

  return item({
    id: "simulation_runbook_complete",
    label: "Simulation runbook complete",
    status: statusFor(pass),
    currentValue: runbook ? `${runbook.completedChecks}/${runbook.totalChecks}; broker skipped=${runbook.brokerExecutionSkipped}` : "missing",
    requiredValue: "all runbook checks complete, broker skipped, positions zero, trades zero",
    blockerReason: pass ? "Simulation runbook is complete." : requirementFailed(snapshot, "runbook-complete")?.detail ?? "Simulation runbook is incomplete.",
    nextAction: pass ? "Keep runbook verification attached." : "Complete the simulation runbook; no execution authority is created by doing so."
  });
};

const falsePositiveItem = (snapshot: ResearchRuntimeSnapshot) => {
  const rate = latestFalsePositiveRate(snapshot);
  const pass = typeof rate === "number" ? rate <= MAX_FALSE_POSITIVE_RATE : requirementPassed(snapshot, "false-positive-control");
  const warning = typeof rate === "number" ? rate <= 0.4 : false;
  const failed = requirementFailed(snapshot, "false-positive-control");

  return item({
    id: "false_positive_rate_acceptable",
    label: "False-positive rate acceptable",
    status: statusFor(pass, warning),
    currentValue: typeof rate === "number" ? pctLabel(rate) : failed?.currentValue ?? "unavailable",
    requiredValue: `<= ${pctLabel(MAX_FALSE_POSITIVE_RATE)} false-positive rate or research-quality false-positive control pass`,
    blockerReason: pass ? "False-positive pressure is acceptable." : failed?.detail ?? "False-positive evidence is too weak or unavailable.",
    nextAction: pass ? "Keep false-positive review attached." : failed?.suggestedFix ?? "Run Research Quality and reduce false-positive patterns."
  });
};

const riskPolicyItem = (snapshot: ResearchRuntimeSnapshot) => {
  const drawdownPass = requirementPassed(snapshot, "drawdown-threshold");
  const conservativePass = requirementPassed(snapshot, "conservative-stability");
  const pass = drawdownPass && conservativePass;

  return item({
    id: "risk_policy_complete",
    label: "Risk policy complete",
    status: statusFor(pass, drawdownPass || conservativePass),
    currentValue: `drawdown=${drawdownPass ? "pass" : "blocked"}; conservative=${conservativePass ? "pass" : "blocked"}`,
    requiredValue: "drawdown threshold and conservative scenario both pass",
    blockerReason: pass ? "Research risk simulation checks are complete." : "Risk policy evidence is incomplete for Paper-Demo Candidate review.",
    nextAction: pass ? "Keep risk report attached." : "Stabilize drawdown and conservative scenario before candidate review."
  });
};

const advisoryItem = (snapshot: ResearchRuntimeSnapshot) =>
  item({
    id: "advisory_reviewed",
    label: "Advisory reviewed",
    status: statusFor(snapshot.llm.advisoryPassed, snapshot.llm.bridgeStatus === "running"),
    currentValue: snapshot.llm.latestLLMRun
      ? `${snapshot.llm.providerStatus}; passed=${snapshot.llm.advisoryPassed}`
      : `${snapshot.llm.bridgeStatus}; no passed advisory`,
    requiredValue: "advisory reviewed with configured provider; advisory remains non-authoritative",
    blockerReason: snapshot.llm.advisoryPassed ? "Advisory review is recorded." : "Advisory review has not passed or is unavailable.",
    nextAction: snapshot.llm.advisoryPassed ? "Keep advisory transcript as explanatory only." : snapshot.llm.readinessImpact,
    proposalEligible: false
  });

const authorityItem = (snapshot: ResearchRuntimeSnapshot) => {
  const source = activeResearchSource(snapshot);
  const pass =
    source.authority.executionAuthority === "none" &&
    source.authority.brokerAuthority === "none" &&
    source.authority.readinessOverrideAuthority === "none" &&
    snapshot.mt5ReadOnly.executionAuthority === "none" &&
    snapshot.mt5ReadOnly.brokerAuthority === "none" &&
    snapshot.mt5ReadOnly.readinessOverrideAuthority === "none";

  return item({
    id: "no_authority_violations",
    label: "No authority violations",
    status: statusFor(pass),
    currentValue: `source=${source.authority.executionAuthority}/${source.authority.brokerAuthority}/${source.authority.readinessOverrideAuthority}; MT5=${snapshot.mt5ReadOnly.executionAuthority}/${snapshot.mt5ReadOnly.brokerAuthority}/${snapshot.mt5ReadOnly.readinessOverrideAuthority}`,
    requiredValue: "executionAuthority none, brokerAuthority none, readinessOverrideAuthority none",
    blockerReason: pass ? "Authority remains none." : "A source reported non-none authority and must be blocked.",
    nextAction: pass ? "Keep safety locks unchanged." : "Block the source immediately and restore read-only/no-authority contracts.",
    proposalEligible: false
  });
};

export function buildPaperDemoChecklist(snapshot: ResearchRuntimeSnapshot): PaperDemoChecklistSummary {
  const source = activeResearchSource(snapshot);
  const items: PaperDemoChecklistItem[] = [
    sourceQualityItem(snapshot),
    sourceProviderItem(snapshot),
    minimumTradeSampleItem(snapshot),
    walkForwardOosTradesItem(snapshot),
    walkForwardPassRateItem(snapshot),
    evidenceItem(snapshot),
    maturityItem(snapshot),
    regimeItem(snapshot),
    grinchIctItem(snapshot),
    conservativeScenarioItem(snapshot),
    runbookItem(snapshot),
    falsePositiveItem(snapshot),
    riskPolicyItem(snapshot),
    advisoryItem(snapshot),
    authorityItem(snapshot)
  ];
  const failItems = items.filter((entry) => entry.status === "fail");
  const warningItems = items.filter((entry) => entry.status === "warning");
  const primaryBlocker =
    failItems[0]?.blockerReason ??
    warningItems[0]?.blockerReason ??
    "All checklist items pass; this panel still cannot promote readiness by itself.";

  return {
    checklistId: uid("paper_demo_checklist"),
    generatedAt: new Date().toISOString(),
    researchReady: snapshot.readiness.readinessState === "Research Ready" || snapshot.readiness.readinessState === "Paper-Demo Candidate",
    paperDemoCandidate: snapshot.readiness.readinessState === "Paper-Demo Candidate" && failItems.length === 0,
    passCount: items.filter((entry) => entry.status === "pass").length,
    failCount: failItems.length,
    warningCount: warningItems.length,
    notApplicableCount: items.filter((entry) => entry.status === "not_applicable").length,
    primaryBlocker,
    nextAction: failItems[0]?.nextAction ?? warningItems[0]?.nextAction ?? snapshot.readiness.nextAction,
    sourceContext: {
      provider: source.provider,
      requestedSymbol: source.symbol,
      brokerSymbol: snapshot.mt5ReadOnly.brokerSymbol ?? source.provenance.providerSymbol,
      timeframe: source.timeframe,
      candleCount: source.candleCount,
      sourceFingerprint: source.fingerprint,
      sourceLabel: source.provenance.sourceLabel,
      proxyWarning: source.provider === "mt5_read_only" ? mt5ProxyWarning(snapshot) : source.warnings[0]
    },
    items,
    proposalEligibleBlockers: safeTopN(items.filter((entry) => entry.proposalEligible && entry.status !== "pass"), 8),
    authority: researchDecisionAuthorityNone,
    safetyNotice: "Checklist is reporting-only. It cannot promote readiness, place orders, or override authority."
  };
}
