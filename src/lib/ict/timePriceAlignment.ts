import type { GrinchTimePriceAlignment, GrinchTimingGrade } from "@/lib/strategyLibrary/grinchStrategyTypes";
import { clockMinutesFor } from "@/lib/ict/openingPriceEquilibrium";
import type { SessionTimeMapping } from "@/lib/sessions";

const isBetween = (value: number, start: number, end: number) => value >= start && value <= end;
const minutes = (hour: number, minute = 0) => hour * 60 + minute;

export function classifyTimePriceAlignment(timestamp?: string, sessionTimeMapping?: SessionTimeMapping): GrinchTimePriceAlignment {
  const clockMinutes = timestamp ? clockMinutesFor(timestamp, sessionTimeMapping) : undefined;
  const timingZoneDetail = sessionTimeMapping?.timingZone && sessionTimeMapping.timingZone !== "literal_timestamp"
    ? ` (${sessionTimeMapping.timingZone} timing)`
    : "";
  if (typeof clockMinutes !== "number") {
    return {
      timingGrade: "expired",
      currentWindow: "unknown",
      isLondonObservationWindow: false,
      isNySetupWindow: false,
      isNyConfirmationWindow: false,
      reason: `Timestamp is missing or does not include a parseable clock time${timingZoneDetail}.`
    };
  }

  if (isBetween(clockMinutes, minutes(2), minutes(3))) {
    return {
      timingGrade: "acceptable",
      currentWindow: "london_observation",
      isLondonObservationWindow: true,
      isNySetupWindow: false,
      isNyConfirmationWindow: false,
      reason: `London is trading in the 2:00-3:00 observation window around 12AM Open${timingZoneDetail}.`
    };
  }

  if (isBetween(clockMinutes, minutes(9, 30), minutes(9, 34))) {
    return {
      timingGrade: "ideal",
      currentWindow: "ny_setup",
      isLondonObservationWindow: false,
      isNySetupWindow: true,
      isNyConfirmationWindow: false,
      reason: `NY first-five timing is active${timingZoneDetail}; transcript treats it as ideal mainly when a target has already been met and reversal evidence is immediate.`
    };
  }

  if (isBetween(clockMinutes, minutes(9, 35), minutes(9, 59))) {
    return {
      timingGrade: "acceptable",
      currentWindow: "ny_setup",
      isLondonObservationWindow: false,
      isNySetupWindow: true,
      isNyConfirmationWindow: false,
      reason:
        `NY 9:35-10:00 is retracement and observation time${timingZoneDetail}; transcript warns to wait for 10:00 confirmation unless exceptional reversal evidence exists.`
    };
  }

  if (isBetween(clockMinutes, minutes(10), minutes(10, 15))) {
    return {
      timingGrade: "acceptable",
      currentWindow: "ny_confirmation",
      isLondonObservationWindow: false,
      isNySetupWindow: false,
      isNyConfirmationWindow: true,
      reason: `NY 10:00-10:15 confirmation/continuation window is active${timingZoneDetail}.`
    };
  }

  if (isBetween(clockMinutes, minutes(10, 15), minutes(10, 30))) {
    return {
      timingGrade: "late",
      currentWindow: "delayed_profile",
      isLondonObservationWindow: false,
      isNySetupWindow: false,
      isNyConfirmationWindow: false,
      reason: `Delayed profile window is active${timingZoneDetail}; probability is lower and confirmation must be exceptional.`
    };
  }

  const timingGrade: GrinchTimingGrade = clockMinutes < minutes(9, 30) ? "early" : "expired";
  return {
    timingGrade,
    currentWindow: "outside_model_window",
    isLondonObservationWindow: false,
    isNySetupWindow: false,
    isNyConfirmationWindow: false,
    reason:
      timingGrade === "early"
        ? `NY setup window has not opened yet${timingZoneDetail}; Model 1 is incomplete.`
        : `Primary Model 1 timing has expired${timingZoneDetail} unless a later phase supplies exceptional confirmation.`
  };
}
