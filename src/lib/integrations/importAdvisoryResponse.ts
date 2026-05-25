import type {
  AdvisoryResponse,
  AdvisoryResponseImportResult
} from "@/lib/integrations/openclawHermesTypes";
import { validateAdvisoryResponse } from "@/lib/integrations/validateAdvisoryResponse";

export function importAdvisoryResponse(rawJson: string): AdvisoryResponseImportResult {
  if (!rawJson.trim()) {
    return {
      validation: {
        valid: false,
        errors: ["Paste an advisory response JSON payload first"],
        warnings: []
      }
    };
  }

  try {
    const parsed = JSON.parse(rawJson) as Partial<AdvisoryResponse>;
    const validation = validateAdvisoryResponse(parsed);
    return {
      response: validation.valid ? (parsed as AdvisoryResponse) : undefined,
      validation
    };
  } catch {
    return {
      validation: {
        valid: false,
        errors: ["Response JSON could not be parsed"],
        warnings: []
      }
    };
  }
}
