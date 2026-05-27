import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
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
  const [chartError, setChartError] = useState<string>();
  const [overlayVisibility, setOverlayVisibility] = useState<Record<string, boolean>>(() => {
    const entries = [...lineOverlays, ...zoneOverlays].map((overlay) => [overlay.id, overlay.visibleByDefault !== false] as const);
    return Object.fromEntries(entries);
  });

  const sortedCandles = useMemo(
    () => safeArray(candles).slice().sort((a, b) => Number(a.time) - Number(b.time)),
    [candles]
  );

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
    if (!container || !sortedCandles.length) {
      return undefined;
    }

    let chart: IChartApi | null = null;
    let disposed = false;
    let resizeFrame: number | undefined;

    try {
      setChartError(undefined);
      chart = createChart(container, {
        ...missionChartOptions,
        height: Math.max(220, container.clientHeight),
        width: Math.max(320, container.clientWidth)
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, missionCandlestickOptions);
      candleSeries.setData(
        sortedCandles.map((candle: TradingChartCandle) => ({
          close: candle.close,
          high: candle.high,
          low: candle.low,
          open: candle.open,
          time: candle.time
        }))
      );

      const markerApi = createSeriesMarkers(candleSeries, safeArray(markers).map(toLightweightMarker), {
        zOrder: "top"
      });

      const addLine = (overlay: TradingChartLineOverlay) => {
        if (!overlayVisibility[overlay.id] || !chart) {
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
      };

      for (const overlay of lineOverlays) {
        addLine(overlay);
      }
      for (const zone of zoneOverlays) {
        if (overlayVisibility[zone.id]) {
          addLine(zone.top);
          addLine(zone.bottom);
        }
      }

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

      chart.timeScale().fitContent();

      return () => {
        disposed = true;
        if (resizeFrame !== undefined) {
          window.cancelAnimationFrame(resizeFrame);
        }
        observer.disconnect();
        try {
          markerApi.setMarkers([]);
        } catch {
          // Lightweight Charts may already have detached marker primitives during route transitions.
        }
        try {
          chart?.remove();
        } catch {
          // Chart cleanup must never block React Router from rendering the next page.
        }
        chartRef.current = null;
        chart = null;
      };
    } catch (error) {
      setChartError(error instanceof Error ? error.message : "Chart renderer failed to initialize.");
      try {
        chart?.remove();
      } catch {
        // Keep the page navigable even if the renderer failed mid-initialization.
      }
      chartRef.current = null;
      return undefined;
    }
  }, [lineOverlays, markers, overlayVisibility, sortedCandles, zoneOverlays]);

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
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-slate-950/90 shadow-[0_0_45px_rgba(8,145,178,0.08)] ${className ?? ""}`}>
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
