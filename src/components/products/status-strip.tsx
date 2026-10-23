"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "@/components/ext/count-up";
import { settle } from "@/components/ext/motion";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ProductStatus, ProductStatusCounts } from "./types";

interface Segment {
  key: string;
  label: string;
  statuses: ProductStatus[];
  /* Chart slots, not new colours: moss, slate, amber, clay, then ink for what is still being written. */
  bar: string;
}

const SEGMENTS: ReadonlyArray<Segment> = [
  { key: "approved", label: "Approved", statuses: ["approved"], bar: "bg-chart-3" },
  { key: "draft", label: "Draft", statuses: ["draft"], bar: "bg-chart-4" },
  { key: "needs_review", label: "Needs review", statuses: ["needs_review"], bar: "bg-chart-1" },
  { key: "failed", label: "Failed", statuses: ["failed"], bar: "bg-chart-5" },
  { key: "pending_ai", label: "Being written", statuses: ["pending_ai"], bar: "bg-ink/30" },
  { key: "other", label: "Rejected or archived", statuses: ["rejected", "archived"], bar: "bg-ink/12" },
];

function sum(counts: ProductStatusCounts, statuses: ReadonlyArray<ProductStatus>): number {
  return statuses.reduce((n, s) => n + counts[s], 0);
}

/**
 * The catalog by status under the page header: a stacked bar that grows in the first time it is
 * seen, and a legend whose entries filter the table (the filters live in the URL, so each entry is a
 * link). Counts arrive with the page and follow every table refresh, rolling to the new numbers.
 */
export function StatusStrip({ counts }: { counts: ProductStatusCounts }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const track = useRef<HTMLDivElement>(null);
  const inView = useInView(track, { once: true, amount: 0.5 });
  const total = sum(counts, SEGMENTS.flatMap((s) => s.statuses));
  const selected = searchParams.getAll("status");
  const rows = SEGMENTS.map((s) => ({ ...s, n: sum(counts, s.statuses), share: total > 0 ? sum(counts, s.statuses) / total : 0 })).filter((s) => s.key !== "other" || s.n > 0);
  const live = counts.approved;

  const hrefFor = (s: Segment, active: boolean): string => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("status");
    sp.delete("offset");
    if (!active) for (const st of s.statuses) sp.append("status", st);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <section aria-label="Catalog by status" className="flex flex-col gap-2.5 bg-card px-4 py-3 hairline">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <CountUp value={total} format={formatNumber} className="font-display text-[1.75rem] leading-none text-ink tabular" />
          <span className="text-xs text-ink-muted">{total === 1 ? "product" : "products"} in the catalog</span>
        </div>
        <span className="text-xs text-ink-muted">
          <span className="num text-ink">{formatPercent(total > 0 ? live / total : 0, 1)}</span> live in the shop
        </span>
      </div>
      <div ref={track} role="img" aria-label={rows.map((r) => `${r.label} ${formatNumber(r.n)} (${formatPercent(r.share, 1)})`).join(", ")} className="h-2 w-full overflow-hidden rounded-full bg-paper-deep">
        <motion.div className="flex h-full w-full origin-left gap-px" initial={{ scaleX: 0 }} animate={{ scaleX: inView ? 1 : 0 }} transition={settle(reduce, 0.8, 0.1)}>
          {rows.map((r) => (
            <div key={r.key} className={cn("h-full transition-[flex] duration-500", r.bar)} style={{ flex: `${r.share} 1 ${r.n > 0 ? 2 : 0}px` }} />
          ))}
        </motion.div>
      </div>
      <ul className="-mx-1.5 flex flex-wrap gap-x-1 gap-y-0.5 text-xs">
        {rows.map((r) => {
          const active = selected.length === r.statuses.length && r.statuses.every((s) => selected.includes(s));
          return (
            <li key={r.key}>
              <Link
                href={hrefFor(r, active)}
                scroll={false}
                aria-pressed={active}
                title={active ? "Show every status" : `Show only ${r.label.toLowerCase()}`}
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 transition-colors hover:bg-paper-deep/70 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                  active && "bg-paper-deep ring-1 ring-inset ring-border",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-[2px]", r.bar)} />
                <span className={cn(r.n === 0 ? "text-ink-muted" : "text-ink")}>{r.label}</span>
                <CountUp value={r.n} format={formatNumber} className={cn("num", r.n === 0 ? "text-ink-muted" : "text-ink")} />
                <span className="num text-ink-muted">{formatPercent(r.share, 1)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
