#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "mt5PushFeed");
const outRoot = path.join(projectRoot, ".gotrader", "mt5-push-feed-test");
const sourceFiles = [
  "mt5PushFeedTypes.ts",
  "mt5PushFeedSymbolMapping.ts",
  "mt5PushFeedNormalizer.ts",
  "mt5PushFeedEventBus.ts",
  "mt5PushFeedStore.ts",
  "mt5PushFeedIctTriggers.ts",
  "mt5PushFeedGateway.ts",
  "mt5PushFeedFixtures.ts"
];

function compileForNode() {
  fs.mkdirSync(outRoot, { recursive: true });
  for (const file of sourceFiles) {
    const sourcePath = path.join(sourceRoot, file);
    const source = fs.readFileSync(sourcePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
        verbatimModuleSyntax: false
      },
      fileName: sourcePath
    }).outputText;
    const rewritten = transpiled
      .replace(/from\s+"\.\/([^"]+)"/g, 'from "./$1.mjs"')
      .replace(/from\s+'\.\/([^']+)'/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(outRoot, file.replace(/\.ts$/, ".mjs")), rewritten, "utf8");
  }
}

async function importCompiled(file) {
  return import(pathToFileURL(path.join(outRoot, file)).href);
}

async function main() {
  compileForNode();
  const fixtures = await importCompiled("mt5PushFeedFixtures.mjs");
  const busModule = await importCompiled("mt5PushFeedEventBus.mjs");
  const storeModule = await importCompiled("mt5PushFeedStore.mjs");
  const triggerModule = await importCompiled("mt5PushFeedIctTriggers.mjs");
  const gatewayModule = await importCompiled("mt5PushFeedGateway.mjs");
  const normalizerModule = await importCompiled("mt5PushFeedNormalizer.mjs");

  const normalized = normalizerModule.normalizeMt5PushFeedEvent(
    fixtures.mt5PushFeedCandleClosedFixture,
    "2026-06-14T14:05:01.000Z"
  );
  assert.equal(normalized.type, "canonical.candle_closed");
  assert.equal(normalized.candle.source, "mt5");
  assert.equal(normalized.candle.brokerSymbol, "USTECH");
  assert.equal(normalized.candle.requestedSymbol, "MNQ");
  assert.equal(normalized.candle.timeframe, "5m");
  assert.equal(normalized.candle.serverTimestamp, "2026-06-14T14:05:00.000Z");
  assert.equal(normalized.candle.receivedAt, "2026-06-14T14:05:01.000Z");
  assert.deepEqual(
    {
      executionAuthority: normalized.executionAuthority,
      brokerAuthority: normalized.brokerAuthority,
      readinessOverrideAuthority: normalized.readinessOverrideAuthority
    },
    {
      executionAuthority: "none",
      brokerAuthority: "read_only",
      readinessOverrideAuthority: "none"
    }
  );

  const eventBus = busModule.createMt5PushFeedEventBus();
  const state = storeModule.createMt5PushFeedStoreState();
  const triggerController = triggerModule.createMt5PushFeedIctTriggerController();
  eventBus.subscribe((event) => triggerController.handleBusEvent(event));

  const connection = storeModule.processMt5PushFeedEvent(
    state,
    fixtures.mt5PushFeedConnectionStatusFixture,
    { eventBus, persistStatus: false, receivedAt: "2026-06-14T14:00:01.000Z" }
  );
  assert.equal(connection.accepted, true);
  assert.equal(connection.status.status, "connected");
  assert.equal(connection.status.activeSymbols.includes("USTECH"), true);

  const firstCandle = storeModule.processMt5PushFeedEvent(
    state,
    fixtures.mt5PushFeedCandleClosedFixture,
    { eventBus, persistStatus: false, receivedAt: "2026-06-14T14:05:01.000Z" }
  );
  assert.equal(firstCandle.accepted, true);
  assert.equal(firstCandle.duplicate, false);
  assert.equal(firstCandle.trigger.currentReadShouldRefresh, true);
  assert.equal(firstCandle.trigger.advisorPacketShouldRefresh, true);
  assert.equal(firstCandle.trigger.replayValidationMayQueue, true);
  assert.equal(triggerController.currentReadRefreshCount, 1);
  assert.equal(triggerController.advisorPacketRefreshCount, 1);
  assert.equal(triggerController.replayValidationQueueCount, 1);
  assert.equal(Object.values(state.candlesBySeries).flat().length, 1);

  const duplicate = storeModule.processMt5PushFeedEvent(
    state,
    fixtures.mt5PushFeedCandleClosedFixture,
    { eventBus, persistStatus: false, receivedAt: "2026-06-14T14:05:02.000Z" }
  );
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(Object.values(state.candlesBySeries).flat().length, 1);
  assert.equal(state.status.skippedDuplicateCount, 1);
  assert.equal(triggerController.currentReadRefreshCount, 1, "Duplicate candle must not trigger another current-read refresh.");

  const stale = storeModule.processMt5PushFeedEvent(
    state,
    fixtures.mt5PushFeedStaleFixture,
    { eventBus, persistStatus: false, receivedAt: "2026-06-14T14:07:31.000Z" }
  );
  assert.equal(stale.accepted, true);
  assert.equal(stale.status.status, "stale");
  assert.equal(stale.trigger.currentReadShouldRefresh, false);
  assert.equal(stale.trigger.advisorPacketShouldRefresh, false);
  assert.equal(stale.trigger.replayValidationMayQueue, false);
  assert.equal(triggerController.feedWarningCount, 1);

  const gateway = gatewayModule.createMt5PushFeedGateway({
    eventBus,
    persistStatus: false,
    state: storeModule.createMt5PushFeedStoreState()
  });
  const unsafe = gateway.receiveEvent({
    type: "mt5.tick",
    brokerSymbol: "USTECH",
    account: { id: "blocked" },
    bid: 1,
    ask: 2
  });
  assert.equal(unsafe.accepted, false);
  assert.match(unsafe.warnings[0], /Unsafe MT5 push-feed payload blocked/i);

  const serialized = JSON.stringify({
    status: state.status,
    journalEvents: state.journalEvents,
    firstCandleTrigger: firstCandle.trigger,
    staleTrigger: stale.trigger
  });
  assert.doesNotMatch(serialized, /"candles"\s*:/i, "Compact feed status/audit output must not expose raw candle arrays.");
  assert.doesNotMatch(
    serialized,
    /"account"\s*:|"orders"\s*:|"positions"\s*:|"placeOrder"\s*:|"buyMarket"\s*:|"sellMarket"\s*:/i,
    "Feed output must not expose account/order/position or execution mutation fields."
  );
  assert.match(serialized, /"executionAuthority":"none"/);
  assert.match(serialized, /"brokerAuthority":"read_only"/);
  assert.match(serialized, /"readinessOverrideAuthority":"none"/);

  console.log("MT5 push-feed read-only architecture test passed.");
  console.log(
    JSON.stringify(
      {
        candleCount: Object.values(state.candlesBySeries).flat().length,
        currentReadRefreshCount: triggerController.currentReadRefreshCount,
        duplicatesSkipped: state.status.skippedDuplicateCount,
        staleTriggeredTrading: stale.trigger.currentReadShouldRefresh || stale.trigger.replayValidationMayQueue,
        authority: {
          executionAuthority: state.status.executionAuthority,
          brokerAuthority: state.status.brokerAuthority,
          readinessOverrideAuthority: state.status.readinessOverrideAuthority
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
