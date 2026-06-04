import {
  canonicalSourceFromMt5ReadOnlyFeed,
  canonicalSourceFromPreparedSource,
  type CanonicalCandleProvider,
  type CanonicalCandleSource
} from "@/lib/candleSources";
import {
  hydrateActiveMt5ReadOnlyCandleFeed,
  loadActiveMt5ReadOnlyCandleFeed
} from "@/lib/integrations/mt5";
import {
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  prepareCandleSourceForResearch,
  type CandleWindowSettings,
  type PreparedCandleSource
} from "@/lib/marketData";
import type { CandleDataSourceMode } from "@/lib/marketData/historicalCandleImport";
import { mockCandles } from "@/lib/mockData/mockCandles";

export type BacktestSourcePreference = "active_research" | "imported_historical" | "mock_demo";

export interface ResolvedBacktestCandleSource extends PreparedCandleSource {
  authority: CanonicalCandleSource["authority"];
  brokerSymbol?: string;
  dataQuality: CanonicalCandleSource["dataQuality"];
  firstTimestamp?: string;
  lastTimestamp?: string;
  provider: CanonicalCandleProvider;
  requestedSymbol: string;
  sourceFingerprint: string;
  sourceId: string;
  sourceWarnings: string[];
  sourceRole: "active_research" | "imported_historical" | "mock_demo";
}

const sourceModeForProvider = (provider: CanonicalCandleProvider): CandleDataSourceMode =>
  provider === "imported_historical"
    ? "imported"
    : provider === "mt5_read_only"
      ? "mt5_read_only"
      : provider === "tradingview_mcp"
        ? "tradingview_mcp_chart"
        : "mock";

const sourceRoleFor = (
  provider: CanonicalCandleProvider,
  preference: BacktestSourcePreference
): ResolvedBacktestCandleSource["sourceRole"] =>
  preference === "mock_demo"
    ? "mock_demo"
    : provider === "imported_historical"
      ? "imported_historical"
      : "active_research";

const asResolvedBacktestSource = (
  prepared: PreparedCandleSource,
  canonical: CanonicalCandleSource,
  preference: BacktestSourcePreference,
  warnings: string[] = []
): ResolvedBacktestCandleSource => ({
  ...prepared,
  authority: canonical.authority,
  brokerSymbol: canonical.provenance.providerSymbol,
  dataQuality: canonical.dataQuality,
  firstTimestamp: canonical.firstTimestamp,
  lastTimestamp: canonical.lastTimestamp,
  provider: canonical.provider,
  requestedSymbol: canonical.symbol,
  sourceFingerprint: canonical.fingerprint,
  sourceId: canonical.sourceId,
  sourceRole: sourceRoleFor(canonical.provider, preference),
  sourceWarnings: [...canonical.warnings, ...warnings]
});

const preparedFromCanonical = (
  canonical: CanonicalCandleSource,
  settings: Partial<CandleWindowSettings>
): PreparedCandleSource =>
  prepareCandleSourceForResearch(
    {
      mode: sourceModeForProvider(canonical.provider),
      label: canonical.provenance.sourceLabel,
      candles: canonical.candles
    },
    settings
  );

export const createMockBacktestCandleSource = (
  settings: Partial<CandleWindowSettings> = loadCandleWindowSettings()
): ResolvedBacktestCandleSource => {
  const prepared = prepareCandleSourceForResearch(
    {
      mode: "mock",
      label: "Mock demo candles",
      candles: mockCandles
    },
    settings
  );
  const canonical = canonicalSourceFromPreparedSource(prepared);
  return asResolvedBacktestSource(prepared, canonical, "mock_demo", [
    "Mock/demo source selected explicitly. Do not compare this to MT5 or imported research results."
  ]);
};

const loadActiveMt5CanonicalSource = async () => {
  const mt5Feed = await hydrateActiveMt5ReadOnlyCandleFeed().catch(() => loadActiveMt5ReadOnlyCandleFeed());
  return canonicalSourceFromMt5ReadOnlyFeed(mt5Feed);
};

export async function loadResolvedBacktestCandleSource({
  preference = "active_research",
  settings = loadCandleWindowSettings()
}: {
  preference?: BacktestSourcePreference;
  settings?: Partial<CandleWindowSettings>;
} = {}): Promise<ResolvedBacktestCandleSource> {
  if (preference === "mock_demo") {
    return createMockBacktestCandleSource(settings);
  }

  const importedOrMock = await loadPreparedCandleSource(settings);
  const importedOrMockCanonical = canonicalSourceFromPreparedSource(importedOrMock);

  if (preference === "imported_historical") {
    return asResolvedBacktestSource(
      importedOrMock,
      importedOrMockCanonical,
      preference,
      importedOrMockCanonical.provider === "imported_historical"
        ? ["Imported historical selected explicitly for backtest/replay comparison."]
        : ["Imported historical was requested, but no active imported dataset is available; mock/demo fallback is labeled explicitly."]
    );
  }

  const mt5Canonical = await loadActiveMt5CanonicalSource();
  if (mt5Canonical?.eligibility.researchCycle && mt5Canonical.roles.includes("research")) {
    return asResolvedBacktestSource(
      preparedFromCanonical(mt5Canonical, settings),
      mt5Canonical,
      "active_research",
      [
        "Backtest/Replay is using the active canonical MT5 read-only research source.",
        "MT5 read-only USTECH is CFD/proxy market data for MNQ-style research, not CME MNQ futures broker truth.",
        "Authority remains execution none, broker none, readiness override none."
      ]
    );
  }

  return asResolvedBacktestSource(
    importedOrMock,
    importedOrMockCanonical,
    "active_research",
    [
      mt5Canonical?.eligibility.researchCycle && !mt5Canonical.roles.includes("research")
        ? "MT5 read-only candles are loaded, but MT5 is not selected as the active research source for Backtest/Replay."
        : "No eligible active canonical MT5 research source was available for Backtest/Replay.",
      importedOrMockCanonical.provider === "mock"
        ? "Mock/demo source is labeled explicitly; select MT5 read-only or imported historical for real comparison."
        : "Imported historical is being used as the explicit fallback source."
    ]
  );
}
