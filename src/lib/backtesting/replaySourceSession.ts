import type { BacktestSourcePreference, ResolvedBacktestCandleSource } from "@/lib/backtesting/backtestSourceResolver";

export const REPLAY_SNAPSHOT_SOURCE_META_KEY = "gotrader-ai-lab-replay-snapshot-source-meta";

export interface ReplaySnapshotSourceMeta {
  authority: ResolvedBacktestCandleSource["authority"];
  brokerSymbol?: string;
  candleCount: number;
  createdAt: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
  mode: BacktestSourcePreference;
  provider: ResolvedBacktestCandleSource["provider"];
  requestedSymbol: string;
  snapshotId: string;
  sourceFingerprint: string;
  sourceId: string;
  sourceLabel: string;
  timeframe: string;
  warnings: string[];
}

const isBrowser = () => typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const shortIdFrom = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").slice(-16) || "snapshot";

export const buildReplaySnapshotSourceMeta = (
  source: ResolvedBacktestCandleSource,
  mode: BacktestSourcePreference,
  createdAt = new Date().toISOString()
): ReplaySnapshotSourceMeta => ({
  authority: source.authority,
  brokerSymbol: source.brokerSymbol,
  candleCount: source.candles.length,
  createdAt,
  firstTimestamp: source.firstTimestamp,
  lastTimestamp: source.lastTimestamp,
  mode,
  provider: source.provider,
  requestedSymbol: source.requestedSymbol,
  snapshotId: `replay_snapshot_${shortIdFrom(`${source.sourceFingerprint}${createdAt}`)}`,
  sourceFingerprint: source.sourceFingerprint,
  sourceId: source.sourceId,
  sourceLabel: source.label,
  timeframe: source.candles[0]?.timeframe ?? source.appliedSettings.targetTimeframe,
  warnings: source.sourceWarnings
});

export const storeReplaySnapshotSourceMeta = (
  source: ResolvedBacktestCandleSource,
  mode: BacktestSourcePreference,
  createdAt = new Date().toISOString()
) => {
  const meta = buildReplaySnapshotSourceMeta(source, mode, createdAt);
  if (isBrowser()) {
    window.sessionStorage.setItem(REPLAY_SNAPSHOT_SOURCE_META_KEY, JSON.stringify(meta));
  }
  return meta;
};

export const loadReplaySnapshotSourceMeta = (): ReplaySnapshotSourceMeta | undefined => {
  if (!isBrowser()) {
    return undefined;
  }
  try {
    const raw = window.sessionStorage.getItem(REPLAY_SNAPSHOT_SOURCE_META_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<ReplaySnapshotSourceMeta>;
    return parsed.sourceFingerprint && parsed.provider && parsed.createdAt
      ? {
          authority: parsed.authority ?? {
            executionAuthority: "none",
            brokerAuthority: "none",
            readinessOverrideAuthority: "none"
          },
          brokerSymbol: parsed.brokerSymbol,
          candleCount: parsed.candleCount ?? 0,
          createdAt: parsed.createdAt,
          firstTimestamp: parsed.firstTimestamp,
          lastTimestamp: parsed.lastTimestamp,
          mode: parsed.mode ?? "active_research",
          provider: parsed.provider,
          requestedSymbol: parsed.requestedSymbol ?? "MNQ",
          snapshotId: parsed.snapshotId ?? `replay_snapshot_${shortIdFrom(parsed.sourceFingerprint)}`,
          sourceFingerprint: parsed.sourceFingerprint,
          sourceId: parsed.sourceId ?? parsed.sourceFingerprint,
          sourceLabel: parsed.sourceLabel ?? "Replay snapshot",
          timeframe: parsed.timeframe ?? "5m",
          warnings: parsed.warnings ?? []
        }
      : undefined;
  } catch {
    return undefined;
  }
};

export const clearReplaySnapshotSourceMeta = () => {
  if (isBrowser()) {
    window.sessionStorage.removeItem(REPLAY_SNAPSHOT_SOURCE_META_KEY);
  }
};
