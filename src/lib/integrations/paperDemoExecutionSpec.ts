import type { PaperDemoExecutionSpec } from "@/lib/integrations/paperDemoExecutionTypes";

export const paperDemoExecutionSpec: PaperDemoExecutionSpec = {
  status: "planning_only",
  brokerConnection: "not_connected",
  liveTrading: "disabled",
  accountMode: "future_demo_account_only",
  nextPhase: "single_account_paper_bridge",
  responsibilitySplit: {
    aiLab: [
      "Own research inputs, deterministic ICT context, internal agent debate, CIO thesis, prompt history, and local performance memory.",
      "Export simulation handoffs and receive paper/demo performance feedback only after go-trader reports it.",
      "Never connect directly to a broker or submit orders from the frontend."
    ],
    goTrader: [
      "Own future paper execution state, scheduler risk gates, order request routing, and execution audit records.",
      "Translate approved paper requests into broker-demo adapter calls only after simulation bridge verification.",
      "Return order status, fills, positions, PnL, and heartbeat messages back to AI Lab."
    ],
    brokerDemoAccount: [
      "Own demo order acceptance, rejection, fills, open positions, account balance, and demo PnL.",
      "Remain isolated from AI Lab until a future paper-mode connector is intentionally implemented."
    ],
    feedback: [
      "AI Lab receives performance feedback only.",
      "Research scoring must distinguish simulated thesis quality from paper execution outcomes."
    ]
  },
  lifecycle: [
    "Handoff export",
    "Scheduler reads signal",
    "Risk gate checks",
    "Demo order request",
    "Broker demo fill",
    "Position state update",
    "PnL feedback",
    "AI Lab performance update"
  ],
  stateOwnership: {
    researchState: [
      "AI Lab owns thesis inputs, ICT context, agent opinions, CIO synthesis, prompt versions, and local export audit records."
    ],
    executionState: [
      "go-trader owns queued paper requests, order lifecycle state, strategy pause flags, risk-gate decisions, and execution reconciliation."
    ],
    brokerPositionState: [
      "Broker demo account owns authoritative fills, broker order IDs, open position quantities, average prices, and account PnL."
    ],
    auditState: [
      "go-trader owns execution audit events; AI Lab stores imported summaries for research analytics only."
    ],
    manualOverrideState: [
      "go-trader owns pause, close, flatten, cancel pending orders, and bridge disable commands after explicit user approval."
    ]
  },
  manualControls: [
    "Pause strategy",
    "Close position",
    "Flatten account",
    "Cancel pending orders",
    "Disable bridge"
  ],
  failSafes: [
    "Max daily loss",
    "Max contracts",
    "Symbol allowlist",
    "Session filter",
    "Stale handoff rejection",
    "Duplicate signal rejection",
    "Broker disconnect lockout",
    "Emergency flatten"
  ],
  futureContracts: [
    "PaperExecutionRequest",
    "PaperOrderStatus",
    "PaperFill",
    "PaperPosition",
    "PaperPnLUpdate",
    "PaperManualCloseRequest",
    "PaperFlattenAllRequest",
    "PaperBridgeHeartbeat"
  ],
  explicitNotes: [
    "No broker code exists yet.",
    "This planning layer does not place trades.",
    "Demo execution comes after simulation bridge verification."
  ]
};
