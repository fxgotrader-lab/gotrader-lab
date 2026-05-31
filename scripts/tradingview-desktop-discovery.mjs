import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const homeDir = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\andre";

const unique = (items) => [...new Set(items.filter(Boolean))];

const toResolvedPath = (value) => {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  return resolve(value.replace(/^"|"$/g, "").trim());
};

const pathExists = (value) => {
  try {
    return Boolean(value && existsSync(value));
  } catch {
    return false;
  }
};

const isExecutable = (value) => extname(value || "").toLowerCase() === ".exe";

const looksLikeTradingView = (value) => {
  const lower = String(value || "").toLowerCase();
  const lowerBase = basename(lower);
  const stem = lowerBase.replace(/\.(exe|lnk)$/i, "");
  return lower.includes("tradingview") || lower.includes("trading view") || stem === "tv" || lower.includes("\\tv\\");
};

const isLikelyTradingViewExecutable = (value) => {
  const lowerBase = basename(value || "").toLowerCase();
  const lowerDir = dirname(value || "").toLowerCase();
  return (
    isExecutable(value) &&
    (lowerBase.includes("tradingview") ||
      lowerBase.includes("trading view") ||
      lowerBase === "tv.exe" ||
      lowerDir.includes("tradingview") ||
      lowerDir.includes("trading view") ||
      lowerDir.includes("\\tv\\"))
  );
};

const safeReadDir = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const shouldSkipDirectory = (name) => {
  const lower = name.toLowerCase();
  return ["node_modules", "cache", "temp", "tmp", "packages", "microsoft\\edge", "google\\chrome"].some((token) =>
    lower.includes(token)
  );
};

const directExecutableCandidates = () =>
  unique([
    process.env.TRADINGVIEW_DESKTOP_EXE,
    join(homeDir, "AppData", "Local", "Programs", "TradingView", "TradingView.exe"),
    join(homeDir, "AppData", "Local", "Programs", "TradingView Desktop", "TradingView.exe"),
    join(homeDir, "AppData", "Local", "Programs", "TradingView.app", "TradingView.exe"),
    join(homeDir, "AppData", "Local", "TradingView", "TradingView.exe"),
    join(homeDir, "AppData", "Roaming", "TradingView", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "TradingView", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "TradingView Desktop", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "TradingView.app", "TradingView.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "TradingView", "TradingView.exe"),
    process.env.APPDATA && join(process.env.APPDATA, "TradingView", "TradingView.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "TradingView", "TradingView.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "TradingView Desktop", "TradingView.exe"),
    process.env.ProgramFiles && join(process.env.ProgramFiles, "TradingView.app", "TradingView.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "TradingView", "TradingView.exe"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "TradingView Desktop", "TradingView.exe")
  ])
    .map(toResolvedPath)
    .filter(Boolean);

const scanRoots = () =>
  unique([
    join(homeDir, "AppData", "Local", "Programs"),
    join(homeDir, "AppData", "Local", "Apps", "2.0"),
    join(homeDir, "AppData", "Local", "Packages"),
    join(homeDir, "AppData", "Local"),
    join(homeDir, "AppData", "Roaming"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Apps", "2.0"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Packages"),
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.ProgramFiles,
    process.env.ProgramFiles && join(process.env.ProgramFiles, "WindowsApps"),
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps")
  ])
    .map(toResolvedPath)
    .filter((item) => item && pathExists(item));

const shortcutRoots = () =>
  unique([
    process.env.APPDATA && join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"),
    process.env.ProgramData && join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"),
    join(homeDir, "Desktop"),
    join(homeDir, "OneDrive", "Desktop"),
    process.env.OneDrive && join(process.env.OneDrive, "Desktop"),
    process.env.OneDriveConsumer && join(process.env.OneDriveConsumer, "Desktop"),
    process.env.OneDriveCommercial && join(process.env.OneDriveCommercial, "Desktop"),
    "C:\\Users\\Public\\Desktop"
  ])
    .map(toResolvedPath)
    .filter((item) => item && pathExists(item));

const scanForExecutables = (root, maxDepth = 5) => {
  const found = [];
  const rootLower = root.toLowerCase();
  const broadPackageRoot = rootLower.includes("\\apps\\2.0") || rootLower.includes("\\windowsapps");
  const walk = (dir, depth, parentPromising = false) => {
    if (depth > maxDepth || !pathExists(dir)) {
      return;
    }
    const entries = safeReadDir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && isLikelyTradingViewExecutable(fullPath)) {
        found.push(fullPath);
        continue;
      }
      if (!entry.isDirectory() || shouldSkipDirectory(fullPath)) {
        continue;
      }
      const promising = parentPromising || broadPackageRoot || looksLikeTradingView(entry.name) || depth === 0;
      if (promising) {
        walk(fullPath, depth + 1, parentPromising || looksLikeTradingView(entry.name));
      }
    }
  };
  walk(root, 0);
  return found;
};

