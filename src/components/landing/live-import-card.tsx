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
const REAL_SECONDS = 77;
/** The 77 real seconds play in 9, then rest before replaying. */
const PLAY_MS = 9000;
const REST_MS = 3500;
const TICK_MS = 100;

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A netz-style status panel that replays the real import log, line by line, on a compressed clock. */
export function LiveImportCard({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(reduce ? PLAY_MS : 0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setElapsed((e) => (e + TICK_MS) % (PLAY_MS + REST_MS)), TICK_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const played = Math.min(elapsed, PLAY_MS);
  const seconds = (played / PLAY_MS) * REAL_SECONDS;
  const shown = LINES.filter((l) => l.at <= seconds);
  const done = played >= PLAY_MS;

  return (
    <div className={cn("w-full bg-card text-left shadow-[0_18px_40px_-24px_rgba(26,23,20,0.35)] hairline", className)} aria-live="off">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="num truncate text-sm text-ink">new-12.csv</p>
          <p className="text-[11px] text-ink-muted">Fast mode · real models · 26 rows, 18 photos</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", done ? "bg-success-soft text-success" : "bg-brand-soft text-brand")}>{done ? "Completed" : "Running"}</span>
          <span className="num text-xs text-ink-muted">{clock(seconds)}</span>
        </div>
      </div>
      <div className="h-1 bg-paper-deep">
        <motion.div className="h-full origin-left bg-brand" style={{ scaleX: played / PLAY_MS }} transition={{ duration: 0 }} />
      </div>
      <ol className="flex min-h-[17.5rem] flex-col gap-2 px-4 py-3 text-xs">
        {shown.map((line, i) => {
          const current = !done && i === shown.length - 1;
          return (
            <motion.li key={line.text} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="flex items-start gap-2">
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", line.warn ? "bg-warning-soft text-warning" : current ? "bg-brand-soft" : "bg-success-soft text-success")}>
                {line.warn ? <TriangleAlertIcon className="size-2.5" aria-hidden /> : current ? <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden /> : <CheckIcon className="size-2.5" aria-hidden />}
              </span>
              <span className={cn("leading-snug", line.warn ? "text-ink" : current ? "text-ink" : "text-ink-muted")}>{line.text}</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
