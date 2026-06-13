import type { StrategyDefinition, StrategyFamily, StrategySide, StrategyStatus } from "./strategyLibraryTypes";

export const STRATEGY_LIBRARY_AUTHORITY = {
  executionAuthority: "none" as const,
  brokerAuthority: "none" as const,
  readinessOverrideAuthority: "none" as const
};

const mt5ResearchSource = {
  allowedProviders: ["mt5_read_only", "imported_historical"],
  requiresFingerprint: true,
  allowMockOrSample: false,
  cfdProxyAllowed: true,
  notes: [
    "MT5 read-only CFD/proxy data is allowed for research labeling only.",
    "Mock/sample data cannot create evidence or Paper-Demo eligibility."
  ]
};

const compactValidation = [
  {
    id: "replay_validation",
    label: "Replay validation",
    required: true,
    detail: "Replay must pass from compact deterministic results; recognition alone is not evidence."
  },
  {
    id: "walk_forward_oos",
    label: "Walk-forward/OOS",
    required: true,
    detail: "Walk-forward or OOS validation must not degrade."
  },
  {
    id: "evidence_maturity",
    label: "Evidence and maturity",
    required: true,
    minimum: 50,
    detail: "Evidence and maturity summaries must be present before Paper-Demo discussion."
  }
];

