import type { ReadinessGateSnapshot } from "@/lib/readiness";
import type { ResearchQualityReview } from "@/lib/researchQuality";
import type { ValidationSuiteReport } from "@/lib/validation";
import type {
  AdvisoryReadinessSummary,
  AdvisoryRequestPacket,
  AdvisoryResearchQualitySummary,
  AdvisoryValidationSummary
} from "@/lib/integrations/openclawHermesTypes";
import type { DebateSession, TradeThesis } from "@/lib/types";
import { uid } from "@/lib/utils";

export const ADVISORY_PACKET_SOURCE = "gotrader_ai_lab" as const;
export const ADVISORY_PACKET_MODE = "advisory_only" as const;
export const ADVISORY_PACKET_SAFETY_NOTICE =
  "This packet is advisory only. It cannot execute trades or override readiness gates." as const;

interface CreateAdvisoryRequestPacketOptions {
  packetId?: string;
  timestamp?: string;
  debateSession?: DebateSession;
  validationReport?: ValidationSuiteReport;
  researchQualityReview?: ResearchQualityReview;
  readinessSnapshot?: ReadinessGateSnapshot;
}

const summarizeValidation = (
  report?: ValidationSuiteReport
): AdvisoryValidationSummary | undefined => {
  if (!report) {
    return undefined;
  }

  const conservativeScenario = report.scenarios.find((scenario) => scenario.id === "conservative-confluence");

  return {
    validationId: report.id,
    generatedAt: report.generatedAt,
    readinessStatus: report.calibration.readinessStatus,
    readinessScore: report.calibration.readinessScore,
    conservativeScenarioStatus: conservativeScenario?.readiness,
    maxDrawdownR: conservativeScenario?.maxDrawdown,
    confidenceCalibration: conservativeScenario?.confidenceCalibration.score
  };
};

const summarizeResearchQuality = (
  review?: ResearchQualityReview
): AdvisoryResearchQualitySummary | undefined => {
  if (!review) {
    return undefined;
  }

  return {
    reviewId: review.id,
    generatedAt: review.generatedAt,
    readinessGrade: review.readinessGrade,
    falsePositiveCount: review.falsePositivePatterns.reduce(
      (total, pattern) => total + pattern.estimatedFalsePositives,
      0
    ),
    topWeaknesses: review.topWeaknesses.map((weakness) => weakness.title)
  };
};

const summarizeReadiness = (
  snapshot?: ReadinessGateSnapshot
): AdvisoryReadinessSummary | undefined => {
  if (!snapshot) {
    return undefined;
  }

  return {
    state: snapshot.state,
    failedRequirements: snapshot.failedRequirements.map((requirement) => requirement.label),
    brokerExecutionDisabled: true
  };
};

export function createAdvisoryRequestPacket(
  thesis: TradeThesis,
  options: CreateAdvisoryRequestPacketOptions = {}
): AdvisoryRequestPacket {
  const ictContext = thesis.ictContext;
  const timestamp = options.timestamp ?? new Date().toISOString();

  return {
    packetId: options.packetId ?? uid("advisory_packet"),
    timestamp,
    source: ADVISORY_PACKET_SOURCE,
    mode: ADVISORY_PACKET_MODE,
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none",
    thesisId: thesis.id,
    symbol: thesis.symbol,
    timeframe: thesis.timeframe,
    ictContextSummary: {
      narrativeSummary: ictContext.narrativeSummary,
      bias: ictContext.bias,
      confluenceScore: ictContext.confluenceScore,
      killZone: ictContext.killZoneTag,
      premiumDiscount: ictContext.premiumDiscount,
      latestSwingHigh: ictContext.latestSwingHigh?.price,
      latestSwingLow: ictContext.latestSwingLow?.price,
      hasBullishMSS: ictContext.hasBullishMSS,
      hasBearishMSS: ictContext.hasBearishMSS,
      hasBullishBOS: ictContext.hasBullishBOS,
      hasBearishBOS: ictContext.hasBearishBOS,
      liquiditySweepCount: ictContext.liquiditySweeps.length,
      fairValueGapCount: ictContext.fairValueGaps.length
    },
    internalAgentDebateSummaries: (options.debateSession?.messages ?? []).map((message) => ({
      agentId: message.agentId,
      agentName: message.agentName,
      bias: message.stance,
      confidence: message.confidence,
      weight: message.weight,
      reasoning: message.message,
      recommendation: message.recommendation,
      supportingFactors: message.supportingFactors ?? [],
      warningFactors: message.warningFactors ?? []
    })),
    cioThesis: {
      bias: thesis.finalBias,
      confidence: thesis.confidence,
      thesisSummary: thesis.thesisSummary,
      reasoningSummary: thesis.reasoningSummary,
      invalidationLevel: thesis.invalidationLevel,
      targetLiquidity: thesis.targetLiquidity
    },
    validationSummary: summarizeValidation(options.validationReport),
    researchQualityGrade: summarizeResearchQuality(options.researchQualityReview),
    readinessStatus: summarizeReadiness(options.readinessSnapshot),
    riskNotes: thesis.riskNotes,
    requestedAdvisoryTasks: [
      "review_thesis",
      "identify_missing_confluence",
      "identify_risk_concerns",
      "suggest_calibration_change",
      "recommend_continue_research",
      "recommend_rerun_validation",
      "recommend_paper_demo_candidate_review"
    ],
    safetyNotice: ADVISORY_PACKET_SAFETY_NOTICE
  };
}
