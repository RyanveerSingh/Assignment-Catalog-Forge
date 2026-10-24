"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Chip } from "@/components/ext/chip";
import { settle, stagger } from "@/components/ext/motion";
import { StatusBadge } from "@/components/ext/status-badge";
import { formatCountdown, formatDuration, formatMicrosUsd, formatNumber, formatRelative, modeLabel } from "@/lib/format";
import type { ImportDto } from "./import-live-types";

const CELL_LABEL = "text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted md:hidden";

/**
 * One import in the recent list: name and mode, status, a progress bar that fills the first time the
 * list is seen, then products, cost, started and duration. The row is a link; hovering lifts it a
 * touch and slides the chevron. New rows (from polling) enter with the same fade-and-rise.
 */
export function ImportRow({ imp, storeSlug, index, now, revealed }: { imp: ImportDto; storeSlug: string; index: number; now: number; revealed: boolean }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const href = `/app/${storeSlug}/upload/${imp.id}`;
  const finished = imp.counts.done + imp.counts.needs_review + imp.counts.failed;
  const fraction = imp.totalRows > 0 ? Math.min(1, finished / imp.totalRows) : 0;
  const started = imp.startedAt ?? imp.createdAt;
  const elapsed = imp.startedAt ? Math.max(0, (imp.finishedAt ? Date.parse(imp.finishedAt) : now) - Date.parse(imp.startedAt)) : null;
  const countdown = imp.status === "paused" ? formatCountdown(imp.pausedUntil, now) : null;
  const mode = modeLabel(imp.mode);
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={settle(reduce, 0.35, stagger(index))}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest("a, button")) return;
        router.push(href);
      }}
      className="group relative grid cursor-pointer grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5 transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-surface-2/50 md:grid-cols-[minmax(180px,2fr)_150px_minmax(160px,1.6fr)_80px_90px_90px_90px_20px] md:items-center md:gap-x-5 md:px-5"
    >
      <div className="col-span-2 min-w-0 md:col-span-1">
        <Link href={href} className="block truncate rounded-md text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {imp.name}
        </Link>
        <Chip tone={imp.mode === "economy" ? "neutral" : "brand"} className="mt-1" title={mode.detail}>
          {mode.label.replace(" mode", "")}
        </Chip>
      </div>
      <div className="flex flex-col items-start gap-1">
        <span className={CELL_LABEL}>Status</span>
        <StatusBadge status={imp.status} />
        {countdown !== null ? (
          <span className="text-[11px] text-warning" suppressHydrationWarning>
            {countdown === "now" ? "resuming now" : `resuming in ${countdown}`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className={CELL_LABEL}>Progress</span>
        <div className="flex items-center gap-2.5">
          <div role="progressbar" aria-label={`${imp.name} progress`} aria-valuemin={0} aria-valuemax={Math.max(1, imp.totalRows)} aria-valuenow={finished} className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full w-full origin-left rounded-full bg-brand" initial={{ scaleX: 0 }} animate={{ scaleX: revealed ? fraction : 0 }} transition={settle(reduce, 0.8, 0.2 + stagger(index))} />
          </div>
          <span className="num shrink-0 text-xs text-ink">
            {formatNumber(finished)} / {imp.totalRows > 0 ? formatNumber(imp.totalRows) : "—"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <span className={CELL_LABEL}>Products</span>
        <span className="num text-[13px] text-ink">{formatNumber(imp.productCount)}</span>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <span className={CELL_LABEL}>Cost</span>
        <span className="num text-[13px] text-ink">{formatMicrosUsd(imp.costMicros)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={CELL_LABEL}>Started</span>
        <time dateTime={started} suppressHydrationWarning className="text-[13px] text-ink-muted">
          {formatRelative(started, now)}
        </time>
      </div>
      <div className="flex flex-col gap-1">
        <span className={CELL_LABEL}>Duration</span>
        <span className="num text-[13px] text-ink-muted" suppressHydrationWarning>
          {elapsed !== null ? formatDuration(elapsed) : "—"}
        </span>
      </div>
      <ChevronRightIcon aria-hidden className="absolute top-4 right-4 size-4 text-ink-muted/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand md:static" />
    </motion.li>
  );
}
