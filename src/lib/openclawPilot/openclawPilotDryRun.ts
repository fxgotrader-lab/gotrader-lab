import {
  assertOpenClawPilotAuthorityNone,
  loadOpenClawPilotProgram,
  openClawPilotAuthorityNone,
  openClawPilotForbiddenFields,
  summarizeOpenClawPilotProgram,
  validateOpenClawPilotProgram
} from "@/lib/openclawPilot/openclawProgram";
import type {
  OpenClawPilotAuditEntry,
  OpenClawPilotAuthority,
  OpenClawPilotProgram,
  OpenClawPilotValidationResult
} from "@/lib/openclawPilot/openclawPilotTypes";

type UnknownRecord = Record<string, unknown>;

export interface OpenClawPilotDryRunOptions {
  program?: OpenClawPilotProgram;
  timestamp?: string;
}

const MAX_SUMMARY_LENGTH = 220;

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const compactString = (value: unknown, fallback = "unknown") => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text ? text.slice(0, 160) : fallback;
};

const getNestedRecord = (value: unknown, key: string): UnknownRecord | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const child = value[key];
  return isRecord(child) ? child : undefined;
};

const getNestedString = (value: unknown, keys: string[]): string | undefined => {
  let cursor: unknown = value;
  for (const key of keys) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor === undefined || cursor === null ? undefined : String(cursor);
};

const extractAuthority = (packet: unknown): Partial<OpenClawPilotAuthority> | undefined => {
  if (!isRecord(packet)) {
    return undefined;
  }
  const direct = getNestedRecord(packet, "authority");
  if (direct) {
    return direct as Partial<OpenClawPilotAuthority>;
  }
  const safety = getNestedRecord(packet, "safety");
  if (safety) {
    return safety as Partial<OpenClawPilotAuthority>;
  }
  return {
    executionAuthority: packet.executionAuthority as OpenClawPilotAuthority["executionAuthority"],
    brokerAuthority: packet.brokerAuthority as OpenClawPilotAuthority["brokerAuthority"],
    readinessOverrideAuthority: packet.readinessOverrideAuthority as OpenClawPilotAuthority["readinessOverrideAuthority"]
  };
};

const authorityIsNone = (authority: Partial<OpenClawPilotAuthority> | undefined) =>
  authority?.executionAuthority === "none" &&
  authority?.brokerAuthority === "none" &&
  authority?.readinessOverrideAuthority === "none";

const forbiddenKeyLabel = (key: string): string | undefined => {
  const normalized = normalizeKey(key);
  if (normalized === "rawcandles") return "rawCandles";
  if (normalized === "candles" || normalized === "candlearray" || normalized === "candlearrays") {
    return "candleArrays";
  }
  if (normalized === "ohlcv" || normalized === "importedohlcvarrays" || normalized === "importedohlcv") {
    return "importedOhlcvArrays";
  }
  if (normalized === "rawruntimesnapshot" || normalized === "runtimesnapshot") return "rawRuntimeSnapshot";
  if (normalized === "secrets") return "secrets";
  if (normalized === "apikey" || normalized === "apikeys" || normalized === "openaikey") return "apiKeys";
  if (normalized === "token" || normalized === "tokens" || normalized === "authorization") return "tokensPasswords";
  if (normalized === "password" || normalized === "passwords") return "tokensPasswords";
  if (normalized === "mt5credentials" || normalized === "mt5login" || normalized === "mt5password") return "mt5Credentials";
  if (normalized === "account" || normalized === "accountdata" || normalized === "accountnumber") return "accountData";
  if (
    normalized === "order" ||
    normalized === "orders" ||
    normalized === "orderdata" ||
    normalized === "orderid" ||
    normalized === "orderroute"
  ) {
    return "orderData";
  }
  if (normalized === "position" || normalized === "positions" || normalized === "positiondata" || normalized === "positionid") {
    return "positionData";
  }
  if (normalized === "brokermutation" || normalized === "mutatebroker") return "brokerMutation";
  if (normalized === "executionrequest" || normalized === "executionintent") return "executionRequest";
  if (normalized === "placeorder" || normalized === "buymarket" || normalized === "sellmarket") return "executionRequest";
  if (normalized === "readinessoverride" || normalized === "overridereadiness") return "readinessOverride";
  if (
    normalized === "activecalibration" ||
    normalized === "activecalibrationmutation" ||
    normalized === "activeresearchcalibration"
  ) {
    return "activeCalibrationMutation";
  }
  if (normalized === "applycalibration") return "applyCalibration";
  if (normalized === "approvecalibrationproposal") return "approveCalibrationProposal";
  if (normalized === "screenshot" || normalized === "screenshots" || normalized === "base64" || normalized === "imagebase64") {
    return "screenshotsBase64";
  }
  return undefined;
};

