"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "@/components/ext/count-up";
import { settle } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatMicrosUsd, formatPercent } from "@/lib/format";
import { MiniStat } from "./stat";

/** Spend against the naive baseline (every token at list price, no cache, batch or routing) with a savings meter that fills on first view. */
export function CostSection({ cost }: { cost: StoreMetrics["cost"] }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const inView = useInView(track, { once: true, amount: 0.5 });
  const ratio = cost.naiveMicros > 0 ? Math.min(1, cost.savedMicros / cost.naiveMicros) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <section aria-labelledby="cost-heading" className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className={cn(CARD, "px-5 py-5 md:px-6")}>
        <h2 id="cost-heading" className="font-display text-lg text-ink">
          AI spend
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">What writing and translating has cost, next to what the same calls would cost at list price.</p>
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-[12px] font-medium text-ink-muted">Spent</div>
            <CountUp value={cost.totalMicros} format={formatMicrosUsd} className="font-display text-[2.5rem] leading-none text-brand tabular" />
          </div>
          <div title="The naive baseline: every token at list rate, no prompt cache, no Batch API, no cheaper models">
            <div className="text-[12px] font-medium text-ink-muted">At list price</div>
            <CountUp value={cost.naiveMicros} format={formatMicrosUsd} className="font-display text-[1.6rem] leading-none text-ink-muted tabular" />
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-ink">
              Saved <span className="num text-success">{formatMicrosUsd(cost.savedMicros)}</span>
            </span>
            <span className="num text-ink-muted">{cost.naiveMicros > 0 ? `${pct}% of list price` : "no calls yet"}</span>
          </div>
          <div ref={track} role="meter" aria-label="Share of the list price saved" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% saved`} className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full w-full origin-left rounded-full bg-brand" initial={{ scaleX: 0 }} animate={{ scaleX: inView ? ratio : 0 }} transition={settle(reduce, 0.9, 0.1)} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">The saving comes from three things: cheaper models for simple rows, reusing the shared part of each prompt, and sending Economy imports in batches.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:gap-4">
        <MiniStat label="Per product" value={formatMicrosUsd(cost.perProductMicros, 4)} />
        <MiniStat label="Per 1,000 products" value={formatMicrosUsd(cost.per1000Micros)} />
        <MiniStat label="Prompt reuse" value={formatPercent(cost.cacheHitRate)} hint="calls that read the prompt cache" />
        <MiniStat label="Sent in batches" value={formatPercent(cost.batchedShare)} hint="calls through the Batch API" />
      </dl>
    </section>
  );
}
