import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { formatRelative } from "@/lib/format";

export type Connection = "connecting" | "live" | "reconnecting";

export function Stamp({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-GB")} suppressHydrationWarning>
      {formatRelative(iso, now)}
    </time>
  );
}

export function ConnBadge({ live, conn }: { live: boolean; conn: Connection }) {
  if (!live) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full bg-ink/30" />
        Final
      </span>
    );
  }
  const label = conn === "live" ? "Live" : conn === "reconnecting" ? "Reconnecting…" : "Connecting…";
  return (
    <span className="inline-flex items-center gap-1.5" role="status">
      <span aria-hidden className={cn("size-1.5 rounded-full", conn === "live" ? "animate-pulse bg-success" : "bg-warning")} />
      {label}
    </span>
  );
}

const BANNER_CLASS = {
  warning: ["border-warning bg-warning-soft", "text-warning"],
  danger: ["border-destructive bg-destructive/5", "text-destructive"],
  neutral: ["border-border bg-muted", "text-ink-muted"],
} as const;

export function Banner({ tone, icon: Icon, children, action }: { tone: keyof typeof BANNER_CLASS; icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  const [box, iconColor] = BANNER_CLASS[tone];
  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-3 border-l-[3px] px-3 py-2 text-sm text-ink", box)}>
      <Icon className={cn("size-4 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
