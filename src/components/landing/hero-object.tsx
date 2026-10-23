"use client";

import type { LucideIcon } from "lucide-react";
import { CoinsIcon, FileSpreadsheetIcon, LanguagesIcon, ShieldCheckIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { EASE_OUT } from "@/components/ext/motion";
import { Float } from "./float";
import { LANGS, ProductCard, RawSheet, useLangCycle, type Lang } from "./hero-transform";

/* The wide layout is drawn on a fixed 960 × 540 stage so chips, card and connector lines agree to the pixel. */
const STAGE = { w: 960, h: 540 } as const;
const CARD = { x: 330, y: 20, w: 300 } as const;

interface Chip {
  key: string;
  icon: LucideIcon;
  tone?: "success";
  /** Stage position of the chip's top-left corner. */
  x: number;
  y: number;
  /** Where its connector starts (on the chip) and ends (on the card edge). */
  from: [number, number];
  to: [number, number];
  period: number;
  invert?: boolean;
}

const CHIPS: readonly Chip[] = [
  { key: "row", icon: FileSpreadsheetIcon, x: 28, y: 64, from: [246, 93], to: [CARD.x, 150], period: 4.8 },
  { key: "price", icon: CoinsIcon, x: 60, y: 404, from: [258, 433], to: [CARD.x, 385], period: 5.6, invert: true },
  { key: "claims", icon: ShieldCheckIcon, tone: "success", x: 702, y: 104, from: [702, 133], to: [CARD.x + CARD.w, 185], period: 5.2, invert: true },
  { key: "langs", icon: LanguagesIcon, x: 690, y: 386, from: [690, 415], to: [CARD.x + CARD.w, 365], period: 6 },
];

function ChipBody({ chip, lang }: { chip: Chip; lang: Lang }): ReactNode {
  switch (chip.key) {
    case "row":
      return <Text title="Row 8 · new-12.csv" sub="Steinzeug-Vase · salbeigrün" />;
    case "price":
      return <Text title={<span className="num">24,00 → €24.00</span>} sub="2400 cents · EUR from the row" />;
    case "claims":
      return <Text title="5 claims verified" sub="each one quotes its cell" />;
    default:
      return (
        <Text
          title={
            <span className="flex gap-1" aria-label={`Listing languages, showing ${lang.toUpperCase()}`}>
              {LANGS.map((l) => (
                <span key={l.code} className={cn("num rounded-md px-1.5 py-0.5 text-[11px] transition-colors duration-300", l.code === lang ? "bg-brand text-brand-foreground" : "bg-paper text-ink-muted")}>
                  {l.label}
                </span>
              ))}
            </span>
          }
          sub="written, then translated"
        />
      );
  }
}

function Text({ title, sub }: { title: ReactNode; sub: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[13px] leading-tight font-medium text-ink">{title}</span>
      <span className="text-[11px] leading-tight text-ink-muted">{sub}</span>
    </span>
  );
}

/**
 * The hero object: the published vase card in the middle, the supplier's row tilted behind it, four
 * status chips tethered to the card by thin lines, all over soft concentric circles and a still orange glow
 * that does not follow the scroll, so scrolling past it costs nothing. Below `lg` the chips line up under the card instead.
 */
export function HeroObject() {
  const reduce = useReducedMotion();
  const { lang, choose, pause } = useLangCycle(reduce);
  const enter = (delay: number) => (reduce ? { duration: 0 } : { duration: 0.7, delay, ease: EASE_OUT });

  return (
    <div className="relative mt-10 md:mt-12" onMouseEnter={() => pause(true)} onMouseLeave={() => pause(false)} onFocus={() => pause(true)} onBlur={() => pause(false)}>
      <div className="relative mx-auto w-full max-w-[960px] px-4 pt-2 pb-4 lg:h-[540px] lg:px-0 lg:pt-0 lg:pb-0" style={{ "--card-x": `${CARD.x}px`, "--card-y": `${CARD.y}px` } as CSSProperties}>
        {/* Glow and circles, centred on the card. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[420px] h-[620px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full lg:top-[258px]" style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--brand) 16%, transparent), color-mix(in oklab, var(--brand) 4%, transparent) 55%, transparent 75%)" }} />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[420px] -translate-x-1/2 -translate-y-1/2 lg:top-[258px]">
          {[380, 580, 780].map((d, i) => (
            <motion.span
              key={d}
              className="absolute left-1/2 top-1/2 block rounded-full border border-brand/15"
              style={{ width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2 }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 - i * 0.28 }}
              transition={reduce ? { duration: 0 } : { duration: 1.1, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
            />
          ))}
        </div>

        {/* The supplier's row: tilted behind the card on wide screens, stacked just above it (and fully readable) otherwise. */}
        <motion.div className="relative z-[1] mx-auto w-full max-w-[320px] lg:absolute lg:left-[120px] lg:top-[70px] lg:mx-0 lg:w-[330px] lg:max-w-none" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={enter(0.5)}>
          <div className="-rotate-2 lg:-rotate-7">
            <RawSheet />
          </div>
        </motion.div>

        {/* The published listing. */}
        <motion.div className="relative z-[2] mx-auto -mt-6 w-full max-w-[300px] lg:absolute lg:left-(--card-x) lg:top-(--card-y) lg:mx-0 lg:mt-0 lg:w-[300px]" initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={enter(0.35)}>
          <ProductCard lang={lang} onLang={choose} />
        </motion.div>

        {/* Connector lines, wide screens only. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-[1] hidden h-full w-full lg:block" viewBox={`0 0 ${STAGE.w} ${STAGE.h}`} fill="none">
          {CHIPS.map((c, i) => (
            <g key={c.key}>
              <motion.path d={`M ${c.from[0]} ${c.from[1]} L ${c.to[0]} ${c.to[1]}`} stroke="var(--brand)" strokeOpacity={0.45} strokeWidth={1.25} strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 1 + i * 0.1, ease: EASE_OUT }} />
              <motion.circle cx={c.to[0]} cy={c.to[1]} r={3} fill="var(--brand)" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.3, delay: 1.5 + i * 0.1 }} style={{ transformOrigin: `${c.to[0]}px ${c.to[1]}px` }} />
            </g>
          ))}
        </svg>

        {/* Status chips: around the card on wide screens, a row beneath it otherwise. */}
        <ul className="relative z-[3] mx-auto mt-6 grid max-w-[420px] grid-cols-2 gap-2 pb-2 md:max-w-[600px] md:gap-3 lg:contents" aria-label="What the import did with this row">
          {CHIPS.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.key} className="min-w-0 lg:absolute lg:left-(--cx) lg:top-(--cy) lg:z-[3]" style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px` } as CSSProperties}>
                <Float delay={0.8 + i * 0.12} period={c.period} invert={c.invert} className="h-full">
                  <div className="flex h-full items-center gap-2.5 rounded-2xl bg-card px-3 py-2.5 sm:py-2 sm:pl-2 shadow-[var(--shadow-float)] ring-1 ring-border/70 md:pr-3.5 md:whitespace-nowrap">
                    <span className={cn("hidden size-9 shrink-0 sm:flex items-center justify-center rounded-xl", c.tone === "success" ? "bg-success-soft text-success" : "bg-brand-soft text-brand")}>
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <ChipBody chip={c} lang={lang} />
                  </div>
                </Float>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
