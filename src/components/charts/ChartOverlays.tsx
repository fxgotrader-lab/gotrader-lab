import type { TradingChartLineOverlay, TradingChartMarker, TradingChartZoneOverlay } from "@/lib/charting";
import { safeArray } from "@/lib/utils";

export function ChartOverlays({
  lineOverlays,
  markers,
  overlayVisibility,
  zoneOverlays
}: {
  lineOverlays: TradingChartLineOverlay[];
  markers: TradingChartMarker[];
  overlayVisibility: Record<string, boolean>;
  zoneOverlays: TradingChartZoneOverlay[];
}) {
  const visibleLines = safeArray(lineOverlays).filter((overlay) => overlayVisibility[overlay.id]);
  const visibleZones = safeArray(zoneOverlays).filter((zone) => overlayVisibility[zone.id]);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[70%] flex-wrap gap-2 md:flex">
      {visibleLines.slice(0, 6).map((overlay) => (
        <span
          className="rounded-full border border-white/10 bg-slate-950/75 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-slate-300 backdrop-blur"
          key={overlay.id}
        >
          {overlay.label}
        </span>
      ))}
      {visibleZones.slice(0, 4).map((zone) => (
        <span
          className="rounded-full border border-white/10 bg-slate-950/75 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-slate-300 backdrop-blur"
          key={zone.id}
        >
          {zone.label}
        </span>
      ))}
      {markers.length ? (
        <span className="rounded-full border border-cyan-300/20 bg-cyan-950/60 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">
          {markers.length} markers
        </span>
      ) : null}
    </div>
  );
}
