import type { RegimeClassification, RegimeHistoryRecord } from "@/lib/regime/regimeTypes";

export const REGIME_HISTORY_UPDATED_EVENT = "gotrader-regime-history-updated";
export const REGIME_HISTORY_STORAGE_KEY = "gotrader-ai-lab-regime-history";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const safetyNotice: RegimeHistoryRecord["safetyNotice"] =
  "Research-only regime classification. No broker execution, order placement, or readiness override.";

export function createRegimeHistoryRecord(classification: RegimeClassification): RegimeHistoryRecord {
  return {
    recordId: `regime_history_${classification.sourceFingerprint}`,
    timestamp: classification.timestamp,
    source: "gotrader_composite_regime_classifier",
    classification,
    safetyNotice
  };
}

export function loadRegimeClassificationHistory(limit = 50): RegimeClassification[] {
  if (!isBrowser()) {
    return [];
  }
  const raw = window.localStorage.getItem(REGIME_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as RegimeHistoryRecord[];
    return parsed
      .map((record) => record.classification)
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    window.localStorage.removeItem(REGIME_HISTORY_STORAGE_KEY);
    return [];
  }
}

export function appendRegimeClassificationHistory(classification: RegimeClassification, limit = 50) {
  if (!isBrowser()) {
    return classification;
  }
  const current = loadRegimeClassificationHistory(limit).map(createRegimeHistoryRecord);
  if (current[0]?.classification.sourceFingerprint === classification.sourceFingerprint) {
    return classification;
  }
  const records = [createRegimeHistoryRecord(classification), ...current].slice(0, limit);
  try {
    window.localStorage.setItem(REGIME_HISTORY_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(REGIME_HISTORY_UPDATED_EVENT, { detail: classification }));
  } catch {
    try {
      window.localStorage.setItem(REGIME_HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, 10)));
    } catch {
      window.localStorage.removeItem(REGIME_HISTORY_STORAGE_KEY);
    }
  }
  return classification;
}

