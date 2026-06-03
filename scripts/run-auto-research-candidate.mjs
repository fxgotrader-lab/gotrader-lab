import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcLibRoot = path.join(workspaceRoot, "src", "lib");
const allowedVariants = new Set(["strict", "balanced", "exploratory", "all"]);
const authorityNone = {
  executionAuthority: "none",
  brokerAuthority: "none",
  readinessOverrideAuthority: "none"
};

const config = {
  family: process.env.AUTO_RESEARCH_CANDIDATE_FAMILY || "reversal_expansion_confirmation",
  variant: process.env.AUTO_RESEARCH_VARIANT || "all",
  bridgeUrl: (process.env.MT5_READONLY_BRIDGE_URL || "http://127.0.0.1:7341").replace(/\/$/, ""),
  requestedSymbol: process.env.MT5_READONLY_REQUESTED_SYMBOL || "MNQ",
  brokerSymbol:
    process.env.MT5_READONLY_BROKER_SYMBOL ||
    process.env.MT5_READONLY_DEFAULT_SYMBOL ||
    "USTECH",
  timeframe: process.env.AUTO_RESEARCH_TIMEFRAME || process.env.MT5_READONLY_TEST_TIMEFRAME || "5m",
  candleLimit: Number(process.env.AUTO_RESEARCH_CANDLE_LIMIT || process.env.MT5_READONLY_TEST_LIMIT || 1000),
  fetchTimeoutMs: Number(process.env.AUTO_RESEARCH_SOURCE_TIMEOUT_MS || process.env.MT5_READONLY_TEST_TIMEOUT_MS || 5000),
  maxCandidates: Number(process.env.AUTO_RESEARCH_MAX_CANDIDATES || 25),
  validationMode: process.env.AUTO_RESEARCH_VALIDATION_MODE || "direct"
};

if (!allowedVariants.has(config.variant)) {
  console.error(
    JSON.stringify(
      {
        status: "invalid_input",
        error: `AUTO_RESEARCH_VARIANT must be one of ${[...allowedVariants].join(", ")}.`,
        received: config.variant
      },
      null,
      2
    )
  );
  process.exit(1);
}

if (!["direct", "full"].includes(config.validationMode)) {
  console.error(
    JSON.stringify(
      {
        status: "invalid_input",
        error: "AUTO_RESEARCH_VALIDATION_MODE must be direct or full.",
        received: config.validationMode
      },
      null,
      2
    )
  );
  process.exit(1);
}

const safeArray = (value) => (Array.isArray(value) ? value : []);
const round = (value, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
const debug = (...args) => {
  if (process.env.AUTO_RESEARCH_DEBUG === "1") {
    console.error("[auto-research-candidate]", ...args);
  }
};

const fetchJson = async (url, timeoutMs = config.fetchTimeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload,
      url
    };
  } finally {
    clearTimeout(timeout);
  }
};

const printAndExit = (payload, exitCode = 0) => {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
};

const fetchMt5Source = async () => {
  const query = new URLSearchParams({
    requestedSymbol: config.requestedSymbol,
    symbol: config.brokerSymbol,
    timeframe: config.timeframe,
    limit: String(config.candleLimit)
  });

  const healthUrl = `${config.bridgeUrl}/health`;
  const statusUrl = `${config.bridgeUrl}/status`;
  const candlesUrl = `${config.bridgeUrl}/candles?${query.toString()}`;
  let health;
  let status;
  let candlesResponse;

  try {
    health = await fetchJson(healthUrl);
    status = await fetchJson(statusUrl);
    candlesResponse = await fetchJson(candlesUrl);
  } catch (error) {
    return {
      ok: false,
      health,
      status,
      error: error instanceof Error ? error.message : String(error),
      attemptedUrl: candlesUrl
    };
  }

  const payload = candlesResponse.payload && typeof candlesResponse.payload === "object"
    ? candlesResponse.payload
    : undefined;
  const candles = safeArray(payload?.candles);
  const returnedCount = Number(payload?.returnedCount ?? payload?.candleCount ?? candles.length);
  return {
    ok: candlesResponse.ok && candles.length > 0,
    health,
    status,
    candlesResponse,
    candlesPayload: payload,
    returnedCount,
    attemptedUrl: candlesUrl
  };
};

