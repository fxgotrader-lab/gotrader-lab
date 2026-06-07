export type IctGrinchImplementationStatus =
  | "missing"
  | "partial"
  | "generic_ict_approximation"
  | "implemented";

export interface IctGrinchModelContract {
  id: "grinch_model_1" | "grinch_reversal" | "grinch_consolidation";
  label: string;
  implementationStatus: IctGrinchImplementationStatus;
  missingDetailRequired: boolean;
  requiredSessionConditions: string[];
  requiredLiquidityBehavior: string[];
  requiredEntryFields: string[];
  requiredTargetFields: string[];
  requiredInvalidationFields: string[];
  missingDetailNeeded: string[];
  researchOnly: true;
  authority: {
    executionAuthority: "none";
    brokerAuthority: "none";
    readinessOverrideAuthority: "none";
  };
}

const authority = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

export const ICT_GRINCH_MODEL_CONTRACTS: IctGrinchModelContract[] = [
  {
    id: "grinch_model_1",
    label: "Grinch Model 1",
    implementationStatus: "generic_ict_approximation",
    missingDetailRequired: true,
    requiredSessionConditions: [
      "Session-local timing window must be identified.",
      "Model-specific bias and opening-price relationship must be known."
    ],
    requiredLiquidityBehavior: [
      "Clear liquidity draw or sweep must be identified before candidate construction."
    ],
    requiredEntryFields: [
      "Entry zone from model-specific displacement/FVG/order-block structure."
    ],
    requiredTargetFields: [
      "External liquidity or session/FVG target aligned with model direction."
    ],
    requiredInvalidationFields: [
      "Model-specific sweep/raid extreme or mitigation/FVG origin boundary."
    ],
    missingDetailNeeded: [
      "Precise Grinch Model 1 teaching rules for timing, setup state, and entry trigger.",
      "Approved target and invalidation hierarchy for Model 1."
    ],
    researchOnly: true,
    authority
  },
  {
    id: "grinch_reversal",
    label: "Grinch Reversal",
    implementationStatus: "partial",
    missingDetailRequired: true,
    requiredSessionConditions: [
      "London or New York interaction with 12AM Open must be identified.",
      "Clean expansion away from 12AM Open must be confirmed before approval."
    ],
    requiredLiquidityBehavior: [
      "Liquidity sweep/raid and reversal away from the interaction level."
    ],
    requiredEntryFields: [
      "Reversal entry zone from FVG, mitigation block, or displacement structure."
    ],
    requiredTargetFields: [
      "Premium/discount FVG target, external liquidity, or session extreme in reversal direction."
    ],
    requiredInvalidationFields: [
      "Interaction/sweep extreme, London raid extreme, or mitigation/FVG origin boundary."
    ],
    missingDetailNeeded: [
      "Exact Grinch clean-expansion threshold and candle-structure rules.",
      "Exact reversal entry confirmation hierarchy."
    ],
    researchOnly: true,
    authority
  },
  {
    id: "grinch_consolidation",
    label: "Grinch Consolidation",
    implementationStatus: "generic_ict_approximation",
    missingDetailRequired: true,
    requiredSessionConditions: [
      "Tight consolidation range must be detected before manipulation/distribution."
    ],
    requiredLiquidityBehavior: [
      "Liquidity raid outside consolidation followed by displacement back through range."
    ],
    requiredEntryFields: [
      "Entry zone from post-raid displacement/FVG or mitigation structure."
    ],
    requiredTargetFields: [
      "Opposite-side range liquidity, external liquidity, or session/FVG target."
    ],
    requiredInvalidationFields: [
      "Raid extreme, consolidation extreme, or FVG origin boundary."
    ],
    missingDetailNeeded: [
      "Exact Grinch consolidation tightness thresholds.",
      "Approved raid and distribution confirmation rules."
    ],
    researchOnly: true,
    authority
  }
];

export const summarizeIctGrinchModelInventory = () => ({
  researchOnly: true as const,
  totalModels: ICT_GRINCH_MODEL_CONTRACTS.length,
  implemented: ICT_GRINCH_MODEL_CONTRACTS.filter((model) => model.implementationStatus === "implemented").length,
  partial: ICT_GRINCH_MODEL_CONTRACTS.filter((model) => model.implementationStatus === "partial").length,
  genericApproximations: ICT_GRINCH_MODEL_CONTRACTS.filter((model) => model.implementationStatus === "generic_ict_approximation").length,
  missingDetailRequired: ICT_GRINCH_MODEL_CONTRACTS.filter((model) => model.missingDetailRequired).length,
  authority
});
