import type { TradingChartLineOverlay, TradingChartSourceMeta, TradingChartZoneOverlay } from "@/lib/charting";
import { safeArray } from "@/lib/utils";

const sourceBadgeClass = (source: TradingChartSourceMeta) => {
  if (source.isImported) {
    return "border-cyan-300/40 bg-cyan-300/15 text-cyan-100";
  }
  if (source.isReplay) {
    return "border-amber-300/40 bg-amber-300/15 text-amber-100";
  }
  if (source.sourceType === "tradingview_mcp_chart") {
    return "border-sky-300/40 bg-sky-300/15 text-sky-100";
  }
  if (source.sourceType === "mt5_read_only") {
    return "border-emerald-300/40 bg-emerald-300/15 text-emerald-100";
  }
  if (source.isMock) {
    return "border-slate-300/30 bg-slate-300/10 text-slate-200";
  }
  return "border-purple-300/40 bg-purple-300/15 text-purple-100";
};

const formatTimestamp = (timestamp?: string) => timestamp ? new Date(timestamp).toLocaleString() : "n/a";
const formatClose = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "n/a";

export function ChartToolbar({
  lineOverlays,
  onToggleOverlay,
  overlayVisibility,
  source,
  stateLabel,
  zoneOverlays
}: {
  lineOverlays: TradingChartLineOverlay[];
  onToggleOverlay: (id: string) => void;
  overlayVisibility: Record<string, boolean>;
  source: TradingChartSourceMeta;
  stateLabel?: string;
  zoneOverlays: TradingChartZoneOverlay[];
}) {
  const visibleOverlayCount = safeArray(lineOverlays).filter((overlay) => overlayVisibility[overlay.id]).length;
  const visibleZoneCount = safeArray(zoneOverlays).filter((zone) => overlayVisibility[zone.id]).length;
  const sourceBadge = source.isLive
    ? "LIVE"
    : source.sourceType === "tradingview_mcp_chart"
      ? "TRADINGVIEW MCP"
      : source.sourceType === "mt5_read_only"
        ? "MT5 READ-ONLY"
      : source.isImported
        ? "IMPORTED"
        : source.isReplay
          ? "REPLAY"
          : source.sourceType === "live_placeholder"
            ? "LIVE NOT CONNECTED"
            : "MOCK";

  return (
    <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-950/90 px-3 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${sourceBadgeClass(source)}`}>
            {sourceBadge}
          </span>
          {source.sourceType === "tradingview_mcp_chart" ? (
            <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-sky-100">
              Read-only, not broker truth
            </span>
          ) : null}
          {source.sourceType === "mt5_read_only" ? (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-emerald-100">
              Read-only, no execution
            </span>
          ) : null}
          {source.sourceType === "live_placeholder" ? (
            <span className="rounded-full border border-purple-300/30 bg-purple-300/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-purple-100">
              Future live not connected
            </span>
          ) : null}
          <span className="font-mono text-sm text-slate-100">
            {source.symbol} {source.timeframe}
          </span>
          {stateLabel ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.16em] text-slate-300">
              {stateLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">
          {source.sourceLabel} | {source.candleCount.toLocaleString()} candles | first {formatTimestamp(source.firstTimestamp)} /{" "}
          {formatClose(source.firstClose)} | last {formatTimestamp(source.lastTimestamp)} / {formatClose(source.lastClose)}
        </p>
      </div>
      <div className="flex flex-wrap justify-start gap-2 md:max-w-[48rem] md:justify-end">
        {[...lineOverlays, ...zoneOverlays].map((overlay) => (
          <button
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              overlayVisibility[overlay.id]
                ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-white/20 hover:text-slate-100"
            }`}
            key={overlay.id}
            onClick={() => onToggleOverlay(overlay.id)}
            type="button"
          >
            {overlay.label}
          </button>
        ))}
        {!lineOverlays.length && !zoneOverlays.length ? (
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-slate-500">No overlays</span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs text-slate-500">
            {visibleOverlayCount + visibleZoneCount} shown
          </span>
        )}
      </div>
    </div>
  );
}
