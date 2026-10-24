"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { spring } from "./motion";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  icon?: LucideIcon;
}

/**
 * A segmented pill control. The selected background is one white tile that slides between options
 * (a shared `layoutId`), so the change reads as the same thing moving rather than two things blinking.
 * Options are 40 px tall for a comfortable tap; `aria-pressed` carries the state for assistive tech.
 */
export function Segmented<T extends string>({ value, options, onChange, disabled = false, label }: { value: T; options: ReadonlyArray<SegmentOption<T>>; onChange: (next: T) => void; disabled?: boolean; label: string }) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full rounded-full bg-surface-2 p-1", disabled && "opacity-60")}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed",
              active ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {active ? (
              reduce ? (
                <span aria-hidden className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" />
              ) : (
                <motion.span aria-hidden layoutId={`${id}-tile`} transition={spring(reduce)} className="absolute inset-0 rounded-full bg-card shadow-[var(--shadow-card)]" />
              )
            ) : null}
            {Icon ? <Icon className="relative size-3.5" aria-hidden /> : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
