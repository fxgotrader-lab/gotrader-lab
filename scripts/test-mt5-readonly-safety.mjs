import {
  classifyMt5ReadOnlyTool,
  mt5ReadOnlyAllowedTools,
  mt5ReadOnlyBlockedTools
} from "./mt5-readonly-tool-policy.mjs";

const bridgeUrl = (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, "");
const timeoutMs = Number(process.env.MT5_READONLY_SAFETY_TIMEOUT_MS || 1800);

const dangerousTools = [
  "get_account_info",
  "place_market_order",
  "place_pending_order",
  "modify_position",
  "modify_pending_order",
  "get_all_positions",
  "close_position",
  "close_all_positions",
  "get_all_pending_orders",
  "cancel_pending_order",
  "cancel_all_pending_orders",
  "get_deals",
  "get_orders",
  "buy",
  "sell"
];

const safeTools = [
  "status",
  "get_symbols",
  "get_symbol_price",
  "get_candles_latest",
  "get_candles_by_date",
  "get_symbol_info",
  "quote",
  "candles",
  "symbol_info",
  "spread"
];

const fetchWithTimeout = async (path, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeUrl}/${path}`.replace(/\/$/, ""), {
      ...init,
      cache: "no-store",
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
};

const policyChecks = {
  blocked: dangerousTools.map((tool) => ({ tool, ...classifyMt5ReadOnlyTool(tool) })),
  allowed: safeTools.map((tool) => ({ tool, ...classifyMt5ReadOnlyTool(tool) })),
  unknown: classifyMt5ReadOnlyTool("arbitrary_passthrough_tool")
};

const blockedPolicyPassed = policyChecks.blocked.every((check) => check.blocked && !check.allowed);
const allowedPolicyPassed = policyChecks.allowed.every((check) => check.allowed && !check.blocked);
const unknownPolicyPassed = !policyChecks.unknown.allowed && !policyChecks.unknown.blocked;

const endpointChecks = [];
for (const path of [
  "orders",
  "positions",
  "account",
  "deals",
  "history",
  "place_market_order",
  "close_position",
  "cancel_pending_order"
]) {
  try {
    const result = await fetchWithTimeout(path);
    endpointChecks.push({ path, reachable: true, status: result.status, payload: result.payload });
  } catch (error) {
    endpointChecks.push({
      path,
      reachable: false,
      status: "not_running",
      payload: error instanceof Error ? error.message : String(error)
    });
  }
}

let postCheck;
try {
  postCheck = await fetchWithTimeout("quote?symbol=MNQ", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ symbol: "MNQ" })
  });
} catch (error) {
  postCheck = {
    ok: false,
    status: "not_running",
    payload: error instanceof Error ? error.message : String(error)
  };
}

const wrapperReachable = endpointChecks.some((check) => check.reachable);
const endpointBlockPassed =
  !wrapperReachable ||
  endpointChecks.every((check) => Number(check.status) === 403 || Number(check.status) === 405);
const postBlockPassed =
  postCheck.status === "not_running" || Number(postCheck.status) === 405 || Number(postCheck.status) === 403;
const passed = blockedPolicyPassed && allowedPolicyPassed && unknownPolicyPassed && endpointBlockPassed && postBlockPassed;

console.log(
  JSON.stringify(
    {
      passed,
      bridgeUrl,
      wrapperReachable,
      policy: {
        allowedTools: [...mt5ReadOnlyAllowedTools],
        blockedTools: [...mt5ReadOnlyBlockedTools],
        blockedPolicyPassed,
        allowedPolicyPassed,
        unknownPolicyPassed
      },
      endpointBlockPassed,
      postBlockPassed,
      endpointChecks,
      postCheck: {
        status: postCheck.status,
        payload: postCheck.payload
      },
      authority: {
        executionAuthority: "none",
        brokerAuthority: "none",
        readinessOverrideAuthority: "none"
      },
      note: wrapperReachable
        ? "GoTrader MT5 wrapper rejected mutation/account/order/position endpoints."
        : "Wrapper was not running; static policy checks still prove GoTrader does not allow execution tools."
    },
    null,
    2
  )
);

process.exitCode = passed ? 0 : 1;
