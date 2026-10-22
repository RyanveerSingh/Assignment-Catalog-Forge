/** Display helpers shared by server and client components. No locale guessing: callers pass one. */

export function formatCents(cents: number | null | undefined, currency: string | null | undefined, locale = "en-GB"): string {
  if (cents === null || cents === undefined) return "—";
  const cur = currency ?? "EUR";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

export function formatMicrosUsd(micros: number | null | undefined, digits = 2): string {
  if (micros === null || micros === undefined) return "$0.00";
  const usd = micros / 1_000_000;
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(digits)}`;
}

export function formatNumber(n: number | null | undefined, locale = "en-GB"): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(locale).format(n);
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Math.round((now - t) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff} s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatCountdown(untilIso: string | null | undefined, now = Date.now()): string | null {
  if (!untilIso) return null;
  const ms = new Date(untilIso).getTime() - now;
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.ceil(s / 60)} min`;
}

export const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading",
  queued: "Queued",
  parsing: "Parsing",
  cleaning: "Cleaning",
  grouping: "Grouping",
  enriching: "Writing with AI",
  validating: "Validating",
  translating: "Translating",
  finalizing: "Finalizing",
  completed: "Completed",
  needs_attention: "Needs attention",
  paused: "Paused",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Pending",
  processing: "Processing",
  done: "Done",
  needs_review: "Needs review",
  pending_ai: "Awaiting AI",
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
