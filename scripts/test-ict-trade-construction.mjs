#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src", "lib", "ict-strategy-suite");
const outRoot = path.join(projectRoot, ".gotrader", "ict-trade-construction-test");
const sourceFiles = [
  "ictTradeConstructionTypes.ts",
  "ictTradeConstruction.ts"
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

const base = {
  side: "long",
  entryModelType: "generic",
  symbol: "MNQ",
  brokerSymbol: "USTECH",
  timeframe: "5m",
  sourceFingerprint: "mt5_fp",
  authority: {
    executionAuthority: "none",
    brokerAuthority: "none",
    readinessOverrideAuthority: "none"
  }
};

const assertHas = (values, value) => assert.ok(values.includes(value), `expected ${values.join(", ")} to include ${value}`);
const assertNotHas = (values, value) => assert.equal(values.includes(value), false, `expected ${values.join(", ")} not to include ${value}`);

function assertSafe(result) {
  const serialized = JSON.stringify(result);
  assert.equal(result.authority.executionAuthority, "none");
  assert.equal(result.authority.brokerAuthority, "none");
  assert.equal(result.authority.readinessOverrideAuthority, "none");
  assert.equal(result.safety.rawCandlesExcluded, true);
  assert.doesNotMatch(serialized, /"candles"\s*:|"rawSnapshot"\s*:|"snapshot"\s*:|"password"\s*:|"secret"\s*:|"api[_-]?key"\s*:|"account(Data|Number|Id)?"\s*:|"position(Data|s|Id)?"\s*:|"order(Data|s|Id)?"\s*:/i);
}

async function main() {
  compileForNode();
  const { buildIctTradeConstruction, summarizeIctTradeConstruction } = await import(pathToFileURL(path.join(outRoot, "ictTradeConstruction.mjs")));

  const validGeneric = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 90,
    target: 125
  });
  assert.equal(validGeneric.valid, true);
  assert.equal(validGeneric.rr, 2.5);
  assertSafe(validGeneric);

  const missingTarget = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 90
  });
  assert.equal(missingTarget.valid, false);
  assertHas(missingTarget.blockers, "target_missing");
  assertHas(missingTarget.blockers, "rr_unavailable");
  assertNotHas(missingTarget.blockers, "target_too_close");
  assertSafe(missingTarget);

  const missingEntry = buildIctTradeConstruction({
    ...base,
    stop: 90,
    target: 125
  });
  assertHas(missingEntry.blockers, "entry_missing");
  assertHas(missingEntry.blockers, "rr_unavailable");

  const missingStop = buildIctTradeConstruction({
    ...base,
    entry: 100,
    target: 125
  });
  assertHas(missingStop.blockers, "invalidation_missing");
  assertHas(missingStop.blockers, "rr_unavailable");

  const lowRr = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 90,
    target: 110
  });
  assertHas(lowRr.blockers, "rr_below_minimum");
  assertHas(lowRr.blockers, "target_too_close");

  const preferredWarning = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 90,
    target: 121
  });
  assert.equal(preferredWarning.valid, true);
  assertHas(preferredWarning.warnings, "preferred_rr_not_reached");

  const fvgLong = buildIctTradeConstruction({
    ...base,
    entryModelType: "fvg",
    entry: 100,
    stop: 94,
    target: 115,
    structureBounds: { fvgLow: 95, fvgHigh: 105 }
  });
  assert.equal(fvgLong.valid, true);

  const fvgLongBadStop = buildIctTradeConstruction({
    ...base,
    entryModelType: "fvg",
    entry: 100,
    stop: 96,
    target: 115,
    structureBounds: { fvgLow: 95, fvgHigh: 105 }
  });
  assertHas(fvgLongBadStop.blockers, "stop_not_beyond_structure");

  const fvgShort = buildIctTradeConstruction({
    ...base,
    side: "short",
    entryModelType: "fvg",
    entry: 100,
    stop: 106,
    target: 85,
    structureBounds: { fvgLow: 95, fvgHigh: 105 }
  });
  assert.equal(fvgShort.valid, true);

  const fvgShortBadStop = buildIctTradeConstruction({
    ...base,
    side: "short",
    entryModelType: "fvg",
    entry: 100,
    stop: 104,
    target: 85,
    structureBounds: { fvgLow: 95, fvgHigh: 105 }
  });
  assertHas(fvgShortBadStop.blockers, "stop_not_beyond_structure");

  const obLong = buildIctTradeConstruction({
    ...base,
    entryModelType: "order_block",
    entry: 100,
    stop: 89,
    target: 125,
    structureBounds: { orderBlockLow: 90, orderBlockHigh: 104 }
  });
  assert.equal(obLong.valid, true);

  const obShort = buildIctTradeConstruction({
    ...base,
    side: "short",
    entryModelType: "order_block",
    entry: 100,
    stop: 111,
    target: 75,
    structureBounds: { orderBlockLow: 96, orderBlockHigh: 110 }
  });
  assert.equal(obShort.valid, true);

  const noStructure = buildIctTradeConstruction({
    ...base,
    entryModelType: "breaker",
    entry: 100,
    stop: 90,
    target: 125
  });
  assertHas(noStructure.blockers, "structure_bounds_missing");

  const wideStop = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 40,
    target: 230
  });
  assertHas(wideStop.blockers, "stop_too_wide");

  const invalidPriceOrder = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 105,
    target: 125
  });
  assertHas(invalidPriceOrder.blockers, "invalid_price_order");

  const unsafeAuthority = buildIctTradeConstruction({
    ...base,
    entry: 100,
    stop: 90,
    target: 125,
    authority: {
      executionAuthority: "enabled",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  });
  assertHas(unsafeAuthority.blockers, "authority_not_none");
  assert.equal(unsafeAuthority.authority.executionAuthority, "none");

  const forexRawDistance = buildIctTradeConstruction({
    ...base,
    symbol: "EURUSD",
    brokerSymbol: "EURUSD.pro",
    entry: 1.1,
    stop: 1.095,
    target: 1.112,
    maxStopDistance: 0.01
  });
  assert.equal(forexRawDistance.valid, true);

  console.log(JSON.stringify({
    ok: true,
    examples: {
      validGeneric: summarizeIctTradeConstruction(validGeneric),
      missingTarget: missingTarget.blockers,
      lowRr: lowRr.blockers,
      fvgLong: fvgLong.blockers,
      wideStop: wideStop.blockers
    },
    authority: validGeneric.authority
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
