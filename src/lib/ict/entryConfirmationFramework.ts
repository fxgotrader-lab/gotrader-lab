import type { Candle, FairValueGap, MarketStructureEvent } from "@/lib/types";
import type {
  GrinchEntryConfirmationResult,
  GrinchModelOnePowerThreeResult,
  GrinchPdArray,
  GrinchTimePriceAlignment
} from "@/lib/strategyLibrary/grinchStrategyTypes";

const latestIndex = <T extends { index: number }>(items: T[]) => [...items].sort((a, b) => b.index - a.index)[0];

export function evaluateEntryConfirmation({
  candles,
  fairValueGaps,
  modelOne,
  pdArrays,
  structureEvents,
  timePriceAlignment
}: {
  candles: Candle[];
  fairValueGaps: FairValueGap[];
  modelOne: GrinchModelOnePowerThreeResult;
  pdArrays: GrinchPdArray[];
  structureEvents: MarketStructureEvent[];
  timePriceAlignment: GrinchTimePriceAlignment;
}): GrinchEntryConfirmationResult {
  const reasons: string[] = [];
  const missingEvidence: string[] = [];
  const respectedArray = pdArrays.find((array) => array.respected);
  const activeArray = respectedArray ?? pdArrays.find((array) => array.active);
  const latestStructure = latestIndex(structureEvents);
  const latestGap = latestIndex(fairValueGaps.filter((gap) => gap.createdByDisplacement));
  const latestCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const body = latestCandle ? Math.abs(latestCandle.close - latestCandle.open) : 0;
  const priorRange = previousCandle ? Math.max(0.01, previousCandle.high - previousCandle.low) : 0.01;

  const pdArrayRespect = Boolean(respectedArray);
  const meanThresholdRespect = Boolean(activeArray && !activeArray.violated);
  const displacementAway = Boolean(latestStructure?.displacement === "strong" || body > priorRange * 1.2);
  const mssOrBos = Boolean(latestStructure);
  const newFvgAfterDisplacement = Boolean(latestGap && (!latestStructure || latestGap.index >= latestStructure.index - 2));
  const timeWindowAlignment =
    timePriceAlignment.timingGrade === "ideal" ||
    timePriceAlignment.timingGrade === "acceptable" ||
    (modelOne.modelOneState === "valid" && timePriceAlignment.timingGrade === "late");

  if (pdArrayRespect) {
    reasons.push(`${respectedArray!.label} respected.`);
  } else {
    missingEvidence.push("PD array respect is not confirmed.");
  }
  if (meanThresholdRespect) {
    reasons.push("Active PD array mean threshold has not been materially violated.");
  } else {
    missingEvidence.push("Mean-threshold respect is missing or violated.");
  }
  if (displacementAway) {
    reasons.push("Displacement away from the reference area is present.");
  } else {
    missingEvidence.push("Displacement away from the reference area is missing.");
  }
  if (mssOrBos) {
    reasons.push(`${latestStructure!.type} confirms market-structure participation.`);
  } else {
    missingEvidence.push("No MSS/BOS confirmation is present.");
  }
  if (newFvgAfterDisplacement) {
    reasons.push("New displacement FVG is available for lower-timeframe confirmation.");
  } else {
    missingEvidence.push("No new FVG after displacement is available.");
  }
  if (timeWindowAlignment) {
    reasons.push(timePriceAlignment.reason);
  } else {
    missingEvidence.push(timePriceAlignment.reason);
  }

  const score =
    Number(pdArrayRespect) * 0.22 +
    Number(meanThresholdRespect) * 0.16 +
    Number(displacementAway) * 0.2 +
    Number(mssOrBos) * 0.16 +
    Number(newFvgAfterDisplacement) * 0.14 +
    Number(timeWindowAlignment) * 0.12;

  return {
    pdArrayRespect,
    meanThresholdRespect,
    displacementAway,
    mssOrBos,
    newFvgAfterDisplacement,
    timeWindowAlignment,
    confirmationScore: Number(score.toFixed(2)),
    reasons,
    missingEvidence
  };
}
