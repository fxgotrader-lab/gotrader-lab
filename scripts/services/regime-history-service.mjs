import fs from "node:fs";
import path from "node:path";

const safetyNotice = "Research-only regime classification. No broker execution, order placement, or readiness override.";

export const defaultRegimeHistoryPath = path.join(process.cwd(), "state", "regime_history.jsonl");

export function compactRegimeHistoryRecord(classification) {
  return {
    recordId: `regime_history_${classification.sourceFingerprint}`,
    timestamp: classification.timestamp ?? new Date().toISOString(),
    source: "gotrader_composite_regime_classifier",
    classification: {
      regimeId: classification.regimeId,
      label: classification.label,
      instantaneousLabel: classification.instantaneousLabel,
      stableLabel: classification.stableLabel,
      transitionPending: classification.transitionPending,
      confidence: classification.confidence,
      dataQuality: classification.dataQuality,
      scores: classification.scores,
      supportingFactors: (classification.supportingFactors ?? []).slice(0, 10),
      conflictScore: classification.conflictScore,
      recommendedBehavior: classification.recommendedBehavior,
      missingInputs: (classification.missingInputs ?? []).slice(0, 10),
      warnings: (classification.warnings ?? []).slice(0, 10),
      symbol: classification.symbol,
      timeframe: classification.timeframe,
      candleCount: classification.candleCount,
      sourceFingerprint: classification.sourceFingerprint
    },
    safetyNotice
  };
}

export function appendRegimeHistoryJsonl(classification, filePath = defaultRegimeHistoryPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record = compactRegimeHistoryRecord(classification);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

