"use client";

import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "./count-up";
import { settle, stagger } from "./motion";
import { Sparkline } from "./sparkline";
import { CARD } from "./surfaces";

type StatTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const ICON: Record<StatTone, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-brand-soft text-brand",
};

const CONTEXT: Record<NonNullable<StatTileProps["contextTone"]>, string> = {
  muted: "text-ink-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

interface StatTileProps {
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
  /** Position in the row, for the entrance stagger. */
  index?: number;
}

/**
 * The dashboard's figure tile: a raised card with the label and an icon chip, a big Lexend number
 * that rolls to new values, a one-line context and an optional sparkline in the brand colour. The number and text
 * are plain server HTML (the real value is in the first paint); only opacity and transforms move.
 */
export function StatTile({ label, value, format, icon: Icon, tone = "neutral", context, contextTone = "muted", sparkline, sparklineLabel, index = 0 }: StatTileProps) {
  const reduce = useReducedMotion();
  const delay = stagger(index, 0.06);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.45, delay)} className={cn(CARD, "flex flex-col gap-3 px-5 pt-4 pb-4")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-muted">{label}</span>
        {Icon ? (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", ICON[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <CountUp value={value} format={format} className="font-display text-[2rem] leading-none text-ink tabular" />
      <div className={cn("line-clamp-2 min-h-4 text-xs leading-4", CONTEXT[contextTone])}>{context}</div>
      {sparkline ? <Sparkline values={sparkline} label={sparklineLabel ?? `${label}, last ${sparkline.length} days`} delay={delay + 0.15} /> : null}
    </motion.div>
  );
}
