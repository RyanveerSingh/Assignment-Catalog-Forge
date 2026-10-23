"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ImportCounts } from "@/db/schema";
import { settle } from "@/components/ext/motion";
import { formatNumber, formatPercent, statusLabel } from "@/lib/format";

const COUNT_KEYS = ["pending", "processing", "done", "needs_review", "failed"] as const;

/**
 * "Rows processed" under the figure tiles. The amber fill is a scale transform that eases to each
 * new fraction; `initial={false}` means an import opened half way through renders at that width
 * rather than growing from zero.
 */
export function RowsProgress({ counts, totalRows, finished, fraction, rowsPerMin }: { counts: ImportCounts; totalRows: number; finished: number; fraction: number; rowsPerMin: number | null }) {
  const reduce = useReducedMotion();
  return (
    <section aria-label="Row progress" className="bg-card px-4 py-3 hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-ink">Rows processed</span>
        <span className="num text-ink-muted" suppressHydrationWarning>
          {formatNumber(finished)} / {formatNumber(totalRows)} · {formatPercent(fraction)}
          {rowsPerMin !== null ? ` · ${formatNumber(rowsPerMin)} rows/min` : ""}
        </span>
      </div>
      <div role="progressbar" aria-label="Rows processed" aria-valuemin={0} aria-valuemax={Math.max(1, totalRows)} aria-valuenow={finished} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper-deep">
        <motion.div className="h-full w-full origin-left rounded-full bg-brand" initial={false} animate={{ scaleX: fraction }} transition={settle(reduce, 0.6)} />
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        {COUNT_KEYS.map((k) => (
          <div key={k} className="flex gap-1">
            <dt>{statusLabel(k)}</dt>
            <dd className="num text-ink">{formatNumber(counts[k])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
