import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const debugPort = process.env.TRADINGVIEW_DESKTOP_DEBUG_PORT || "9222";

const unique = (items) => [...new Set(items.filter(Boolean))];

const candidatePaths = () =>
  unique([
    process.env.TRADINGVIEW_DESKTOP_EXE,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "TradingView", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "TradingView Desktop", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "TradingView", "TradingView.exe"),
    process.env.APPDATA && join(process.env.APPDATA, "TradingView", "TradingView.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "TradingView", "TradingView.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "TradingView Desktop", "TradingView.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "TradingView", "TradingView.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "TradingView Desktop", "TradingView.exe")
  ]);

const searchRoots = () =>
  unique([
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs"),
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"]
  ]);

const shouldSkipDirectory = (name) => {
  const lower = name.toLowerCase();
  return ["node_modules", "cache", "temp", "tmp", "packages", "microsoft", "windowsapps"].some((token) =>
    lower.includes(token)
  );
};

const scanForTradingViewExe = (root, maxDepth = 4) => {
  const results = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || !existsSync(dir)) {
      return;
    }
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === "tradingview.exe") {
        results.push(fullPath);
        continue;
      }
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
        continue;
      }
      const promising = depth === 0 || entry.name.toLowerCase().includes("tradingview");
      if (promising) {
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(root, 0);
  return results;
};

const discoverTradingViewExe = () => {
  const direct = candidatePaths().filter((candidate) => existsSync(candidate));
  const scanned = searchRoots().flatMap((root) => scanForTradingViewExe(root));
  return unique([...direct, ...scanned]).map((item) => resolve(item));
};

const discoveredPaths = discoverTradingViewExe();
const selectedPath = process.env.TRADINGVIEW_DESKTOP_EXE
  ? resolve(process.env.TRADINGVIEW_DESKTOP_EXE)
  : discoveredPaths[0];

if (!selectedPath || !existsSync(selectedPath)) {
  console.error("TradingView.exe was not found.");
  console.error("Set TRADINGVIEW_DESKTOP_EXE to the full path, for example:");
  console.error('$env:TRADINGVIEW_DESKTOP_EXE="C:\\path\\to\\TradingView.exe"');
  process.exitCode = 1;
} else {
  if (discoveredPaths.length > 1 && !process.env.TRADINGVIEW_DESKTOP_EXE) {
    console.log("Multiple TradingView.exe paths found; using the first one.");
    discoveredPaths.forEach((path, index) => console.log(`${index + 1}. ${path}`));
  }

  const args = [`--remote-debugging-port=${debugPort}`];
  console.log(`Launching: "${selectedPath}" ${args.join(" ")}`);
  const child = spawn(selectedPath, args, {
    cwd: dirname(selectedPath),
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  console.log(`TradingView Desktop launch requested. Check http://127.0.0.1:${debugPort}/json/version after it starts.`);
}
