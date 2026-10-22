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
        <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Total</div>
            <div className="num text-4xl leading-none text-ink">{formatMicrosUsd(cost.totalMicros)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Naive baseline</div>
            <div className="num text-2xl leading-none text-ink-muted">{formatMicrosUsd(cost.naiveMicros)}</div>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-ink">
              Saved <span className="num">{formatMicrosUsd(cost.savedMicros)}</span>
            </span>
            <span className="num text-ink-muted">{cost.naiveMicros > 0 ? `${pct}% of baseline` : "no calls yet"}</span>
          </div>
          <div
            role="meter"
            aria-label="Share of the naive baseline saved"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}% saved`}
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-brand-soft"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">Baseline prices every token at list rate with no prompt cache, no Batch API and no model routing.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <MiniStat label="Per product" value={formatMicrosUsd(cost.perProductMicros, 4)} />
        <MiniStat label="Per 1,000 products" value={formatMicrosUsd(cost.per1000Micros)} />
        <MiniStat label="Cache hit rate" value={formatPercent(cost.cacheHitRate)} hint="calls that read the prompt cache" />
        <MiniStat label="Batched share" value={formatPercent(cost.batchedShare)} hint="calls sent through the Batch API" />
      </dl>
    </section>
  );
}
