export { mockMarketDataAdapter, marketDataProviderRoadmap, plannedMarketDataAgents } from "@/lib/marketData/marketDataAdapters";
export {
  aggregateCandles,
  CANDLE_WINDOW_SETTINGS_UPDATED_EVENT,
  DASHBOARD_IMPORTED_CANDIDATE_LIMIT,
  DASHBOARD_IMPORTED_RAW_WINDOW_LIMIT,
  DASHBOARD_IMPORTED_SAFE_PROCESSED_LIMIT,
  DASHBOARD_IMPORTED_SAFE_WINDOW_SIZE,
  DASHBOARD_IMPORTED_STANDARD_WINDOW_SIZE,
  dashboardImportedSafeCandleWindowSettings,
  defaultCandleWindowSettings,
  DEFAULT_IMPORTED_WINDOW_SIZE,
  getImportedDataPreset,
  HARD_BROWSER_CANDLE_LIMIT,
  importedDataPresetSettings,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  prepareCandlesForResearch,
  prepareCandleSourceForResearch,
  resetCandleWindowSettings,
  SAFE_CANDLE_WINDOW_LIMIT,
  safeWindowSizeOptions,
  sanitizeCandleWindowSettings,
  saveCandleWindowSettings
} from "@/lib/marketData/candleWindowing";
export { buildMarketContext, summarizeMarketContext } from "@/lib/marketData/marketContextBuilder";
export {
  getActiveImportedCandleSetId,
  importHistoricalCandleFile,
  isImportedCandleSource,
  listImportedCandleMetadata,
  loadActiveCandleSource,
  loadImportedCandles,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  saveImportedCandleSet,
  setActiveImportedCandleSet
} from "@/lib/marketData/historicalCandleImport";
export { createMockMarketContext, mockMarketContext } from "@/lib/marketData/mockMarketContext";
export { marketDataProviderRoadmap as marketDataRoadmap, plannedMarketDataAgents as plannedMarketAgents } from "@/lib/marketData/marketDataRoadmap";
export type {
  CandleWindowSettings,
  ImportedDataPreset,
  PreparedCandleSource,
  ResearchPerformanceMode,
  ResearchSessionFilter,
  ResearchTimeframe,
  ResearchWindowMode
} from "@/lib/marketData/candleWindowing";
export type {
  CandleDataSource,
  CandleDataSourceMode,
  HistoricalCandleImportResult,
  HistoricalCandleValidationWarning,
  HistoricalImportFormat,
  HistoricalImportStatus,
  ImportedCandleMetadata
} from "@/lib/marketData/historicalCandleImport";
export type {
  IntermarketContext,
  MacroEconomicContext,
  MacroEvent,
  MarketContext,
  MarketContextModule,
  MarketDataAdapter,
  MarketDataMode,
  MarketDataModuleStatus,
  MarketDataProviderRoadmapEntry,
  MarketDataProviderStatus,
  MarketLevel,
  OHLCVSeries,
  OrderFlowContext,
  PlannedMarketDataAgent,
  PositioningContext,
  PriceVolumeContext,
  VolumeProfileContext
} from "@/lib/marketData/marketDataTypes";