const failSourceUnavailable = (sourceResult) => {
  printAndExit(
    {
      status: "source_unavailable",
      message: "MT5 read-only source is unavailable to the headless candidate runner.",
      family: config.family,
      variant: config.variant,
      source: {
        provider: "mt5_read_only",
        bridgeUrl: config.bridgeUrl,
        requestedSymbol: config.requestedSymbol,
        brokerSymbol: config.brokerSymbol,
        timeframe: config.timeframe,
        requestedLimit: config.candleLimit,
        attemptedUrl: sourceResult.attemptedUrl,
        health: compactEndpoint(sourceResult.health),
        status: compactEndpoint(sourceResult.status),
        candles: compactEndpoint(sourceResult.candlesResponse),
        error: sourceResult.error
      },
      instructions: [
        "Start the MT5 upstream server.",
        "Start the GoTrader MT5 read-only wrapper with npm.cmd run mt5:readonly-bridge.",
        "Confirm the feed with npm.cmd run test:mt5-readonly.",
        "Set MT5_READONLY_BROKER_SYMBOL=USTECH if the broker symbol is not persisted in your shell."
      ],
      safetyAuthority: authorityNone
    },
    1
  );
};

const compactEndpoint = (result) => {
  if (!result) {
    return undefined;
  }
  const payload = result.payload && typeof result.payload === "object" ? result.payload : undefined;
  return {
    ok: result.ok,
    status: result.status,
    url: result.url,
    connectionStatus: payload?.connectionStatus ?? payload?.upstreamStatus,
    warning: safeArray(payload?.warnings)[0],
    error: payload?.error ?? (typeof result.payload === "string" ? result.payload.slice(0, 160) : undefined)
  };
};

const normalizeCandle = (raw, index) => {
  const timestamp = String(raw?.timestamp ?? raw?.time ?? "");
  const open = Number(raw?.open);
  const high = Number(raw?.high);
  const low = Number(raw?.low);
  const close = Number(raw?.close);
  const volume = Number(raw?.volume ?? raw?.tickVolume ?? 0);
  if (!timestamp || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return undefined;
  }
  return {
    id: String(raw?.id ?? `mt5_${timestamp}_${index}`),
    symbol: config.requestedSymbol,
    timeframe: config.timeframe,
    timestamp,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
};

const normalizeCandles = (rawCandles) => {
  const byTimestamp = new Map();
  rawCandles.forEach((raw, index) => {
    const candle = normalizeCandle(raw, index);
    if (candle) {
      byTimestamp.set(candle.timestamp, candle);
    }
  });
  return [...byTimestamp.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
};

const fingerprintFor = (candles) => {
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) {
    return "empty";
  }
  return [
    "mt5_read_only",
    config.requestedSymbol,
    config.brokerSymbol,
    config.timeframe,
    candles.length,
    first.timestamp,
    last.timestamp,
    first.close,
    last.close
  ].join("|");
};

const collectSourceFiles = (root) => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        files.push(fullPath);
      }
    }
  };
  walk(root);
  return files;
};

