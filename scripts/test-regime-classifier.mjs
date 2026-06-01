import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { appendRegimeHistoryJsonl, defaultRegimeHistoryPath } from "./services/regime-history-service.mjs";

const workspace = process.cwd();
const sourcePath = path.join(workspace, "src", "lib", "regime", "compositeRegimeClassifier.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
  }
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { classifyMarketRegime } = await import(moduleUrl);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const candle = (index, close, symbol = "NQ", spread = 1.2) => ({
  id: `${symbol}-${index}`,
  symbol,
  timeframe: "5m",
  timestamp: new Date(Date.UTC(2026, 0, 1, 14, index * 5)).toISOString(),
  open: close - spread * 0.4,
  high: close + spread,
  low: close - spread,
  close,
  volume: 1000 + index * 3
});

const makeTrend = (direction = 1, count = 160) =>
  Array.from({ length: count }, (_, index) => {
    const close = 18000 + direction * index * 2.8 + Math.sin(index / 7) * 1.8;
    return candle(index, close);
  });

const makeRange = (amplitude = 2, count = 160) =>
  Array.from({ length: count }, (_, index) =>
    candle(index, 18000 + Math.sin(index / 3) * amplitude + Math.cos(index / 5) * amplitude * 0.4, "NQ", 0.25)
  );

const makeHighVolRange = (count = 160) =>
  Array.from({ length: count }, (_, index) => {
    const activeHighVol = index > count - 45;
    const amplitude = activeHighVol ? 26 : 2.5;
    const spread = activeHighVol ? 7 : 0.6;
    return candle(index, 18000 + Math.sin(index / 2) * amplitude + Math.cos(index / 5) * amplitude * 0.45, "NQ", spread);
  });

const baseContext = (candles, overrides = {}) => ({
  macro: {
    economicCalendar: [],
    dxy: 104,
    vix: 16,
    twoYearYield: 4.7,
    tenYearYield: 4.35,
    status: "planned",
    ...overrides.macro
  },
  intermarket: {
    dxyNqRelationship: "neutral",
    vixEquityRelationship: "neutral",
    status: "planned",
    ...overrides.intermarket
  },
  priceVolume: {
    ohlcv: { candles }
  }
});

const insufficient = classifyMarketRegime({ candles: makeTrend(1, 20), symbol: "NQ", timeframe: "5m" });
assert(insufficient.stableLabel === "insufficient_data", "Insufficient data should return insufficient_data.");
assert(insufficient.confidence <= 0.35, "Insufficient data confidence must be capped.");

const bullCandles = makeTrend(1);
const bull = classifyMarketRegime({ candles: bullCandles, marketContext: baseContext(bullCandles), symbol: "NQ", timeframe: "5m" });
assert(bull.instantaneousLabel === "trend_bull", `Expected trend_bull, got ${bull.instantaneousLabel}.`);

const bearCandles = makeTrend(-1);
const bear = classifyMarketRegime({ candles: bearCandles, marketContext: baseContext(bearCandles), symbol: "NQ", timeframe: "5m" });
assert(bear.instantaneousLabel === "trend_bear", `Expected trend_bear, got ${bear.instantaneousLabel}.`);

const lowRangeCandles = makeRange(1.5);
const lowRange = classifyMarketRegime({ candles: lowRangeCandles, marketContext: baseContext(lowRangeCandles), symbol: "NQ", timeframe: "5m" });
assert(lowRange.instantaneousLabel === "range_low_vol", `Expected range_low_vol, got ${lowRange.instantaneousLabel}.`);

const highRangeCandles = makeHighVolRange();
const highRange = classifyMarketRegime({ candles: highRangeCandles, marketContext: baseContext(highRangeCandles), symbol: "NQ", timeframe: "5m" });
assert(highRange.instantaneousLabel === "range_high_vol", `Expected range_high_vol, got ${highRange.instantaneousLabel}.`);

const eventTime = highRangeCandles[highRangeCandles.length - 1].timestamp;
const event = classifyMarketRegime({
  candles: highRangeCandles,
  marketContext: baseContext(highRangeCandles, {
    macro: {
      economicCalendar: [{ id: "test-cpi", name: "CPI", impact: "high", scheduledAt: eventTime, status: "mock" }],
      vix: 24
    }
  }),
  symbol: "NQ",
  timeframe: "5m",
  timestamp: eventTime
});
assert(event.instantaneousLabel === "event_high_vol", `Expected event_high_vol, got ${event.instantaneousLabel}.`);

const hysteresis = classifyMarketRegime({
  candles: bearCandles,
  history: [bull],
  marketContext: baseContext(bearCandles),
  symbol: "NQ",
  timeframe: "5m"
});
assert(hysteresis.transitionPending, "Hysteresis should mark first opposing observation as transition_pending.");
assert(hysteresis.stableLabel === bull.stableLabel, "Hysteresis should hold previous stable label until persistence is confirmed.");

const record = appendRegimeHistoryJsonl(bull);
assert(record.classification.label === bull.label, "JSONL history record should contain the regime label.");
assert(fs.existsSync(defaultRegimeHistoryPath), "state/regime_history.jsonl should be written by the local logger.");

console.log(JSON.stringify({
  status: "passed",
  cases: {
    insufficient: insufficient.stableLabel,
    trendBull: bull.instantaneousLabel,
    trendBear: bear.instantaneousLabel,
    rangeLowVol: lowRange.instantaneousLabel,
    rangeHighVol: highRange.instantaneousLabel,
    eventHighVol: event.instantaneousLabel,
    hysteresisTransitionPending: hysteresis.transitionPending
  },
  historyPath: defaultRegimeHistoryPath
}, null, 2));
