import { cn } from "cn";
import { statusLabel } from "@/lib/format";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_BY_STATUS: Record<string, Tone> = {
  completed: "success",
  done: "success",
  approved: "success",
  draft: "info",
  needs_review: "warning",
  needs_attention: "warning",
  paused: "warning",
  failed: "danger",
  rejected: "danger",
  cancelled: "neutral",
  archived: "neutral",
  pending: "neutral",
  pending_ai: "brand",
  queued: "brand",
  parsing: "brand",
  cleaning: "brand",
  grouping: "brand",
  enriching: "brand",
  validating: "brand",
  translating: "brand",
  finalizing: "brand",
  processing: "brand",
  uploading: "brand",
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-ink-muted ring-border",
  brand: "bg-brand-soft text-brand ring-brand/25",
  success: "bg-success-soft text-success ring-success/25",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  info: "bg-info-soft text-info ring-info/25",
};

const ACTIVE = new Set(["queued", "parsing", "cleaning", "grouping", "enriching", "validating", "translating", "finalizing", "processing", "uploading", "pending_ai"]);

/** Status pill with a colour AND a label, never colour alone. Active statuses carry a pulsing dot. */
export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const tone = TONE_BY_STATUS[status] ?? "neutral";
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset", TONE_CLASS[tone], className)}>
      {ACTIVE.has(status) ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
      {label ?? statusLabel(status)}
    </span>
  );
}
