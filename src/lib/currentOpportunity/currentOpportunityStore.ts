import type { CurrentOpportunityScan } from "./currentOpportunityTypes";

export const CURRENT_OPPORTUNITY_SCAN_STORAGE_KEY = "gotrader.current-opportunity.latest.v1";
export const CURRENT_OPPORTUNITY_SCAN_UPDATED_EVENT = "gotrader:current-opportunity-scan-updated";

export const saveCurrentOpportunityScan = (scan: CurrentOpportunityScan) => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return { ok: false, reason: "localStorage unavailable" };
  }
  try {
    window.localStorage.setItem(CURRENT_OPPORTUNITY_SCAN_STORAGE_KEY, JSON.stringify(scan));
    window.dispatchEvent(new CustomEvent(CURRENT_OPPORTUNITY_SCAN_UPDATED_EVENT, { detail: { scan } }));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error ?? "save failed") };
  }
};

export const readLatestCurrentOpportunityScan = (): CurrentOpportunityScan | undefined => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CURRENT_OPPORTUNITY_SCAN_STORAGE_KEY) ?? "null");
    if (!parsed?.researchOnly || !Array.isArray(parsed.opportunities)) return undefined;
    return parsed as CurrentOpportunityScan;
  } catch {
    return undefined;
  }
};

export const clearCurrentOpportunityScan = () => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.removeItem(CURRENT_OPPORTUNITY_SCAN_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CURRENT_OPPORTUNITY_SCAN_UPDATED_EVENT, { detail: { scan: undefined } }));
  } catch {
    // Diagnostics-only storage should never block the UI.
  }
};
