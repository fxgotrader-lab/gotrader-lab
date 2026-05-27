import { ColorType, CrosshairMode } from "lightweight-charts";

export const missionChartOptions = {
  crosshair: {
    mode: CrosshairMode.Magnet,
    vertLine: {
      color: "rgba(56, 189, 248, 0.35)",
      labelBackgroundColor: "#0891b2"
    },
    horzLine: {
      color: "rgba(56, 189, 248, 0.35)",
      labelBackgroundColor: "#0891b2"
    }
  },
  grid: {
    horzLines: {
      color: "rgba(148, 163, 184, 0.09)"
    },
    vertLines: {
      color: "rgba(148, 163, 184, 0.06)"
    }
  },
  layout: {
    attributionLogo: true,
    background: {
      color: "#07111f",
      type: ColorType.Solid
    },
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    textColor: "#cbd5e1"
  },
  rightPriceScale: {
    borderColor: "rgba(148, 163, 184, 0.18)",
    scaleMargins: {
      bottom: 0.12,
      top: 0.12
    }
  },
  timeScale: {
    borderColor: "rgba(148, 163, 184, 0.18)",
    timeVisible: true
  }
} as const;

export const missionCandlestickOptions = {
  borderDownColor: "#ef4444",
  borderUpColor: "#22c55e",
  downColor: "#ef4444",
  upColor: "#22c55e",
  wickDownColor: "#f87171",
  wickUpColor: "#34d399"
} as const;
