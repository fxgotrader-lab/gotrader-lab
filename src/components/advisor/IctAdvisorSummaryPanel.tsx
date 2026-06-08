import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BrainCircuit, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildIctAdvisorPacketFromRuntime,
  buildIctCurrentReadFromPacket,
  buildIctResearchSignalFromCurrentRead,
  formatIctAdvisorSignalSummary,
  ICT_CMD_PAPER_TRACKING_UPDATED_EVENT,
  ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT,
  isResearchSignalEligibleForPaperSim,
  readActiveCmdPaperTracking,
  readLatestResearchState,
  summarizeNewsSessionRisk,
  type IctAdvisorPacket,
  type IctCmdPaperTrackingRecord,
  type IctCurrentRead,
  type IctLatestResearchState,
  type IctResearchSignal
} from "@/lib/ict-strategy-suite";
import { buildResearchAdvisorDecisionExplanation } from "@/lib/ict-strategy-suite/ictResearchAdvisorDecisionExplanation";
import type {
  IctResearchAdvisorDecisionExplanation,
  IctResearchAdvisorDecisionStatus
} from "@/lib/ict-strategy-suite/ictResearchAdvisorDecisionExplanationTypes";
import type { ResearchRuntimeSnapshot } from "@/lib/runtime";

const formatToken = (value?: string) => (value?.trim() ? value : "unknown").replace(/_/g, " ");
const pct = (value?: number) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const compactPrice = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "n/a");
const entryZoneLabel = (entryZone?: IctAdvisorPacket["recommendedSignal"]["entryZone"]) =>
  entryZone ? `${compactPrice(entryZone.low)} - ${compactPrice(entryZone.high)} (${compactPrice(entryZone.midpoint)} mid)` : "n/a";
const statusVariant = (status?: IctAdvisorPacket["approvedProfileDecision"]["status"]) =>
  status === "approved_research_candidate"
    ? "success"
    : status === "paper_watchlist_candidate"
      ? "warning"
    : status === "watchlist_candidate"
      ? "warning"
      : status === "rejected_candidate"
        ? "danger"
        : "secondary";
const smtVariant = (status?: string) =>
  /reject/i.test(status ?? "")
    ? "danger"
    : /confirm/i.test(status ?? "")
      ? "success"
      : /insufficient|missing|unknown/i.test(status ?? "")
        ? "warning"
        : "secondary";
const smtLabel = (status?: string) => {
  if (status === "comparison_sources_missing") return "SMT sources missing";
  if (status === "insufficient_data") return "SMT insufficient";
  if (status === "confirms_candidate") return "SMT confirms";
  if (status === "rejects_candidate") return "SMT rejects";
  if (status === "no_smt") return "No SMT";
  return `SMT ${formatToken(status)}`;
};
const riskVariant = (status?: string) =>
  /blocked|reject|avoid|no_trade/i.test(status ?? "")
    ? "danger"
    : /caution|unknown|unavailable/i.test(status ?? "")
      ? "warning"
      : "success";
const riskLabel = (status?: string) => {
  if (status === "clear") return "Risk clear";
  if (status === "caution") return "Risk caution";
  if (status === "blocked") return "Risk blocked";
  if (status === "unknown_no_calendar") return "Risk calendar unknown";
  if (status === "unavailable") return "Risk unavailable";
  return `Risk ${formatToken(status)}`;
};
const signalVariant = (signal?: IctResearchSignal) =>
  signal?.status === "approved_research_signal"
    ? "success"
    : signal?.status === "watchlist_signal"
      ? "warning"
      : signal?.status === "rejected_signal"
        ? "danger"
        : "secondary";
const modelLaneLabel = (lane?: string) => {
  if (lane === "approved") return "Approved";
  if (lane === "paper_watchlist") return "Paper Watchlist";
  if (lane === "watchlist") return "Watchlist";
  if (lane === "rejected") return "Rejected";
  if (lane === "no_trade") return "No Trade";
  return "Pending";
};
const modelLaneVariant = (lane?: string) =>
  lane === "approved"
    ? "success" as const
    : lane === "paper_watchlist" || lane === "watchlist"
      ? "warning" as const
      : lane === "rejected"
        ? "danger" as const
      : "secondary" as const;
const decisionStatusVariant = (status: IctResearchAdvisorDecisionStatus) =>
  status === "ready" || status === "eligible" || status === "saved" || status === "tracking"
    ? "success" as const
    : status === "warning" || status === "insufficient" || status === "weak" || status === "missing"
      ? "warning" as const
      : status === "disabled"
        ? "danger" as const
        : "secondary" as const;

type StrategyCalibrationSummary = {
  whatGoTraderSees: string;
  whatGoTraderSeesDetail: string;
  whatItMissed: string;
  whatItMissedDetail: string;
  strongestModelEvidence: string;
  strongestModelEvidenceDetail: string;
  weakestBlocker: string;
  weakestBlockerDetail: string;
  nextCalibrationRecommendation: string;
};

const firstText = (...values: Array<string | undefined | null | false>) =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0);

const analysisTimeframeLabel = (currentRead: IctCurrentRead) =>
  currentRead.analysisTimeframesUsed?.length ? currentRead.analysisTimeframesUsed.join(" / ") : "analysis context pending";

const missingStructureFor = (currentRead: IctCurrentRead) =>
  [
    currentRead.targetConstructionStatus === "missing" ? "target" : undefined,
    currentRead.invalidationConstructionStatus === "missing" ? "invalidation" : undefined,
    currentRead.rrConstructionStatus === "missing" ? "RR" : undefined
  ].filter((value): value is string => Boolean(value));

