export type IctBrowserResearchStatus =
  | "idle"
  | "running"
  | "partial"
  | "completed"
  | "unavailable"
  | "failed"
  | "timed_out";

export interface IctBrowserResearchLimits {
  maxSymbolsPerScorecard: number;
  maxCandlesPerSymbol: number;
  maxReplayWindows: number;
  maxOptimizerCandidates: number;
  maxDiagnosticsRows: number;
  maxRuntimeMs: number;
  maxStoredResultBytes: number;
  yieldEveryIterations: number;
}

export const DEFAULT_ICT_BROWSER_RESEARCH_LIMITS: IctBrowserResearchLimits = {
  maxSymbolsPerScorecard: 3,
  maxCandlesPerSymbol: 750,
  maxReplayWindows: 250,
  maxOptimizerCandidates: 50,
  maxDiagnosticsRows: 100,
  maxRuntimeMs: 10_000,
  maxStoredResultBytes: 250_000,
  yieldEveryIterations: 25
};

export const resolveIctBrowserResearchLimits = (
  input: Partial<IctBrowserResearchLimits> = {}
): IctBrowserResearchLimits => ({
  maxSymbolsPerScorecard: Math.max(1, Math.floor(Number(input.maxSymbolsPerScorecard ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxSymbolsPerScorecard))),
  maxCandlesPerSymbol: Math.max(120, Math.floor(Number(input.maxCandlesPerSymbol ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxCandlesPerSymbol))),
  maxReplayWindows: Math.max(25, Math.floor(Number(input.maxReplayWindows ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxReplayWindows))),
  maxOptimizerCandidates: Math.max(1, Math.floor(Number(input.maxOptimizerCandidates ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxOptimizerCandidates))),
  maxDiagnosticsRows: Math.max(10, Math.floor(Number(input.maxDiagnosticsRows ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxDiagnosticsRows))),
  maxRuntimeMs: Math.max(500, Math.floor(Number(input.maxRuntimeMs ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxRuntimeMs))),
  maxStoredResultBytes: Math.max(25_000, Math.floor(Number(input.maxStoredResultBytes ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.maxStoredResultBytes))),
  yieldEveryIterations: Math.max(1, Math.floor(Number(input.yieldEveryIterations ?? DEFAULT_ICT_BROWSER_RESEARCH_LIMITS.yieldEveryIterations)))
});

export const ictBrowserSafeNotice =
  "Browser-safe mode limits symbols, candles, replay windows, diagnostics rows, and optimizer candidates. Use CLI/full replay for exhaustive research.";

export const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const approximateJsonBytes = (value: unknown) => {
  const serialized = JSON.stringify(value ?? null);
  if (typeof Blob !== "undefined") return new Blob([serialized]).size;
  return serialized.length;
};

export const isIctBrowserResearchAbort = (signal?: AbortSignal) => signal?.aborted === true;

export const ictBrowserResearchDeadlineExceeded = (deadlineAt?: number) =>
  typeof deadlineAt === "number" && Date.now() >= deadlineAt;

export const throwIfIctBrowserResearchAborted = (signal?: AbortSignal) => {
  if (isIctBrowserResearchAbort(signal)) {
    throw new DOMException("Research advisor action was cancelled.", "AbortError");
  }
};
