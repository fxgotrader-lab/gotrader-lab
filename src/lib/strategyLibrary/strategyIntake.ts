import { getStrategyDefinition, STRATEGY_LIBRARY_AUTHORITY, suggestStrategyIdForRecognition } from "./strategyRegistry";
import type { StrategyFamily, StrategyIntakeInput, StrategyIntakeRecord } from "./strategyLibraryTypes";

const timestampToken = (value: string) => value.replace(/[^0-9a-z]/gi, "");
const hash = (value: string) =>
  Math.abs(Array.from(value).reduce((current, char) => ((current << 5) - current + char.charCodeAt(0)) | 0, 0)).toString(36);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const forbiddenKeyPattern =
  /^(rawCandles|candles|rawRuntimeSnapshot|rawSnapshot|snapshot|accountData|accountNumber|accountId|orderData|orders|orderId|orderRoute|positionData|positions|positionId|apiKey|token|password|secret|mt5Credentials|mt5Login|mt5Password|base64)$/i;
const forbiddenLanguagePattern =
  /\b(place order|buy market|sell market|close position|modify order|cancel order|enable live trading|connect live broker|applyCalibration|approveCalibrationProposal|active_calibration)\b/i;

export function findStrategyForbiddenFields(value: unknown, path = "$", findings: string[] = []): string[] {
  if (typeof value === "string" && forbiddenLanguagePattern.test(value)) {
    findings.push(`${path}:forbidden_language`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findStrategyForbiddenFields(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!isRecord(value)) return findings;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenKeyPattern.test(key)) findings.push(childPath);
    findStrategyForbiddenFields(child, childPath, findings);
  }
  return [...new Set(findings)];
}

const compactNotes = (notes?: string[]) => (notes ?? []).map((note) => String(note).trim()).filter(Boolean).slice(0, 8);
const strategyFamilies = new Set<StrategyFamily>([
  "ict_cmd",
  "silver_bullet",
  "camerons_model",
  "ifvg",
  "turtle_soup",
  "crt",
  "ote",
  "cisd",
  "amd",
  "grinch",
  "pd_array",
  "scalp",
  "market_map",
  "diagnostic"
]);
const asStrategyFamily = (value?: string): StrategyFamily | undefined =>
  strategyFamilies.has(value as StrategyFamily) ? value as StrategyFamily : undefined;

export function createStrategyIntakeRecord(input: StrategyIntakeInput): StrategyIntakeRecord {
  const timestamp = new Date().toISOString();
  const openClawFamilies = input.openClawDraft?.candidateFamilies ?? [];
  const openClawStrategyFamily = asStrategyFamily(input.openClawDraft?.strategyFamily);
  const strategyId =
    input.strategyId ??
    input.openClawDraft?.strategyId ??
    suggestStrategyIdForRecognition({
      candidateFamilies: openClawFamilies,
      family: openClawStrategyFamily ?? input.recognition?.family,
      modelName: input.recognition?.modelName,
      setupName: input.recognition?.setupName,
      targetSubsystem: input.openClawDraft?.targetSubsystem
    }) ??
    "unknown_strategy";
  const definition = getStrategyDefinition(strategyId);
  const sourceProvider = input.sourceStatus?.sourceProvider ?? input.validationChainEntry?.sourceStatus.sourceProvider;
  const sourceFingerprint = input.sourceStatus?.sourceFingerprint ?? input.validationChainEntry?.sourceFingerprint;
  const requestedSymbol = input.sourceStatus?.requestedSymbol ?? input.validationChainEntry?.symbol ?? input.openClawDraft?.requestedSymbol;
  const brokerSymbol = input.sourceStatus?.brokerSymbol ?? input.validationChainEntry?.brokerSymbol ?? input.openClawDraft?.brokerSymbol;
  const timeframe = input.sourceStatus?.primaryTimeframe ?? input.validationChainEntry?.timeframe ?? input.openClawDraft?.timeframe;
  const sourceIsMockOrSample =
    input.sourceStatus?.isMockOrSample === true ||
    input.validationChainEntry?.sourceStatus.isMockOrSample === true ||
    /mock|sample/i.test(sourceProvider ?? "");
  const blockedFields = [
    ...findStrategyForbiddenFields(input.payload),
    ...findStrategyForbiddenFields(input.openClawDraft),
    ...findStrategyForbiddenFields(input.operatorNotes)
  ];
  if (
    input.authority &&
    (input.authority.executionAuthority !== undefined && input.authority.executionAuthority !== "none" ||
      input.authority.brokerAuthority !== undefined && input.authority.brokerAuthority !== "none" ||
      input.authority.readinessOverrideAuthority !== undefined && input.authority.readinessOverrideAuthority !== "none")
  ) {
    blockedFields.push("$.authority");
  }

  return {
    id: `strategy_intake_${timestampToken(timestamp)}_${hash(`${strategyId}|${sourceFingerprint ?? "missing"}`)}`,
    createdAt: timestamp,
    strategyId,
    strategyKnown: Boolean(definition),
    requestedSymbol,
    brokerSymbol,
    timeframe,
    sourceProvider,
    sourceFingerprint,
    sourceIsMockOrSample,
    recognition: {
      modelName: input.recognition?.modelName,
      setupName: input.recognition?.setupName,
      family: input.recognition?.family,
      side: input.recognition?.side,
      presentConditions: compactNotes(input.recognition?.presentConditions),
      missingConditions: compactNotes(input.recognition?.missingConditions),
      notes: compactNotes(input.recognition?.notes)
    },
    validationChainId: input.validationChainEntry?.recognitionId ?? input.openClawDraft?.validationChainId,
    validationStatus: input.validationChainEntry?.hypothesisStatus,
    openClawDraftId: input.openClawDraft?.id,
    openClawCandidateFamilies: openClawFamilies.slice(0, 8),
    operatorNotes: compactNotes(input.operatorNotes),
    evidenceSummary: input.evidenceSummary,
    blockedFields: [...new Set(blockedFields)],
    compactSummary: definition
      ? `${definition.name}: ${requestedSymbol ?? "symbol pending"} ${timeframe ?? "timeframe pending"} on ${sourceProvider ?? "source pending"}.`
      : `Unknown strategy intake requires human strategy definition before validation.`,
    researchOnly: true,
    authority: STRATEGY_LIBRARY_AUTHORITY,
    safety: {
      rawCandlesExcluded: true,
      rawSnapshotsExcluded: true,
      accountDataExcluded: true,
      orderDataExcluded: true,
      positionDataExcluded: true,
      secretsExcluded: true
    }
  };
}

export const assertStrategyIntakeRecordIsCompact = (record: StrategyIntakeRecord) => {
  const serialized = JSON.stringify(record);
  return {
    ok:
      record.researchOnly === true &&
      record.authority.executionAuthority === "none" &&
      record.authority.brokerAuthority === "none" &&
      record.authority.readinessOverrideAuthority === "none" &&
      record.safety.rawCandlesExcluded === true &&
      !/"candles"\s*:|"rawCandles"\s*:|"rawRuntimeSnapshot"\s*:|"account(Data|Number|Id)?"\s*:|"order(Data|s|Id|Route)?"\s*:|"position(Data|s|Id)?"\s*:|"apiKey"\s*:|"token"\s*:|"password"\s*:|"secret"\s*:/i.test(serialized),
    serializedBytes: serialized.length
  };
};
