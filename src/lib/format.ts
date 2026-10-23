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

/** Prose-friendly dollars ("$0.002", "$1.40"); the exact figure stays in the tables. */
export function formatMicrosUsdApprox(micros: number | null | undefined): string {
  if (!micros || micros <= 0) return "$0.00";
  const usd = micros / 1_000_000;
  if (usd < 0.001) return "under $0.001";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
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
  pending_ai: "Being written",
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

export function statusLabel(status: string): string {
  const known = STATUS_LABELS[status];
  if (known) return known;
  const words = status.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5-5": "Opus 5.5",
  "mock-cheap": "Demo writer",
  "mock-strong": "Demo writer",
};

/** "claude-haiku-5-5" → "Haiku 5.5"; the raw id belongs in a title attribute next to it. Unknown ids pass through. */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return "—";
  const known = MODEL_LABELS[model];
  if (known) return known;
  const m = /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)/.exec(model);
  if (m) {
    const [, family = "", major = "", minor = ""] = m;
    return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`;
  }
  if (model.startsWith("mock-")) return "Demo writer";
  return model;
}

const TIER_LABELS: Record<string, string> = {
  cheap: "Cheap model",
  strong: "Strong model",
  vision: "Vision model",
  escalation: "Escalated",
};

export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "—";
  return TIER_LABELS[tier] ?? statusLabel(tier);
}

const MODE_LABELS: Record<string, { label: string; detail: string }> = {
  fast: { label: "Fast mode", detail: "Realtime API: results in minutes" },
  economy: { label: "Economy mode", detail: "Batch API: about half the price, can take hours" },
};

export function modeLabel(mode: string): { label: string; detail: string } {
  return MODE_LABELS[mode] ?? { label: statusLabel(mode), detail: mode };
}
