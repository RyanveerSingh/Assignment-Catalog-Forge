"use client";

import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatMicrosUsd, formatPercent } from "@/lib/format";
import { MiniStat } from "./stat";

/** Spend against the naive baseline (every token at list price, no cache, batch or routing) with a savings meter. */
export function CostSection({ cost }: { cost: StoreMetrics["cost"] }) {
  const ratio = cost.naiveMicros > 0 ? Math.min(1, cost.savedMicros / cost.naiveMicros) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <section aria-labelledby="cost-heading" className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="rounded-sm bg-card p-4 hairline md:p-5">
        <h2 id="cost-heading" className="font-display text-xl text-ink">
          AI spend
        </h2>
        <p className="mt-0.5 text-xs text-ink-muted">What writing and translating has cost, next to what the same calls would cost at list price.</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Spent</div>
            <div className="num text-4xl leading-none text-ink">{formatMicrosUsd(cost.totalMicros)}</div>
          </div>
          <div title="The naive baseline: every token at list rate, no prompt cache, no Batch API, no cheaper models">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">At list price</div>
            <div className="num text-2xl leading-none text-ink-muted">{formatMicrosUsd(cost.naiveMicros)}</div>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-ink">
              Saved <span className="num">{formatMicrosUsd(cost.savedMicros)}</span>
            </span>
            <span className="num text-ink-muted">{cost.naiveMicros > 0 ? `${pct}% of list price` : "no calls yet"}</span>
          </div>
          <div
            role="meter"
            aria-label="Share of the list price saved"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}% saved`}
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-brand-soft"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">The saving comes from three things: cheaper models for simple rows, reusing the shared part of each prompt, and sending Economy imports in batches.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <MiniStat label="Per product" value={formatMicrosUsd(cost.perProductMicros, 4)} />
        <MiniStat label="Per 1,000 products" value={formatMicrosUsd(cost.per1000Micros)} />
        <MiniStat label="Prompt reuse" value={formatPercent(cost.cacheHitRate)} hint="calls that read the prompt cache (cache hit rate)" />
        <MiniStat label="Sent in batches" value={formatPercent(cost.batchedShare)} hint="calls through the Batch API (batched share)" />
      </dl>
    </section>
  );
}
