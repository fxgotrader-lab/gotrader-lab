import {
  CANONICAL_WALK_FORWARD_MIN_CANDLES,
  type CanonicalCandleProvider,
  type CanonicalCandleSource,
  canonicalSourceFromMt5ReadOnlyFeed,
  canonicalSourceFromPreparedSource
} from "@/lib/candleSources";
import {
  hydrateActiveMt5ReadOnlyCandleFeed,
  loadActiveMt5ReadOnlyCandleFeed
} from "@/lib/integrations/mt5";
import {
  loadPreparedWalkForwardCandleSource,
  loadWalkForwardCandleWindowSettings,
  prepareCandleSourceForResearch,
  type CandleWindowSettings,
  type PreparedCandleSource
} from "@/lib/marketData";
import type { CandleDataSourceMode } from "@/lib/marketData/historicalCandleImport";

export interface ResolvedWalkForwardCandleSource extends PreparedCandleSource {
  brokerSymbol?: string;
  dataQuality: CanonicalCandleSource["dataQuality"];
  provider: CanonicalCandleProvider;
  sourceFingerprint: string;
  sourceWarnings: string[];
  walkForwardEligible: boolean;
  walkForwardEligibilityReasons: string[];
}

const asWalkForwardSource = (
  source: PreparedCandleSource,
  canonical: CanonicalCandleSource,
  warnings: string[] = []
): ResolvedWalkForwardCandleSource => ({
  ...source,
  brokerSymbol: canonical.provenance.providerSymbol,
  dataQuality: canonical.dataQuality,
  provider: canonical.provider,
  sourceFingerprint: canonical.fingerprint,
  sourceWarnings: [...canonical.warnings, ...warnings],
  walkForwardEligible: canonical.eligibility.walkForward,
  walkForwardEligibilityReasons: canonical.eligibilityReasons
});

const sourceModeForProvider = (provider: CanonicalCandleProvider): CandleDataSourceMode =>
  provider === "imported_historical"
    ? "imported"
    : provider === "tradingview_mcp"
      ? "tradingview_mcp_chart"
      : provider === "mt5_read_only"
        ? "mt5_read_only"
        : "mock";

const preparedFromCanonical = (
  canonical: CanonicalCandleSource,
  settings: Partial<CandleWindowSettings>
): PreparedCandleSource => {
  const prepared = prepareCandleSourceForResearch(
    {
      mode: sourceModeForProvider(canonical.provider),
      label: canonical.provenance.sourceLabel,
      candles: canonical.candles
    },
    settings
  );
  return {
    ...prepared,
    warnings: [...prepared.warnings, ...canonical.warnings]
  };
};

export async function loadPreparedCanonicalWalkForwardCandleSource(
  settingsInput: Partial<CandleWindowSettings> = loadWalkForwardCandleWindowSettings()
): Promise<ResolvedWalkForwardCandleSource> {
  const importedOrMockSource = await loadPreparedWalkForwardCandleSource(settingsInput);
  const preparedCanonical = canonicalSourceFromPreparedSource(importedOrMockSource);

  if (preparedCanonical.provider === "imported_historical") {
    return asWalkForwardSource(importedOrMockSource, preparedCanonical);
  }

  const mt5Feed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => loadActiveMt5ReadOnlyCandleFeed());
  const mt5Canonical = canonicalSourceFromMt5ReadOnlyFeed(mt5Feed);
  if (mt5Canonical?.eligibility.walkForward) {
    return asWalkForwardSource(
      preparedFromCanonical(mt5Canonical, settingsInput),
      mt5Canonical,
      [
        "MT5 read-only walk-forward uses provider/proxy candle data. Imported historical remains preferred for deep CME futures validation.",
        "MT5 read-only has no execution authority, broker authority, or readiness override authority."
      ]
    );
  }

  const mt5Reasons = mt5Feed
    ? mt5Feed.researchEligibility.walkForwardEligible
      ? ["MT5 read-only is depth-eligible but must be selected as the active research source before walk-forward can use it."]
      : mt5Feed.researchEligibility.reasons
    : [`MT5 read-only source does not have enough depth for walk-forward. Target at least ${CANONICAL_WALK_FORWARD_MIN_CANDLES.toLocaleString()} valid candles.`];

  return asWalkForwardSource(importedOrMockSource, preparedCanonical, mt5Reasons);
}
