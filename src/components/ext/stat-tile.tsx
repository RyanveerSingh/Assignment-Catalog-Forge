"use client";

import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "./count-up";
import { settle } from "./motion";
import { Sparkline } from "./sparkline";

export type StatTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const RULE: Record<StatTone, string> = {
  neutral: "bg-ink/25",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};

const ICON: Record<StatTone, string> = {
  neutral: "bg-paper-deep text-ink-muted",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info-soft text-info",
};

const CONTEXT: Record<NonNullable<StatTileProps["contextTone"]>, string> = {
  muted: "text-ink-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export interface StatTileProps {
  label: string;
  value: number;
  format: (n: number) => string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** One line under the number: a delta, a share or where the figure comes from. */
  context?: React.ReactNode;
  contextTone?: "muted" | "success" | "warning" | "danger";
  /** Daily values, oldest first. Space is reserved whenever this is given, even when it is all zeros. */
  sparkline?: ReadonlyArray<number>;
  sparklineLabel?: string;
  /** Position in the row, for the stagger of the rule and the sparkline reveal. */
  index?: number;
  className?: string;
}

/**
 * The dashboard's figure tile: label and icon, a big tabular number that rolls to new values, a
 * one-line context and an optional sparkline. The number and text are plain server HTML (the real
 * value is in the first paint); only the coloured rule and the sparkline cover move, both transforms.
 */
export function StatTile({ label, value, format, icon: Icon, tone = "neutral", context, contextTone = "muted", sparkline, sparklineLabel, index = 0, className }: StatTileProps) {
  const reduce = useReducedMotion();
  const delay = Math.min(index, 8) * 0.07;
  return (
    <div className={cn("relative flex flex-col gap-2.5 overflow-hidden bg-card px-4 pt-4 pb-3.5 hairline", className)}>
      <motion.span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5 origin-left", RULE[tone])} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={settle(reduce, 0.6, delay)} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
        {Icon ? (
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-sm", ICON[tone])}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <CountUp value={value} format={format} className="font-display text-[2rem] leading-none text-ink tabular" />
      <div className={cn("line-clamp-2 min-h-4 text-xs leading-4", CONTEXT[contextTone])}>{context}</div>
      {sparkline ? <Sparkline values={sparkline} label={sparklineLabel ?? `${label}, last ${sparkline.length} days`} delay={delay + 0.15} /> : null}
    </div>
  );
}