const compileLibraryBundle = () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gotrader-auto-research-"));
  fs.writeFileSync(path.join(outRoot, "package.json"), JSON.stringify({ type: "module" }), "utf8");
  const workspaceNodeModules = path.join(workspaceRoot, "node_modules");
  if (fs.existsSync(workspaceNodeModules)) {
    try {
      fs.symlinkSync(workspaceNodeModules, path.join(outRoot, "node_modules"), "junction");
    } catch {
      // If the junction already exists or the filesystem rejects it, Node may still resolve
      // dependencies through absolute package imports rewritten by the caller's environment.
    }
  }
  const sourceFiles = collectSourceFiles(srcLibRoot);
  const sourceSet = new Set(sourceFiles.map((file) => path.normalize(file)));

  const sourceToOutput = (sourcePath) => {
    const relative = path.relative(srcLibRoot, sourcePath);
    return path.join(outRoot, relative).replace(/\.ts$/, ".js");
  };

  const candidatePathsFor = (basePath) => [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts")
  ];

  const resolveSourceSpecifier = (specifier, fromSource) => {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
      return undefined;
    }
    const basePath = specifier.startsWith("@/")
      ? path.join(workspaceRoot, "src", specifier.slice(2))
      : path.resolve(path.dirname(fromSource), specifier);
    const match = candidatePathsFor(basePath).find((candidate) => sourceSet.has(path.normalize(candidate)));
    return match;
  };

  const toImportSpecifier = (targetSource, fromSource) => {
    const fromOutput = sourceToOutput(fromSource);
    const targetOutput = sourceToOutput(targetSource);
    let relative = path.relative(path.dirname(fromOutput), targetOutput).replace(/\\/g, "/");
    if (!relative.startsWith(".")) {
      relative = `./${relative}`;
    }
    return relative;
  };

  const rewriteSpecifier = (specifier, fromSource) => {
    const resolved = resolveSourceSpecifier(specifier, fromSource);
    return resolved ? toImportSpecifier(resolved, fromSource) : specifier;
  };

  const rewriteImports = (sourceText, sourcePath) =>
    sourceText
      .replace(/(from\s+["'])([^"']+)(["'])/g, (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteSpecifier(specifier, sourcePath)}${suffix}`
      )
      .replace(/(import\s*\(\s*["'])([^"']+)(["']\s*\))/g, (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteSpecifier(specifier, sourcePath)}${suffix}`
      )
      .replace(/(import\s+["'])([^"']+)(["'])/g, (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteSpecifier(specifier, sourcePath)}${suffix}`
      );

  for (const sourcePath of sourceFiles) {
    const rewritten = rewriteImports(fs.readFileSync(sourcePath, "utf8"), sourcePath);
    const output = ts.transpileModule(rewritten, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        verbatimModuleSyntax: false,
        sourceMap: false
      },
      fileName: sourcePath
    }).outputText;
    const outputPath = sourceToOutput(sourcePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  }

  return {
    outRoot,
    importLib: (relativePath) => import(pathToFileURL(path.join(outRoot, relativePath)).href)
  };
};

const variantForCandidate = (candidate) => {
  const label = String(candidate.label || "").toLowerCase();
  if (label.includes("strict")) {
    return "strict";
  }
  if (label.includes("balanced")) {
    return "balanced";
  }
  if (label.includes("exploratory")) {
    return "exploratory";
  }
  return "unknown";
};

const reportGrinch = (backtestResult) => {
  const summary = backtestResult?.summary?.grinchSummary;
  const latestScore = summary?.latestScore;
  const reversalProfile = latestScore?.evaluatedProfiles?.find((profile) => profile.profile === "reversal");
  const missingExpansionEvidence = safeArray(latestScore?.missingEvidence)
    .filter((item) => /12am|london|expansion|reversal/i.test(item))
    .slice(0, 8);
  const expansionConfirmedByReason = safeArray(latestScore?.reasons).some((item) => /expanded away|reversal profile/i.test(item));
  const conditionPassed = Boolean(
    latestScore &&
      reversalProfile &&
      (reversalProfile.selectable || latestScore.activeProfile === "reversal") &&
      !missingExpansionEvidence.some((item) => /no clean expansion away/i.test(item)) &&
      (expansionConfirmedByReason || latestScore.activeProfile === "reversal")
  );
  const status = !latestScore ? "unavailable" : conditionPassed ? "passed" : "missing_evidence";
  return {
    selectedProfile: latestScore?.activeProfile ?? "none",
    setupQuality: latestScore?.setupQuality,
    hardGateReason: latestScore?.hardGateReason,
    timingStatus: reversalProfile?.timingGrade ?? latestScore?.timingGrade,
    expansionConfirmationStatus: status,
    reversalExpansionConditionPassed: conditionPassed,
    reversalProfileState: reversalProfile?.state,
    reversalEntryIntent: reversalProfile?.entryIntent,
    profileCandidateCount: summary?.profileCandidateCounts?.reversal ?? 0,
    missingExpansionEvidence: missingExpansionEvidence.length
      ? missingExpansionEvidence
      : conditionPassed
        ? []
        : ["Reversal expansion evidence was not available in the latest Grinch score."],
    missingEvidence: safeArray(latestScore?.missingEvidence).slice(0, 12),
    supportingReasons: safeArray(latestScore?.reasons).slice(0, 8),
    score: latestScore?.grinchModelScore,
    falsePositiveRisk: latestScore?.falsePositiveRisk,
    profileValidity: latestScore?.profileValidity
  };
};

const summarizeBacktest = (result) => ({
  trades: result.summary.totalTrades,
  directionalTrades: result.summary.directionalTrades,
  skippedSignals: result.summary.skippedSignals,
  winRate: round(result.summary.winRate, 3),
  averageR: round(result.summary.averageR, 2),
  drawdown: round(result.summary.maxDrawdown, 2),
  profitFactor: result.summary.profitFactor,
  bestTradeR: round(result.summary.bestTrade?.rMultiple ?? 0, 2),
  worstTradeR: round(result.summary.worstTrade?.rMultiple ?? 0, 2)
});

const metricsFromBacktest = (result) => {
  const grinchSummary = result.summary.grinchSummary;
  const falsePositiveRisk = grinchSummary?.averageFalsePositiveRisk ?? grinchSummary?.latestScore?.falsePositiveRisk ?? 0;
  const estimatedFalsePositives = Math.round(
    result.summary.totalTrades * (1 - result.summary.winRate) * (falsePositiveRisk / 100)
  );
  return {
    validationId: `headless_direct_${Date.now()}`,
    validationTimestamp: new Date().toISOString(),
    totalTrades: result.summary.totalTrades,
    winRate: round(result.summary.winRate, 3),
    averageR: round(result.summary.averageR, 2),
    maxDrawdown: round(result.summary.maxDrawdown, 2),
    profitFactor: result.summary.profitFactor,
    skippedSignals: result.summary.skippedSignals,
    falsePositiveCount: estimatedFalsePositives,
    confidenceCalibration: null,
    readinessScore: null,
    readinessStatus: "not_evaluated",
    stabilityScore: null,
    conservativeScenarioStable: false,
    strongestScenario: "not_evaluated",
    weakestScenario: "not_evaluated"
  };
};

const directComparison = (baselineMetrics, metrics) => {
  const positiveChanges = [];
  const negativeChanges = [];
  if (metrics.averageR > baselineMetrics.averageR) {
    positiveChanges.push(`Average R improved: ${baselineMetrics.averageR}R -> ${metrics.averageR}R.`);
  } else if (metrics.averageR < baselineMetrics.averageR) {
    negativeChanges.push(`Average R weakened: ${baselineMetrics.averageR}R -> ${metrics.averageR}R.`);
  }
  if (metrics.winRate > baselineMetrics.winRate) {
    positiveChanges.push(`Win rate improved: ${round(baselineMetrics.winRate * 100, 1)}% -> ${round(metrics.winRate * 100, 1)}%.`);
  } else if (metrics.winRate < baselineMetrics.winRate) {
    negativeChanges.push(`Win rate weakened: ${round(baselineMetrics.winRate * 100, 1)}% -> ${round(metrics.winRate * 100, 1)}%.`);
  }
  if (metrics.maxDrawdown < baselineMetrics.maxDrawdown) {
    positiveChanges.push(`Drawdown improved: ${baselineMetrics.maxDrawdown}R -> ${metrics.maxDrawdown}R.`);
  } else if (metrics.maxDrawdown > baselineMetrics.maxDrawdown) {
    negativeChanges.push(`Drawdown worsened: ${baselineMetrics.maxDrawdown}R -> ${metrics.maxDrawdown}R.`);
  }
  const improved =
    metrics.averageR >= baselineMetrics.averageR &&
    metrics.winRate >= baselineMetrics.winRate &&
    metrics.maxDrawdown <= baselineMetrics.maxDrawdown &&
    metrics.totalTrades > 0;
  return {
    improved,
    stabilityImproved: metrics.maxDrawdown <= baselineMetrics.maxDrawdown,
    recommendation: improved ? "keep_testing" : "reject",
    promotionVerdict: "needs_full_validation",
    summary: improved
      ? "Direct headless backtest improved headline metrics; full validation and walk-forward are still required."
      : "Direct headless backtest did not improve enough headline metrics for promotion.",
    positiveChanges,
    negativeChanges,
    criticalRegressions: metrics.totalTrades < 3 ? ["Direct backtest trade sample is too small."] : [],
    sanityWarnings: [
      "Direct mode does not run the full validation suite, evidence ledger, maturity review, or walk-forward."
    ],
    followUpSearchDirection: "Run AUTO_RESEARCH_VALIDATION_MODE=full or the UI Auto Research workflow before treating this as promotion evidence."
  };
};

const directScoreBreakdown = (baselineMetrics, metrics, grinch) => {
  const tradeCountScore = Math.min(100, metrics.totalTrades * 12);
  const averageRScore = Math.min(100, Math.max(0, ((metrics.averageR + 0.4) / 1.4) * 100));
  const winRateScore = Math.min(100, Math.max(0, metrics.winRate * 100));
  const drawdownScore = Math.min(100, Math.max(0, 100 - metrics.maxDrawdown * 14));
  const falsePositiveScore = Math.min(100, Math.max(0, 100 - metrics.falsePositiveCount * 12));
  const grinchModelScore = grinch.score ?? 50;
  const stabilityImproved = metrics.maxDrawdown <= baselineMetrics.maxDrawdown;
  const sufficientSample = metrics.totalTrades >= 2 && metrics.totalTrades >= Math.max(2, baselineMetrics.totalTrades * 0.35);
  const totalScore = Math.round(
    averageRScore * 0.18 +
      winRateScore * 0.14 +
      drawdownScore * 0.16 +
      falsePositiveScore * 0.14 +
      tradeCountScore * 0.14 +
      grinchModelScore * 0.24
  );
  return {
    totalScore,
    grinchModelScore: Math.round(grinchModelScore),
    grinchFalsePositiveRisk: grinch.falsePositiveRisk,
    grinchProfileValidity: grinch.profileValidity,
    stabilityImproved,
    sufficientSample,
    rationale:
      "Direct headless score uses single-window backtest metrics and Grinch support only; full Auto Research scoring requires validation mode."
  };
};

const summarizeCandidate = ({
  candidate,
  variant,
  backtestResult,
  validationReport,
  quality,
  readiness,
  metrics,
  comparison,
  scoreBreakdown
}) => {
  const grinch = reportGrinch(backtestResult);
  return {
    candidateId: candidate.candidateId,
    candidateFamily: candidate.candidateFamily,
    variant,
    label: candidate.label,
    rationale: candidate.rationale,
    researchOnly: candidate.candidateFamilyMetadata?.researchOnly ?? true,
    autoApplyAllowed: false,
    changedParameters: candidate.changedParameters,
    sourceProvider: "mt5_read_only",
    requestedSymbol: config.requestedSymbol,
    brokerSymbol: config.brokerSymbol,
    candleCount: validationReport?.sourceCandleCount ?? backtestResult.candles?.length ?? 0,
    grinchProfileSelected: grinch.selectedProfile,
    timingStatus: grinch.timingStatus,
    expansionConfirmationStatus: grinch.expansionConfirmationStatus,
    expansionConfirmationPassed: grinch.reversalExpansionConditionPassed,
    missingEvidence: grinch.missingExpansionEvidence,
    backtest: summarizeBacktest(backtestResult),
    metricSource: config.validationMode === "full" ? "validation_suite" : "direct_backtest",
    trades: metrics.totalTrades,
    winRate: metrics.winRate,
    averageR: metrics.averageR,
    drawdown: metrics.maxDrawdown,
    profitFactor: metrics.profitFactor,
    falsePositives: metrics.falsePositiveCount,
    readiness: readiness?.state ?? "not_evaluated_headless_direct_mode",
    readinessScore: metrics.readinessScore,
    evidenceScore: "unavailable_in_headless_runner",
    maturityScore: "unavailable_in_headless_runner",
    walkForwardVerdict: "not_run",
    validationReadinessStatus: metrics.readinessStatus,
    stabilityScore: metrics.stabilityScore,
    scoreBreakdown: {
      totalScore: scoreBreakdown.totalScore,
      grinchModelScore: scoreBreakdown.grinchModelScore,
      grinchFalsePositiveRisk: scoreBreakdown.grinchFalsePositiveRisk,
      grinchProfileValidity: scoreBreakdown.grinchProfileValidity,
      stabilityImproved: scoreBreakdown.stabilityImproved,
      sufficientSample: scoreBreakdown.sufficientSample,
      rationale: scoreBreakdown.rationale
    },
    comparison: {
      improved: comparison.improved,
      stabilityImproved: comparison.stabilityImproved,
      recommendation: comparison.recommendation,
      promotionVerdict: comparison.promotionVerdict,
      summary: comparison.summary,
      criticalRegressions: comparison.criticalRegressions,
      sanityWarnings: comparison.sanityWarnings,
      followUpSearchDirection: comparison.followUpSearchDirection
    },
    researchQuality: quality
      ? {
          readinessGrade: quality.readinessGrade,
          readinessScore: quality.readinessScore,
          weakestSessions: safeArray(quality.sessionComparison)
            .filter((session) => session.readiness === "red")
            .slice(0, 3)
            .map((session) => session.session)
        }
      : {
          readinessGrade: "not_evaluated_headless_direct_mode",
          readinessScore: null,
          weakestSessions: []
        },
    grinch,
    safetyAuthority: authorityNone
  };
};

const main = async () => {
  debug("fetching MT5 source");
  const sourceResult = await fetchMt5Source();
  if (!sourceResult.ok) {
    failSourceUnavailable(sourceResult);
  }

  const rawCandles = safeArray(sourceResult.candlesPayload?.candles);
  const candles = normalizeCandles(rawCandles);
  const returnedCount = Number(sourceResult.candlesPayload?.returnedCount ?? candles.length);
  const sourceEligible = candles.length >= 400;
  if (!sourceEligible) {
    printAndExit(
      {
        status: "source_ineligible",
        message: "MT5 read-only candles loaded, but the source is not research-eligible for this candidate run.",
        family: config.family,
        variant: config.variant,
        source: {
          provider: "mt5_read_only",
          requestedSymbol: config.requestedSymbol,
          brokerSymbol: config.brokerSymbol,
          timeframe: config.timeframe,
          requestedLimit: config.candleLimit,
          returnedCount,
          normalizedCandleCount: candles.length,
          depthStatus: sourceResult.candlesPayload?.depthStatus,
          firstTimestamp: candles[0]?.timestamp,
          lastTimestamp: candles[candles.length - 1]?.timestamp,
          eligibilityReason: "researchCycle requires at least 400 valid candles."
        },
        instructions: [
          "Run npm.cmd run test:mt5-readonly to confirm MT5 depth.",
          "Increase AUTO_RESEARCH_CANDLE_LIMIT or MT5_READONLY_TEST_LIMIT if the provider has more history.",
          "Keep imported historical data for deep walk-forward if MT5 depth is insufficient."
        ],
        safetyAuthority: authorityNone
      },
      1
    );
  }

  debug("compiling TypeScript research modules");
  const bundle = compileLibraryBundle();
  debug("importing research modules");
  const backtesting = await bundle.importLib("backtesting/index.js");
  const { generateCandidateConfigs } = await bundle.importLib("autoResearch/generateCandidateConfigs.js");
  const fullValidationModules = config.validationMode === "full"
    ? {
        ...(await bundle.importLib("autoResearch/scoreCandidateConfig.js")),
        ...(await bundle.importLib("autoResearch/configSearchSpace.js")),
        ...(await bundle.importLib("validation/runValidationSuite.js")),
        ...(await bundle.importLib("researchQuality/analyzeValidationResults.js")),
        ...(await bundle.importLib("readiness/readinessGate.js")),
        ...(await bundle.importLib("selfImprovement/evaluateCalibrationProposal.js")),
        ...(await bundle.importLib("selfImprovement/compareProposalToBaseline.js")),
        ...(await bundle.importLib("simulationRunbook/storage.js"))
      }
    : undefined;

  const baselineConfig = backtesting.sanitizeBacktestConfig({
    ...backtesting.loadBacktestConfig(),
    symbol: config.requestedSymbol,
    timeframe: config.timeframe
  });

  debug("generating candidates");
  const allCandidates = generateCandidateConfigs(baselineConfig, "deep", config.maxCandidates);
  const familyCandidates = allCandidates.filter((candidate) => candidate.candidateFamily === config.family);
  const candidateConfigs = familyCandidates.filter((candidate) => {
    const variant = variantForCandidate(candidate);
    return config.variant === "all" || variant === config.variant;
  });

  if (!candidateConfigs.length) {
    printAndExit(
      {
        status: "candidate_not_found",
        message: "No Auto Research candidate configs matched the requested family/variant.",
        requested: {
          family: config.family,
          variant: config.variant
        },
        availableFamilies: [...new Set(allCandidates.map((candidate) => candidate.candidateFamily).filter(Boolean))],
        availableCandidates: allCandidates.map((candidate) => ({
          family: candidate.candidateFamily,
          variant: variantForCandidate(candidate),
          label: candidate.label
        })),
        safetyAuthority: authorityNone
      },
      1
    );
  }

  debug("running baseline backtest");
  const baselineBacktest = backtesting.runBacktest(candles, baselineConfig);
  let baselineMetrics;
  let baselineReadiness;
  if (config.validationMode === "full" && fullValidationModules) {
    debug("running baseline validation");
    const baselineValidation = fullValidationModules.runValidationSuite(candles, baselineConfig);
    baselineValidation.sourceCandleCount = candles.length;
    const baselineQuality = fullValidationModules.analyzeValidationResults(baselineValidation);
    baselineReadiness = fullValidationModules.evaluateReadinessGate({
      validation: baselineValidation,
      quality: baselineQuality,
      runbook: fullValidationModules.loadSimulationRunbookState()
    });
    baselineMetrics = fullValidationModules.summarizeValidationMetrics(baselineValidation);
  } else {
    baselineMetrics = metricsFromBacktest(baselineBacktest);
    baselineReadiness = { state: "not_evaluated_headless_direct_mode" };
  }

  const candidateReports = candidateConfigs.map((candidate) => {
    debug("evaluating candidate", candidate.label);
    const backtestResult = backtesting.runBacktest(candles, candidate.config);
    const grinch = reportGrinch(backtestResult);
    let validationReport;
    let quality;
    let readiness;
    let metrics;
    let comparison;
    let scoreBreakdown;
    if (config.validationMode === "full" && fullValidationModules) {
      debug("running validation", candidate.label);
      validationReport = fullValidationModules.runValidationSuite(candles, candidate.config);
      validationReport.sourceCandleCount = candles.length;
      quality = fullValidationModules.analyzeValidationResults(validationReport);
      readiness = fullValidationModules.evaluateReadinessGate({
        validation: validationReport,
        quality,
        runbook: fullValidationModules.loadSimulationRunbookState()
      });
      metrics = fullValidationModules.summarizeValidationMetrics(validationReport);
      comparison = fullValidationModules.compareProposalToBaseline(baselineMetrics, metrics);
      scoreBreakdown = fullValidationModules.scoreCandidateConfig({
        baselineMetrics,
        metrics,
        validation: validationReport,
        quality,
        grinchScore: backtestResult.summary.grinchSummary?.latestScore,
        scoringCriteria: fullValidationModules.defaultAutoResearchScoringCriteria
      });
    } else {
      metrics = metricsFromBacktest(backtestResult);
      comparison = directComparison(baselineMetrics, metrics);
      scoreBreakdown = directScoreBreakdown(baselineMetrics, metrics, grinch);
    }

    return summarizeCandidate({
      candidate,
      variant: variantForCandidate(candidate),
      backtestResult,
      validationReport,
      quality,
      readiness,
      metrics,
      comparison,
      scoreBreakdown
    });
  });

  const bestCandidate = [...candidateReports].sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore)[0];
  printAndExit({
    status: "completed",
    runner: "headless_auto_research_candidate",
    command: "npm.cmd run test:auto-research-candidate",
    inputs: {
      candidateFamily: config.family,
      variant: config.variant,
      maxCandidates: config.maxCandidates,
      validationMode: config.validationMode
    },
    source: {
      provider: "mt5_read_only",
      requestedSymbol: config.requestedSymbol,
      brokerSymbol: config.brokerSymbol,
      timeframe: config.timeframe,
      requestedLimit: config.candleLimit,
      returnedCount,
      normalizedCandleCount: candles.length,
      depthStatus: sourceResult.candlesPayload?.depthStatus,
      connectionStatus: sourceResult.candlesPayload?.connectionStatus,
      firstTimestamp: candles[0]?.timestamp,
      lastTimestamp: candles[candles.length - 1]?.timestamp,
      firstClose: candles[0]?.close,
      lastClose: candles[candles.length - 1]?.close,
      fingerprint: fingerprintFor(candles),
      eligibility: {
        chartDisplay: candles.length >= 5,
        quickAnalysis: candles.length >= 100,
        researchCycle: candles.length >= 400,
        walkForward: candles.length >= 1000
      },
      warnings: [
        "MT5 read-only USTECH is CFD/proxy data for MNQ/NQ-style research, not CME MNQ futures truth."
      ],
      safetyAuthority: authorityNone
    },
    baseline: {
      config: {
        symbol: baselineConfig.symbol,
        timeframe: baselineConfig.timeframe,
        sessionFilter: baselineConfig.sessionFilter,
        minimumConfluenceThreshold: baselineConfig.minimumConfluenceThreshold,
        minimumConfidenceThreshold: baselineConfig.minimumConfidenceThreshold,
        decisionInterval: baselineConfig.decisionInterval
      },
      backtest: summarizeBacktest(baselineBacktest),
      metrics: baselineMetrics,
      readiness: baselineReadiness.state,
      metricSource: config.validationMode === "full" ? "validation_suite" : "direct_backtest",
      grinch: reportGrinch(baselineBacktest)
    },
    candidateCount: candidateReports.length,
    bestCandidate: bestCandidate
      ? {
          label: bestCandidate.label,
          variant: bestCandidate.variant,
          totalScore: bestCandidate.scoreBreakdown.totalScore,
          recommendation: bestCandidate.comparison.recommendation,
          promotionVerdict: bestCandidate.comparison.promotionVerdict
        }
      : undefined,
    candidates: candidateReports,
    guardrails: [
      "Runner is research-only.",
      "Auto-apply remains disabled.",
      "Production thresholds are not mutated.",
      "No execution intent, account mutation, order route, or readiness override is created.",
      config.validationMode === "full"
        ? "Full validation suite was run for baseline and requested candidates."
        : "Direct mode skips full validation, evidence ledger, maturity review, and walk-forward for speed."
    ],
    safetyAuthority: authorityNone
  });
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        safetyAuthority: authorityNone
      },
      null,
      2
    )
  );
  process.exit(1);
});
