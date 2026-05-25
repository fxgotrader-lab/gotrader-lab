import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function safeArray<T>(value: readonly T[] | T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function safeSlice<T>(value: readonly T[] | T[] | null | undefined, start?: number, end?: number): T[] {
  return safeArray(value).slice(start, end);
}

export function safeTopN<T>(value: readonly T[] | T[] | null | undefined, count: number): T[] {
  return safeSlice(value, 0, count);
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export function biasToSignal(bias: "bullish" | "bearish" | "neutral"): -1 | 0 | 1 {
  if (bias === "bullish") {
    return 1;
  }
  if (bias === "bearish") {
    return -1;
  }
  return 0;
}

export function numericDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}