const buildStrategyCalibrationSummary = (
  currentRead: IctCurrentRead,
  researchSignal: IctResearchSignal,
  explanation: IctResearchAdvisorDecisionExplanation
): StrategyCalibrationSummary => {
  const missingStructure = missingStructureFor(currentRead);
  const htfSection = explanation.sections.find((section) => section.id === "htf_alignment");
  const laneSection = explanation.sections.find((section) => section.id === "lane_decision");
  const paperSection = explanation.sections.find((section) => section.id === "paper_sim");
  const weaknessSection =
    explanation.sections.find((section) => section.status === "rejected" || section.status === "blocked") ??
    explanation.sections.find((section) => section.status === "warning" || section.status === "missing" || section.status === "weak" || section.status === "insufficient");
  const detectedLabel = currentRead.modelDetected
    ? `${formatToken(currentRead.modelName)} / ${formatToken(currentRead.modelState)}`
    : currentRead.opportunityDetected
      ? `${formatToken(currentRead.opportunityType)} / ${formatToken(currentRead.opportunityStage)}`
      : `${formatToken(currentRead.bias)} bias / ${formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}`;
  const missed = firstText(
    missingStructure.length ? `missing ${missingStructure.join(", ")}` : undefined,
    currentRead.modelMissingEvidence?.[0],
    currentRead.opportunityMissingEvidence?.[0],
    currentRead.opportunityBlockers?.[0],
    currentRead.fvgTargetStatus === "missing" ? currentRead.fvgTargetReason : undefined,
    htfSection?.status !== "ready" ? htfSection?.reason : undefined,
    currentRead.topReasons[0]
  ) ?? "no primary miss found in compact read";
  const strongestEvidence = firstText(
    currentRead.paperWatchlistEvidenceSummary,
    currentRead.modelReasons?.[0],
    currentRead.opportunityTradeIdea
      ? `${formatToken(currentRead.opportunityTradeIdea.side)} idea from ${formatToken(currentRead.opportunityType)} / ${formatToken(currentRead.opportunityStage)} context`
      : undefined,
    currentRead.opportunityDetected ? `${formatToken(currentRead.opportunityQuality)} opportunity evidence` : undefined,
    currentRead.sessionTopReasons?.[0],
    laneSection?.reason
  ) ?? "no model evidence strong enough for a lane";
  const weakestBlocker = firstText(
    weaknessSection?.reason,
    currentRead.paperSimAllowed ? undefined : paperSection?.reason,
    currentRead.paperWatchlistReason,
    currentRead.topReasons[0],
    researchSignal.rejectionReasons[0]
  ) ?? "no blocking reason supplied";
  const nextRecommendation =
    missingStructure.length
      ? "Calibrate target, invalidation, and RR construction before changing model thresholds."
      : currentRead.selfImprovementHypothesisQueued
        ? "Replay-test the queued research hypothesis; keep it research-only until evidence improves."
        : currentRead.htfAlignment && currentRead.htfAlignment.alignmentStatus !== "aligned" && currentRead.htfAlignment.alignmentStatus !== "not_required_for_model"
          ? "Review model-aware HTF alignment and keep conflicts as watchlist or paper-only evidence unless replay supports the model."
          : currentRead.opportunityDetected && !currentRead.modelDetected
            ? "Use the CLI calibration audit to turn repeated structured opportunities into explicit model contracts only after replay evidence."
            : "Run npm.cmd run test:ict-strategy-calibration-audit before changing strategy rules.";

  return {
    whatGoTraderSees: detectedLabel,
    whatGoTraderSeesDetail: `${formatToken(currentRead.packetSource)} / ${currentRead.candleCount?.toLocaleString() ?? 0} candles / ${analysisTimeframeLabel(currentRead)}`,
    whatItMissed: missed,
    whatItMissedDetail: `${formatToken(currentRead.modelQualityLane)} lane / ${formatToken(currentRead.approvedStatus)} / ${formatToken(currentRead.analysisDepthStatus)}`,
    strongestModelEvidence: strongestEvidence,
    strongestModelEvidenceDetail: `${formatToken(currentRead.weeklyBiasDirection)} weekly bias / HTF ${formatToken(currentRead.htfAlignment?.alignmentStatus)}`,
    weakestBlocker,
    weakestBlockerDetail: `Signal ${formatToken(researchSignal.status)} / paper ${formatToken(currentRead.paperSimEligibilityStatus)} / authority none`,
    nextCalibrationRecommendation: nextRecommendation
  };
};

