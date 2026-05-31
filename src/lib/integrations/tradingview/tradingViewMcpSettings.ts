import {
  DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL,
  TRADINGVIEW_MCP_BRIDGE_SETTINGS_VERSION,
  type TradingViewMcpBridgeSettings
} from "@/lib/integrations/tradingview/tradingViewMcpBridgeTypes";

export const TRADINGVIEW_MCP_SETTINGS_STORAGE_KEY = "gotrader-ai-lab-tradingview-mcp-settings";
export const TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT = "gotrader-ai-lab-tradingview-mcp-settings-updated";

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const now = () => new Date().toISOString();

const sanitizeBridgeUrl = (value?: string) => {
  const candidate = value?.trim() || DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL;
  }
};

export const defaultTradingViewMcpSettings = (): TradingViewMcpBridgeSettings => ({
  bridgeUrl: DEFAULT_TRADINGVIEW_MCP_BRIDGE_URL,
  enabled: false,
  updatedAt: now(),
  settingsVersion: TRADINGVIEW_MCP_BRIDGE_SETTINGS_VERSION
});

export const sanitizeTradingViewMcpSettings = (
  settings: Partial<TradingViewMcpBridgeSettings> = {}
): TradingViewMcpBridgeSettings => ({
  bridgeUrl: sanitizeBridgeUrl(settings.bridgeUrl),
  enabled: Boolean(settings.enabled),
  updatedAt: settings.updatedAt ?? now(),
  settingsVersion: TRADINGVIEW_MCP_BRIDGE_SETTINGS_VERSION
});

export function loadTradingViewMcpSettings(): TradingViewMcpBridgeSettings {
  if (!isBrowser()) {
    return defaultTradingViewMcpSettings();
  }
  const raw = window.localStorage.getItem(TRADINGVIEW_MCP_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return defaultTradingViewMcpSettings();
  }
  try {
    return sanitizeTradingViewMcpSettings(JSON.parse(raw) as Partial<TradingViewMcpBridgeSettings>);
  } catch {
    return defaultTradingViewMcpSettings();
  }
}

export function saveTradingViewMcpSettings(settings: Partial<TradingViewMcpBridgeSettings>) {
  const sanitized = sanitizeTradingViewMcpSettings({ ...settings, updatedAt: now() });
  if (isBrowser()) {
    window.localStorage.setItem(TRADINGVIEW_MCP_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(TRADINGVIEW_MCP_SETTINGS_UPDATED_EVENT, { detail: sanitized }));
  }
  return sanitized;
}
