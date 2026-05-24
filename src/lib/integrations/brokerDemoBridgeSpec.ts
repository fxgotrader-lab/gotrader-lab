import type { BrokerDemoBridgeSpec } from "@/lib/integrations/brokerDemoBridgeTypes";

export const brokerDemoBridgeSpec: BrokerDemoBridgeSpec = {
  status: "not_connected",
  mode: "planning_only",
  responsibilitySplit: {
    aiLab: [
      "Own research state, ICT context, agent debate, CIO thesis, prompt history, and simulation exports.",
      "Require explicit user approval before any future paper execution request.",
      "Store research memory and simulated performance locally."
    ],
    goTrader: [
      "Own future paper execution request intake and execution state.",
      "Reconcile requested signals with broker-demo order lifecycle events.",
      "Return demo fills, positions, PnL, and audit events to AI Lab."
    ],
    broker: [
      "Own actual demo order acceptance, rejections, fills, positions, and account PnL.",
      "Remain outside AI Lab until a future connector is intentionally implemented."
    ]
  },
  signalLifecycle: [
    "AI Lab thesis",
    "Simulation export",
    "go-trader-compatible signal",
    "Paper execution request",
    "Broker-demo order",
    "Fill confirmation",
    "PnL feedback",
    "Performance update"
  ],
  requiredContracts: [
    "GoTraderSignal",
    "DemoExecutionRequest",
    "DemoOrderStatus",
    "DemoFill",
    "DemoPosition",
    "DemoPnL",
    "ManualCloseRequest",
    "FlattenAllRequest"
  ],
  safetyControls: {
    simulationModeLocked: true,
    paperModeLocked: true,
    requiresUserApproval: true,
    killSwitchEnabled: true,
    maxDailyLoss: 500,
    maxContracts: 1,
    sessionFilter: "all",
    symbolAllowlist: ["ES", "NQ", "MES", "MNQ"]
  },
  futureUiRequirements: [
    "Performance tab demo PnL",
    "Open positions",
    "Close trade button",
    "Flatten all button",
    "Pause strategy button",
    "Order history",
    "Execution audit log"
  ],
  hardProhibitions: [
    "No live trading",
    "No broker API connection",
    "No Tradovate implementation",
    "No TopStep implementation",
    "No websocket feeds",
    "No API keys",
    "No order placement",
    "No multi-account routing",
    "No copy-trading"
  ]
};
