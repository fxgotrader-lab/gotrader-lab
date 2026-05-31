import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { discoverTradingViewDesktop } from "./tradingview-desktop-discovery.mjs";

const debugPort = process.env.TRADINGVIEW_DESKTOP_DEBUG_PORT || "9222";

const printManualInstructions = () => {
  console.error("");
  console.error("Manual path fallback:");
  console.error("1. Right-click the TradingView shortcut.");
  console.error("2. Choose Open file location.");
  console.error("3. If Windows opens another shortcut folder, right-click again and choose Open file location.");
  console.error("4. Copy the full path to TradingView.exe.");
  console.error('5. Set it with: $env:TRADINGVIEW_DESKTOP_EXE="C:\\path\\to\\TradingView.exe"');
  console.error("6. Rerun: npm.cmd run tradingview:start-desktop-debug");
};

const summarizeCandidate = (candidate, index) => {
  const sources = candidate.sources?.length ? candidate.sources.join(",") : candidate.source;
  return `${index + 1}. ${candidate.path} (${sources || "unknown"})`;
};

const discovery = await discoverTradingViewDesktop();
const envOverride = process.env.TRADINGVIEW_DESKTOP_EXE ? resolve(process.env.TRADINGVIEW_DESKTOP_EXE) : null;
const selectedCandidate = envOverride
  ? { path: envOverride, source: "env_override", kind: "executable" }
  : discovery.selectedCandidate;

console.log("TradingView Desktop discovery summary:");
if (discovery.executableCandidates.length) {
  discovery.executableCandidates.forEach((candidate, index) => {
    console.log(summarizeCandidate(candidate, index));
  });
} else {
  console.log("No executable candidates found.");
}

if (discovery.shortcutCandidates.length) {
  console.log("");
  console.log("Shortcut candidates:");
  discovery.shortcutCandidates.forEach((shortcut, index) => {
    const target = shortcut.targetPath || "unresolved";
    const exists = shortcut.exists ? "exists" : "missing";
    console.log(`${index + 1}. ${shortcut.shortcutPath} -> ${target} (${exists})`);
  });
}

if (discovery.registryCandidates.length) {
  console.log("");
  console.log("Registry candidates:");
  discovery.registryCandidates.forEach((entry, index) => {
    console.log(
      `${index + 1}. ${entry.displayName || "TradingView"} | InstallLocation: ${
        entry.installLocation || "unknown"
      } | DisplayIcon: ${entry.displayIcon || "unknown"}`
    );
  });
}

if (discovery.startAppCandidates?.length) {
  console.log("");
  console.log("Windows Start App candidates:");
  discovery.startAppCandidates.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.name || "TradingView"} | AppID: ${entry.appId || "unknown"}`);
  });
}

if (discovery.appPackageCandidates?.length) {
  console.log("");
  console.log("Windows App Package candidates:");
  discovery.appPackageCandidates.forEach((entry, index) => {
    console.log(
      `${index + 1}. ${entry.name || "TradingView"} | Package: ${entry.packageFullName || "unknown"} | InstallLocation: ${
        entry.installLocation || "unknown"
      }`
    );
  });
}

if (discovery.localPackageHints?.packageFolders?.length || discovery.localPackageHints?.desktopInstallerHints?.length) {
  console.log("");
  console.log("Local package hints:");
  discovery.localPackageHints.packageFolders?.forEach((entry, index) => {
    console.log(`${index + 1}. Package data: ${entry.packageDataPath}`);
  });
  discovery.localPackageHints.desktopInstallerHints?.forEach((entry, index) => {
    console.log(`${index + 1}. Desktop installer hint: ${entry.packageFullName} from ${entry.hintFile}`);
  });
}

if (discovery.pathCandidates?.length) {
  console.log("");
  console.log("PATH lookup candidates:");
  discovery.pathCandidates.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.command || "TradingView"} -> ${entry.path || entry.source || entry.definition || "unknown"}`);
  });
}

if (discovery.runningProcessCandidates?.length) {
  console.log("");
  console.log("Running TradingView-like processes:");
  discovery.runningProcessCandidates.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.name || "process"} #${entry.processId || "unknown"} -> ${entry.executablePath || "unknown"}`);
  });
}

if (!selectedCandidate?.path || !existsSync(selectedCandidate.path)) {
  console.error("");
  if (envOverride) {
    console.error(`TRADINGVIEW_DESKTOP_EXE is set but the file was not found: ${envOverride}`);
  } else {
    console.error("TradingView.exe was not found.");
  }
  printManualInstructions();
  process.exitCode = 1;
} else {
  if (discovery.executableCandidates.length > 1 && !envOverride) {
    console.log("");
    console.log("Multiple executable candidates found; using the highest-ranked candidate above.");
  }

  const args = [`--remote-debugging-port=${debugPort}`];
  console.log("");
  console.log(`Selected TradingView path: ${selectedCandidate.path}`);
  console.log(`Launching: "${selectedCandidate.path}" ${args.join(" ")}`);
  const child = spawn(selectedCandidate.path, args, {
    cwd: dirname(selectedCandidate.path),
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  console.log(`TradingView Desktop launch requested. Check http://127.0.0.1:${debugPort}/json/version after it starts.`);
}
