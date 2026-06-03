import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type Time
} from "lightweight-charts";

import { ChartOverlays } from "@/components/charts/ChartOverlays";
import { ChartToolbar } from "@/components/charts/ChartToolbar";
import { missionCandlestickOptions, missionChartOptions } from "@/components/charts/chartTheme";
import type {
  TradingChartCandle,
  TradingChartLineOverlay,
  TradingChartMarker,
  TradingChartPropsData,
  TradingChartZoneOverlay
} from "@/lib/charting";
import { toLightweightMarker } from "@/lib/charting";
import { safeArray } from "@/lib/utils";

const lineStyleFor = (style?: TradingChartLineOverlay["lineStyle"]) => style === "dashed" ? LineStyle.Dashed : LineStyle.Solid;

const lineDataFor = (overlay: TradingChartLineOverlay): LineData<Time>[] =>
  overlay.data
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      time: point.time,
      value: point.value
    }));

export function TradingChart({
  bias,
  candles,
  className,
  heightClassName = "h-[430px]",
  lineOverlays = [],
  markers = [],
  source,
  stateLabel,
  zoneOverlays = []
}: TradingChartPropsData & {
  className?: string;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const markerApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line", Time>[]>([]);
  const lastDataFingerprintRef = useRef<string | undefined>(undefined);
  const lastSourceIdentityRef = useRef<string | undefined>(undefined);
  const [chartError, setChartError] = useState<string>();
  const [overlayVisibility, setOverlayVisibility] = useState<Record<string, boolean>>(() => {
    const entries = [...lineOverlays, ...zoneOverlays].map((overlay) => [overlay.id, overlay.visibleByDefault !== false] as const);
    return Object.fromEntries(entries);
  });

  const sourceKey = source.sourceKey ?? source.dataFingerprint ?? `${source.sourceType}|${source.sourceLabel}|${source.candleCount}|${source.lastTimestamp ?? "none"}`;
  const dataFingerprint = source.dataFingerprint ?? sourceKey;
  const sourceIdentityKey = `${source.sourceType}|${source.sourceLabel}|${source.symbol}|${source.timeframe}`;
  const sortedCandles = useMemo(
    () => safeArray(candles).slice().sort((a, b) => Number(a.time) - Number(b.time)),
    [candles]
  );
  const chartCandleData = useMemo(
    () =>
      sortedCandles.map((candle: TradingChartCandle) => ({
        close: candle.close,
        high: candle.high,
        low: candle.low,
        open: candle.open,
        time: candle.time
      })),
    // The fingerprint intentionally owns chart data identity. Parent snapshots can rebuild arrays
    // without changing the actual candle series; avoid repainting for those no-op renders.
    [dataFingerprint]
  );
  const markerFingerprint = useMemo(
    () => safeArray(markers).map((marker) => `${marker.id}:${marker.time}:${marker.price ?? ""}:${marker.label}`).join("|"),
    [markers]
  );
  const markerData = useMemo(() => safeArray(markers).map(toLightweightMarker), [markerFingerprint]);
  const overlayFingerprint = useMemo(() => {
    const lineSignature = safeArray(lineOverlays)
      .map((overlay) => {
        const first = overlay.data[0];
        const last = overlay.data[overlay.data.length - 1];
        return `${overlay.id}:${overlay.type}:${overlay.data.length}:${first?.time ?? ""}:${first?.value ?? ""}:${last?.time ?? ""}:${last?.value ?? ""}:${overlay.color ?? ""}:${overlay.lineStyle ?? ""}:${overlay.lineWidth ?? ""}`;
      })
      .join("|");
    const zoneSignature = safeArray(zoneOverlays)
      .map((zone) => {
        const topFirst = zone.top.data[0];
        const topLast = zone.top.data[zone.top.data.length - 1];
        const bottomFirst = zone.bottom.data[0];
        const bottomLast = zone.bottom.data[zone.bottom.data.length - 1];
        return `${zone.id}:${zone.type}:${zone.top.data.length}:${topFirst?.time ?? ""}:${topFirst?.value ?? ""}:${topLast?.time ?? ""}:${topLast?.value ?? ""}:${zone.bottom.data.length}:${bottomFirst?.time ?? ""}:${bottomFirst?.value ?? ""}:${bottomLast?.time ?? ""}:${bottomLast?.value ?? ""}`;
      })
      .join("|");
    return `${lineSignature}::${zoneSignature}`;
  }, [lineOverlays, zoneOverlays]);
  const hasCandles = sortedCandles.length > 0;

  useEffect(() => {
    setOverlayVisibility((current) => {
      const next = { ...current };
      let changed = false;
      for (const overlay of [...lineOverlays, ...zoneOverlays]) {
        if (!(overlay.id in next)) {
          next[overlay.id] = overlay.visibleByDefault !== false;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [lineOverlays, zoneOverlays]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasCandles) {
      return undefined;
    }

    let disposed = false;
    let resizeFrame: number | undefined;

    try {
      setChartError(undefined);
      container.replaceChildren();
      const chart = createChart(container, {
        ...missionChartOptions,
        height: Math.max(220, container.clientHeight),
        width: Math.max(320, container.clientWidth)
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, missionCandlestickOptions);
      candleSeriesRef.current = candleSeries;
      markerApiRef.current = createSeriesMarkers(candleSeries, [], {
        zOrder: "top"
      });

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || disposed || !chart) {
          return;
        }
        if (resizeFrame !== undefined) {
          window.cancelAnimationFrame(resizeFrame);
        }
        resizeFrame = window.requestAnimationFrame(() => {
          if (disposed || !chart) {
            return;
          }
          chart.applyOptions({
            height: Math.max(220, entry.contentRect.height),
            width: Math.max(320, entry.contentRect.width)
          });
        });
      });
      observer.observe(container);

      return () => {
        disposed = true;
        if (resizeFrame !== undefined) {
          window.cancelAnimationFrame(resizeFrame);
        }
        observer.disconnect();
        try {
          markerApiRef.current?.setMarkers([]);
        } catch {
          // Lightweight Charts may already have detached marker primitives during route transitions.
        }
        try {
          chart.remove();
        } catch {
          // Chart cleanup must never block React Router from rendering the next page.
        }
        markerApiRef.current = null;
        candleSeriesRef.current = null;
        overlaySeriesRef.current = [];
        lastDataFingerprintRef.current = undefined;
        lastSourceIdentityRef.current = undefined;
        chartRef.current = null;
      };
    } catch (error) {
      setChartError(`Chart render failed. Source remains available. ${error instanceof Error ? error.message : "Chart renderer failed to initialize."}`);
      try {
        chartRef.current?.remove();
      } catch {
        // Keep the page navigable even if the renderer failed mid-initialization.
      }
      markerApiRef.current = null;
      candleSeriesRef.current = null;
      overlaySeriesRef.current = [];
      chartRef.current = null;
      return undefined;
    }
  }, [hasCandles]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || !chartCandleData.length) {
      return;
    }
    try {
      setChartError(undefined);
      candleSeries.setData(chartCandleData);
      const firstDataLoad = !lastDataFingerprintRef.current;
      const sourceSwitched = lastSourceIdentityRef.current !== sourceIdentityKey;
      if (firstDataLoad || sourceSwitched) {
        chart.timeScale().fitContent();
      }
      lastDataFingerprintRef.current = dataFingerprint;
      lastSourceIdentityRef.current = sourceIdentityKey;
    } catch (error) {
      setChartError(`Chart render failed. Source remains available. ${error instanceof Error ? error.message : "Unable to update candle data."}`);
    }
  }, [chartCandleData, dataFingerprint, sourceIdentityKey]);

  useEffect(() => {
    try {
      markerApiRef.current?.setMarkers(markerData);
    } catch (error) {
      setChartError(`Chart render failed. Source remains available. ${error instanceof Error ? error.message : "Unable to update markers."}`);
    }
  }, [markerData, markerFingerprint]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    for (const series of overlaySeriesRef.current) {
      try {
        chart.removeSeries(series);
      } catch {
        // Series may already be detached during route transitions.
      }
    }
    overlaySeriesRef.current = [];

    const addLine = (overlay: TradingChartLineOverlay) => {
      if (!overlayVisibility[overlay.id]) {
        return;
      }
      const lineSeries: ISeriesApi<"Line", Time> = chart.addSeries(LineSeries, {
        color: overlay.color ?? "#38bdf8",
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        lineStyle: lineStyleFor(overlay.lineStyle),
        lineWidth: overlay.lineWidth ?? 1,
        priceLineVisible: false
      });
      lineSeries.setData(lineDataFor(overlay));
      overlaySeriesRef.current.push(lineSeries);
    };

    try {
      for (const overlay of lineOverlays) {
        addLine(overlay);
      }
      for (const zone of zoneOverlays) {
        if (overlayVisibility[zone.id]) {
          addLine(zone.top);
          addLine(zone.bottom);
        }
      }
    } catch (error) {
      setChartError(`Chart render failed. Source remains available. ${error instanceof Error ? error.message : "Unable to update overlays."}`);
    }
  }, [overlayFingerprint, overlayVisibility]);

  const onToggleOverlay = (id: string) => {
    setOverlayVisibility((current) => ({
      ...current,
      [id]: !current[id]
    }));
  };

  const state = stateLabel ?? (bias ? bias.toUpperCase() : undefined);

  if (chartError) {
    return (
      <div className={`rounded-xl border border-white/10 bg-slate-950/80 ${className ?? ""}`}>
        <ChartToolbar
          lineOverlays={lineOverlays}
          onToggleOverlay={onToggleOverlay}
          overlayVisibility={overlayVisibility}
          source={source}
          stateLabel={state}
          zoneOverlays={zoneOverlays}
        />
        <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-amber-100">
          Chart unavailable. {chartError}
        </div>
      </div>
    );
  }

  if (!sortedCandles.length) {
    return (
      <div className={`rounded-xl border border-white/10 bg-slate-950/80 ${className ?? ""}`}>
        <ChartToolbar
          lineOverlays={lineOverlays}
          onToggleOverlay={onToggleOverlay}
          overlayVisibility={overlayVisibility}
          source={source}
          stateLabel={state}
          zoneOverlays={zoneOverlays}
        />
        <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-slate-500">
          No candle data available for this chart.
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 shadow-[0_0_45px_rgba(8,145,178,0.08)] ${className ?? ""}`}
      data-chart-candle-count={source.candleCount}
      data-chart-first-close={source.firstClose ?? ""}
      data-chart-first-timestamp={source.firstTimestamp ?? ""}
      data-chart-last-close={source.lastClose ?? ""}
      data-chart-last-timestamp={source.lastTimestamp ?? ""}
      data-chart-source-key={sourceKey}
      data-chart-source-label={source.sourceLabel}
      data-chart-source-type={source.sourceType}
    >
      <ChartToolbar
        lineOverlays={lineOverlays}
        onToggleOverlay={onToggleOverlay}
        overlayVisibility={overlayVisibility}
        source={source}
        stateLabel={state}
        zoneOverlays={zoneOverlays}
      />
      <div className={`relative ${heightClassName}`}>
        <div className="absolute inset-0" ref={containerRef} />
        <ChartOverlays
          lineOverlays={lineOverlays}
          markers={markers}
          overlayVisibility={overlayVisibility}
          zoneOverlays={zoneOverlays}
        />
      </div>
    </div>
  );
}