const forbiddenStringLabel = (value: string): string | undefined => {
  if (/\bapplyCalibration\b/i.test(value)) return "applyCalibration";
  if (/\bapproveCalibrationProposal\b/i.test(value)) return "approveCalibrationProposal";
  if (/\bactive[_ -]?calibration\b/i.test(value)) return "activeCalibrationMutation";
  if (/\bauto[_ -]?apply\b/i.test(value) && /\btrue\b/i.test(value)) return "autoApply";
  if (/\b(buy|sell)\s+(market|limit|stop|order|contract|now)\b/i.test(value)) return "executionRequest";
  if (/\b(place|close|modify|cancel)\s+(an?\s+)?(order|position|trade)\b/i.test(value)) {
    return "executionRequest";
  }
  if (/\bexecute\s+(trade|order)\b/i.test(value)) return "executionRequest";
  if (/\b(readiness|paper[- ]?demo)\s+override\b/i.test(value)) return "readinessOverride";
  if (/\bbroker\s+mutation\b|\bmutate\s+broker\b/i.test(value)) return "brokerMutation";
  if (/\bapi[_ -]?key\b|\bbearer\s+[a-z0-9._-]+|\bpassword\s*=|\btoken\s*=|\bsk-[a-z0-9]{8,}/i.test(value)) {
    return "secrets";
  }
  return undefined;
};

const looksLikeCandleArray = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  const firstRecord = value.find(isRecord);
  if (!firstRecord) {
    return false;
  }
  return (
    ("open" in firstRecord &&
      "high" in firstRecord &&
      "low" in firstRecord &&
      "close" in firstRecord &&
      ("timestamp" in firstRecord || "time" in firstRecord)) ||
    ("o" in firstRecord && "h" in firstRecord && "l" in firstRecord && "c" in firstRecord)
  );
};

const collectBlockedFields = (value: unknown, path = "$", seen = new WeakSet<object>()): string[] => {
  const findings: string[] = [];
  const add = (label: string, location: string) => findings.push(`${label}:${location}`);

  if (typeof value === "string") {
    const label = forbiddenStringLabel(value);
    if (label) {
      add(label, path);
    }
    return findings;
  }

  if (looksLikeCandleArray(value)) {
    add("candleArrays", path);
    return findings;
  }

  if (!value || typeof value !== "object") {
    return findings;
  }

  if (seen.has(value)) {
    return findings;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...collectBlockedFields(item, `${path}[${index}]`, seen)));
    return findings;
  }

  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    const childPath = `${path}.${key}`;
    const keyLabel = forbiddenKeyLabel(key);
    if (keyLabel) {
      add(keyLabel, childPath);
    }
    if (normalizeKey(key) === "autoapplyallowed" && child === true) {
      add("autoApply", childPath);
    }
    if (
      (key === "executionAuthority" || key === "brokerAuthority" || key === "readinessOverrideAuthority") &&
      child !== undefined &&
      child !== "none"
    ) {
      add(`${key}_not_none`, childPath);
    }
    findings.push(...collectBlockedFields(child, childPath, seen));
  }

  return findings;
};

const unique = (values: string[]) => [...new Set(values)];

export function validateOpenClawPilotDryRunPacket(
  packet: unknown,
  program: OpenClawPilotProgram = loadOpenClawPilotProgram()
): OpenClawPilotValidationResult {
  const programValidation = validateOpenClawPilotProgram(program);
  const blockedFields = unique(collectBlockedFields(packet));
  const authority = extractAuthority(packet);
  const authorityValid = authorityIsNone(authority);
  const errors = [
    ...programValidation.errors.map((error) => `program:${error}`),
    ...blockedFields.map((field) => `blocked:${field}`)
  ];

  if (!authorityValid) {
    errors.push("authority:authority fields must remain none/none/none");
  }

  const valid = errors.length === 0;
  return {
    valid,
    status: valid ? "passed" : "failed",
    blockedFields,
    errors,
    warnings: programValidation.warnings,
    authority: openClawPilotAuthorityNone,
    autoApplyAllowed: false,
    programSummary: summarizeOpenClawPilotProgram(program)
  };
}

