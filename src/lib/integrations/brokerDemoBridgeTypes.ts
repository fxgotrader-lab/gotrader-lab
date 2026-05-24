import type { FuturesSymbol, GoTraderSignalExport, MarketRegime, Timeframe } from "@/lib/types";

export type BrokerDemoBridgeConnectionStatus = "not_connected" | "planning_only" | "paper_ready" | "paused";
export type BrokerDemoBridgeMode = "planning_only" | "simulation" | "paper";
export type DemoOrderSide = "buy" | "sell";
export type DemoOrderType = "market" | "limit" | "stop_market" | "stop_limit";
export type DemoOrderTimeInForce = "day" | "gtc" | "ioc";
export type DemoOrderLifecycleStatus =
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
export type DemoPositionSide = "long" | "short" | "flat";

export interface GoTraderSignal extends Omit<GoTraderSignalExport, "mode"> {
  mode: "simulation" | "paper";
  signal_id: string;
}

export interface BrokerDemoSafetyControls {
  simulationModeLocked: boolean;
  paperModeLocked: boolean;
  requiresUserApproval: boolean;
  killSwitchEnabled: boolean;
  maxDailyLoss: number;
  maxContracts: number;
  sessionFilter: "all" | "Asia" | "London" | "New York" | "NY AM Kill Zone" | "NY PM Kill Zone";
  symbolAllowlist: FuturesSymbol[];
}

export interface DemoExecutionRequest {
  id: string;
  signal_id: string;
  requested_at: string;
  source: "gotrader_ai_lab";
  destination: "go_trader";
  mode: "paper";
  approved_by_user: boolean;
  user_approval_id: string;
  strategy: "ict_ai_lab";
  symbol: FuturesSymbol;
  timeframe: Timeframe;
  regime: MarketRegime;
  side: DemoOrderSide;
  quantity: number;
  order_type: DemoOrderType;
  time_in_force: DemoOrderTimeInForce;
  entry_zone: [number, number];
  invalidation: number;
  target: number;
  confidence: number;
  risk_notes: string;
  safety: BrokerDemoSafetyControls;
}

export interface DemoOrderStatus {
  id: string;
  request_id: string;
  broker_order_id?: string;
  source: "go_trader";
  mode: "paper";
  status: DemoOrderLifecycleStatus;
  symbol: FuturesSymbol;
  side: DemoOrderSide;
  quantity: number;
  filled_quantity: number;
  average_fill_price?: number;
  submitted_at?: string;
  updated_at: string;
  reject_reason?: string;
}

export interface DemoFill {
  id: string;
  order_status_id: string;
  broker_order_id?: string;
  symbol: FuturesSymbol;
  side: DemoOrderSide;
  quantity: number;
  fill_price: number;
  filled_at: string;
  commission?: number;
  mode: "paper";
}

export interface DemoPosition {
  id: string;
  symbol: FuturesSymbol;
  side: DemoPositionSide;
  quantity: number;
  average_price: number;
  unrealized_pnl: number;
  opened_at?: string;
  updated_at: string;
  mode: "paper";
}

export interface DemoPnL {
  id: string;
  symbol?: FuturesSymbol;
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  daily_pnl: number;
  total_pnl: number;
  max_intraday_drawdown: number;
  calculated_at: string;
  mode: "paper";
}

export interface ManualCloseRequest {
  id: string;
  position_id: string;
  requested_at: string;
  mode: "paper";
  approved_by_user: boolean;
  user_approval_id: string;
  reason: string;
}

export interface FlattenAllRequest {
  id: string;
  requested_at: string;
  mode: "paper";
  approved_by_user: boolean;
  user_approval_id: string;
  reason: string;
  pause_strategy_after_flatten: boolean;
}

export interface BrokerDemoBridgeSpec {
  status: BrokerDemoBridgeConnectionStatus;
  mode: BrokerDemoBridgeMode;
  responsibilitySplit: {
    aiLab: string[];
    goTrader: string[];
    broker: string[];
  };
  signalLifecycle: string[];
  requiredContracts: string[];
  safetyControls: BrokerDemoSafetyControls;
  futureUiRequirements: string[];
  hardProhibitions: string[];
}
