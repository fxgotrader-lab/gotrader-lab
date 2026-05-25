import type { FuturesSymbol, MarketRegime, Timeframe } from "@/lib/types";

export type PaperDemoExecutionStatus = "planning_only";
export type PaperDemoBrokerConnection = "not_connected";
export type PaperDemoLiveTradingState = "disabled";
export type PaperDemoAccountMode = "future_demo_account_only";
export type PaperDemoNextPhase = "single_account_paper_bridge";

export type PaperOrderSide = "buy" | "sell";
export type PaperOrderType = "market" | "limit" | "stop_market" | "stop_limit";
export type PaperOrderTimeInForce = "day" | "gtc" | "ioc";
export type PaperOrderLifecycleStatus =
  | "pending_user_approval"
  | "approved"
  | "rejected_by_user"
  | "queued_for_go_trader"
  | "accepted_by_broker_demo"
  | "working"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "failed";
export type PaperPositionSide = "long" | "short" | "flat";

export interface PaperExecutionRiskLimits {
  maxDailyLoss: number;
  maxContracts: number;
  symbolAllowlist: FuturesSymbol[];
  sessionFilter: string;
}

export interface PaperExecutionRequest {
  id: string;
  handoffId: string;
  signalId: string;
  requestedAt: string;
  source: "gotrader_ai_lab";
  destination: "go_trader";
  mode: "paper";
  approvedByUser: boolean;
  approvalId: string;
  strategy: "ict_ai_lab";
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  marketRegime: MarketRegime;
  side: PaperOrderSide;
  quantity: number;
  orderType: PaperOrderType;
  timeInForce: PaperOrderTimeInForce;
  entryZone: [number, number];
  invalidation: number;
  target: number;
  confidence: number;
  riskNotes: string;
  riskLimits: PaperExecutionRiskLimits;
}

export interface PaperOrderStatus {
  id: string;
  requestId: string;
  brokerOrderId?: string;
  source: "go_trader";
  mode: "paper";
  status: PaperOrderLifecycleStatus;
  symbol: FuturesSymbol;
  side: PaperOrderSide;
  quantity: number;
  filledQuantity: number;
  averageFillPrice?: number;
  submittedAt?: string;
  updatedAt: string;
  rejectionReason?: string;
}

export interface PaperFill {
  id: string;
  orderStatusId: string;
  brokerOrderId?: string;
  symbol: FuturesSymbol;
  side: PaperOrderSide;
  quantity: number;
  fillPrice: number;
  filledAt: string;
  commission?: number;
  mode: "paper";
}

export interface PaperPosition {
  id: string;
  symbol: FuturesSymbol;
  side: PaperPositionSide;
  quantity: number;
  averagePrice: number;
  unrealizedPnl: number;
  openedAt?: string;
  updatedAt: string;
  mode: "paper";
}

export interface PaperPnLUpdate {
  id: string;
  symbol?: FuturesSymbol;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  dailyPnl: number;
  totalPnl: number;
  maxIntradayDrawdown: number;
  calculatedAt: string;
  mode: "paper";
}

export interface PaperManualCloseRequest {
  id: string;
  positionId: string;
  requestedAt: string;
  mode: "paper";
  approvedByUser: boolean;
  approvalId: string;
  reason: string;
}

export interface PaperFlattenAllRequest {
  id: string;
  requestedAt: string;
  mode: "paper";
  approvedByUser: boolean;
  approvalId: string;
  reason: string;
  pauseStrategyAfterFlatten: boolean;
}

export interface PaperBridgeHeartbeat {
  id: string;
  emittedAt: string;
  source: "go_trader";
  mode: "paper";
  bridgeStatus: "healthy" | "paused" | "locked_out" | "disconnected";
  activeStrategyIds: string[];
  openPositionCount: number;
  pendingOrderCount: number;
  notes?: string;
}

export interface PaperDemoExecutionSpec {
  status: PaperDemoExecutionStatus;
  brokerConnection: PaperDemoBrokerConnection;
  liveTrading: PaperDemoLiveTradingState;
  accountMode: PaperDemoAccountMode;
  nextPhase: PaperDemoNextPhase;
  responsibilitySplit: {
    aiLab: string[];
    goTrader: string[];
    brokerDemoAccount: string[];
    feedback: string[];
  };
  lifecycle: string[];
  stateOwnership: {
    researchState: string[];
    executionState: string[];
    brokerPositionState: string[];
    auditState: string[];
    manualOverrideState: string[];
  };
  manualControls: string[];
  failSafes: string[];
  futureContracts: string[];
  explicitNotes: string[];
}