const scanForShortcuts = (root, maxDepth = 7) => {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || !pathExists(dir)) {
      return;
    }
    const entries = safeReadDir(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".lnk" && looksLikeTradingView(entry.name)) {
        found.push(fullPath);
        continue;
      }
      if (entry.isDirectory() && !shouldSkipDirectory(fullPath)) {
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(root, 0);
  return found;
};

const scanForLocalPackageHints = () => {
  const packageRoots = unique([
    join(homeDir, "AppData", "Local", "Packages"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Packages")
  ])
    .map(toResolvedPath)
    .filter((item) => item && pathExists(item));

  const packageFolders = packageRoots.flatMap((root) =>
    safeReadDir(root)
      .filter((entry) => entry.isDirectory() && looksLikeTradingView(entry.name))
      .map((entry) => ({
        packageFamilyName: entry.name,
        packageDataPath: join(root, entry.name)
      }))
  );

  const desktopInstallerHints = packageRoots.flatMap((root) =>
    safeReadDir(root)
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith("microsoft.desktopappinstaller_"))
      .flatMap((entry) => {
        const localCache = join(root, entry.name, "LocalCache");
        return safeReadDir(localCache)
          .filter((item) => item.isFile() && looksLikeTradingView(item.name))
          .map((item) => {
            const packageFullName = item.name.match(/^(TradingView\.Desktop_[^{}]+__[^{}]+)(?:\{|_temp|\.pri)/i)?.[1];
            return {
              packageFullName,
              hintFile: join(localCache, item.name)
            };
          })
          .filter((item) => item.packageFullName);
      })
  );

  return {
    packageFolders,
    desktopInstallerHints
  };
};

const runPowerShellJson = (script, env = {}, timeoutMs = 8000) =>
  new Promise((resolveRun) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolveRun({ ok: false, payload: [], stderr: `PowerShell timed out after ${timeoutMs}ms.` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const parsed = stdout.trim() ? JSON.parse(stdout) : [];
        resolveRun({ ok: code === 0, payload: Array.isArray(parsed) ? parsed : [parsed], stderr: stderr.trim() });
      } catch {
        resolveRun({ ok: false, payload: [], stderr: stderr.trim() || stdout.trim() });
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolveRun({ ok: false, payload: [], stderr: error instanceof Error ? error.message : String(error) });
    });
  });

export const resolveShortcutTargets = async (shortcutPaths) => {
  if (!shortcutPaths.length) {
    return [];
  }
  const script = `
$paths = $env:TRADINGVIEW_SHORTCUT_PATHS | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
$results = foreach ($path in $paths) {
  try {
    $shortcut = $shell.CreateShortcut($path)
    [PSCustomObject]@{
      shortcutPath = $path
      targetPath = $shortcut.TargetPath
      arguments = $shortcut.Arguments
      workingDirectory = $shortcut.WorkingDirectory
      exists = [System.IO.File]::Exists($shortcut.TargetPath)
    }
  } catch {
    [PSCustomObject]@{
      shortcutPath = $path
      targetPath = $null
      arguments = $null
      workingDirectory = $null
      exists = $false
      error = $_.Exception.Message
    }
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script, {
    TRADINGVIEW_SHORTCUT_PATHS: JSON.stringify(shortcutPaths)
  });
  return result.payload;
};

export const readTradingViewRegistryEntries = async () => {
  const script = `
$roots = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$results = foreach ($root in $roots) {
  if (Test-Path $root) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $item = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($item.DisplayName -match 'TradingView') {
        [PSCustomObject]@{
          registryPath = $_.PSPath
          displayName = $item.DisplayName
          installLocation = $item.InstallLocation
          displayIcon = $item.DisplayIcon
          uninstallString = $item.UninstallString
        }
      }
    }
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script);
  return result.payload;
};

