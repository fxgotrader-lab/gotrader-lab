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
      "Rejected/research-only baseline Silver Bullet detector for comparison. The 90-day audit showed weak target-first behavior and OOS degradation, so v1 cannot be promoted.",
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
      "90-day audit rejected v1",
      "OOS degraded",
      "target-first rate too low",
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
  {
    id: "silver_bullet_v2_refined_research",
    name: "ICT Silver Bullet v2 Refined Research",
    family: "silver_bullet",
    status: "replay_required",
    detectorStatus: "executable_research",
    description:
      "Refined research-only Silver Bullet detector with stricter sweep quality, displacement/FVG timing, return timing, context alignment, realistic target, and RR caps. No promotion without replay/OOS evidence.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["1m"],
    higherTimeframes: ["5m", "15m"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "silver_bullet_killzone",
        label: "Silver Bullet killzone",
        description: "Candidate must form inside 03:00-04:00, 10:00-11:00, or 14:00-15:00 New York.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "meaningful_liquidity_sweep",
        label: "Meaningful liquidity sweep",
        description: "Sweep must take a meaningful prior swing/equal high-low inside the first half of the window.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "timely_displacement_fvg",
        label: "Timely displacement FVG",
        description: "Directional 1m FVG must form within five candles and have meaningful displacement/body size.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "timely_return_to_fvg",
        label: "Timely return to FVG",
        description: "Return must happen within ten candles and cannot fully violate the FVG first.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "context_alignment",
        label: "5m/15m context alignment",
        description: "Available 5m/15m context should align with candidate direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "realistic_target_rr",
        label: "Realistic target/RR",
        description: "Stop cannot be unrealistically tiny; target must be nearest logical liquidity and RR must be 2R-15R.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Long invalidation below swept sell-side wick/FVG boundary.",
      "Short invalidation above swept buy-side wick/FVG boundary.",
      "Unrealistically tiny stop distance blocks the candidate."
    ],
    targetRules: [
      "Target nearest logical liquidity pool, not a far historical extreme.",
      "Diagnostic scoring caps RR at realistic research range; excessive RR blocks v2."
    ],
    minimumRR: 2,
    sessionRules: [
      "Use America/New_York timing for Silver Bullet windows.",
      "Sweep must occur early enough to leave time for delivery."
    ],
    regimeRules: [
      "Chop/range without directional displacement blocks v2.",
      "High-impact news within 30 minutes blocks candidate creation when known.",
      "Unknown VWAP/news state is warning-only, not fabricated."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "silver_bullet_v2_replay_oos",
        label: "Silver Bullet v2 replay/OOS",
        required: true,
        detail: "V2 can only progress after 90-day replay, walk-forward/OOS, evidence, maturity, readiness checklist, and committee review."
      }
    ],
    forbiddenPromotionReasons: [
      "weak sweep",
      "late FVG",
      "weak displacement",
      "late return",
      "bad FVG violation",
      "unrealistic RR",
      "no context alignment",
      "mock/sample source",
      "high-impact news",
      "missing replay/OOS"
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
  {
    id: "ifvg_v1",
    name: "Inversion FVG v1",
    family: "ifvg",
    status: "replay_required",
    detectorStatus: "executable_research",
    description:
      "Executable research detector for Inversion Fair Value Gap. It requires a fully inverted FVG, unused inversion zone, retest/respect, HTF context review, liquidity target, and minimum 2R before replay validation.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h", "1d"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "fair_value_gap",
        label: "Fair value gap",
        description: "Original bullish or bearish FVG must be identified deterministically.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "full_inversion",
        label: "Full inversion",
        description: "Price must fully trade through the original FVG boundary.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "unused_ifvg_zone",
        label: "Unused IFVG zone",
        description: "The gap cannot already be used before inversion.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "ifvg_retest",
        label: "IFVG retest",
        description: "Price must return to the inverted FVG and respect it as support/resistance.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "htf_context_reviewed",
        label: "HTF context reviewed",
        description: "Available HTF context must not hard-conflict with IFVG direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "liquidity_target",
        label: "Liquidity target",
        description: "Target must be the next draw on liquidity in the IFVG direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "minimum_2r",
        label: "Minimum 2R",
        description: "Target, invalidation, and entry must produce at least 2R.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Long invalidation below the inverted FVG bottom.",
      "Short invalidation above the inverted FVG top.",
      "A reused IFVG zone blocks the candidate."
    ],
    targetRules: [
      "Long target is next buy-side liquidity above the IFVG midpoint.",
      "Short target is next sell-side liquidity below the IFVG midpoint.",
      "Minimum reward/risk is 2R before validation can be queued."
    ],
    minimumRR: 2,
    sessionRules: [
      "Primary use is RTH, with strongest review during London open and New York open.",
      "Use America/New_York timing for session classification."
    ],
    regimeRules: [
      "Low-volume/Globex/holiday context blocks or warns depending available source metadata.",
      "HTF conflict blocks v1; missing HTF context is warning-only and remains replay-required."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "ifvg_replay_oos",
        label: "IFVG replay/OOS",
        required: true,
        detail: "IFVG can only progress after 90-day replay, walk-forward/OOS, evidence, maturity, readiness checklist, and committee review."
      }
    ],
    forbiddenPromotionReasons: [
      "FVG not inverted",
      "reused IFVG",
      "no retest",
      "against HTF context",
      "low volume",
      "RR below 2",
      "mock/sample source",
      "missing replay/OOS"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "ifvg_filtered_v2_research",
    name: "IFVG Filtered v2 Research",
    family: "ifvg",
    status: "paper_watchlist_candidate",
    detectorStatus: "executable_research",
    description:
      "Research-only filtered IFVG profile discovered from the 90-day variant audit. It requires clean retest plus displacement confirmation and remains paper-watchlist only until replay, walk-forward, evidence, maturity, and Paper-Demo checklist gates pass.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h", "1d"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "fair_value_gap",
        label: "Fair value gap",
        description: "Original bullish or bearish FVG must be identified deterministically.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "full_inversion",
        label: "Full inversion",
        description: "Price must fully trade through the original FVG boundary.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "unused_ifvg_zone",
        label: "Unused IFVG zone",
        description: "The IFVG zone cannot already be used before inversion.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "clean_retest",
        label: "Clean retest",
        description: "Retest must respect the inverted gap without fully violating the opposite boundary.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "displacement_confirmation",
        label: "Displacement confirmation",
        description: "Inversion candle body and post-inversion delivery must confirm direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "liquidity_target",
        label: "Liquidity target",
        description: "Target must be the next draw on liquidity in the IFVG direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "minimum_2r",
        label: "Minimum 2R",
        description: "Target, invalidation, and entry must produce at least 2R after compact validation.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Long invalidation below the inverted FVG bottom or clean-retest violation level.",
      "Short invalidation above the inverted FVG top or clean-retest violation level.",
      "A reused IFVG zone blocks the candidate."
    ],
    targetRules: [
      "Long target is next buy-side liquidity above the IFVG midpoint.",
      "Short target is next sell-side liquidity below the IFVG midpoint.",
      "Minimum reward/risk is 2R and cost sensitivity must remain positive before paper-watchlist review."
    ],
    minimumRR: 2,
    sessionRules: [
      "Use America/New_York timing for session classification.",
      "Clean retest plus displacement can appear in London or New York contexts; session result must remain compactly reported."
    ],
    regimeRules: [
      "HTF conflict remains a blocker unless replay explicitly marks the setup as a lower-timeframe research case.",
      "Mock/sample data cannot create evidence or Paper-Demo eligibility."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "ifvg_filtered_v2_replay_oos",
        label: "IFVG filtered v2 replay/OOS",
        required: true,
        detail: "The filtered v2 profile can only progress after replay, walk-forward/OOS, evidence, maturity, readiness checklist, and committee review."
      },
      {
        id: "paper_demo_checklist",
        label: "Paper-Demo checklist",
        required: true,
        detail: "Paper-Demo is not automatic; the normal checklist must pass independently."
      }
    ],
    forbiddenPromotionReasons: [
      "missing clean retest",
      "missing displacement confirmation",
      "reused IFVG",
      "against HTF context",
      "RR below 2",
      "negative cost sensitivity",
      "mock/sample source",
      "missing replay/OOS",
      "Paper-Demo checklist incomplete"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
  {
    id: "turtle_soup_v1",
    name: "Turtle Soup v1",
    family: "turtle_soup",
    status: "replay_required",
    detectorStatus: "executable_research",
    description:
      "Executable research detector for Turtle Soup false-breakout reversal. It uses 15m/1h setup range, 5m sweep/rejection/MSS/retest, and minimum 2.5R before replay validation.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["5m"],
    higherTimeframes: ["15m", "1h"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "setup_range",
        label: "15m/1h setup range",
        description: "A clear setup range must exist; trending/middle-of-range conditions block.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "range_liquidity_sweep",
        label: "Range liquidity sweep",
        description: "Sweep highs for short or sweep lows for long.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "immediate_rejection",
        label: "Immediate rejection",
        description: "Price must reject the sweep within one to three 5m candles.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "market_structure_shift",
        label: "5m MSS",
        description: "5m market structure shift must confirm reversal direction.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "target_invalidation_rr",
        label: "Target/invalidation/RR",
        description: "Stop beyond sweep wick, target opposing liquidity/range side, minimum 2.5R.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Short invalidation beyond swept high wick.",
      "Long invalidation beyond swept low wick.",
      "Stale sweep beyond ten 5m candles blocks candidate."
    ],
    targetRules: [
      "Short target is opposing range low or sell-side liquidity.",
      "Long target is opposing range high or buy-side liquidity.",
      "Minimum reward/risk is 2.5R before validation can be queued."
    ],
    minimumRR: 2.5,
    sessionRules: [
      "Best sessions: London Open and New York Open.",
      "Use America/New_York timing."
    ],
    regimeRules: [
      "Trending market with no range blocks Turtle Soup.",
      "Middle-of-range candidates block.",
      "High-impact news within 15 minutes blocks when known."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "turtle_soup_replay_oos",
        label: "Turtle Soup replay/OOS",
        required: true,
        detail: "Turtle Soup requires 90-day replay, walk-forward/OOS, evidence, maturity, readiness checklist, and committee review."
      }
    ],
    forbiddenPromotionReasons: [
      "stale sweep",
      "no rejection",
      "no MSS",
      "middle of range",
      "RR below 2.5",
      "mock/sample source",
      "high-impact news",
      "missing replay/OOS"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
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
  {
    id: "cisd_v1",
    name: "CISD v1",
    family: "cisd",
    status: "replay_required",
    detectorStatus: "executable_research",
    description:
      "Executable research detector for Change in State of Delivery. It requires clear prior delivery, an opposite body close beyond a significant prior body, body-zone retest, structural stop, liquidity target, and minimum 2R before replay validation.",
    side: "both",
    supportedSymbols: ["MNQ", "NQ", "USTECH", "US30", "YM", "US500", "ES", "XAUUSD", "EURUSD.pro", "BTCUSD"],
    primaryTimeframes: ["5m", "15m"],
    higherTimeframes: ["15m", "1h", "4h", "1d"],
    sourceRequirements: mt5ResearchSource,
    requiredConditions: [
      {
        id: "prior_delivery",
        label: "Prior delivery",
        description: "Price must be delivering clearly in one direction before the shift.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "opposite_body_close",
        label: "Opposite body close",
        description: "Bullish CISD closes beyond a bearish delivery body; bearish CISD closes beyond a bullish delivery body.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "strong_cisd_candle",
        label: "Strong CISD candle",
        description: "The delivery-shift candle must not be doji/minimal body.",
        requiredFor: ["intake", "replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "body_retest_entry",
        label: "Body-zone retest",
        description: "Entry is the retest of the CISD candle open-to-close body zone.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "opposing_liquidity_target",
        label: "Opposing liquidity target",
        description: "Target must be the next opposing liquidity pool in the new delivery direction.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      },
      {
        id: "target_invalidation_rr",
        label: "Target/invalidation/RR",
        description: "Stop beyond full CISD candle including wick and minimum 2R are required before replay validation.",
        requiredFor: ["replay", "paper_watchlist", "paper_demo"]
      }
    ],
    invalidationRules: [
      "Long invalidation below the full bullish CISD candle wick.",
      "Short invalidation above the full bearish CISD candle wick.",
      "Multiple opposite CISD signals in chop block the candidate."
    ],
    targetRules: [
      "Long target is the next buy-side liquidity pool above the body retest entry.",
      "Short target is the next sell-side liquidity pool below the body retest entry.",
      "Minimum reward/risk is 2R before validation can be queued."
    ],
    minimumRR: 2,
    sessionRules: [
      "Primary use is RTH, with highest probability near the RTH open.",
      "Use America/New_York session timing for classification."
    ],
    regimeRules: [
      "Clear delivery must precede the state change.",
      "Chop and repeated opposite shifts block candidate creation.",
      "High-impact news within 30 minutes blocks when known."
    ],
    validationRequirements: compactValidation,
    paperDemoRequirements: [
      {
        id: "cisd_replay_oos",
        label: "CISD replay/OOS",
        required: true,
        detail: "CISD can only progress after replay, OOS/walk-forward, evidence, maturity, readiness checklist, and committee review."
      }
    ],
    forbiddenPromotionReasons: [
      "no prior delivery",
      "weak CISD candle",
      "chop",
      "no body-zone retest",
      "RR below 2",
      "mock/sample source",
      "high-impact news",
      "missing replay/OOS"
    ],
    authority: STRATEGY_LIBRARY_AUTHORITY
  },
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
  if (/silver[_\s-]*bullet.*v2|v2.*silver[_\s-]*bullet|refined.*silver[_\s-]*bullet|silver_bullet_v2/.test(text)) {
    return "silver_bullet_v2_refined_research";
  }
  if (input.family === "silver_bullet" || /silver[_\s-]*bullet/.test(text)) {
    return "silver_bullet_v1";
  }
  if (input.family === "camerons_model" || /cameron/.test(text)) {
    return "camerons_model_research_v1";
  }
  if (/ifvg[_\s-]*filtered[_\s-]*v2|filtered.*ifvg|ifvg.*v2|clean.*retest.*displacement|clean_retest_displacement/.test(text)) {
    return "ifvg_filtered_v2_research";
  }
  if (input.family === "ifvg" || /\bifvg\b|inversion.*fvg|inversion fair value/.test(text)) {
    return "ifvg_v1";
  }
  if (input.family === "turtle_soup" || /turtle[_\s-]*soup/.test(text)) {
    return "turtle_soup_v1";
  }
  if (input.family === "crt" || /\bcrt\b|candle[_\s-]*range/.test(text)) {
    return "crt_research_v1";
  }
  if (input.family === "ote" || /\bote\b|optimal[_\s-]*trade/.test(text)) {
    return "ote_research_v1";
  }
  if (input.family === "cisd" || /\bcisd\b|change in state/.test(text)) {
    return "cisd_v1";
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
