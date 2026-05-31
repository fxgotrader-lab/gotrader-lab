import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const loadTsModule = async (relativePath) => {
  const fullPath = path.join(projectRoot, relativePath);
  const source = fs.readFileSync(fullPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false
    },
    fileName: fullPath
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  return import(moduleUrl);
};

const brokerRouter = await loadTsModule("src/lib/brokers/brokerRouter.ts");
const brokerPolicy = await loadTsModule("src/lib/brokers/brokerAuthorityPolicy.ts");
const tvNormalizer = await loadTsModule("src/lib/integrations/tradingview/tradingViewEvidenceNormalizer.ts");

const futuresRoute = brokerRouter.routeBrokerForSymbol({ symbol: "MNQ", accountMode: "research" });
const forexRoute = brokerRouter.routeBrokerForSymbol({ symbol: "EUR/USD", accountMode: "research" });
const cfdRoute = brokerRouter.routeBrokerForSymbol({ symbol: "US30", accountMode: "research" });
const unknownRoute = brokerRouter.routeBrokerForSymbol({ symbol: "RANDOM", accountMode: "research" });

assert(futuresRoute.broker === "tradovate", "MNQ should route to Tradovate.");
assert(forexRoute.broker === "mt5", "EUR/USD should route to MT5.");
assert(cfdRoute.broker === "mt5", "US30 should route to MT5.");
assert(unknownRoute.broker === "none", "Unsupported symbols should route to none.");
for (const route of [futuresRoute, forexRoute, cfdRoute, unknownRoute]) {
  assert(route.executionAuthority === "none", `${route.symbol} must have no execution authority in research mode.`);
  assert(route.brokerAuthority === "none", `${route.symbol} must have no broker authority in research mode.`);
}

const candidate = {
  candidateId: "candidate_test",
  strategyId: "strategy_test",
  symbol: "MNQ",
  direction: "long",
  setupType: "research_only",
  entryZone: [100, 101],
  invalidation: 99,
  targets: [103, 105],
  confidence: 0.7,
  evidenceRefs: ["tv_test"],
  tradingViewEvidenceRef: "tv_test",
  marketSnapshotRef: "snapshot_test",
  riskAssumptions: ["risk manager must approve before any execution"],
  status: "needs_confirmation"
};

const riskDecision = brokerPolicy.createBlockedResearchRiskDecision({ candidate });
assert(riskDecision.status === "rejected", "RiskDecision should reject executable directions in Phase 1.");
assert(riskDecision.positionSize === null, "RiskDecision must not assign position size.");

const intent = brokerPolicy.createBlockedExecutionIntent({
  candidate,
  riskDecision,
  route: futuresRoute
});
assert(intent.status === "blocked", "ExecutionIntent should be blocked.");
assert(intent.executionAuthority === "none", "ExecutionIntent must have no execution authority.");
assert(intent.orderType === "none", "ExecutionIntent must not specify executable order type.");

const result = brokerPolicy.createBlockedExecutionResult({ broker: futuresRoute.broker, intent });
assert(result.status === "blocked", "ExecutionResult should be blocked.");
assert(!("rawBrokerResponse" in result), "ExecutionResult must not include raw broker responses in contract test.");

const tvEvidence = tvNormalizer.normalizeTradingViewEvidence(
  {
    symbol: "MNQ",
    timeframe: "5m",
    technicalSummary: "Trend looks constructive; buy only if GoTrader confirms.",
    bias: "buy",
    confidence: 0.85,
    executionAuthority: "execute",
    brokerAuthority: "tradovate",
    readinessOverrideAuthority: "approved"
  },
  { symbol: "MNQ", timeframe: "5m" }
);
assert(tvEvidence.bias === "bullish", "TradingView buy wording should normalize to bullish advisory bias.");
assert(tvEvidence.executionAuthority === "none", "TradingView evidence must have no execution authority.");
assert(tvEvidence.brokerAuthority === "none", "TradingView evidence must have no broker authority.");
assert(tvEvidence.readinessOverrideAuthority === "none", "TradingView evidence must have no readiness override authority.");
assert(tvEvidence.warnings.some((warning) => warning.includes("downgraded")), "Authority claims should produce downgrade warnings.");

const journalEvent = brokerPolicy.createBrokerJournalEvent({
  candidate,
  evaluatorDecision: "confirm_with_broker",
  executionIntent: intent,
  executionResult: result,
  riskDecision,
  route: futuresRoute,
  runtimeFingerprint: "runtime_test",
  sourceRefs: [tvEvidence.evidenceId]
});
assert(journalEvent.executionIntent.status === "blocked", "JournalEvent should record blocked intent.");
assert(journalEvent.executionResult.status === "blocked", "JournalEvent should record blocked result.");
assert(journalEvent.evaluatorDecision === "confirm_with_broker", "Evaluator can only request future broker confirmation, not execution.");

const output = JSON.stringify({ futuresRoute, forexRoute, cfdRoute, unknownRoute, riskDecision, intent, result, tvEvidence, journalEvent });
for (const forbidden of ["TWELVE_DATA_API_KEY", "FMP_API_KEY", "password", "secret", "YOUR_MT5_PASSWORD"]) {
  assert(!output.includes(forbidden), `Output must not contain ${forbidden}.`);
}
assert(!output.includes("live_ready"), "Phase 1 output must not mark live-ready intent.");
assert(!output.includes("paper_ready"), "Phase 1 output must not mark paper-ready intent.");

console.log("Multi-broker contract smoke passed.");
console.log(
  JSON.stringify(
    {
      routes: [futuresRoute, forexRoute, cfdRoute, unknownRoute].map((route) => ({
        symbol: route.symbol,
        broker: route.broker,
        authority: route.executionAuthority,
        warning: route.routingWarnings[0]
      })),
      tradingViewAuthority: {
        executionAuthority: tvEvidence.executionAuthority,
        brokerAuthority: tvEvidence.brokerAuthority,
        readinessOverrideAuthority: tvEvidence.readinessOverrideAuthority
      },
      riskDecision: riskDecision.status,
      executionIntent: intent.status,
      executionResult: result.status
    },
    null,
    2
  )
);