export const readTradingViewStartApps = async () => {
  const script = `
$results = Get-StartApps -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match 'TradingView|Trading View'
} | ForEach-Object {
  [PSCustomObject]@{
    name = $_.Name
    appId = $_.AppID
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script);
  return result.payload;
};

export const readTradingViewAppPackages = async () => {
  const script = `
$results = Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match 'TradingView|Trading View' -or $_.PackageFullName -match 'TradingView|Trading View'
} | ForEach-Object {
  [PSCustomObject]@{
    name = $_.Name
    packageFullName = $_.PackageFullName
    installLocation = $_.InstallLocation
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script);
  return result.payload;
};

export const readTradingViewPathEntries = async () => {
  const script = `
$commands = @('TradingView.exe', 'TradingView Desktop.exe', 'tv.exe')
$results = foreach ($command in $commands) {
  Get-Command $command -ErrorAction SilentlyContinue | ForEach-Object {
    [PSCustomObject]@{
      command = $command
      source = $_.Source
      path = $_.Path
      definition = $_.Definition
    }
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script);
  return result.payload;
};

export const readTradingViewRunningProcesses = async () => {
  const script = `
$results = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match 'TradingView|Trading View|^tv\\.exe$' -or $_.ExecutablePath -match 'TradingView|Trading View'
} | ForEach-Object {
  [PSCustomObject]@{
    name = $_.Name
    processId = $_.ProcessId
    executablePath = $_.ExecutablePath
    commandLine = $_.CommandLine
  }
}
$results | ConvertTo-Json -Depth 4
`;
  const result = await runPowerShellJson(script);
  return result.payload;
};

const cleanDisplayIconPath = (value) => {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  const stripped = value.trim().replace(/^"|"$/g, "");
  const commaIndex = stripped.toLowerCase().lastIndexOf(".exe,");
  if (commaIndex >= 0) {
    return stripped.slice(0, commaIndex + 4);
  }
  const exeIndex = stripped.toLowerCase().lastIndexOf(".exe");
  return exeIndex >= 0 ? stripped.slice(0, exeIndex + 4) : stripped;
};

const registryExecutableCandidates = (entries) =>
  entries.flatMap((entry) =>
    unique([
      cleanDisplayIconPath(entry.displayIcon),
      entry.installLocation && join(entry.installLocation, "TradingView.exe"),
      entry.installLocation && join(entry.installLocation, "TradingView Desktop.exe")
    ])
      .map(toResolvedPath)
      .filter((candidate) => candidate && pathExists(candidate) && isExecutable(candidate))
      .map((candidate) => ({
        path: candidate,
        source: "registry",
        displayName: entry.displayName,
        registryPath: entry.registryPath
      }))
  );

const appPackageExecutableCandidates = (entries) =>
  entries.flatMap((entry) =>
    unique([
      entry.installLocation && join(entry.installLocation, "TradingView.exe"),
      entry.installLocation && join(entry.installLocation, "TradingView Desktop.exe"),
      entry.installLocation && join(entry.installLocation, "tv.exe")
    ])
      .map(toResolvedPath)
      .filter((candidate) => candidate && pathExists(candidate) && isExecutable(candidate))
      .map((candidate) => ({
        path: candidate,
        source: "app_package",
        displayName: entry.name,
        packageFullName: entry.packageFullName
      }))
  );

const packageHintExecutableCandidates = (packageHints) =>
  packageHints.desktopInstallerHints
    .flatMap((hint) =>
      unique([
        hint.packageFullName && join("C:\\Program Files\\WindowsApps", hint.packageFullName, "TradingView.exe"),
        hint.packageFullName && join("C:\\Program Files\\WindowsApps", hint.packageFullName, "tv.exe")
      ])
        .map(toResolvedPath)
        .filter((candidate) => candidate && pathExists(candidate) && isExecutable(candidate))
        .map((candidate) => ({
          path: candidate,
          source: "local_package_hint",
          packageFullName: hint.packageFullName,
          hintFile: hint.hintFile
        }))
    );

const pathExecutableCandidates = (entries) =>
  entries
    .flatMap((entry) => unique([entry.path, entry.source, entry.definition]))
    .map(toResolvedPath)
    .filter((candidate) => candidate && pathExists(candidate) && isExecutable(candidate))
    .map((candidate) => ({
      path: candidate,
      source: "path_lookup"
    }));

const processExecutableCandidates = (entries) =>
  entries
    .map((entry) => toResolvedPath(entry.executablePath))
    .filter((candidate) => candidate && pathExists(candidate) && isExecutable(candidate))
    .map((candidate) => ({
      path: candidate,
      source: "running_process"
    }));

const pathFreshnessScore = (candidate) => {
  try {
    const stats = statSync(candidate.path);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
};

const candidateRank = (candidate) => {
  const lowerPath = candidate.path.toLowerCase();
  const lowerBase = basename(candidate.path).toLowerCase();
  let score = 0;
  if (candidate.source === "env_override") score += 1000;
  if (candidate.kind === "executable") score += 200;
  if (candidate.source === "direct") score += 100;
  if (candidate.source === "shortcut_target") score += 80;
  if (candidate.source === "registry") score += 70;
  if (candidate.source === "app_package") score += 65;
  if (candidate.source === "local_package_hint") score += 95;
  if (candidate.source === "running_process") score += 90;
  if (candidate.source === "path_lookup") score += 75;
  if (candidate.source === "windows_app_alias") score += 30;
  if (lowerBase === "tradingview.exe") score += 100;
  if (lowerBase === "tv.exe") score += 60;
  if (lowerPath.includes("\\programs\\tradingview")) score += 40;
  return score;
};

export async function discoverTradingViewDesktop() {
  const directCandidates = directExecutableCandidates()
    .filter((candidate) => pathExists(candidate) && isExecutable(candidate))
    .map((candidate) => ({
      path: candidate,
      kind: "executable",
      source: candidate === toResolvedPath(process.env.TRADINGVIEW_DESKTOP_EXE) ? "env_override" : "direct"
    }));

  const scannedCandidates = scanRoots()
    .flatMap((root) => scanForExecutables(root))
    .map((candidate) => ({
      path: toResolvedPath(candidate),
      kind: "executable",
      source: candidate.toLowerCase().includes("\\windowsapps\\") ? "windows_app_alias" : "scan"
    }))
    .filter((candidate) => candidate.path && pathExists(candidate.path));

  const shortcutPaths = shortcutRoots().flatMap((root) => scanForShortcuts(root));
  const shortcutTargets = await resolveShortcutTargets(shortcutPaths);
  const shortcutCandidates = shortcutTargets
    .filter((item) => item.targetPath && item.exists && isLikelyTradingViewExecutable(item.targetPath))
    .map((item) => ({
      path: toResolvedPath(item.targetPath),
      kind: "executable",
      source: "shortcut_target",
      shortcutPath: item.shortcutPath,
      arguments: item.arguments,
      workingDirectory: item.workingDirectory
    }));

  const registryEntries = await readTradingViewRegistryEntries();
  const registryCandidates = registryExecutableCandidates(registryEntries);
  const startAppEntries = await readTradingViewStartApps();
  const appPackageEntries = await readTradingViewAppPackages();
  const appPackageCandidates = appPackageExecutableCandidates(appPackageEntries);
  const localPackageHints = scanForLocalPackageHints();
  const localPackageCandidates = packageHintExecutableCandidates(localPackageHints);
  const pathEntries = await readTradingViewPathEntries();
  const pathCandidates = pathExecutableCandidates(pathEntries);
  const runningProcessEntries = await readTradingViewRunningProcesses();
  const runningProcessCandidates = processExecutableCandidates(runningProcessEntries);

  const candidateMap = new Map();
  [
    ...directCandidates,
    ...scannedCandidates,
    ...shortcutCandidates,
    ...registryCandidates,
    ...appPackageCandidates,
    ...localPackageCandidates,
    ...pathCandidates,
    ...runningProcessCandidates
  ].forEach((candidate) => {
    if (!candidate.path) {
      return;
    }
    const key = candidate.path.toLowerCase();
    const existing = candidateMap.get(key);
    candidateMap.set(key, existing ? { ...existing, sources: unique([...(existing.sources ?? [existing.source]), candidate.source]) } : candidate);
  });

  const executableCandidates = [...candidateMap.values()]
    .filter((candidate) => pathExists(candidate.path) && isExecutable(candidate.path))
    .sort((a, b) => candidateRank(b) - candidateRank(a) || pathFreshnessScore(b) - pathFreshnessScore(a));

  return {
    envOverride: process.env.TRADINGVIEW_DESKTOP_EXE || null,
    executableCandidates,
    shortcutCandidates: shortcutTargets,
    registryCandidates: registryEntries,
    startAppCandidates: startAppEntries,
    appPackageCandidates: appPackageEntries,
    localPackageHints,
    pathCandidates: pathEntries,
    runningProcessCandidates: runningProcessEntries,
    selectedCandidate: executableCandidates[0] ?? null,
    searchedRoots: scanRoots(),
    shortcutRoots: shortcutRoots()
  };
}
