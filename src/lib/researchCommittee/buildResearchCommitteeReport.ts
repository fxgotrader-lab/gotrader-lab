import type { ResearchRuntimeSnapshot } from "@/lib/runtime";
import {
  buildResearchDecisionLogBundle,
  researchDecisionAuthorityNone,
  type ResearchDecisionLogEntry,
  type ResearchDecisionVerdict
} from "@/lib/researchDecisionLog";
import { safeTopN, uid } from "@/lib/utils";

import type { ResearchCommitteeReport, ResearchCommitteeSection } from "./researchCommitteeTypes";
import { buildResearchReadinessDistinction } from "./researchReadinessDistinction";

const pct = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";

const rValue = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}R` : "n/a";

const compact = (values: Array<string | undefined | null>, fallback: string, max = 5) => {
  const unique = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
  return unique.length ? safeTopN(unique, max) : [fallback];
};

function buildBullCase(entry: ResearchDecisionLogEntry): ResearchCommitteeSection {
  const supportiveMetrics = [
    entry.source.candleCount >= 400 ? `${entry.source.provider} source has ${entry.source.candleCount.toLocaleString()} candles.` : undefined,
    entry.regime.dataQuality === "sufficient" ? `Regime evidence is sufficient: ${entry.regime.label}.` : undefined,
    entry.metrics.trades > 0 ? `${entry.metrics.trades} simulated trade(s), ${pct(entry.metrics.winRate)} win rate.` : undefined,
    entry.metrics.averageR !== null && entry.metrics.averageR > 0 ? `Average R is positive at ${rValue(entry.metrics.averageR)}.` : undefined,
    entry.source.sourceFingerprint ? "Source fingerprint is recorded." : undefined
  ];

  return {
    title: "Bull Case",
    status: supportiveMetrics.some(Boolean) ? "supportive" : "insufficient",
    summary: "Evidence that supports continuing research on this setup without changing safety posture.",
    evidence: compact(supportiveMetrics, "No strong supportive evidence is available yet."),
    limitations: compact(
      [
        entry.grinch.blocker ? `Grinch refinement blocker remains: ${entry.grinch.blocker.replace(/_/g, " ")}.` : undefined,
        entry.walkForward?.verdict ? `Walk-forward verdict is ${entry.walkForward.verdict.replace(/_/g, " ")}.` : undefined,
        entry.quality.evidenceScore !== null ? `Evidence score ${entry.quality.evidenceScore}/100.` : undefined
      ],
      "No limitations recorded in the compact decision log."
    )
  };
}

function buildBearCase(entry: ResearchDecisionLogEntry): ResearchCommitteeSection {
  const blockers = compact(
    [
      ...entry.blockers,
      entry.grinch.expansionReplayResult?.failureReason,
      entry.metrics.trades === 0 ? "No simulated trades were generated." : undefined,
      entry.walkForward?.verdict === "fail" || entry.walkForward?.verdict === "insufficient_evidence"
        ? `Walk-forward verdict blocks stronger confidence: ${entry.walkForward.verdict.replace(/_/g, " ")}.`
        : undefined
    ],
    "No blocking bear-case evidence was recorded."
  );

  return {
    title: "Bear Case",
    status: blockers[0] === "No blocking bear-case evidence was recorded." ? "insufficient" : "blocking",
    summary: "Evidence that argues against trusting the current full-stack ICT/Grinch setup.",
    evidence: blockers,
    limitations: compact(
      [
        entry.source.provider === "mt5_read_only" ? "MT5 USTECH is CFD/proxy data, not CME MNQ futures truth." : undefined,
        "This report is deterministic and uses existing GoTrader outputs only."
      ],
      "No bear-case limitations recorded."
    )
  };
}

function nextActionsFor(verdict: ResearchDecisionVerdict, entry: ResearchDecisionLogEntry) {
  if (verdict === "reject_current_setup") {
    return compact(
      [
        "Reject the current setup for this window.",
        entry.grinch.expansionReplayResult?.recommendation,
        "Keep collecting MT5 read-only candles and wait for cleaner Grinch expansion evidence."
      ],
      "Reject current setup and wait for better evidence."
    );
  }
  if (verdict === "run_walk_forward") {
    return ["Run walk-forward validation on the active canonical source.", "Keep source/provider labels attached to the result."];
  }
  if (verdict === "run_calibration_test") {
    return ["Run the strongest current Grinch calibration family in research-only mode.", "Do not alter production thresholds."];
  }
  if (verdict === "draft_self_improvement_proposal") {
    return ["Keep proposal draft-only.", "Require AI Research, walk-forward, evidence, maturity, and regime consistency checks."];
  }
  if (verdict === "collect_more_data") {
    return ["Collect more eligible candles/evidence.", "Rerun deterministic research after the active source updates."];
  }
  return ["Observe only.", "No execution or readiness change is permitted."];
}

export function buildResearchCommitteeReport(snapshot: ResearchRuntimeSnapshot): ResearchCommitteeReport {
  const { entry, reflection } = buildResearchDecisionLogBundle(snapshot);
  const bullCase = buildBullCase(entry);
  const bearCase = buildBearCase(entry);
  const readinessDistinction = buildResearchReadinessDistinction(entry);
  const conservativeStatus = entry.blockers.length ? "blocking" : "cautious";
  const balancedStatus = entry.finalResearchVerdict === "reject_current_setup" ? "blocking" : "cautious";

  return {
    reportId: uid("research_committee"),
    generatedAt: new Date().toISOString(),
    sourceProvider: String(entry.source.provider),
    sourceFingerprint: entry.source.sourceFingerprint,
    decisionLogEntry: entry,
    reflectionMemory: reflection,
    bullCase,
    bearCase,
    readinessDistinction,
    riskCommittee: {
      conservativeView: {
        title: "Conservative Risk View",
        status: conservativeStatus,
        summary: entry.blockers.length
          ? "Conservative review blocks promotion because unresolved research blockers remain."
          : "Conservative review allows observation only; no execution path exists.",
        evidence: compact(entry.blockers, "No hard blocker recorded; maintain research-only posture."),
        limitations: ["Research-only risk view. It cannot approve execution or readiness override."]
      },
      balancedView: {
        title: "Balanced Risk View",
        status: balancedStatus,
        summary: entry.finalResearchVerdictReason,
        evidence: [
          `Verdict: ${entry.finalResearchVerdict.replace(/_/g, " ")}.`,
          `Trades: ${entry.metrics.trades}; average R: ${rValue(entry.metrics.averageR)}; drawdown: ${rValue(entry.metrics.drawdown)}.`
        ],
        limitations: ["Balanced view still requires normal evidence, maturity, and walk-forward gates."]
      },
      aggressiveView: {
        title: "Aggressive Research View",
        status: "cautious",
        summary: "The most aggressive allowed action is another research test or observation; it is not an order path.",
        evidence: nextActionsFor(entry.finalResearchVerdict, entry),
        limitations: ["No buy/sell/order/account/position authority is available from this committee."]
      },
      finalRiskChairVerdict:
        !readinessDistinction.paperDemoCandidate
          ? readinessDistinction.riskChairSummary
          : entry.finalResearchVerdict === "reject_current_setup"
          ? "Risk chair rejects the current setup for this window."
          : "Risk chair permits research-only follow-up under existing gates.",
      blockers: entry.blockers
    },
    finalResearchChairSynthesis: {
      verdict: entry.finalResearchVerdict,
      summary: readinessDistinction.paperDemoCandidate
        ? entry.finalResearchVerdictReason
        : `${entry.finalResearchVerdictReason} ${readinessDistinction.riskChairSummary}`,
      nextActions: readinessDistinction.paperDemoCandidate
        ? nextActionsFor(entry.finalResearchVerdict, entry)
        : [
            "Continue research and collect more evidence before Paper-Demo Candidate review.",
            ...readinessDistinction.recommendedNextWork
          ],
      reproducibilityWarning:
        "This GoTrader-native report is deterministic from the current local runtime. Separate LLM advisory text may vary by provider/model and should be treated as non-reproducible commentary."
    },
    authority: researchDecisionAuthorityNone,
    safetyNotice: "Research committee only. No broker execution, no order placement, no readiness override."
  };
}