export function IctAdvisorSummaryPanel({
  mode = "full",
  packetOverride,
  snapshot
}: {
  mode?: "compact" | "full";
  packetOverride?: IctAdvisorPacket;
  snapshot?: ResearchRuntimeSnapshot;
}) {
  const [packet, setPacket] = useState<IctAdvisorPacket>();
  const [latestResearchState, setLatestResearchState] = useState<IctLatestResearchState>();
  const [cmdPaperTracking, setCmdPaperTracking] = useState<IctCmdPaperTrackingRecord>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const refreshLatestState = () => setLatestResearchState(readLatestResearchState());
    refreshLatestState();
    window.addEventListener(ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT, refreshLatestState);
    window.addEventListener("storage", refreshLatestState);
    return () => {
      window.removeEventListener(ICT_LATEST_RESEARCH_STATE_UPDATED_EVENT, refreshLatestState);
      window.removeEventListener("storage", refreshLatestState);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setCmdPaperTracking(readActiveCmdPaperTracking());
    refresh();
    window.addEventListener(ICT_CMD_PAPER_TRACKING_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ICT_CMD_PAPER_TRACKING_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (packetOverride) {
      setPacket(packetOverride);
      setError(undefined);
      return () => {
        mounted = false;
      };
    }
    if (!snapshot) {
      setPacket(undefined);
      return () => {
        mounted = false;
      };
    }
    void buildIctAdvisorPacketFromRuntime(snapshot)
      .then((nextPacket) => {
        if (mounted) {
          setPacket(nextPacket);
          setError(undefined);
        }
      })
      .catch((reason) => {
        if (mounted) {
          setPacket(undefined);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      mounted = false;
    };
  }, [packetOverride, snapshot?.snapshotId, snapshot?.marketData.activeResearchSource.sourceId, snapshot?.marketData.activeResearchSource.fingerprint, snapshot?.mt5ReadOnly.higherTimeframeSources?.map((source) => source.fingerprint).join("|")]);

  const recommended = packet?.recommendedSignal;
  const currentRead = useMemo(() => buildIctCurrentReadFromPacket(packet, latestResearchState), [packet, latestResearchState]);
  const researchSignal = useMemo(
    () => buildIctResearchSignalFromCurrentRead(currentRead, latestResearchState),
    [currentRead, latestResearchState]
  );
  const decisionExplanation = useMemo(
    () => buildResearchAdvisorDecisionExplanation({ currentRead, researchSignal, latestResearchState, cmdPaperTracking }),
    [currentRead, researchSignal, latestResearchState, cmdPaperTracking]
  );
  const strategyCalibrationSummary = useMemo(
    () => buildStrategyCalibrationSummary(currentRead, researchSignal, decisionExplanation),
    [currentRead, researchSignal, decisionExplanation]
  );
  const decisionSection = (id: IctResearchAdvisorDecisionExplanation["sections"][number]["id"]) =>
    decisionExplanation.sections.find((section) => section.id === id);
  const paperSimEligibility = useMemo(
    () => isResearchSignalEligibleForPaperSim(researchSignal),
    [researchSignal]
  );
  const missingTradeFields = useMemo(
    () =>
      [
        typeof recommended?.target === "number" ? undefined : "target",
        typeof recommended?.invalidation === "number" ? undefined : "invalidation",
        typeof recommended?.rrEstimate === "number" ? undefined : "RR"
      ].filter((field): field is string => Boolean(field)),
    [recommended?.target, recommended?.invalidation, recommended?.rrEstimate]
  );
  const missingTradeFieldsLabel = missingTradeFields.length ? missingTradeFields.join(", ") : "none";
  const paperWatchlistEligible = currentRead.paperWatchlistEligible;
  const paperSimAllowed = currentRead.paperSimAllowed || paperSimEligibility.eligible;
  const paperSimLabel = paperSimAllowed ? "Paper Sim: Eligible" : "Paper Sim: Not Eligible";
  const paperSimVariant = paperSimAllowed ? "success" as const : "warning" as const;
  const modelLane = modelLaneLabel(currentRead.modelQualityLane);
  const cmdPaperState = cmdPaperTracking?.state ?? "inactive";
  const cmdPaperLabel =
    cmdPaperState === "active" || cmdPaperState === "pending"
      ? "tracking"
      : cmdPaperState === "target_hit"
        ? "target hit"
        : cmdPaperState === "invalidation_hit"
          ? "invalidation hit"
          : cmdPaperState;
  const cmdPaperVariant =
    cmdPaperState === "target_hit"
      ? "success" as const
      : cmdPaperState === "invalidation_hit" || cmdPaperState === "expired" || cmdPaperState === "cancelled"
        ? "danger" as const
        : cmdPaperState === "active" || cmdPaperState === "pending"
          ? "warning" as const
          : "secondary" as const;
  const paperWatchlistLabel = paperWatchlistEligible ? "Paper-only eligible" : "Not eligible";
  const phaseOneSignals = useMemo(() => (packet?.signals ?? []).filter((signal) => signal.phase === "phase_1"), [packet?.signals]);
  const phaseTwoSignals = useMemo(() => (packet?.signals ?? []).filter((signal) => signal.phase === "phase_2"), [packet?.signals]);
  const topPhaseTwo = phaseTwoSignals
    .slice()
    .sort((left, right) => {
      const statusWeight = (status?: string) =>
        status === "approved_research_candidate" ? 4 : status === "paper_watchlist_candidate" ? 3 : status === "watchlist_candidate" ? 2 : status === "rejected_candidate" ? 1 : 0;
      return statusWeight(right.approvedProfileDecision?.status) - statusWeight(left.approvedProfileDecision?.status) || right.confidence - left.confidence;
    })[0];

  if (mode === "compact") {
    return (
      <section data-testid="dashboard-research-advisor-card" className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.14),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.94))] p-4 shadow-[0_0_45px_rgba(8,145,178,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Research Advisor</p>
            <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-50">
              <BrainCircuit className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              ICT Strategy Suite compact snapshot
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusVariant(packet?.approvedProfileDecision.status)}>{formatToken(packet?.approvedProfileDecision.status)}</Badge>
            <Badge data-testid="dashboard-ict-model-lane" variant={modelLaneVariant(currentRead.modelQualityLane)}>Model lane: {modelLane}</Badge>
            <Badge data-testid="dashboard-ict-research-signal-status" variant={signalVariant(researchSignal)}>{formatToken(researchSignal.status)}</Badge>
            <Badge data-testid="dashboard-ict-paper-sim-status" variant={paperSimVariant}>{paperSimLabel}</Badge>
            <Badge data-testid="dashboard-ict-cmd-paper-status" variant={cmdPaperVariant}>CMD Paper: {cmdPaperLabel}</Badge>
            <Badge data-testid="dashboard-ict-execution-status" variant="danger">Execution: Disabled</Badge>
            <Badge variant={smtVariant(currentRead.smtStatus)}>{smtLabel(currentRead.smtStatus)}</Badge>
            <Badge variant={riskVariant(currentRead.riskStatus)}>{riskLabel(currentRead.riskStatus)}</Badge>
          </div>
        </div>
        {packet ? (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <AdvisorMini label="Packet source" value={formatToken(currentRead.packetSource)} detail={`${currentRead.candleCount?.toLocaleString() ?? 0} candles`} />
              <AdvisorMini
                label="Recognition"
                value={formatToken(currentRead.recognitionTier)}
                detail={currentRead.recognitionOpportunitySummary}
              />
              <AdvisorMini
                label="Direction"
                value={formatToken(currentRead.scalpDirection ?? currentRead.modelDirection ?? currentRead.opportunityDirection)}
                detail={currentRead.scalpStatus ? `Scalp ${formatToken(currentRead.scalpStatus)}` : "model/opportunity direction"}
              />
              <AdvisorMini
                label="Lane"
                value={modelLane}
                detail={`Recognition lane ${formatToken(currentRead.universalRecognition?.laneRecommendation)}`}
              />
              <AdvisorMini
                label="Next action"
                value={currentRead.nextAction}
                detail="research-only; no execution"
              />
              <AdvisorMini
                label="Chart timeframe"
                value={currentRead.displayTimeframe ?? packet.primaryTimeframe}
                detail="display/reference only"
              />
              <AdvisorMini
                label="Analysis TFs"
                value={currentRead.analysisTimeframesUsed?.join(" / ") || "pending"}
                detail={`${formatToken(currentRead.analysisDepthStatus)} depth / ${formatToken(currentRead.multiTimeframeContextStatus)} context`}
              />
              <AdvisorMini
                label="Missing TFs"
                value={currentRead.missingTimeframes?.length ? currentRead.missingTimeframes.join(" / ") : "none"}
                detail={`Session ${currentRead.sessionModelSourceTimeframe ?? "pending"} / confirm ${currentRead.confirmationSourceTimeframe ?? "pending"}`}
              />
              <AdvisorMini
                label="Weekly bias"
                value={`${formatToken(currentRead.weeklyBiasDirection)} / ${formatToken(currentRead.weeklyBiasStatus)}`}
                detail={currentRead.weeklyBiasReason}
              />
              <AdvisorMini label="Composite bias" value={formatToken(currentRead.bias)} />
              <AdvisorMini
                label="Session narrative"
                value={formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}
                detail={`${currentRead.debug.selectedSessionDate ?? "no session date"} / ${formatToken(currentRead.sessionDirectionalRead)} / ${pct(currentRead.sessionNarrativeConfidence)}`}
              />
              <AdvisorMini
                label="Model detected"
                value={currentRead.modelDetected ? formatToken(currentRead.modelName) : "not detected"}
                detail={currentRead.modelDetected ? `${formatToken(currentRead.modelState)} / ${formatToken(currentRead.modelDirection)}` : currentRead.modelMissingEvidence?.[0] ?? currentRead.topReasons[0] ?? "Detector ran; no complete model."}
              />
              <AdvisorMini
                label="Market opportunity"
                value={currentRead.opportunityDetected ? formatToken(currentRead.opportunityType) : "none"}
                detail={`${formatToken(currentRead.opportunityStage)} / ${formatToken(currentRead.opportunityQuality)}`}
              />
              <AdvisorMini
                label="Opportunity lane"
                value={formatToken(currentRead.opportunityLaneRecommendation)}
                detail={currentRead.opportunityNextAction}
              />
              <AdvisorMini
                label="Research hypothesis"
                value={currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}
                detail={currentRead.selfImprovementHypothesisQueued ? "needs replay validation" : currentRead.selfImprovementHypothesisReason}
              />
              <AdvisorMini
                label="FVG target"
                value={currentRead.fvgTargetDetected ? formatToken(currentRead.fvgTargetDirection) : "missing"}
                detail={currentRead.fvgTargetReason}
              />
              <AdvisorMini
                label="Model lane"
                value={modelLane}
                detail={currentRead.paperWatchlistReason ?? "research-only lane"}
              />
              <AdvisorMini label="Active setup" value={formatToken(currentRead.bestSetup)} detail={`Phase 2 ${formatToken(topPhaseTwo?.setup ?? currentRead.bestPhase2Setup)}`} />
              <AdvisorMini label="Decision" value={formatToken(currentRead.approvedStatus)} detail={`Lane ${modelLane}`} />
              <AdvisorMini
                label="Research signal"
                value={formatToken(researchSignal.status)}
                detail={`${formatToken(researchSignal.side)} / execution disabled`}
              />
              <AdvisorMini
                label="Paper Sim"
                value={formatToken(currentRead.paperSimEligibilityStatus)}
                detail={decisionSection("paper_sim")?.reason ?? currentRead.paperSimEligibilityReason ?? paperSimEligibility.reasons[0] ?? "Waiting for approved signal"}
              />
              <AdvisorMini label="Research readiness" value={formatToken(currentRead.readinessSummary.researchReadiness)} detail={currentRead.readinessSummary.reasons[0]} />
              <AdvisorMini label="Paper readiness" value={formatToken(currentRead.readinessSummary.paperReadiness)} detail={decisionSection("readiness_split")?.reason ?? "paper/demo remains gated"} />
              <AdvisorMini label="Execution readiness" value={formatToken(currentRead.readinessSummary.executionReadiness)} detail="always disabled" />
              <AdvisorMini
                label="CMD Paper"
                value={cmdPaperLabel}
                detail={cmdPaperTracking ? `${cmdPaperTracking.side} / ${formatToken(cmdPaperTracking.outcome)}` : decisionSection("cmd_paper")?.reason ?? "inactive"}
              />
              <AdvisorMini
                label="Execution"
                value="Disabled"
                detail="authority none / no broker mutation"
              />
              <AdvisorMini
                label="Trade field status"
                value={missingTradeFieldsLabel === "none" ? "complete" : missingTradeFieldsLabel}
                detail={`T ${formatToken(currentRead.targetConstructionStatus)} / I ${formatToken(currentRead.invalidationConstructionStatus)} / RR ${formatToken(currentRead.rrConstructionStatus)}`}
              />
              <AdvisorMini label="Confidence" value={pct(currentRead.confidence)} />
              <AdvisorMini label="Signal RR" value={typeof researchSignal.rrEstimate === "number" ? `${researchSignal.rrEstimate.toFixed(2)}R` : "n/a"} detail={typeof researchSignal.confidence === "number" ? pct(researchSignal.confidence) : "n/a"} />
              <AdvisorMini label="Phase 1 / Phase 2" value={`${currentRead.debug.phase1SignalCount}/${currentRead.debug.phase2SignalCount}`} detail="signals evaluated" />
              <AdvisorMini label="SMT / Risk" value={`${formatToken(currentRead.smtStatus)} / ${formatToken(currentRead.riskStatus)}`} detail={`${currentRead.smtReason ?? "SMT reason unavailable"} / ${currentRead.riskReason ?? "Risk reason unavailable"}`} />
              <AdvisorMini
                label="Monte Carlo"
                value={currentRead.latestMonteCarloStatus === "saved" ? formatToken(currentRead.latestMonteCarloRobustness) : "none saved"}
                detail={
                  typeof currentRead.latestMonteCarloRiskOfRuinPct === "number"
                    ? `Risk of ruin ${currentRead.latestMonteCarloRiskOfRuinPct.toFixed(1)}%`
                    : decisionSection("monte_carlo")?.reason ?? currentRead.latestMonteCarloReason
                }
              />
              <AdvisorMini
                label="Recommended max risk"
                value={typeof currentRead.latestMonteCarloRecommendedRiskPct === "number" ? `${currentRead.latestMonteCarloRecommendedRiskPct.toFixed(2)}%` : "unavailable"}
                detail={currentRead.recommendedMaxRiskReason}
              />
              <AdvisorMini
                label="Replay"
                value={currentRead.latestReplayStatus ?? "none saved"}
                detail="latest manual result"
              />
              <AdvisorMini
                label="Scorecard"
                value={currentRead.latestScorecardBestSymbol ?? "none saved"}
                detail={currentRead.latestScorecardResearchPreferredSymbols?.join(", ") || "latest manual result"}
              />
              <AdvisorMini label="Target" value={compactPrice(currentRead.target)} detail={currentRead.targetConstructionReason} />
              <AdvisorMini label="Invalidation" value={compactPrice(currentRead.invalidation)} detail={currentRead.invalidationConstructionReason} />
              <AdvisorMini label="RR estimate" value={typeof currentRead.rrEstimate === "number" ? `${currentRead.rrEstimate.toFixed(2)}R` : "n/a"} detail={currentRead.rrConstructionReason} />
            </div>
            <StrategyCalibrationPanel summary={strategyCalibrationSummary} compact />
            <DecisionExplanationPanel explanation={decisionExplanation} compact />
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="line-clamp-2 text-xs leading-5 text-slate-300">
                Recognition: {formatToken(currentRead.recognitionTier)}. Session: {formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}. Model: {currentRead.modelDetected ? `${formatToken(currentRead.modelName)} / ${formatToken(currentRead.modelState)} / ${formatToken(currentRead.modelDirection)}` : "not detected"}. Lane: {modelLane}. Paper Sim: {currentRead.paperSimAllowed ? "Eligible" : "Not Eligible"} ({currentRead.paperSimEligibilityReason ?? "reason pending"}). Readiness: Research {formatToken(currentRead.readinessSummary.researchReadiness)}, Paper {formatToken(currentRead.readinessSummary.paperReadiness)}, Execution Disabled. Trade fields: target {formatToken(currentRead.targetConstructionStatus)}, invalidation {formatToken(currentRead.invalidationConstructionStatus)}, RR {formatToken(currentRead.rrConstructionStatus)}. {currentRead.topReasons[0] ?? currentRead.paperWatchlistReason ?? recommended?.summary ?? "ICT advisor summary unavailable."} Next: {researchSignal.nextAction} Approval score {packet.compactSummary.approvalScore}/100.
                {" "}Hypothesis: {currentRead.selfImprovementHypothesisQueued ? "queued - needs replay validation" : "not queued"}. CMD Paper: {cmdPaperLabel}.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">journal {packet.journalStatus}</Badge>
                <Badge variant="danger">authority none</Badge>
                <Badge variant="secondary">compact packet only</Badge>
              </div>
              <Button variant="secondary" size="sm">
                <Link to="/research-advisor" className="inline-flex items-center gap-2">
                  Open Advisor
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">{error ?? "Waiting for active canonical research source."}</p>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-cyan-300/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_82%_4%,rgba(168,85,247,0.12),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] p-5 shadow-[0_0_55px_rgba(8,145,178,0.09)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">ICT Strategy Suite</p>
          <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-50">
            <BrainCircuit className="h-5 w-5 text-cyan-300" aria-hidden="true" />
            Research-only decision board
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Canonical candles are evaluated locally; the UI and advisory packets expose compact decision fields only. Raw candles, snapshots, account/order/position data, and secrets stay excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant(packet?.approvedProfileDecision.status)}>{formatToken(packet?.approvedProfileDecision.status)}</Badge>
          <Badge data-testid="ict-model-quality-lane" variant={modelLaneVariant(currentRead.modelQualityLane)}>Model lane: {modelLane}</Badge>
          <Badge data-testid="dashboard-ict-paper-sim-status-full" variant={paperSimVariant}>{paperSimLabel}</Badge>
          <Badge data-testid="ict-cmd-paper-status-full" variant={cmdPaperVariant}>CMD Paper: {cmdPaperLabel}</Badge>
          <Badge variant={paperWatchlistEligible ? "warning" : "secondary"}>{paperWatchlistLabel}</Badge>
          <Badge variant={smtVariant(currentRead.smtStatus)}>{smtLabel(currentRead.smtStatus)}</Badge>
          <Badge variant={riskVariant(currentRead.riskStatus)}>{riskLabel(currentRead.riskStatus)}</Badge>
          <Badge variant={recommended?.decision === "research_only" ? "success" : "warning"}>{formatToken(recommended?.decision)}</Badge>
          <Badge variant="danger">execution none</Badge>
          <Badge variant="secondary">compact packet</Badge>
        </div>
      </div>
      {packet ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AdvisorMini label="Symbol mapping" value={`${packet.brokerSymbol} -> ${packet.requestedSymbol}`} detail={packet.activeSource.provider.replace(/_/g, " ")} />
            <AdvisorMini label="Recognition tier" value={formatToken(currentRead.recognitionTier)} detail={currentRead.recognitionOpportunitySummary} />
            <AdvisorMini label="Known model" value={currentRead.knownModelName ? formatToken(currentRead.knownModelName) : "none confirmed"} detail={currentRead.knownModelState ? formatToken(currentRead.knownModelState) : "fallback can still map PD/scalp"} />
            <AdvisorMini label="PD array focus" value={currentRead.pdArrayFocus ? formatToken(currentRead.pdArrayFocus) : "pending"} detail={`${currentRead.universalRecognition?.pdArrays.length ?? 0} compact arrays recognized`} />
            <AdvisorMini label="Scalp fallback" value={formatToken(currentRead.scalpStatus)} detail={`${formatToken(currentRead.scalpDirection)} / T ${compactPrice(currentRead.scalpTarget)} / I ${compactPrice(currentRead.scalpInvalidation)} / RR ${typeof currentRead.scalpRR === "number" ? `${currentRead.scalpRR.toFixed(2)}R` : "n/a"}`} />
            <AdvisorMini label="Chart timeframe" value={currentRead.displayTimeframe ?? packet.primaryTimeframe} detail="display/reference only" />
            <AdvisorMini label="Analysis TFs" value={currentRead.analysisTimeframesUsed?.join(" / ") || "pending"} detail={`${formatToken(currentRead.analysisDepthStatus)} depth / ${formatToken(currentRead.multiTimeframeContextStatus)} context`} />
            <AdvisorMini label="Missing TFs" value={currentRead.missingTimeframes?.length ? currentRead.missingTimeframes.join(" / ") : "none"} detail="required W1/D1/H4/H1/M15/M5" />
            <AdvisorMini label="HTF / session source" value={currentRead.htfBiasSource?.length ? currentRead.htfBiasSource.join(" / ") : "pending"} detail={`Session ${currentRead.sessionModelSourceTimeframe ?? "pending"} / confirm ${currentRead.confirmationSourceTimeframe ?? "pending"}`} />
            <AdvisorMini label="HTF alignment" value={formatToken(currentRead.htfAlignment?.alignmentStatus)} detail={currentRead.htfAlignment?.conflictReason ?? "W1/D1/H4/H1/M15/M5 pending"} />
            <AdvisorMini label="Weekly bias" value={`${formatToken(currentRead.weeklyBiasDirection)} / ${formatToken(currentRead.weeklyBiasStatus)}`} detail={currentRead.weeklyBiasReason} />
            <AdvisorMini label="Packet candles" value={packet.activeSource.candleCount.toLocaleString()} detail="compact count only" />
            <AdvisorMini label="HTF context" value={packet.htfTimeframes.length ? packet.htfTimeframes.join(", ") : "missing"} detail="analysis bias inputs" />
            <AdvisorMini label="Composite bias" value={formatToken(packet.compactSummary.compositeBias)} detail={recommended?.bias.primary ? `primary ${recommended.bias.primary}` : undefined} />
            <AdvisorMini
              label="Session narrative"
              value={formatToken(currentRead.sessionNarrativeStatus ?? currentRead.sessionNarrativeProfile)}
              detail={`${currentRead.debug.selectedSessionDate ?? "no session date"} / ${formatToken(currentRead.sessionDirectionalRead)} / ${pct(currentRead.sessionNarrativeConfidence)}`}
            />
            <AdvisorMini
              label="Model detected"
              value={currentRead.modelDetected ? formatToken(currentRead.modelName) : "not detected"}
              detail={
                currentRead.modelDetected
                  ? `${formatToken(currentRead.modelState)} / ${formatToken(currentRead.modelDirection)} / ${pct(currentRead.modelConfidence)}`
                  : currentRead.modelMissingEvidence?.[0] ?? currentRead.topReasons[0] ?? "Detector ran; no complete model."
              }
            />
            <AdvisorMini
              label="Market opportunity"
              value={currentRead.opportunityDetected ? formatToken(currentRead.opportunityType) : "none"}
              detail={`${formatToken(currentRead.opportunityStage)} / ${formatToken(currentRead.opportunityQuality)} / ${formatToken(currentRead.opportunityLaneRecommendation)}`}
            />
            <AdvisorMini
              label="Research hypothesis"
              value={currentRead.selfImprovementHypothesisQueued ? "queued" : "not queued"}
              detail={currentRead.selfImprovementHypothesisQueued ? currentRead.selfImprovementNextValidation : currentRead.selfImprovementHypothesisReason}
            />
            <AdvisorMini
              label="Opportunity next"
              value={currentRead.opportunityNextAction}
              detail={currentRead.opportunityBlockers[0] ?? currentRead.opportunityMissingEvidence[0] ?? "compact opportunity read"}
            />
            <AdvisorMini
              label="NY mitigation"
              value={packet.compactSummary.sessionMitigationDetected ? "detected" : "missing"}
              detail={`depth ${formatToken(packet.compactSummary.dataDepthStatus)}`}
            />
            <AdvisorMini
              label="FVG target"
              value={currentRead.fvgTargetDetected ? formatToken(currentRead.fvgTargetDirection) : "missing"}
              detail={currentRead.fvgTargetReason}
            />
            <AdvisorMini label="Candidate lane" value={modelLane} detail={currentRead.paperWatchlistReason ?? "research-only lane"} />
            <AdvisorMini label="Paper-watchlist eligibility" value={paperWatchlistEligible ? "eligible" : "not eligible"} detail={currentRead.paperWatchlistEvidenceSummary ?? "compact evidence only"} />
            <AdvisorMini label="Paper Sim" value={formatToken(currentRead.paperSimEligibilityStatus)} detail={decisionSection("paper_sim")?.reason ?? currentRead.paperSimEligibilityReason ?? paperSimEligibility.reasons[0] ?? "approval or structure pending"} />
            <AdvisorMini label="Research readiness" value={formatToken(currentRead.readinessSummary.researchReadiness)} detail={currentRead.readinessSummary.reasons[0]} />
            <AdvisorMini label="Paper readiness" value={formatToken(currentRead.readinessSummary.paperReadiness)} detail={decisionSection("readiness_split")?.reason ?? "paper/demo remains gated"} />
            <AdvisorMini label="Execution readiness" value={formatToken(currentRead.readinessSummary.executionReadiness)} detail="always disabled" />
            <AdvisorMini label="Execution" value="Disabled" detail="authority none / no broker mutation" />
            <AdvisorMini label="Active setup" value={formatToken(packet.compactSummary.setup)} />
            <AdvisorMini label="Research side" value={formatToken(packet.compactSummary.side)} />
            <AdvisorMini label="Decision" value={formatToken(packet.compactSummary.decision)} />
            <AdvisorMini label="Approved profile" value={formatToken(packet.approvedProfileDecision.status)} detail={packet.approvedProfileDecision.profileId.replace(/_/g, " ")} />
            <AdvisorMini label="Research signal" value={formatToken(researchSignal.status)} detail={`${formatToken(researchSignal.side)} / execution disabled`} />
            <AdvisorMini
              label="Trade field status"
              value={missingTradeFieldsLabel === "none" ? "complete" : missingTradeFieldsLabel}
              detail={`T ${formatToken(currentRead.targetConstructionStatus)} / I ${formatToken(currentRead.invalidationConstructionStatus)} / RR ${formatToken(currentRead.rrConstructionStatus)}`}
            />
            <AdvisorMini label="Paper watchlist" value={paperWatchlistEligible ? "eligible" : "not eligible"} detail={paperWatchlistEligible ? "paper simulation only" : decisionSection("paper_sim")?.reason ?? currentRead.paperSimEligibilityReason ?? paperSimEligibility.reasons[0] ?? "approval or structure pending"} />
            <AdvisorMini label="CMD Paper" value={cmdPaperLabel} detail={cmdPaperTracking ? `${cmdPaperTracking.side} / ${formatToken(cmdPaperTracking.outcome)}` : decisionSection("cmd_paper")?.reason ?? "inactive"} />
            <AdvisorMini label="Approval score" value={`${packet.approvedProfileDecision.approvalScore}/100`} />
            <AdvisorMini label="Signal next action" value={researchSignal.nextAction} detail="research-only contract" />
            <AdvisorMini label="Confidence" value={pct(packet.compactSummary.confidence)} />
            <AdvisorMini
              label="SMT / RS"
              value={smtLabel(currentRead.smtStatus)}
              detail={currentRead.smtReason}
            />
            <AdvisorMini label="RS leader" value={packet.indexSmt?.relativeStrengthLeader ?? "n/a"} detail={`weakness ${packet.indexSmt?.relativeWeaknessLeader ?? "n/a"}`} />
            <AdvisorMini label="Risk Governor" value={riskLabel(currentRead.riskStatus)} detail={currentRead.riskReason ?? summarizeNewsSessionRisk(packet.newsSessionRisk)} />
            <AdvisorMini label="News risk" value={formatToken(packet.compactSummary.newsRiskLevel)} detail={`${packet.compactSummary.blockingEventsCount ?? 0} block / ${packet.compactSummary.cautionEventsCount ?? 0} caution`} />
            <AdvisorMini label="Session risk" value={formatToken(packet.compactSummary.sessionRiskState)} detail={formatToken(packet.newsSessionRisk?.session.sessionName)} />
            <AdvisorMini label="Confidence adjustment" value={`${Math.round((packet.compactSummary.riskGovernorConfidenceAdjustment ?? 0) * 100)} pts`} />
            <AdvisorMini label="Draw-on-liquidity" value={packet.compactSummary.drawOnLiquidity ?? "none"} />
            <AdvisorMini label="Swept liquidity" value={recommended?.liquiditySwept ? `${recommended.liquiditySwept.type} @ ${compactPrice(recommended.liquiditySwept.price)}` : "none"} />
            <AdvisorMini label="Dealing range" value={formatToken(recommended?.dealingRange?.currentLocation)} detail={recommended?.dealingRange ? `${compactPrice(recommended.dealingRange.low)} / ${compactPrice(recommended.dealingRange.midpoint)} / ${compactPrice(recommended.dealingRange.high)}` : undefined} />
            <AdvisorMini label="Phase" value={formatToken(recommended?.phase)} />
            <AdvisorMini label="Order block" value={formatToken(recommended?.orderBlock?.variant)} detail={recommended?.orderBlock ? `${recommended.orderBlock.direction} / ${recommended.orderBlock.reason}` : undefined} />
            <AdvisorMini label="FVG / displacement" value={recommended?.fairValueGap ? `${recommended.fairValueGap.direction} FVG` : recommended?.displacement ? `${recommended.displacement.direction} displacement` : "missing"} />
            <AdvisorMini label="Entry zone" value={entryZoneLabel(recommended?.entryZone)} />
            <AdvisorMini label="Invalidation" value={compactPrice(currentRead.invalidation)} detail={currentRead.invalidationConstructionReason} />
            <AdvisorMini label="Target" value={compactPrice(currentRead.target)} detail={currentRead.targetConstructionReason} />
            <AdvisorMini label="RR estimate" value={typeof currentRead.rrEstimate === "number" ? `${currentRead.rrEstimate.toFixed(2)}R` : "n/a"} detail={currentRead.rrConstructionReason} />
            <AdvisorMini label="Journal" value={packet.journalStatus} detail={`${packet.journalEvents.length} compact events`} />
            <AdvisorMini label="Latest replay" value={currentRead.latestReplayStatus ?? "none saved"} detail="manual result" />
            <AdvisorMini
              label="Latest Monte Carlo"
              value={currentRead.latestMonteCarloStatus === "saved" ? formatToken(currentRead.latestMonteCarloRobustness) : "none saved"}
              detail={
                typeof currentRead.latestMonteCarloRecommendedRiskPct === "number"
                  ? `max risk idea ${currentRead.latestMonteCarloRecommendedRiskPct.toFixed(1)}%`
                  : decisionSection("monte_carlo")?.reason ?? currentRead.latestMonteCarloReason
              }
            />
            <AdvisorMini
              label="Recommended max risk"
              value={typeof currentRead.latestMonteCarloRecommendedRiskPct === "number" ? `${currentRead.latestMonteCarloRecommendedRiskPct.toFixed(2)}%` : "unavailable"}
              detail={currentRead.recommendedMaxRiskReason}
            />
            <AdvisorMini label="Latest scorecard" value={currentRead.latestScorecardBestSymbol ?? "none saved"} detail="manual result" />
          </div>
          <StrategyCalibrationPanel summary={strategyCalibrationSummary} />
          <DecisionExplanationPanel explanation={decisionExplanation} />
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div data-testid="ict-universal-recognition-summary" className="mb-4 rounded-lg border border-violet-300/15 bg-violet-300/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Recognition Summary</p>
                  <p className="mt-1 text-sm font-semibold text-slate-50">
                    {formatToken(currentRead.recognitionTier)} / {currentRead.knownModelName ? formatToken(currentRead.knownModelName) : "no full model"} / {formatToken(currentRead.scalpStatus)}
                  </p>
                </div>
                <Badge variant={currentRead.recognitionTier === "full_model" ? "success" : currentRead.recognitionTier === "insufficient_data" ? "danger" : "warning"}>
                  {formatToken(currentRead.universalRecognition?.laneRecommendation)}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-violet-50">
                {currentRead.recognitionOpportunitySummary} PD focus: {currentRead.pdArrayFocus ? formatToken(currentRead.pdArrayFocus) : "pending"}. Next: {currentRead.universalRecognition?.nextAction ?? currentRead.nextAction}
              </p>
            </div>
            <div data-testid="ict-model-quality-lane-summary" className="mb-4 rounded-lg border border-cyan-300/15 bg-cyan-300/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Model Quality Lane</p>
              <p className="mt-1 text-sm font-semibold text-slate-50">
                {currentRead.modelDetected ? formatToken(currentRead.modelName) : "No model detected"} / {modelLane} / {paperWatchlistEligible ? "paper-test only" : "not paper eligible"}
              </p>
              <p className="mt-2 text-xs leading-5 text-cyan-100">
                {currentRead.paperWatchlistReason ?? "No model-quality reason was supplied."} Evidence: {currentRead.paperWatchlistEvidenceSummary ?? "compact evidence pending."} Hypothesis: {currentRead.selfImprovementHypothesisQueued ? "queued - needs replay validation" : currentRead.selfImprovementHypothesisReason ?? "not queued"}. Next action: {researchSignal.nextAction}
              </p>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Index SMT / Relative Strength</p>
                <p className="mt-1 text-xs text-slate-400">
                  Confirmation layer only. It can confirm, reject, or adjust confidence on existing ICT candidates, but it cannot create standalone signals.
                </p>
              </div>
              <Badge variant={smtVariant(currentRead.smtStatus)}>{smtLabel(currentRead.smtStatus)}</Badge>
            </div>
            {packet.indexSmt ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <AdvisorMini label="Index group" value="USTECH / US500 / US30" />
                  <AdvisorMini label="SMT type" value={formatToken(packet.indexSmt.divergenceType)} />
                  <AdvisorMini label="Confirms candidate" value={packet.indexSmt.confirmsCandidate ? "yes" : "no"} />
                  <AdvisorMini label="Rejects candidate" value={packet.indexSmt.rejectsCandidate ? "yes" : "no"} />
                  <AdvisorMini label="Confidence adjustment" value={`${Math.round(packet.indexSmt.confidenceAdjustment * 100)} pts`} />
                  <AdvisorMini label="RS leader" value={packet.indexSmt.relativeStrengthLeader ?? "n/a"} />
                  <AdvisorMini label="RS weakness" value={packet.indexSmt.relativeWeaknessLeader ?? "n/a"} />
                  <AdvisorMini label="Journal" value={`${packet.indexSmtJournalEvents.length} compact SMT events`} />
                </div>
                <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-slate-300">
                  {packet.indexSmt.reason}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {packet.indexSmt.instruments.map((instrument) => (
                    <AdvisorMini
                      key={instrument.brokerSymbol}
                      label={instrument.displayLabel}
                      value={`${instrument.dataStatus} / ${typeof instrument.relativeChangePct === "number" ? `${instrument.relativeChangePct.toFixed(2)}%` : "n/a"}`}
                      detail={`buy sweep ${instrument.sweptBuySide ? "yes" : "no"} / sell sweep ${instrument.sweptSellSide ? "yes" : "no"}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Index SMT is waiting for the active index futures research context.
              </p>
            )}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ICT News / Session Risk Governor</p>
                <p className="mt-1 text-xs text-slate-400">
                  Confirms acceptable timing or downgrades/rejects existing ICT candidates. It cannot create standalone signals, change readiness, or create execution intent.
                </p>
              </div>
              <Badge variant={riskVariant(currentRead.riskStatus)}>{riskLabel(currentRead.riskStatus)}</Badge>
            </div>
            {packet.newsSessionRisk ? (
              <>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <AdvisorMini label="News risk level" value={formatToken(packet.newsSessionRisk.newsRiskLevel)} />
                  <AdvisorMini label="Session state" value={formatToken(packet.newsSessionRisk.sessionRiskState)} detail={`${formatToken(packet.newsSessionRisk.session.sessionName)} ${packet.newsSessionRisk.session.localTime}`} />
                  <AdvisorMini label="Action" value={formatToken(packet.newsSessionRisk.riskGovernorAction)} />
                  <AdvisorMini label="Confidence adjustment" value={`${Math.round(packet.newsSessionRisk.riskGovernorConfidenceAdjustment * 100)} pts`} />
                  <AdvisorMini label="Blocking events" value={packet.newsSessionRisk.blockingEventsCount.toLocaleString()} />
                  <AdvisorMini label="Caution events" value={packet.newsSessionRisk.cautionEventsCount.toLocaleString()} />
                  <AdvisorMini label="Timing zone" value={packet.newsSessionRisk.session.timingZone} />
                  <AdvisorMini label="Journal" value={`${packet.newsSessionRiskJournalEvents.length} compact events`} />
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  <AdvisorList
                    label="Risk notes"
                    values={packet.newsSessionRisk.newsSessionRiskNotes}
                    empty="none"
                  />
                  <AdvisorList
                    label="Blocking / caution events"
                    values={[
                      ...packet.newsSessionRisk.blockingEvents.map((event) => `${event.title}: ${event.riskLevel}`),
                      ...packet.newsSessionRisk.cautionEvents.map((event) => `${event.title}: ${event.riskLevel}`)
                    ]}
                    empty="none"
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                News/session governor is waiting for an ICT candidate timestamp.
              </p>
            )}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Phase 1 signals</p>
              <div className="mt-3 grid gap-2">
                {phaseOneSignals.map((signal) => (
                  <div key={signal.strategyId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{signal.strategyId}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={signal.decision === "research_only" ? "success" : "warning"}>{formatToken(signal.decision)}</Badge>
                        <Badge variant="secondary">{pct(signal.confidence)}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{formatIctAdvisorSignalSummary(signal)}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{signal.summary}</p>
                    {signal.noTradeReasons.length ? (
                      <p className="mt-2 text-xs leading-5 text-amber-100">Blocked: {signal.noTradeReasons.slice(0, 3).join("; ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Phase 2 models</p>
              <div className="mt-3 grid gap-2">
                {phaseTwoSignals.map((signal) => (
                  <div key={signal.strategyId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">{signal.strategyId}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={statusVariant(signal.approvedProfileDecision?.status)}>{formatToken(signal.approvedProfileDecision?.status)}</Badge>
                        <Badge variant={signal.decision === "research_only" ? "success" : "warning"}>{formatToken(signal.decision)}</Badge>
                        <Badge variant="secondary">{pct(signal.confidence)}</Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{formatIctAdvisorSignalSummary(signal)}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-300">{signal.summary}</p>
                    {signal.orderBlock ? (
                      <p className="mt-2 text-xs leading-5 text-cyan-100">
                        {formatToken(signal.orderBlock.variant)} / {signal.orderBlock.direction} / {signal.orderBlock.reason}
                      </p>
                    ) : null}
                    {signal.noTradeReasons.length ? (
                      <p className="mt-2 text-xs leading-5 text-amber-100">Blocked: {signal.noTradeReasons.slice(0, 3).join("; ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recommended signal detail</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <AdvisorList label="No-trade reasons" values={recommended?.noTradeReasons ?? []} empty="none" />
                <AdvisorList label="Model reasons" values={packet.compactSummary.primaryModelDetection?.modelReasons ?? []} empty="none" />
                <AdvisorList label="Model missing evidence" values={packet.compactSummary.primaryModelDetection?.missingEvidence ?? []} empty="none" />
                <AdvisorList label="Approved profile reasons" values={packet.approvedProfileDecision.approvedReasons} empty="none" />
                <AdvisorList label="Rejection reasons" values={packet.approvedProfileDecision.rejectionReasons} empty="none" />
                <AdvisorList label="Watchlist reasons" values={packet.approvedProfileDecision.watchlistReasons} empty="none" />
                <AdvisorList label="Risk notes" values={recommended?.riskNotes ?? []} empty="none" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Packet safety</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300">
                <AdvisorMini label="Raw candles" value={packet.safetyLocks.rawCandlesIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Raw snapshots" value={packet.safetyLocks.rawSnapshotsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Secrets" value={packet.safetyLocks.secretsIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Account/order/position" value={packet.safetyLocks.accountDataIncluded || packet.safetyLocks.orderDataIncluded || packet.safetyLocks.positionDataIncluded ? "included" : "excluded"} />
                <AdvisorMini label="Authority" value={`${packet.authority.executionAuthority}/${packet.authority.brokerAuthority}/${packet.authority.readinessOverrideAuthority}`} />
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ICT Replay Validation</p>
                <p className="mt-1 text-xs text-slate-400">
                  Research-only historical replay of compact ICT advisor signals. Raw candles are used internally and excluded from the report.
                </p>
              </div>
              <Badge variant="danger">authority none</Badge>
            </div>
            <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              Replay validation is manual-only in the Advisor workspace. Use Manual Replay Review to run the browser-safe replay action; this summary panel does not auto-run replay, scorecard, optimizer, or Monte Carlo work.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
          {error ?? "ICT Advisor is waiting for the active canonical research source to hydrate."}
        </p>
      )}
    </section>
  );
}

function DecisionExplanationPanel({
  compact = false,
  explanation
}: {
  compact?: boolean;
  explanation: IctResearchAdvisorDecisionExplanation;
}) {
  const visibleSections = compact
    ? explanation.sections.filter((section) => section.id !== "source_context")
    : explanation.sections;
  return (
    <div
      data-testid="research-advisor-decision-explanation"
      className="mt-4 rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_16%_0%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(135deg,rgba(2,6,23,0.72),rgba(15,23,42,0.58))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Decision Explanation</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Deterministic current-read audit for {explanation.brokerSymbol} -&gt; {explanation.requestedSymbol}. Source {formatToken(explanation.packetSource)}, depth {formatToken(explanation.analysisDepthStatus)}, weekly bias {formatToken(explanation.weeklyBiasDirection)} / {formatToken(explanation.weeklyBiasStatus)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">hydration {formatToken(explanation.candleHydrationStatus)}</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">compact only</Badge>
        </div>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-2" : "lg:grid-cols-3"}`}>
        {visibleSections.map((section) => (
          <article key={section.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{section.label}</p>
              <Badge variant={decisionStatusVariant(section.status)}>{formatToken(section.status)}</Badge>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-100">{section.reason}</p>
            <p className="mt-2 text-xs leading-5 text-cyan-100">Next: {section.nextAction}</p>
            {compact ? null : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {section.facts.slice(0, 5).map((fact) => (
                  <span key={fact} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-400">
                    {fact}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function StrategyCalibrationPanel({
  compact = false,
  summary
}: {
  compact?: boolean;
  summary: StrategyCalibrationSummary;
}) {
  return (
    <div
      data-testid="ict-strategy-calibration-summary"
      className={`mt-4 rounded-2xl border border-emerald-300/15 bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,rgba(2,6,23,0.62),rgba(15,23,42,0.66))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${compact ? "mb-1" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Strategy Calibration</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Compact recognition audit from the current read. The full 90-day strategy calibration audit is manual CLI only and never runs on Advisor or Dashboard load.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">manual CLI audit</Badge>
          <Badge variant="danger">authority none</Badge>
          <Badge variant="secondary">compact only</Badge>
        </div>
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-4"}`}>
        <AdvisorMini
          label="What GoTrader sees"
          value={summary.whatGoTraderSees}
          detail={summary.whatGoTraderSeesDetail}
        />
        <AdvisorMini
          label="What it missed"
          value={summary.whatItMissed}
          detail={summary.whatItMissedDetail}
        />
        <AdvisorMini
          label="Strongest evidence"
          value={summary.strongestModelEvidence}
          detail={summary.strongestModelEvidenceDetail}
        />
        <AdvisorMini
          label="Weakest blocker"
          value={summary.weakestBlocker}
          detail={summary.weakestBlockerDetail}
        />
      </div>
      <p className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/10 p-3 text-xs leading-5 text-emerald-50">
        Next calibration recommendation: {summary.nextCalibrationRecommendation}
      </p>
    </div>
  );
}

function AdvisorMini({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function AdvisorList({ empty, label, values }: { empty: string; label: string; values: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{values.length ? values.slice(0, 4).join("; ") : empty}</p>
    </div>
  );
}
