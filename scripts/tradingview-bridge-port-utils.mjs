import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const defaultBridgeHost = process.env.TRADINGVIEW_MCP_BRIDGE_HOST || "127.0.0.1";
export const defaultBridgePort = Number(process.env.TRADINGVIEW_MCP_BRIDGE_PORT || 7331);

const timeoutSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
};

export const bridgeUrlFor = ({ host = defaultBridgeHost, port = defaultBridgePort } = {}) => `http://${host}:${port}`;

export async function probeJson(url, timeoutMs = 1500) {
  const timeout = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: timeout.signal });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    timeout.clear();
  }
}

export function isGoTraderWrapperPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const text = JSON.stringify(payload).toLowerCase();
  return (
    text.includes("tradingview mcp") &&
    text.includes("executionauthority") &&
    text.includes("readinessoverrideauthority")
  );
}

export async function findPortListeners(port = defaultBridgePort) {
  try {
    const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "tcp"], {
      windowsHide: true,
      timeout: 5000
    });
    const listeners = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes(`:${port}`) && /\bLISTENING\b/i.test(line))
      .map((line) => {
        const parts = line.split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        return {
          protocol: parts[0],
          localAddress: parts[1],
          foreignAddress: parts[2],
          state: parts[3],
          pid: Number.isFinite(pid) ? pid : undefined,
          raw: line
        };
      })
      .filter((listener) => listener.pid);
    const seen = new Set();
    return listeners.filter((listener) => {
      const key = `${listener.localAddress}:${listener.pid}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

async function runPowerShell(command) {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024 }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getProcessInfo(pid) {
  if (!pid) {
    return undefined;
  }
  const command = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"`,
    "if ($p) {",
    "  $p | Select-Object ProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
    "}"
  ].join("; ");
  const stdout = await runPowerShell(command);
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout);
      return {
        pid: Number(parsed.ProcessId ?? pid),
        name: parsed.Name,
        executablePath: parsed.ExecutablePath,
        commandLine: parsed.CommandLine
      };
    } catch {
      // Fall back to Get-Process when CIM command line details are unavailable.
    }
  }
  const processStdout = await runPowerShell(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p | Select-Object Id,ProcessName,Path | ConvertTo-Json -Compress }`
  );
  if (processStdout) {
    try {
      const parsed = JSON.parse(processStdout);
      return {
        pid: Number(parsed.Id ?? pid),
        name: parsed.ProcessName,
        executablePath: parsed.Path
      };
    } catch {
      // Try tasklist next.
    }
  }
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 5000
    });
    const line = stdout.trim().split(/\r?\n/).find(Boolean);
    if (line && !line.toLowerCase().includes("no tasks")) {
      const fields = line
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map((field) => field.replace(/^"|"$/g, ""));
      return {
        pid,
        name: fields[0]
      };
    }
  } catch {
    // Keep the diagnostic useful even when Windows blocks process lookup.
  }
  return { pid };
}

export async function getListenerProcesses(port = defaultBridgePort) {
  const listeners = await findPortListeners(port);
  const processes = await Promise.all(
    listeners.map(async (listener) => ({
      ...listener,
      process: await getProcessInfo(listener.pid)
    }))
  );
  return processes;
}

export function isSafeGoTraderWrapperProcess(processInfo) {
  const name = String(processInfo?.name ?? "").toLowerCase();
  const commandLine = String(processInfo?.commandLine ?? "").toLowerCase();
  return (
    name.includes("node") &&
    (commandLine.includes("start-tradingview-mcp-bridge") ||
      commandLine.includes("start-tradingview-mcp-bridge.mjs") ||
      commandLine.includes("gotrader"))
  );
}

export async function diagnoseBridgePort({
  host = defaultBridgeHost,
  port = defaultBridgePort,
  includeCandles = false,
  timeoutMs = 1500
} = {}) {
  const baseUrl = bridgeUrlFor({ host, port });
  const listeners = await getListenerProcesses(port);
  const health = await probeJson(`${baseUrl}/health`, timeoutMs);
  const status = await probeJson(`${baseUrl}/status`, timeoutMs);
  const candles = includeCandles
    ? await probeJson(`${baseUrl}/candles?symbol=MNQ&timeframe=5m&limit=5`, timeoutMs + 1000)
    : undefined;
  const healthyWrapper = health.ok && isGoTraderWrapperPayload(health.payload);
  const healthPayload = health.payload && typeof health.payload === "object" ? health.payload : undefined;
  const statusPayload = status.payload && typeof status.payload === "object" ? status.payload : undefined;
  const upstreamTimedOut =
    healthPayload?.upstreamStatus === "timeout" ||
    statusPayload?.upstreamStatus === "timeout" ||
    statusPayload?.upstream?.status === "timeout" ||
    String(statusPayload?.status ?? "").includes("upstream_timeout");
  const anyGoTraderProcess = listeners.some((listener) => isSafeGoTraderWrapperProcess(listener.process));
  const anyResponse = health.ok || status.ok;
  const statusLabel = !listeners.length
    ? "free"
    : healthyWrapper
      ? upstreamTimedOut
        ? "wrapper_healthy_upstream_timeout"
        : "healthy_gotrader_wrapper"
      : anyGoTraderProcess
        ? "stale_gotrader_wrapper"
        : anyResponse
          ? "wrong_process"
          : "occupied_unresponsive";
  const nextRecommendedAction =
    statusLabel === "free"
      ? "Start the wrapper with npm.cmd run tradingview:mcp-bridge."
      : statusLabel === "healthy_gotrader_wrapper"
        ? "The wrapper is already running. Use npm.cmd run test:tradingview-mcp or connect from Command Center."
        : statusLabel === "wrapper_healthy_upstream_timeout"
          ? "The wrapper is alive, but upstream TradingView MCP CLI timed out. Restart TradingView Desktop with CDP on 9222 or inspect the upstream CLI."
        : statusLabel === "stale_gotrader_wrapper"
          ? "Run npm.cmd run tradingview:mcp-stop, then npm.cmd run tradingview:mcp-bridge."
          : statusLabel === "wrong_process"
            ? "A different process owns the port. Change TRADINGVIEW_MCP_BRIDGE_PORT or stop that process manually if appropriate."
            : "Port is occupied but unresponsive. Run npm.cmd run tradingview:mcp-diagnose-port, then npm.cmd run tradingview:mcp-stop if it is a stale GoTrader wrapper.";

  return {
    host,
    port,
    url: baseUrl,
    status: statusLabel,
    listeners,
    probes: {
      health,
      status,
      candles
    },
    nextRecommendedAction
  };
}

export function compactProcess(processInfo) {
  if (!processInfo) {
    return "unknown process";
  }
  return [
    `PID ${processInfo.pid ?? "unknown"}`,
    processInfo.name,
    processInfo.executablePath,
    processInfo.commandLine
  ]
    .filter(Boolean)
    .join(" / ");
}