const researchOnlyPlaceholderStrategy = (config: {
  id: string;
  name: string;
  family: StrategyFamily;
  description: string;
  side?: StrategySide;
  supportedSymbols?: string[];
  primaryTimeframes?: string[];
  higherTimeframes?: string[];
  requiredConditions: Array<{ id: string; label: string; description: string }>;
  sessionRules?: string[];
  regimeRules?: string[];
  minimumRR?: number;
  forbiddenPromotionReasons?: string[];
}): StrategyDefinition => ({
  id: config.id,
  name: config.name,
  family: config.family,
  status: "research_only",
  detectorStatus: "research_only_placeholder",
  description: config.description,
  side: config.side ?? "both",
  supportedSymbols: config.supportedSymbols ?? ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD"],
  primaryTimeframes: config.primaryTimeframes ?? ["1m", "5m", "15m"],
  higherTimeframes: config.higherTimeframes ?? ["5m", "15m", "1h", "4h", "1d"],
  sourceRequirements: mt5ResearchSource,
  requiredConditions: config.requiredConditions.map((condition) => ({
    ...condition,
    requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
  })),
  invalidationRules: [
    "Research placeholder cannot define active invalidation until a deterministic detector contract is implemented.",
    "No Paper-Demo progression is allowed from strategy definition alone."
  ],
  targetRules: [
    "Research placeholder cannot define active targets until replay validates a deterministic detector.",
    "Targets must remain compact and cannot imply execution."
  ],
  minimumRR: config.minimumRR ?? 2,
  sessionRules: config.sessionRules ?? ["Session model must be explicit before replay."],
  regimeRules: config.regimeRules ?? ["No regime or readiness override."],
  validationRequirements: compactValidation,
  paperDemoRequirements: [
    {
      id: "deterministic_detector_required",
      label: "Deterministic detector required",
      required: true,
      detail: "This strategy is registered for research intake, but its executable detector is not implemented yet."
    }
  ],
  forbiddenPromotionReasons: [
    "deterministic detector not implemented",
    "placeholder strategy",
    "mock/sample source",
    "missing replay",
    "missing walk-forward",
    ...(config.forbiddenPromotionReasons ?? [])
  ],
  authority: STRATEGY_LIBRARY_AUTHORITY
});

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    id: "silver_bullet_v1",
    name: "ICT Silver Bullet v1",
    family: "silver_bullet",
    status: "replay_required",
    detectorStatus: "executable_research",
    description:
      "Research-only Silver Bullet detector for the 03:00, 10:00, and 14:00 New York one-hour windows. It requires a liquidity sweep, matching FVG, return to FVG, explicit target/invalidation, and at least 2R before replay validation.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["1m"],
    higherTimeframes: ["5m", "15m"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "silver_bullet_killzone",
        label: "Silver Bullet killzone",
        description: "Latest one-minute context must be inside 03:00-04:00, 10:00-11:00, or 14:00-15:00 New York.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "liquidity_sweep",
        label: "Liquidity sweep",
        description: "Long requires sell-side sweep; short requires buy-side sweep.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "directional_fvg",
        label: "Directional FVG",
        description: "Bullish FVG after sell-side sweep or bearish FVG after buy-side sweep.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "return_to_fvg",
        label: "Return to FVG",
        description: "Price must return to the FVG entry zone before candidate creation.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "target_invalidation_rr",
        label: "Target/invalidation/RR",
        description: "Target, invalidation, and minimum 2R must be compactly defined.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Long invalidation below the FVG boundary or swept sell-side level.",
      "Short invalidation above the FVG boundary or swept buy-side level."
    ],
    targetRules: [
      "Target next liquidity pool or prior swing opposite the entry direction.",
      "Minimum reward/risk is 2R before validation can be queued."
    ],
    minimumRR: 2,
    sessionRules: [
      "Use America/New_York timing for Silver Bullet windows.",
      "Valid windows: 03:00-04:00, 10:00-11:00, 14:00-15:00 New York."
    ],
    regimeRules: [
      "VWAP extension should be available or flagged for manual review.",
      "High-impact news within 30 minutes blocks candidate creation."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "silver_bullet_replay_oos",
        label: "Silver Bullet replay/OOS",
        required: true,
        detail: "Silver Bullet can only progress after replay, walk-forward, evidence, maturity, and checklist gates."
      }
    ],
    forbiddenPromotionReasons: [
      "outside killzone",
      "missing sweep",
      "missing FVG",
      "missing return to FVG",
      "RR below 2",
      "mock/sample source",
      "high-impact news"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  researchOnlyPlaceholderStrategy({
    id: "camerons_model_research_v1",
    name: "Cameron's Model Research v1",
    family: "camerons_model",
    description:
      "Registered research definition for Cameron's model. It can receive compact intake and OpenClaw proposal references, but no executable detector is implemented yet.",
    requiredConditions: [
      { id: "camerons_session_context", label: "Session context", description: "Session context and model phase must be explicit." },
      { id: "camerons_sweep_displacement", label: "Sweep/displacement", description: "Sweep and displacement evidence must be deterministic." },
      { id: "camerons_entry_model", label: "Entry model", description: "Entry, invalidation, target, and RR must be generated by a detector." }
    ],
    forbiddenPromotionReasons: ["Cameron's model detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "ifvg_research_v1",
    name: "Inversion FVG Research v1",
    family: "ifvg",
    description:
      "Registered research definition for IFVG continuation/reversal review. It remains placeholder-only until inversion and retest rules are deterministic.",
    requiredConditions: [
      { id: "fvg_invalidated", label: "FVG invalidated", description: "Original FVG must be invalidated cleanly." },
      { id: "inversion_retest", label: "Inversion retest", description: "Retest of the inverted FVG must be detected." },
      { id: "ifvg_displacement", label: "Displacement follow-through", description: "Displacement away from the inversion must confirm direction." }
    ],
    forbiddenPromotionReasons: ["IFVG detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "turtle_soup_research_v1",
    name: "Turtle Soup Research v1",
    family: "turtle_soup",
    description:
      "Registered research definition for false-breakout reversal review. It remains placeholder-only until sweep, reclaim, and target logic are deterministic.",
    requiredConditions: [
      { id: "prior_high_low_sweep", label: "Prior high/low sweep", description: "A previous high or low must be swept." },
      { id: "failed_breakout_reclaim", label: "Failed breakout reclaim", description: "Price must reclaim the swept level." },
      { id: "opposing_liquidity_target", label: "Opposing liquidity target", description: "Target must be the next opposing liquidity pool." }
    ],
    forbiddenPromotionReasons: ["Turtle Soup detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "crt_research_v1",
    name: "Candle Range Theory Research v1",
    family: "crt",
    description:
      "Registered research definition for CRT range expansion and false-breakout context. It is research-only until candle range construction is deterministic.",
    requiredConditions: [
      { id: "crt_range_candle", label: "CRT range candle", description: "Reference range candle must be selected deterministically." },
      { id: "crt_liquidity_run", label: "CRT liquidity run", description: "Liquidity run outside the reference candle must be detected." },
      { id: "crt_reentry_expansion", label: "CRT re-entry/expansion", description: "Re-entry and expansion toward opposing range must confirm." }
    ],
    forbiddenPromotionReasons: ["CRT detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "ote_research_v1",
    name: "Optimal Trade Entry Research v1",
    family: "ote",
    description:
      "Registered research definition for OTE retracement into premium/discount arrays. It remains placeholder-only until swing selection and fib zone rules are deterministic.",
    requiredConditions: [
      { id: "impulse_swing_selected", label: "Impulse swing selected", description: "Impulse swing must be selected without hindsight." },
      { id: "ote_retracement_zone", label: "OTE retracement zone", description: "Retracement must enter the deterministic OTE zone." },
      { id: "pd_array_confluence", label: "PD-array confluence", description: "PD-array confluence must confirm entry logic." }
    ],
    forbiddenPromotionReasons: ["OTE detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "cisd_research_v1",
    name: "CISD Research v1",
    family: "cisd",
    description:
      "Registered research definition for Change in State of Delivery. It remains placeholder-only until displacement/state-change rules are deterministic.",
    requiredConditions: [
      { id: "delivery_state_shift", label: "Delivery state shift", description: "A clear shift in delivery state must be detected." },
      { id: "cisd_displacement", label: "CISD displacement", description: "Displacement must confirm the state change." },
      { id: "cisd_continuation_context", label: "Continuation context", description: "Continuation or reversal context must be compactly defined." }
    ],
    forbiddenPromotionReasons: ["CISD detector not implemented"]
  }),
  researchOnlyPlaceholderStrategy({
    id: "amd_power_of_three_research_v1",
    name: "AMD Power of Three Research v1",
    family: "amd",
    description:
      "Registered research definition for accumulation-manipulation-distribution / Power of Three. It remains placeholder-only until phase boundaries are deterministic.",
    requiredConditions: [
      { id: "accumulation_phase", label: "Accumulation phase", description: "Accumulation range must be explicit." },
      { id: "manipulation_phase", label: "Manipulation phase", description: "Manipulation outside the range must be detected." },
      { id: "distribution_phase", label: "Distribution phase", description: "Distribution/expansion must confirm the model." }
    ],
    forbiddenPromotionReasons: ["AMD Power of Three detector not implemented", "phase labels not deterministic"]
  }),
  {
    id: "ict_cmd_short_paper_watchlist_v1",
    name: "CMD Paper-Watchlist Short",
    family: "ict_cmd",
    status: "paper_watchlist_candidate",
    description:
      "Strict consolidation-manipulation-distribution short research lane. Promising behavior is paper-only until independent dates and rolling windows validate it.",
    side: "short",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h", "1d", "1w"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "consolidation_manipulation_distribution",
        label: "CMD model",
        description: "Session narrative must be consolidation, manipulation, then distribution.",
        requiredFor: ["intake", "paper_watchlist", "paper_demo"]
      },
      {
        id: "short_side_only",
        label: "Short side",
        description: "The strict current profile is short-only.",
        requiredFor: ["intake", "paper_watchlist", "paper_demo"]
      },
      {
        id: "clear_consolidation_range",
        label: "Clear consolidation range",
        description: "Range high/low must be explicit enough to define manipulation and invalidation.",
        requiredFor: ["paper_watchlist", "paper_demo"]
      },
      {
        id: "manipulation_or_liquidity_sweep_event",
        label: "Manipulation/sweep",
        description: "A clear sweep/manipulation event must precede distribution.",
        requiredFor: ["paper_watchlist", "paper_demo"]
      },
      {
        id: "distribution_or_expansion_away",
        label: "Distribution away",
        description: "Distribution/expansion away from the manipulated range must be present.",
        requiredFor: ["paper_watchlist", "paper_demo"]
      },
      {
        id: "external_liquidity_target",
        label: "External liquidity target",
        description: "Target must be external liquidity, not arbitrary midpoint projection.",
        requiredFor: ["paper_watchlist", "paper_demo"]
      },
      {
        id: "valid_structural_invalidation",
        label: "Valid invalidation",
        description: "Invalidation must be structural and compactly described.",
        requiredFor: ["paper_watchlist", "paper_demo"]
      },
      {
        id: "independent_date_gate",
        label: "Independent-date gate",
        description: "CMD must prove performance across independent dates/windows before Paper-Demo progression.",
        requiredFor: ["paper_demo"]
      }
    ],
    invalidationRules: [
      "For short CMD, invalidation must sit above the structural manipulation high or distribution invalidation point.",
      "No active candidate may omit invalidation."
    ],
    targetRules: [
      "Target must reference external liquidity or a validated premium/discount PD array.",
      "No active candidate may omit target."
    ],
    minimumRR: 1.2,
    sessionRules: ["Session narrative must confirm CMD.", "Range-bound alone cannot promote the strategy."],
    regimeRules: ["Range/high-volatility regimes are allowed only with distribution evidence."],
    validationRequirements: [
      ...compactValidation,
      {
        id: "independent_dates",
        label: "Independent dates",
        required: true,
        minimum: 3,
        detail: "At least three unique trading dates are required before promotion beyond watchlist."
      },
      {
        id: "active_rolling_windows",
        label: "Active rolling windows",
        required: true,
        minimum: 2,
        detail: "At least two rolling windows must produce CMD samples."
      },
      {
        id: "minimum_cmd_sample",
        label: "Minimum CMD sample",
        required: true,
        minimum: 20,
        detail: "Small one-day samples remain overfit-risk even with high target-first rates."
      }
    ],
    paperDemoRequirements: [
      {
        id: "paper_demo_checklist",
        label: "Paper-Demo checklist",
        required: true,
        detail: "Paper-Demo checklist must remain blocked until independent-date validation passes."
      }
    ],
    forbiddenPromotionReasons: [
      "one-date cluster",
      "mock/sample source",
      "missing target",
      "missing invalidation",
      "missing RR",
      "failed OOS"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "grinch_reversal_expansion_confirmation_v1",
    name: "Grinch Reversal Expansion Confirmation",
    family: "grinch",
    status: "replay_required",
    description: "Research-only candidate family for testing whether reversal expansion away from 12AM Open improves setup quality.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      { id: "london_interaction_12am", label: "London interaction", description: "London must interact with the 12AM Open.", requiredFor: ["intake", "replay"] },
      { id: "clean_expansion_away", label: "Clean expansion away", description: "Expansion must move cleanly away from 12AM Open.", requiredFor: ["replay", "paper_watchlist"] }
    ],
    invalidationRules: ["Timing gates cannot be bypassed.", "Expansion failure keeps the setup blocked."],
    targetRules: ["Use 12AM Open/PD-array targets only when replay confirms expansion quality."],
    minimumRR: 1.2,
    sessionRules: ["Use New York session timing mapping for MT5 CFD/proxy data."],
    regimeRules: ["Range/high-volatility requires extra expansion confirmation."],
    validationRequirements: compactValidation,
    paperDemoRequirements: [{ id: "not_paper_demo_ready", label: "Not Paper-Demo ready", required: true, detail: "Family is executable by Auto Research but not Paper-Demo eligible yet." }],
    forbiddenPromotionReasons: ["missing clean expansion", "timing expired", "unsafe authority", "insufficient replay"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "grinch_model_1_research_v1",
    name: "Grinch Model 1 Research Placeholder",
    family: "grinch",
    status: "research_only",
    description: "Placeholder/research-only Model 1 family. Cannot become Paper-Demo eligible without a dedicated validated profile.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [{ id: "model_1_profile", label: "Model 1 profile", description: "Profile evidence must be explicit.", requiredFor: ["intake"] }],
    invalidationRules: ["Placeholder strategies cannot define active invalidation for Paper-Demo."],
    targetRules: ["Placeholder strategies cannot define active targets for Paper-Demo."],
    minimumRR: 1.2,
    sessionRules: ["Timing windows must be session-local."],
    regimeRules: ["No regime override."],
    validationRequirements: compactValidation,
    paperDemoRequirements: [{ id: "placeholder_block", label: "Placeholder block", required: true, detail: "Requires a complete strategy definition first." }],
    forbiddenPromotionReasons: ["placeholder strategy", "missing validated family"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "grinch_consolidation_research_v1",
    name: "Grinch Consolidation Research Placeholder",
    family: "grinch",
    status: "research_only",
    description: "Placeholder/research-only Grinch consolidation family. No Paper-Demo progression without replay/OOS evidence.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [{ id: "consolidation_profile", label: "Consolidation profile", description: "Tight range and liquidity raid must be explicit.", requiredFor: ["intake"] }],
    invalidationRules: ["Range-bound chop cannot create Paper-Demo invalidation."],
    targetRules: ["Liquidity raid and expansion must define target logic."],
    minimumRR: 1.2,
    sessionRules: ["Consolidation window must be session-local."],
    regimeRules: ["Range-bound alone is not enough."],
    validationRequirements: compactValidation,
    paperDemoRequirements: [{ id: "placeholder_block", label: "Placeholder block", required: true, detail: "Requires a complete strategy definition first." }],
    forbiddenPromotionReasons: ["placeholder strategy", "range not tight", "no liquidity raid"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "pd_array_setup_research_v1",
    name: "PD-Array Setup Research",
    family: "pd_array",
    status: "research_only",
    description: "Research-only PD-array alignment setup. It may support context but cannot become Paper-Demo eligible by itself.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US500", "US30", "XAUUSD"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h", "1d"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [{ id: "pd_array_alignment", label: "PD-array alignment", description: "Active PD array and dealing-range location must be explicit.", requiredFor: ["intake"] }],
    invalidationRules: ["PD array alone cannot provide complete invalidation."],
    targetRules: ["PD array can suggest a target but does not create a standalone strategy."],
    minimumRR: 1.2,
    sessionRules: ["Session context must be present."],
    regimeRules: ["No regime override."],
    validationRequirements: compactValidation,
    paperDemoRequirements: [{ id: "support_only", label: "Support only", required: true, detail: "Must be paired with a validated model." }],
    forbiddenPromotionReasons: ["supporting context only", "no standalone model"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "scalp_setup_research_v1",
    name: "Scalp Setup Research",
    family: "scalp",
    status: "research_only",
    description: "Lower-timeframe scalp setup research lane. Remains watchlist-only until replay/OOS proves quality.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US500", "US30"],
    primaryTimeframes: ["1m", "5m"],
    higherTimeframes: ["5m", "15m", "1h"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [{ id: "scalp_confirmation", label: "Scalp confirmation", description: "Lower-timeframe displacement and liquidity context must be present.", requiredFor: ["intake"] }],
    invalidationRules: ["Scalp invalidation must be explicit and close to entry context."],
    targetRules: ["Targets must be compact and not imply execution."],
    minimumRR: 1.2,
    sessionRules: ["Must be within configured research session."],
    regimeRules: ["Avoid high-noise conditions unless replay proves stability."],
    validationRequirements: compactValidation,
    paperDemoRequirements: [{ id: "scalp_not_validated", label: "Scalp not validated", required: true, detail: "Scalp setup is research/watchlist-only." }],
    forbiddenPromotionReasons: ["unvalidated scalp", "low sample", "HTF conflict"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "market_map_only_diagnostic_v1",
    name: "Market-Map Only Diagnostic",
    family: "market_map",
    status: "retired",
    description: "Diagnostic-only market map context. It can explain bias/context but cannot create evidence or Paper-Demo eligibility.",
    side: "both",
    supportedSymbols: ["*"],
    primaryTimeframes: ["5m", "15m", "1h"],
    higherTimeframes: ["15m", "1h", "4h", "1d", "1w"],
    sourceRequirements: { ...mt5ResearchSource, allowMockOrSample: false },
    requiredConditions: [{ id: "market_map_context", label: "Market map context", description: "Context-only framework, not a setup.", requiredFor: ["intake"] }],
    invalidationRules: ["No invalidation because this is not a setup."],
    targetRules: ["No target because this is not a setup."],
    minimumRR: 0,
    sessionRules: ["Diagnostic only."],
    regimeRules: ["Diagnostic only."],
    validationRequirements: [],
    paperDemoRequirements: [{ id: "diagnostic_only", label: "Diagnostic only", required: true, detail: "Cannot become evidence or Paper-Demo." }],
    forbiddenPromotionReasons: ["market-map-only diagnostic cannot become evidence"],
    authority: STRATEGY_LIBRARY_AUTHORITY
  }
];

export const listStrategyDefinitions = (): StrategyDefinition[] => STRATEGY_DEFINITIONS.map((strategy) => ({ ...strategy }));

export const getStrategyDefinition = (strategyId?: string) =>
  strategyId ? STRATEGY_DEFINITIONS.find((strategy) => strategy.id === strategyId) : undefined;

export const listStrategyDefinitionsByFamily = (family: StrategyFamily) =>
  listStrategyDefinitions().filter((strategy) => strategy.family === family);

export const strategyStatusLabel = (status: StrategyStatus) => status.replace(/_/g, " ");

export const suggestStrategyIdForRecognition = (input: {
  candidateFamilies?: string[];
  family?: StrategyFamily;
  modelName?: string;
  setupName?: string;
  targetSubsystem?: string;
}) => {
  const text = [
    input.modelName,
    input.setupName,
    input.targetSubsystem,
    ...(input.candidateFamilies ?? [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (input.family === "silver_bullet" || /silver[_\s-]*bullet/.test(text)) {
    return "silver_bullet_v1";
  }
  if (input.family === "camerons_model" || /cameron/.test(text)) {
    return "camerons_model_research_v1";
  }
  if (input.family === "ifvg" || /\bifvg\b|inversion.*fvg|inversion fair value/.test(text)) {
    return "ifvg_research_v1";
  }
  if (input.family === "turtle_soup" || /turtle[_\s-]*soup/.test(text)) {
    return "turtle_soup_research_v1";
  }
  if (input.family === "crt" || /\bcrt\b|candle[_\s-]*range/.test(text)) {
    return "crt_research_v1";
  }
  if (input.family === "ote" || /\bote\b|optimal[_\s-]*trade/.test(text)) {
    return "ote_research_v1";
  }
  if (input.family === "cisd" || /\bcisd\b|change in state/.test(text)) {
    return "cisd_research_v1";
  }
  if (input.family === "amd" || /\bamd\b|power of three|accumulation.*manipulation.*distribution/.test(text)) {
    return "amd_power_of_three_research_v1";
  }
  if (input.family === "ict_cmd" || /cmd|consolidation[_\s-]*manipulation[_\s-]*distribution/.test(text)) {
    return "ict_cmd_short_paper_watchlist_v1";
  }
  if (/reversal[_\s-]*expansion|expansion[_\s-]*confirmation/.test(text)) {
    return "grinch_reversal_expansion_confirmation_v1";
  }
  if (/model[_\s-]*1|model one/.test(text)) return "grinch_model_1_research_v1";
  if (/grinch.*consolidation|consolidation_range_tightness/.test(text)) return "grinch_consolidation_research_v1";
  if (/pd[_\s-]*array/.test(text)) return "pd_array_setup_research_v1";
  if (/scalp/.test(text)) return "scalp_setup_research_v1";
  if (/market[_\s-]*map|diagnostic/.test(text)) return "market_map_only_diagnostic_v1";
  return undefined;
};
