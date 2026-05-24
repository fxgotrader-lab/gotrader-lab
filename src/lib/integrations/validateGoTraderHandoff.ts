import {
  GO_TRADER_HANDOFF_MODE,
  GO_TRADER_HANDOFF_SOURCE,
  GO_TRADER_HANDOFF_STRATEGY,
  type GoTraderHandoff,
  type GoTraderHandoffValidationResult
} from "@/lib/integrations/goTraderHandoffSchema";

const validSignals = new Set([-1, 0, 1]);

export function validateGoTraderHandoff(handoff: Partial<GoTraderHandoff>): GoTraderHandoffValidationResult {
  const errors: string[] = [];

  if (!handoff.symbol) {
    errors.push("symbol is required");
  }

  if (!handoff.timeframe) {
    errors.push("timeframe is required");
  }

  if (typeof handoff.confidence !== "number" || !Number.isFinite(handoff.confidence)) {
    errors.push("confidence is required");
  }

  if (handoff.mode !== GO_TRADER_HANDOFF_MODE) {
    errors.push('mode cannot be changed; it must remain "simulation"');
  }

  if (!validSignals.has(handoff.signal as number)) {
    errors.push("signal must be -1, 0, or 1");
  }

  if (handoff.source !== GO_TRADER_HANDOFF_SOURCE) {
    errors.push(`source must be "${GO_TRADER_HANDOFF_SOURCE}"`);
  }

  if (handoff.strategy !== GO_TRADER_HANDOFF_STRATEGY) {
    errors.push(`strategy must be "${GO_TRADER_HANDOFF_STRATEGY}"`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export class GoTraderHandoffValidationError extends Error {
  constructor(public readonly validation: GoTraderHandoffValidationResult) {
    super(validation.errors.join("; "));
    this.name = "GoTraderHandoffValidationError";
  }
}
