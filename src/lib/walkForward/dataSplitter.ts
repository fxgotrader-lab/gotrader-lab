import type { PreparedCandleSource } from "@/lib/marketData";
import type { Candle } from "@/lib/types";
import { uid } from "@/lib/utils";
import type {
  WalkForwardMode,
  WalkForwardSplitData,
  WalkForwardSplitLabel,
  WalkForwardSplitRatio,
  WalkForwardSplitRatioPreset,
  WalkForwardWindowDefinition
} from "@/lib/walkForward/walkForwardTypes";

export const splitRatioPresets: Record<Exclude<WalkForwardSplitRatioPreset, "custom">, WalkForwardSplitRatio> = {
  "60_20_20": {
    preset: "60_20_20",
    label: "60 / 20 / 20",
    inSample: 0.6,
    validation: 0.2,
    outOfSample: 0.2
  },
  "70_15_15": {
    preset: "70_15_15",
    label: "70 / 15 / 15",
    inSample: 0.7,
    validation: 0.15,
    outOfSample: 0.15
  },
  "50_25_25": {
    preset: "50_25_25",
    label: "50 / 25 / 25",
    inSample: 0.5,
    validation: 0.25,
    outOfSample: 0.25
  }
};

export const walkForwardModeWindowSize: Record<WalkForwardMode, number> = {
  safe: 120,
  standard: 240,
  advanced: 480
};

const splitLabels: Array<{ label: WalkForwardSplitLabel; displayLabel: string; key: keyof Pick<WalkForwardSplitRatio, "inSample" | "validation" | "outOfSample"> }> = [
  { label: "in_sample", displayLabel: "In-sample", key: "inSample" },
  { label: "validation", displayLabel: "Validation", key: "validation" },
  { label: "out_of_sample", displayLabel: "Out-of-sample", key: "outOfSample" }
];

export function resolveSplitRatio(
  preset: WalkForwardSplitRatioPreset = "60_20_20",
  customRatio?: Pick<WalkForwardSplitRatio, "inSample" | "validation" | "outOfSample">
): WalkForwardSplitRatio {
  if (preset !== "custom") {
    return splitRatioPresets[preset];
  }
  const inSample = Math.max(0.1, Math.min(0.8, customRatio?.inSample ?? 0.6));
  const validation = Math.max(0.1, Math.min(0.45, customRatio?.validation ?? 0.2));
  const outOfSample = Math.max(0.1, Math.min(0.45, customRatio?.outOfSample ?? 0.2));
  const total = inSample + validation + outOfSample;
  return {
    preset: "custom",
    label: `${Math.round((inSample / total) * 100)} / ${Math.round((validation / total) * 100)} / ${Math.round((outOfSample / total) * 100)}`,
    inSample: inSample / total,
    validation: validation / total,
    outOfSample: outOfSample / total
  };
}

const metadataFor = (source: PreparedCandleSource) => ({
  aggregateTimeframe: source.appliedSettings.targetTimeframe,
  dataSource: source.mode === "mock" ? "Mock candles" : source.label,
  symbol: source.metadata?.symbol ?? source.candles[0]?.symbol ?? "NQ",
  contract: source.metadata?.contract
});

export function splitCandlesByRatio(
  candles: Candle[],
  ratio: WalkForwardSplitRatio,
  source: PreparedCandleSource,
  windowId = uid("wf_window")
): WalkForwardSplitData[] {
  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const total = sorted.length;
  const inSampleCount = Math.max(1, Math.floor(total * ratio.inSample));
  const validationCount = Math.max(1, Math.floor(total * ratio.validation));
  const outOfSampleCount = Math.max(1, total - inSampleCount - validationCount);
  const adjustedValidationCount = Math.max(1, total - inSampleCount - outOfSampleCount);
  const ranges = {
    in_sample: sorted.slice(0, inSampleCount),
    validation: sorted.slice(inSampleCount, inSampleCount + adjustedValidationCount),
    out_of_sample: sorted.slice(inSampleCount + adjustedValidationCount)
  } satisfies Record<WalkForwardSplitLabel, Candle[]>;
  const metadata = metadataFor(source);

  return splitLabels.map(({ label, displayLabel }) => {
    const splitCandles = ranges[label];
    const first = splitCandles[0];
    const last = splitCandles[splitCandles.length - 1];
    return {
      splitId: `${windowId}_${label}`,
      label,
      displayLabel,
      startTimestamp: first?.timestamp,
      endTimestamp: last?.timestamp,
      rawCandleCount: splitCandles.length,
      processedCandleCount: splitCandles.length,
      ...metadata,
      candles: splitCandles
    };
  });
}

export function createWalkForwardWindows({
  candles,
  source,
  ratio,
  mode = "safe",
  maxWindows = 3
}: {
  candles: Candle[];
  source: PreparedCandleSource;
  ratio: WalkForwardSplitRatio;
  mode?: WalkForwardMode;
  maxWindows?: number;
}): WalkForwardWindowDefinition[] {
  const sorted = [...candles].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!sorted.length) {
    return [];
  }

  const clampedMaxWindows = Math.max(1, Math.min(maxWindows, mode === "advanced" ? 8 : mode === "standard" ? 5 : 3));
  const desiredWindowSize = Math.min(sorted.length, walkForwardModeWindowSize[mode]);
  const minimumWindowSize = Math.min(sorted.length, 45);
  const windowSize = Math.max(minimumWindowSize, desiredWindowSize);
  const starts = new Set<number>();

  if (sorted.length <= windowSize || clampedMaxWindows === 1) {
    starts.add(Math.max(0, sorted.length - windowSize));
  } else {
    const lastStart = sorted.length - windowSize;
    const step = Math.max(1, Math.floor(lastStart / Math.max(1, clampedMaxWindows - 1)));
    for (let start = 0; start <= lastStart && starts.size < clampedMaxWindows; start += step) {
      starts.add(start);
    }
    starts.add(lastStart);
  }

  return [...starts]
    .sort((a, b) => a - b)
    .slice(-clampedMaxWindows)
    .map((start, index, array) => {
      const windowCandles = sorted.slice(start, start + windowSize);
      const windowId = uid(`walk_forward_window_${index + 1}`);
      return {
        windowId,
        windowIndex: index + 1,
        totalWindows: array.length,
        startTimestamp: windowCandles[0]?.timestamp,
        endTimestamp: windowCandles[windowCandles.length - 1]?.timestamp,
        splits: splitCandlesByRatio(windowCandles, ratio, source, windowId)
      };
    });
}
