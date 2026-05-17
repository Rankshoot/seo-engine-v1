/**
 * Display formatters used across keyword tables, audit cards, and overview
 * widgets. All pure / no external deps.
 */

const COMPACT_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const FULL_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const PERCENT_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** 12,400 → "12.4K". Nullish + NaN → "—". */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return COMPACT_FORMATTER.format(value);
}

/** 12400 → "12,400". Nullish → "—". */
export function formatFullNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return FULL_NUMBER_FORMATTER.format(value);
}

/** 0.124 → "12.4%". `value` is a fraction in [0, 1]. */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return PERCENT_FORMATTER.format(value);
}

/** Standard short date — "May 16, 2026". */
export function formatShortDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "3 hours ago", "2 days ago", "just now". */
export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const yr = Math.round(mo / 12);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
}

/** Display a domain stripped of protocol/trailing slash for compact UI. */
export function formatDomain(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

/** Truncate to N chars, appending an ellipsis if cut. */
export function truncate(value: string, max: number): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return value.slice(0, Math.max(0, max - 1)) + "…";
}
