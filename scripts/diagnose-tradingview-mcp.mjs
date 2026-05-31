import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { discoverTradingViewDesktop } from "./tradingview-desktop-discovery.mjs";

const homeDir = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\andre";
const upstreamRepoDir = resolve(process.env.TRADINGVIEW_MCP_REPO_DIR || join(homeDir, "tradingview-mcp"));
const upstreamCliPath = resolve(process.env.TRADINGVIEW_MCP_CLI || join(upstreamRepoDir, "src", "cli", "index.js"));
const bridgeUrl = process.env.TRADINGVIEW_MCP_BRIDGE_URL || "http://127.0.0.1:7331";
const debugUrl = process.env.TRADINGVIEW_DESKTOP_DEBUG_URL || "http://127.0.0.1:9222";
const timeoutMs = 3500;

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let payload = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Keep text payload.
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: "error", payload: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
};

const runCliStatus = () =>
  new Promise((resolveRun) => {
    if (!existsSync(upstreamCliPath)) {
      resolveRun({
        attempted: false,
        ok: false,
        message: "Upstream CLI not found."
      });
      return;
    }
    const child = spawn(process.execPath, [upstreamCliPath, "status"], {
      cwd: upstreamRepoDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolveRun({
        attempted: true,
        ok: false,
        message: `Upstream CLI status timed out after ${timeoutMs}ms.`,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveRun({
        attempted: true,
        ok: code === 0,
        code,
        message: code === 0 ? "Upstream CLI status completed." : "Upstream CLI status returned a non-zero exit code.",
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveRun({
        attempted: true,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });

const desktopDiscovery = await discoverTradingViewDesktop();
const port9222 = await fetchJson(`${debugUrl.replace(/\/$/, "")}/json/version`);
const port7331 = await fetchJson(`${bridgeUrl.replace(/\/$/, "")}/health`);
const cliStatus = await runCliStatus();

const nextSteps = [];
if (!desktopDiscovery.selectedCandidate) {
  nextSteps.push(
    "TradingView.exe was not found. Right-click the TradingView shortcut, choose Open file location, copy the executable path, then set TRADINGVIEW_DESKTOP_EXE."
  );
  nextSteps.push('$env:TRADINGVIEW_DESKTOP_EXE="C:\\path\\to\\TradingView.exe"; npm.cmd run tradingview:start-desktop-debug');
  if (desktopDiscovery.startAppCandidates?.length || desktopDiscovery.appPackageCandidates?.length) {
    nextSteps.push(
      "TradingView appears in Windows app discovery, but no launchable executable path was readable. Use the manual shortcut path override if the app was installed from Microsoft Store."
    );
  }
  if (desktopDiscovery.runningProcessCandidates?.length) {
    nextSteps.push("TradingView-like processes were found, but their executable paths were not readable as launch candidates. Check the running process path in the diagnostic output.");
  }
}
if (!port9222.ok) {
  nextSteps.push("TradingView remote debugging is not responding on 9222. Start Desktop with npm.cmd run tradingview:start-desktop-debug.");
}
if (!existsSync(upstreamRepoDir)) {
  nextSteps.push(`Upstream repo is missing at ${upstreamRepoDir}. Clone https://github.com/tradesdontlie/tradingview-mcp there or set TRADINGVIEW_MCP_REPO_DIR.`);
} else if (!existsSync(upstreamCliPath)) {
  nextSteps.push(`Upstream CLI is missing at ${upstreamCliPath}. Run npm install/build in the upstream tradingview-mcp repo or set TRADINGVIEW_MCP_CLI.`);
}
if (existsSync(upstreamCliPath) && !cliStatus.ok) {
  nextSteps.push("Upstream CLI status did not succeed. Confirm TradingView Desktop is running with remote debugging and retry.");
}
if (!port7331.ok) {
  nextSteps.push(
    'GoTrader wrapper is not responding on 7331. In a second terminal run: $env:TRADINGVIEW_MCP_REPO_DIR="C:\\Users\\andre\\tradingview-mcp"; npm.cmd run tradingview:mcp-bridge'
  );
}
if (!nextSteps.length) {
  nextSteps.push("TradingView Desktop, upstream CLI, and GoTrader wrapper checks look ready. Open /settings and fetch chart evidence.");
}

const report = {
  checkedAt: new Date().toISOString(),
  upstreamRepo: {
    path: upstreamRepoDir,
    exists: existsSync(upstreamRepoDir)
  },
  upstreamCli: {
    path: upstreamCliPath,
    exists: existsSync(upstreamCliPath),
    status: cliStatus
  },
  tradingViewDesktop: {
    envOverride: desktopDiscovery.envOverride,
    selectedCandidate: desktopDiscovery.selectedCandidate,
    executableCandidates: desktopDiscovery.executableCandidates,
    shortcutCandidates: desktopDiscovery.shortcutCandidates,
    registryCandidates: desktopDiscovery.registryCandidates,
    startAppCandidates: desktopDiscovery.startAppCandidates,
    appPackageCandidates: desktopDiscovery.appPackageCandidates,
    pathCandidates: desktopDiscovery.pathCandidates,
    runningProcessCandidates: desktopDiscovery.runningProcessCandidates,
    searchedRoots: desktopDiscovery.searchedRoots,
    shortcutRoots: desktopDiscovery.shortcutRoots
  },
  ports: {
    "9222": {
      url: `${debugUrl.replace(/\/$/, "")}/json/version`,
      responding: port9222.ok,
      status: port9222.status
    },
    "7331": {
      url: `${bridgeUrl.replace(/\/$/, "")}/health`,
      responding: port7331.ok,
      status: port7331.status
    }
  },
  safety: {
    mode: "read_only_analysis_setup",
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  },
  nextSteps
};

console.log(JSON.stringify(report, null, 2));
