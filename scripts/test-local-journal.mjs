#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  appendLocalJournalRecord,
  createLocalJournalRecord,
  getLocalJournalFilePath,
  readLocalJournalRecords,
  sanitizeJournalRecord,
  summarizeLocalJournalRecords
} from "./services/local-journal-service.mjs";
import { runStrategyRiskContextFlow } from "./services/strategy-risk-context-evaluator.mjs";

function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    symbol: argv[argv.indexOf("--symbol") + 1] ?? "EUR/USD",
    interval: argv[argv.indexOf("--interval") + 1] ?? "5min"
  };
}

function printHelp() {
  process.stdout.write(`GoTrader Local Journal smoke test

Usage:
  npm run test:local-journal

The test writes compact JSONL audit records under .gotrader/journal/.
It does not trade, connect MT5, write Supabase, or persist provider secrets.
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoSecrets(payload) {
  const serialized = JSON.stringify(payload);
  for (const envName of ["TWELVE_DATA_API_KEY", "FMP_API_KEY"]) {
    const value = process.env[envName];
    assert(!serialized.includes(envName), `Output contains ${envName} label`);
    if (value) {
      assert(!serialized.includes(value), `Output contains ${envName} value`);
    }
  }
  assert(!/apikey\s*=|apikey%3d|api_key\s*=|api_key%3d/i.test(serialized), "Output contains an API key query parameter");
  assert(!/broker\s*password|broker\s*secret|mt5\s*password|brokerCredentialValue/i.test(serialized), "Output contains broker credential text");
  assert(!/supabase\.co|metatrader|order_placement|execution_intent/i.test(serialized), "Output contains future execution or persistence handoff text");
}

function assertGitignored() {
  const gitignore = fs.readFileSync(".gitignore", "utf8");
  assert(/\.gotrader\/journal\//.test(gitignore), ".gotrader/journal/ must be gitignored");
  assert(/^\*\.jsonl$/m.test(gitignore), "*.jsonl must be gitignored");
}

function assertJsonlFileValid(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  assert(lines.length >= 3, "JSONL file must include appended test records");
  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL line ${index + 1}: ${error?.message ?? error}`);
    }
  }
}

function assertRecordSafe(record) {
  assert(record.storageMode === "local_jsonl", "Record storageMode must be local_jsonl");
  assert(record.rawProviderPayloadIncluded === false, "Record rawProviderPayloadIncluded must be false");
  assert(record.provenance.approved === false, "Record provenance approved must be false");
  assert(record.provenance.executionAllowed === false, "Record provenance executionAllowed must be false");
  assert((record.event.macroRiskFlags ?? []).length <= 5, "Record macroRiskFlags must be capped");
  assertNoSecrets(record);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  assertGitignored();
  const date = new Date().toISOString().slice(0, 10);
  const filePath = getLocalJournalFilePath({ date });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
  }

  const flow = await runStrategyRiskContextFlow({
    dryRun: true,
    symbol: args.symbol,
    interval: args.interval,
    outputsize: 8
  });
  const macroRecord = createLocalJournalRecord(flow.evaluation.journalEvent, {
    riskDecision: flow.evaluation.riskDecision
  });
  const noTradeEvent = {
    ...flow.evaluation.journalEvent,
    journalEntryId: "journal_no_trade_test",
    status: "rejected",
    reason: "No trade setup recorded as local journal test.",
    macroRiskFlags: []
  };
  const noTradeRecord = createLocalJournalRecord(noTradeEvent, {
    recordType: "no_trade",
    riskDecision: {
      ...flow.evaluation.riskDecision,
      approved: false,
      executionAllowed: false,
      macroRiskFlags: []
    }
  });
  const failedEvent = {
    ...flow.evaluation.journalEvent,
    journalEntryId: "journal_data_quality_failure_test",
    status: "failed",
    reason: "Synthetic data quality failure local journal test.",
    macroRiskFlags: []
  };
  const failedRecord = createLocalJournalRecord(failedEvent, {
    riskDecision: {
      ...flow.evaluation.riskDecision,
      approved: false,
      executionAllowed: false,
      macroRiskFlags: []
    }
  });

  for (const record of [macroRecord, noTradeRecord, failedRecord]) {
    const sanitized = sanitizeJournalRecord(record);
    assert(sanitized.ok, `Record should sanitize: ${sanitized.errors.join("; ")}`);
    const write = appendLocalJournalRecord(record, { date });
    assert(write.ok, write.error?.message ?? "Journal append failed");
    assertRecordSafe(write.record);
  }

  const read = readLocalJournalRecords({ date, limit: 50 });
  assert(read.ok, "readLocalJournalRecords should succeed");
  assert(read.records.length === 3, "Local journal should read back three records");
  for (const record of read.records) {
    assertRecordSafe(record);
  }
  const summary = summarizeLocalJournalRecords({ date });
  assert(summary.ok, "summarizeLocalJournalRecords should succeed");
  assert(summary.summary.totalRecords === 3, "Summary totalRecords should be 3");
  assert(summary.summary.byRecordType.macro_risk_block >= 1, "Summary must count macro_risk_block");
  assert(summary.summary.byRecordType.no_trade >= 1, "Summary must count no_trade");
  assert(summary.summary.byRecordType.data_quality_failure >= 1, "Summary must count data_quality_failure");
  assertJsonlFileValid(filePath);
  assertNoSecrets(read.records);

  process.stdout.write("GoTrader Local Journal smoke test passed.\n");
  process.stdout.write(`Journal file: ${filePath}\n`);
  process.stdout.write(`Records written: ${summary.summary.totalRecords}\n`);
  process.stdout.write(`Macro blocks: ${summary.summary.byRecordType.macro_risk_block}\n`);
  process.stdout.write(`No-trade records: ${summary.summary.byRecordType.no_trade}\n`);
  process.stdout.write(`Data-quality failures: ${summary.summary.byRecordType.data_quality_failure}\n`);
}

main().catch((error) => {
  process.stderr.write(`Local Journal smoke test failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
