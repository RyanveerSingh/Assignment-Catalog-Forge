import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

export type ChipTone = "neutral" | "brand" | "success" | "warning" | "danger" | "ink";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  ink: "bg-ink text-paper",
};

/** A small rounded label: a mode, a model, a format. `dot` adds the status mark; `icon` a glyph before the text. */
export function Chip({ tone = "neutral", icon: Icon, dot = false, pulse = false, className, children, title }: { tone?: ChipTone; icon?: LucideIcon; dot?: boolean; pulse?: boolean; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold tracking-[0.02em] whitespace-nowrap", TONE[tone], className)}>
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-current", pulse && "animate-pulse")} /> : null}
      {Icon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
