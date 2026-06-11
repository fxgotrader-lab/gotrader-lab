import {
  hydrateActiveMt5ReadOnlyCandleFeed,
  loadActiveMt5ReadOnlyCandleFeed,
  resolveMt5ReadOnlyRuntimeState
} from "@/lib/integrations/mt5";
import { loadActiveTradingViewMcpChartFeed } from "@/lib/integrations/tradingview";
import { loadPreparedCandleSource, resolveChartDisplayCandleSource } from "@/lib/marketData";
import { buildSourceStatusSnapshot } from "./buildSourceStatusSnapshot";
import type { SourceStatusSnapshot } from "./sourceStatusTypes";

/**
 * Resolves the shared source status snapshot from the same canonical stores
 * every page already uses (active MT5 read-only feed, prepared research
 * source, TradingView chart feed). Read-only; authority stays none.
 */
export async function resolveSourceStatusSnapshot(): Promise<SourceStatusSnapshot> {
  const mt5Feed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => loadActiveMt5ReadOnlyCandleFeed());
  const mt5Runtime = resolveMt5ReadOnlyRuntimeState(mt5Feed);
  const tradingViewFeed = loadActiveTradingViewMcpChartFeed();
  const prepared = await loadPreparedCandleSource().catch(() => undefined);

  if (!prepared) {
    return buildSourceStatusSnapshot({
      provider: "mock",
      researchEligible: false,
      sourceLabel: "No prepared candle source resolved",
      requestedSymbol: mt5Feed?.requestedSymbol,
      brokerSymbol: mt5Runtime.brokerSymbol,
      candleCount: 0,
      warnings: ["Prepared candle source could not be loaded."]
    });
  }

  const display = resolveChartDisplayCandleSource(prepared, tradingViewFeed, mt5Feed);
  const research = display.activeResearchSource;
  const researchUsesMt5 = display.researchUsesMt5ReadOnly;
  const lastCandle = display.activeResearchCandleSource[display.activeResearchCandleSource.length - 1];

  return buildSourceStatusSnapshot({
    provider: research.provider,
    researchEligible: research.eligibility.researchCycle && research.roles.includes("research"),
    sourceLabel: researchUsesMt5
      ? mt5Runtime.displayLabel ?? research.provenance.sourceLabel
      : research.provenance.sourceLabel,
    requestedSymbol: researchUsesMt5 ? mt5Feed?.requestedSymbol ?? research.symbol : research.symbol,
    brokerSymbol: researchUsesMt5 ? mt5Runtime.brokerSymbol : research.provenance.providerSymbol,
    primaryTimeframe: research.timeframe,
    higherTimeframes: (mt5Runtime.higherTimeframeSources ?? []).map((source) => ({
      timeframe: source.timeframe,
      candleCount: source.candleCount
    })),
    candleCount: research.candleCount,
    fingerprint: research.fingerprint,
    lastUpdated: lastCandle?.timestamp ?? research.lastTimestamp ?? research.lastUpdatedAt,
    warnings: [...research.warnings, ...display.canonicalWarnings]
  });
}
