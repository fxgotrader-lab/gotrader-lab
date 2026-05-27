import { uid } from "@/lib/utils";

import {
  advisoryHookSafetyLocks
} from "@/lib/integrations/openclawMemoryHooks";
import type {
  HermesNotificationHookState,
  HermesNotificationPayload,
  HermesNotificationType
} from "@/lib/integrations/advisoryMemoryTypes";

export const hermesNotificationTypes: HermesNotificationType[] = [
  "autonomous_loop_started",
  "cycle_completed",
  "calibration_auto_applied",
  "auto_apply_blocked",
  "walk_forward_failed",
  "walk_forward_insufficient",
  "maturity_improved",
  "readiness_changed",
  "action_required"
];

export const hermesNotificationHookSpec = {
  status: "planned" as const,
  hermesNotifications: "not_connected" as const,
  mode: "notification_only" as const,
  events: hermesNotificationTypes,
  routeAuthority: "none" as const,
  authority: {
    executionAuthority: "none" as const,
    brokerAuthority: "none" as const,
    readinessOverrideAuthority: "none" as const
  },
  safetyLocks: advisoryHookSafetyLocks,
  sourceOfTruth: "gotrader_ai_lab"
};

export function createHermesNotificationPayload({
  eventType,
  routeToOpen = "/dashboard",
  severity = "info",
  summary,
  title
}: {
  eventType: HermesNotificationType;
  routeToOpen?: string;
  severity?: HermesNotificationPayload["severity"];
  summary: string;
  title: string;
}): HermesNotificationPayload {
  return {
    notificationId: uid("hermes_notification"),
    eventType,
    title,
    summary,
    severity,
    routeToOpen,
    timestamp: new Date().toISOString(),
    authority: {
      executionAuthority: "none",
      brokerAuthority: "none",
      readinessOverrideAuthority: "none"
    }
  };
}

export function createPlannedHermesNotificationState(): HermesNotificationHookState {
  return {
    status: "planned",
    hermesNotifications: "not_connected",
    latestPayload: createHermesNotificationPayload({
      eventType: "autonomous_loop_started",
      title: "Autonomous loop event planned",
      summary: "Hermes may later notify the user about research events, but GoTrader AI Lab remains the source of truth.",
      routeToOpen: "/autonomous-research"
    }),
    safetyLocks: advisoryHookSafetyLocks
  };
}
