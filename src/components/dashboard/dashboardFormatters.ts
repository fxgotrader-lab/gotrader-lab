export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not run";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
}

export function formatR(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}R`;
}

export function formatNumber(value?: number | null, digits = 2) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return value.toFixed(digits);
}
