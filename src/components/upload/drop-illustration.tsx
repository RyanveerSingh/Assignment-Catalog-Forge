"use client";

import { CheckIcon, LanguagesIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";

const CHIPS: ReadonlyArray<{ label: string; icon: LucideIcon; className: string; pos: string; delay: number }> = [
  { label: "Prices fixed", icon: CheckIcon, className: "bg-success-soft text-success", pos: "-top-1 left-2 md:-left-3", delay: 0 },
  { label: "Claims checked", icon: ShieldCheckIcon, className: "bg-brand-soft text-brand", pos: "top-[38%] -right-1 md:-right-6", delay: 1.3 },
  { label: "EN · DE · FR", icon: LanguagesIcon, className: "bg-ink text-paper", pos: "-bottom-2 left-[22%]", delay: 2.4 },
];

/**
 * The hero picture: a supplier sheet becoming a product card, with three chips floating around it.
 * The chips bob on a slow transform loop and a brand-colour dot travels the arrow; under reduced motion both
 * stand still. While a file is held over the zone the arrow leans forward and the card lifts.
 */
export function DropIllustration({ active, className }: { active: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const ink = "stroke-ink";
  const faint = "stroke-ink/35";
  const float = reduce ? undefined : { y: [0, -7, 0] };
  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 260 150" className="h-auto w-full overflow-visible" aria-hidden fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* the supplier sheet, with a wavy price and a crossed-out cell for the mess */}
        <g>
          <rect x="4" y="18" width="92" height="114" rx="10" className={cn(ink, "fill-card")} />
          <rect x="4" y="18" width="92" height="20" rx="10" className="fill-surface-2" stroke="none" />
          <path d="M4 38h92" className={faint} />
          <rect x="14" y="25" width="16" height="6" rx="3" className="fill-ink/70" stroke="none" />
          <rect x="36" y="25" width="22" height="6" rx="3" className="fill-ink/70" stroke="none" />
          <rect x="64" y="25" width="18" height="6" rx="3" className="fill-ink/70" stroke="none" />
          <path d="M14 52h26M50 52h30M14 66h20M50 66h18M14 80h30M14 94h22M50 94h30M14 108h28M14 122h18M50 122h24" className={faint} strokeWidth={2.2} />
          <path d="M50 80q3-4 6 0t6 0t6 0t6 0t6 0" className="stroke-warning" strokeWidth={1.8} />
          <path d="M52 105l7 7M59 105l-7 7" className="stroke-destructive" strokeWidth={1.8} />
        </g>
        {/* the arrow: one brand-colour line with a dot travelling along it */}
        <g className={cn("stroke-brand transition-transform duration-300 ease-out", active ? "translate-x-1.5" : "")} strokeWidth={2.2}>
          <path d="M108 75H150" />
          <path d="M142 67l8 8-8 8" />
        </g>
        {reduce ? null : (
          <motion.g initial={{ x: 0, opacity: 0 }} animate={{ x: [0, 38, 38], opacity: [0, 1, 0] }} transition={{ duration: active ? 0.9 : 2.2, repeat: Infinity, ease: "easeInOut", times: [0, 0.8, 1] }}>
            <circle r="3.2" cx="108" cy="75" className="fill-brand" />
          </motion.g>
        )}
        {/* the finished product card */}
        <g className={cn("transition-transform duration-300 ease-out", active ? "-translate-y-1.5" : "")}>
          <rect x="162" y="8" width="94" height="134" rx="12" className={cn(ink, "fill-card")} />
          <rect x="170" y="16" width="78" height="58" rx="8" className="fill-surface-2" stroke="none" />
          <path d="M176 66l16-18 11 11 8-8 17 15" className="stroke-brand" strokeWidth={2} />
          <circle cx="232" cy="31" r="5" className="fill-brand" stroke="none" />
          <rect x="170" y="84" width="54" height="6" rx="3" className="fill-ink" stroke="none" />
          <rect x="170" y="97" width="72" height="4" rx="2" className="fill-ink/25" stroke="none" />
          <rect x="170" y="106" width="60" height="4" rx="2" className="fill-ink/25" stroke="none" />
          <rect x="170" y="121" width="34" height="12" rx="6" className="fill-brand" stroke="none" />
          <text x="187" y="130" textAnchor="middle" className="fill-brand-foreground" style={{ font: "600 7px var(--font-inter), sans-serif" }}>
            €24.00
          </text>
          <circle cx="238" cy="127" r="8" className="fill-success-soft" stroke="none" />
          <path d="M234 127l3 3 5-6" className="stroke-success" strokeWidth={1.8} />
        </g>
      </svg>
      {CHIPS.map((c) => {
        const Icon = c.icon;
        return (
          <motion.span
            key={c.label}
            aria-hidden
            animate={float}
            transition={reduce ? undefined : { duration: 4.5, delay: c.delay, repeat: Infinity, ease: "easeInOut" }}
            className={cn("absolute inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap shadow-[var(--shadow-card)] ring-1 ring-black/5", c.className, c.pos)}
          >
            <Icon className="size-3" />
            {c.label}
          </motion.span>
        );
      })}
    </div>
  );
}
