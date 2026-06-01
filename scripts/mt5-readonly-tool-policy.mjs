export const mt5ReadOnlyAllowedTools = new Set([
  "status",
  "health",
  "get_symbols",
  "get_symbol_price",
  "get_candles_latest",
  "get_candles_by_date",
  "get_symbol_info",
  "quote",
  "candles",
  "rates",
  "ohlcv",
  "symbol_info",
  "spread",
  "symbols"
]);

export const mt5ReadOnlyBlockedTools = new Set([
  "get_account_info",
  "place_market_order",
  "place_pending_order",
  "modify_position",
  "modify_pending_order",
  "get_all_positions",
  "get_positions_by_symbol",
  "get_positions_by_id",
  "close_position",
  "close_all_positions",
  "close_all_positions_by_symbol",
  "close_all_profitable_positions",
  "close_all_losing_positions",
  "get_all_pending_orders",
  "get_pending_orders_by_symbol",
  "cancel_pending_order",
  "cancel_all_pending_orders",
  "cancel_pending_orders_by_symbol",
  "get_deals",
  "get_orders",
  "buy",
  "sell",
  "close",
  "modify",
  "cancel",
  "order",
  "orders",
  "position",
  "positions",
  "account",
  "deals",
  "history"
]);

const normalized = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, "_");

export const normalizeMt5ToolName = (value) => normalized(value).replace(/^\/+|\/+$/g, "");

export const classifyMt5ReadOnlyTool = (toolNameOrPath) => {
  const name = normalizeMt5ToolName(toolNameOrPath);
  const compact = name.replace(/^\w+\/v\d+\//, "");
  const segments = compact.split(/[/-]/).filter(Boolean);
  const candidates = new Set([
    name,
    compact,
    compact.replace(/\//g, "_"),
    ...segments
  ]);

  for (const candidate of candidates) {
    if (mt5ReadOnlyBlockedTools.has(candidate)) {
      return {
        allowed: false,
        blocked: true,
        reason: `MT5 tool/path "${toolNameOrPath}" is blocked by the GoTrader read-only policy.`
      };
    }
  }

  if (mt5ReadOnlyAllowedTools.has(name) || mt5ReadOnlyAllowedTools.has(compact) || mt5ReadOnlyAllowedTools.has(compact.replace(/\//g, "_"))) {
    return {
      allowed: true,
      blocked: false,
      reason: `MT5 tool/path "${toolNameOrPath}" is allowed as read-only market data.`
    };
  }

  return {
    allowed: false,
    blocked: false,
    reason: `MT5 tool/path "${toolNameOrPath}" is not in the GoTrader read-only allowlist.`
  };
};

export const isBlockedMt5MutationPath = (path) => classifyMt5ReadOnlyTool(path).blocked;
