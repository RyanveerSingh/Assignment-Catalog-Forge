import { ActivityIcon, ArchiveIcon, BanIcon, CheckIcon, ClockIcon, EyeIcon, type LucideIcon, PauseIcon, PenLineIcon, SparklesIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { statusLabel } from "@/lib/format";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_BY_STATUS: Record<string, Tone> = {
  completed: "success",
  done: "success",
  approved: "success",
  fresh: "success",
  draft: "info",
  needs_review: "warning",
  needs_attention: "warning",
  paused: "warning",
  outdated: "warning",
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
  neutral: "bg-surface-2 text-ink-muted ring-border",
  brand: "bg-brand-soft text-brand ring-brand/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  info: "bg-brand-soft/60 text-brand ring-brand/15",
};

const ACTIVE = new Set(["queued", "parsing", "cleaning", "grouping", "enriching", "validating", "translating", "finalizing", "processing", "uploading", "pending_ai"]);

/** One glyph per state so the pills read at a glance even before the label; running states share the activity mark. */
const ICON_BY_STATUS: Record<string, LucideIcon> = {
  completed: CheckIcon,
  done: CheckIcon,
  approved: CheckIcon,
  fresh: CheckIcon,
  draft: PenLineIcon,
  needs_review: EyeIcon,
  needs_attention: TriangleAlertIcon,
  paused: PauseIcon,
  failed: XIcon,
  rejected: BanIcon,
  cancelled: BanIcon,
  archived: ArchiveIcon,
  pending: ClockIcon,
  outdated: ClockIcon,
  queued: ClockIcon,
  pending_ai: SparklesIcon,
  enriching: SparklesIcon,
  validating: SparklesIcon,
  translating: SparklesIcon,
};

/** Status pill with a dot, an icon AND a label, never colour alone. Active statuses pulse their dot. */
export function StatusBadge({ status, className, label, size = "sm" }: { status: string; className?: string; label?: string; size?: "sm" | "md" }) {
  const tone = TONE_BY_STATUS[status] ?? "neutral";
  const active = ACTIVE.has(status);
  const Icon = ICON_BY_STATUS[status] ?? (active ? ActivityIcon : null);
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset", size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs", TONE_CLASS[tone], className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-current", active && "animate-pulse")} />
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {label ?? statusLabel(status)}
    </span>
  );
}
