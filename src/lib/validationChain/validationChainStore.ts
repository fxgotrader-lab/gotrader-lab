import {
  VALIDATION_CHAIN_AUTHORITY,
  type ValidationChainEntry,
  type ValidationChainState
} from "./validationChainTypes";

export const VALIDATION_CHAIN_STORAGE_KEY = "gotrader.validation-chain.v1";
export const VALIDATION_CHAIN_UPDATED_EVENT = "gotrader:validation-chain-updated";
const MAX_ENTRIES = 20;

const emptyState = (): ValidationChainState => ({
  updatedAt: new Date().toISOString(),
  researchOnly: true,
  entries: [],
  authority: VALIDATION_CHAIN_AUTHORITY
});

export const readValidationChainState = (): ValidationChainState => {
  if (typeof window === "undefined") {
    return emptyState();
  }
  try {
    const raw = window.localStorage.getItem(VALIDATION_CHAIN_STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw) as ValidationChainState;
    if (!Array.isArray(parsed.entries)) {
      return emptyState();
    }
    return { ...parsed, authority: VALIDATION_CHAIN_AUTHORITY, researchOnly: true };
  } catch {
    return emptyState();
  }
};

const persist = (state: ValidationChainState): ValidationChainState => {
  if (typeof window === "undefined") {
    return state;
  }
  try {
    // Compact summaries only: refuse to persist anything carrying raw candles.
    const serialized = JSON.stringify(state);
    if (/"candles"\s*:/i.test(serialized)) {
      throw new Error("Validation chain state must not contain raw candle arrays.");
    }
    window.localStorage.setItem(VALIDATION_CHAIN_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(VALIDATION_CHAIN_UPDATED_EVENT));
  } catch {
    // Storage unavailable: state remains in-memory for this call only.
  }
  return state;
};

export const saveValidationChainEntry = (entry: ValidationChainEntry): ValidationChainState => {
  const state = readValidationChainState();
  const existing = state.entries.filter((item) => item.recognitionId !== entry.recognitionId);
  const entries = [entry, ...existing].slice(0, MAX_ENTRIES);
  return persist({
    ...state,
    updatedAt: new Date().toISOString(),
    latestRecognitionId: entry.recognitionId,
    entries
  });
};

export const latestValidationChainEntry = (
  state: ValidationChainState = readValidationChainState()
): ValidationChainEntry | undefined =>
  state.entries.find((entry) => entry.recognitionId === state.latestRecognitionId) ?? state.entries[0];

export const updateLatestValidationChainEntry = (
  update: (entry: ValidationChainEntry) => ValidationChainEntry
): ValidationChainEntry | undefined => {
  const latest = latestValidationChainEntry();
  if (!latest) {
    return undefined;
  }
  const next = update(latest);
  saveValidationChainEntry(next);
  return next;
};
