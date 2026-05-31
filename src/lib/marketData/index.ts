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
  getWalkForwardDataPreset,
  HARD_BROWSER_CANDLE_LIMIT,
  importedDataPresetSettings,
  loadCandleWindowSettings,
  loadPreparedCandleSource,
  loadPreparedWalkForwardCandleSource,
  loadWalkForwardCandleWindowSettings,
  prepareCandlesForResearch,
  prepareCandleSourceForResearch,
  resetCandleWindowSettings,
  resetWalkForwardCandleWindowSettings,
  SAFE_CANDLE_WINDOW_LIMIT,
  safeWindowSizeOptions,
  sanitizeCandleWindowSettings,
  saveCandleWindowSettings,
  saveWalkForwardCandleWindowSettings,
  WALK_FORWARD_IMPORTED_SAFE_WINDOW_SIZE,
  WALK_FORWARD_IMPORTED_STANDARD_WINDOW_SIZE,
  WALK_FORWARD_WINDOW_SETTINGS_UPDATED_EVENT,
  walkForwardDataPresetSettings
} from "@/lib/marketData/candleWindowing";
export { buildMarketContext, summarizeMarketContext } from "@/lib/marketData/marketContextBuilder";
export {
  getActiveImportedCandleSetId,
  importHistoricalCandleFile,
  importNormalizedHistoricalCandleArtifact,
  isImportedCandleSource,
  listImportedCandleMetadata,
  loadActiveCandleSource,
  loadImportedCandles,
  MARKET_DATA_IMPORT_UPDATED_EVENT,
  resolveImportedCandleActivationState,
  saveImportedCandleSet,
  setActiveImportedCandleSet
} from "@/lib/marketData/historicalCandleImport";
export { createMockMarketContext, mockMarketContext } from "@/lib/marketData/mockMarketContext";
export { marketDataProviderRoadmap as marketDataRoadmap, plannedMarketDataAgents as plannedMarketAgents } from "@/lib/marketData/marketDataRoadmap";
export {
  createDisconnectedLiveMarketDataStatus,
  createReadOnlyAdapterStatus,
  isLiveFeedConnected,
  LIVE_MARKET_DATA_STATUS_VERSION,
  liveStatusLabel
} from "@/lib/marketData/liveMarketDataStatus";
export {
  currentChartSourceLabel,
  resolveChartDisplayCandleSource,
  resolveLiveMarketDataStatus
} from "@/lib/marketData/marketDataSourceResolver";
export type {
  ChartDisplaySourceMode,
  ResolvedChartDisplaySource
} from "@/lib/marketData/marketDataSourceResolver";
export type {
  CandleWindowSettings,
  ImportedDataPreset,
  PreparedCandleSource,
  ResearchPerformanceMode,
  ResearchSessionFilter,
  ResearchTimeframe,
  ResearchWindowMode,
  WalkForwardDataPreset
} from "@/lib/marketData/candleWindowing";
export type {
  CandleDataSource,
  CandleDataSourceMode,
  HistoricalCandleImportResult,
  HistoricalCandleValidationWarning,
  HistoricalImportFormat,
  HistoricalImportStatus,
  ImportedCandleActivationState,
  ImportedCandleActivationStatus,
  ImportedCandleMetadata,
  NormalizedHistoricalCandleArtifact
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
export type {
  LiveMarketDataConnectionStatus,
  LiveMarketDataMode,
  LiveMarketDataProvider,
  LiveMarketDataStatus,
  ReadOnlyMarketDataAdapterStatus
} from "@/lib/marketData/liveMarketDataTypes";
