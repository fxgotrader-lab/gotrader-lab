import {
  backtestSessionFilters,
  backtestStopModels
} from "@/lib/backtesting";
import type { AutoResearchScoringCriteria } from "@/lib/autoResearch/autoResearchTypes";

export const autoResearchSearchModes = [
  "quick",
  "standard",
  "deep",
  "session_focus",
  "stop_model_focus",
  "long_short_focus",
  "conservative_only"
] as const;

export const autoResearchSearchModeDefaults = {
  quick: 5,
  standard: 10,
  deep: 25,
  session_focus: 10,
  stop_model_focus: 10,
  long_short_focus: 10,
  conservative_only: 5,
  conservative: 5,
  balanced: 10,
  aggressive_research_only: 10,
  session_focused: 10,
  stop_model_focused: 10,
  long_short_bias: 10
} as const;

export const safeAutoResearchSearchSpace = {
  confluenceThreshold: [0.25, 0.35, 0.45, 0.55, 0.65],
  confidenceThreshold: [0.35, 0.42, 0.5, 0.58, 0.68],
  sessionFilter: backtestSessionFilters,
  stopModel: backtestStopModels,
  targetRMultiple: [1.5, 2, 2.5, 3],
  allowLong: [true, false],
  allowShort: [true, false],
  agentWeightNudge: [-0.04, 0, 0.04],
  ictScoringWeightNudge: [-0.1, 0, 0.1],
  prohibited: [
    "broker settings",
    "execution permissions",
    "live mode",
    "demo mode activation",
    "contract size",
    "max daily loss",
    "API keys",
    "readiness gate bypass",
    "manual approval permissions"
  ]
};

export const defaultAutoResearchScoringCriteria: AutoResearchScoringCriteria = {
  stabilityFirst: true,
  weights: {
    lowerMaxDrawdown: 0.22,
    betterAverageR: 0.12,
    acceptableWinRate: 0.1,
    lowerFalsePositives: 0.14,
    confidenceCalibration: 0.14,
    sessionConsistency: 0.08,
    sufficientTradeCount: 0.1,
    skippedSignalBalance: 0.05,
    profitFactor: 0.05,
    robustnessAcrossScenarios: 0.1
  }
};

export const autoResearchSafetyNotes = [
  "Auto Research cannot execute trades.",
  "Auto Research cannot enable paper, demo, or live trading.",
  "Auto Research cannot change broker settings.",
  "Auto Research cannot override readiness gates.",
  "Auto Research cannot approve its own proposal.",
  "Auto Research cannot modify API keys or secrets.",
  "Every candidate and decision is logged locally.",
  "Active baseline changes require user approval in the Self-Improvement workflow."
];
