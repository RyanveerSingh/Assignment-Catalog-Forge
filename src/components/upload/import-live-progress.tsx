"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import type { ImportCounts } from "@/db/schema";
import { CountUp } from "@/components/ext/count-up";
import { settle } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import { formatNumber, formatPercent, statusLabel } from "@/lib/format";

const COUNT_KEYS = ["pending", "processing", "done", "needs_review", "failed"] as const;
const DOT: Record<(typeof COUNT_KEYS)[number], string> = { pending: "bg-ink/25", processing: "bg-brand", done: "bg-success", needs_review: "bg-warning", failed: "bg-destructive" };

/**
 * "Rows processed" under the figure tiles. The blue fill is a scale transform that eases to each
 * new fraction; `initial={false}` means an import opened half way through renders at that width
 * rather than growing from zero.
 */
export function RowsProgress({ counts, totalRows, finished, fraction, rowsPerMin }: { counts: ImportCounts; totalRows: number; finished: number; fraction: number; rowsPerMin: number | null }) {
  const reduce = useReducedMotion();
  return (
    <section aria-label="Row progress" className={cn(CARD, "px-5 py-4 md:px-6")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">Rows processed</span>
        <span className="num text-xs text-ink-muted" suppressHydrationWarning>
          {formatNumber(finished)} / {formatNumber(totalRows)} · <span className="font-semibold text-brand">{formatPercent(fraction)}</span>
          {rowsPerMin !== null ? ` · ${formatNumber(rowsPerMin)} rows/min` : ""}
        </span>
      </div>
      <div role="progressbar" aria-label="Rows processed" aria-valuemin={0} aria-valuemax={Math.max(1, totalRows)} aria-valuenow={finished} className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full w-full origin-left rounded-full bg-brand" initial={false} animate={{ scaleX: fraction }} transition={settle(reduce, 0.6)} />
      </div>
      <dl className="mt-3 flex flex-wrap gap-2">
        {COUNT_KEYS.map((k) => (
          <div key={k} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2/80 px-2.5 text-[11px]">
            <span aria-hidden className={cn("size-1.5 rounded-full", DOT[k])} />
            <dt className="text-ink-muted">{statusLabel(k)}</dt>
            <dd className="num font-semibold text-ink">
              <CountUp value={counts[k]} format={formatNumber} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