const deriveCompactSummary = (packet: unknown, valid: boolean, blockedFields: string[]) => {
  const requestedSymbol =
    getNestedString(packet, ["requestedSymbol"]) ??
    getNestedString(packet, ["latestCycle", "requestedSymbol"]) ??
    getNestedString(packet, ["sourceContext", "requestedSymbol"]) ??
    "unknown";
  const brokerSymbol =
    getNestedString(packet, ["brokerSymbol"]) ??
    getNestedString(packet, ["latestCycle", "brokerSymbol"]) ??
    getNestedString(packet, ["sourceContext", "brokerSymbol"]) ??
    "unknown";
  const provider =
    getNestedString(packet, ["sourceProvider"]) ??
    getNestedString(packet, ["sourceContext", "provider"]) ??
    getNestedString(packet, ["latestCycle", "provider"]) ??
    "unknown";
  const verdict = valid ? "passed OpenClaw pilot dry-run validation" : `blocked ${blockedFields.length} unsafe field(s)`;
  return `${requestedSymbol} via ${brokerSymbol} on ${provider}: ${verdict}.`.slice(0, MAX_SUMMARY_LENGTH);
};

export function runOpenClawPilotDryRun(
  packet: unknown,
  options: OpenClawPilotDryRunOptions = {}
): OpenClawPilotAuditEntry {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const program = options.program ?? loadOpenClawPilotProgram();
  const validationResult = validateOpenClawPilotDryRunPacket(packet, program);
  const valid = validationResult.valid;
  const id = `openclaw_pilot_dry_run_${timestamp.replace(/[^0-9a-z]/gi, "")}`;
  const relatedIntent =
    getNestedString(packet, ["intentId"]) ??
    getNestedString(packet, ["selfImprovementProposalIntent", "proposalTitle"]);
  const compactSummary = deriveCompactSummary(packet, valid, validationResult.blockedFields);

  return {
    id,
    auditId: id,
    timestamp,
    eventType: valid ? "dry_run_passed" : "dry_run_rejected",
    summary: compactSummary,
    compactSummary,
    relatedPacketId: getNestedString(packet, ["packetId"]),
    relatedIntentId: relatedIntent,
    requestedSymbol:
      getNestedString(packet, ["requestedSymbol"]) ??
      getNestedString(packet, ["latestCycle", "requestedSymbol"]) ??
      getNestedString(packet, ["sourceContext", "requestedSymbol"]),
    brokerSymbol:
      getNestedString(packet, ["brokerSymbol"]) ??
      getNestedString(packet, ["latestCycle", "brokerSymbol"]) ??
      getNestedString(packet, ["sourceContext", "brokerSymbol"]),
    sourceProvider:
      getNestedString(packet, ["sourceProvider"]) ??
      getNestedString(packet, ["sourceContext", "provider"]) ??
      getNestedString(packet, ["latestCycle", "provider"]),
    sourceFingerprint:
      getNestedString(packet, ["sourceFingerprint"]) ??
      getNestedString(packet, ["sourceContext", "sourceFingerprint"]),
    validationResult,
    blockedFields: validationResult.blockedFields,
    nextAction: valid
      ? "Queue deterministic GoTrader validation if a human chooses to continue."
      : "Remove blocked fields and rerun the OpenClaw pilot dry-run before advisory or proposal review.",
    authority: openClawPilotAuthorityNone,
    forbiddenFieldsAbsent: true,
    exclusions: openClawPilotForbiddenFields,
    safety: {
      rawCandlesExcluded: true,
      rawSnapshotsExcluded: true,
      accountDataExcluded: true,
      orderDataExcluded: true,
      positionDataExcluded: true,
      secretsExcluded: true,
      screenshotsBase64Excluded: true,
      importedOhlcvArraysExcluded: true
    }
  };
}

export const openClawPilotDryRunAuditIsSafe = (entry: OpenClawPilotAuditEntry): boolean =>
  assertOpenClawPilotAuthorityNone(entry.authority) &&
  entry.forbiddenFieldsAbsent === true &&
  entry.safety.rawCandlesExcluded &&
  entry.safety.secretsExcluded &&
  entry.safety.accountDataExcluded &&
  entry.safety.orderDataExcluded &&
  entry.safety.positionDataExcluded;
