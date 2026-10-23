"use client";

import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "cn";

/* The event log of the showcase import (new-12.csv, 26 rows, 18 photos, real models), with the seconds each line landed at. */
const LINES: ReadonlyArray<{ at: number; text: string; warn?: boolean }> = [
  { at: 0, text: "Upload received: new-12.csv + 18 photos" },
  { at: 0.1, text: "Parsed 26 rows" },
  { at: 0.6, text: "Grouped 26 rows into 12 products (1 duplicate, 1 SKU conflict)" },
  { at: 3.1, text: "Photos: 18 accepted, 16 matched by name, 1 left for you" },
  { at: 3.2, text: "Writing listings with Haiku 5.5" },
  { at: 44.9, text: "Blocked 1 claim in Waxed Cotton Dog Coat: the sheet says not waterproof", warn: true },
  { at: 45, text: "Translating into Deutsch and Français" },
  { at: 76.6, text: "Completed: 19 rows done, 7 need review, 0 failed" },
  { at: 76.8, text: "Published 9 products to the shop; 3 waiting for review" },
];
/** Running totals, each taken from the log line that reports it and shown once that line has landed. */
const TOTALS: ReadonlyArray<{ label: string; value: number; at: number }> = [
  { label: "Rows parsed", value: 26, at: 0.1 },
  { label: "Products", value: 12, at: 0.6 },
  { label: "Published", value: 9, at: 76.8 },
];
const REAL_SECONDS = 77;
/** The 77 real seconds play in 9, then rest before replaying. */
const PLAY_MS = 9000;
const REST_MS = 3500;
const TICK_MS = 100;

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A white status panel that replays the real import log, line by line, on a compressed clock. */
export function LiveImportCard({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (reduce) {
      setElapsed(PLAY_MS);
      return;
    }
    const id = window.setInterval(() => setElapsed((e) => (e + TICK_MS) % (PLAY_MS + REST_MS)), TICK_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const played = Math.min(elapsed, PLAY_MS);
  const seconds = (played / PLAY_MS) * REAL_SECONDS;
  const shown = LINES.filter((l) => l.at <= seconds);
  const done = played >= PLAY_MS;

  return (
    <div className={cn("flex w-full flex-col rounded-3xl bg-card text-left shadow-[var(--shadow-card)] ring-1 ring-border/70", className)} aria-live="off">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="num truncate text-sm font-medium text-ink">new-12.csv</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Fast mode · real models · 26 rows, 18 photos</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", done ? "bg-success-soft text-success" : "bg-brand-soft text-brand")}>
            <span aria-hidden className={cn("size-1.5 rounded-full", done ? "bg-success" : "animate-pulse bg-brand")} />
            {done ? "Completed" : "Running"}
          </span>
          <span className="num text-xs text-ink-muted">{clock(seconds)}</span>
        </div>
      </div>
      <div className="mx-5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full origin-left rounded-full bg-brand" style={{ scaleX: played / PLAY_MS }} transition={{ duration: 0 }} />
      </div>
      <ol className="flex flex-col gap-2.5 px-5 py-4 text-[13px]">
        {LINES.map((line, i) => {
          const reached = i < shown.length;
          const current = !done && i === shown.length - 1;
          return (
            <motion.li key={line.text} initial={false} animate={{ opacity: reached ? 1 : 0.55, x: reached ? 0 : -4 }} transition={{ duration: reduce ? 0 : 0.25 }} className="flex items-start gap-2.5">
              <span className={cn("mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full", !reached ? "ring-1 ring-border ring-inset" : line.warn ? "bg-warning-soft text-warning" : current ? "bg-brand-soft" : "bg-success-soft text-success")}>
                {!reached ? null : line.warn ? <TriangleAlertIcon className="size-2.5" aria-hidden /> : current ? <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden /> : <CheckIcon className="size-2.5" aria-hidden />}
              </span>
              <span className={cn("leading-snug", reached && (line.warn || current) ? "text-ink" : "text-ink-muted")}>{line.text}</span>
            </motion.li>
          );
        })}
      </ol>
      <dl className="mx-5 mt-auto mb-4 grid grid-cols-3 gap-2">
        {TOTALS.map((t) => {
          const value = seconds >= t.at ? t.value : 0;
          return (
            <div key={t.label} className="rounded-2xl bg-paper px-3 py-2.5">
              <dt className="text-[11px] text-ink-muted">{t.label}</dt>
              <dd className="num mt-0.5 text-lg leading-tight text-ink">{value}</dd>
            </div>
          );
        })}
      </dl>
      <p className="border-t border-border px-5 py-3 text-[11px] text-ink-muted">The real log of the sample import, 77 seconds replayed in nine.</p>
    </div>
  );
}
