"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "@/components/ext/count-up";
import { settle } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ProductStatus, ProductStatusCounts } from "./types";

interface Segment {
  key: string;
  label: string;
  statuses: ProductStatus[];
  /* Blue tones for the healthy states, amber and red for what needs a person, ink for the rest. */
  bar: string;
}

const SEGMENTS: ReadonlyArray<Segment> = [
  { key: "approved", label: "Approved", statuses: ["approved"], bar: "bg-brand" },
  { key: "draft", label: "Draft", statuses: ["draft"], bar: "bg-[#7c9cf6]" },
  { key: "needs_review", label: "Needs review", statuses: ["needs_review"], bar: "bg-warning" },
  { key: "failed", label: "Failed", statuses: ["failed"], bar: "bg-destructive" },
  { key: "pending_ai", label: "Being written", statuses: ["pending_ai"], bar: "bg-[#b9c9fb]" },
  { key: "other", label: "Rejected or archived", statuses: ["rejected", "archived"], bar: "bg-ink/15" },
];

function sum(counts: ProductStatusCounts, statuses: ReadonlyArray<ProductStatus>): number {
  return statuses.reduce((n, s) => n + counts[s], 0);
}

/**
 * The catalog by status as the page's header card: the total in Lexend, a stacked bar that grows in
 * the first time it is seen, and a legend of pill filters (the filters live in the URL, so each pill
 * is a link). Counts arrive with the page and follow every table refresh, rolling to the new numbers.
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
    <motion.section aria-label="Catalog by status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.45)} className={cn(CARD, "flex flex-col gap-4 px-5 py-5 md:px-6")}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <CountUp value={total} format={formatNumber} className="font-display text-[2.5rem] leading-none text-ink tabular" />
          <span className="text-sm text-ink-muted">{total === 1 ? "product" : "products"} in the catalog</span>
        </div>
        <span className="inline-flex h-7 items-center gap-2 rounded-full bg-success-soft px-3 text-xs font-medium text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          <span className="num">{formatNumber(live)}</span> live in the shop · <span className="num">{formatPercent(total > 0 ? live / total : 0, 1)}</span>
        </span>
      </div>
      <div ref={track} role="img" aria-label={rows.map((r) => `${r.label} ${formatNumber(r.n)} (${formatPercent(r.share, 1)})`).join(", ")} className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div className="flex h-full w-full origin-left gap-0.5" initial={{ scaleX: 0 }} animate={{ scaleX: inView ? 1 : 0 }} transition={settle(reduce, 0.9, 0.15)}>
          {rows.map((r) => (
            <div key={r.key} className={cn("h-full rounded-full transition-[flex] duration-500", r.bar)} style={{ flex: `${r.share} 1 ${r.n > 0 ? 3 : 0}px` }} />
          ))}
        </motion.div>
      </div>
      <ul className="flex flex-wrap gap-2">
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
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[13px] ring-1 ring-inset transition-[background-color,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97]",
                  active ? "bg-brand-soft text-brand ring-brand/30" : "bg-card text-ink ring-border hover:bg-surface-2",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-full", r.bar)} />
                <span className={cn("font-medium", r.n === 0 && !active && "text-ink-muted")}>{r.label}</span>
                <CountUp value={r.n} format={formatNumber} className={cn("num", active ? "text-brand" : "text-ink")} />
                <span className="num text-[11px] text-ink-muted">{formatPercent(r.share, 1)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
