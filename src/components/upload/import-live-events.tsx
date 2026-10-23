"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import type { ImportEventDto } from "./import-live-types";

export const MAX_EVENTS = 500;

const LEVEL: Record<ImportEventDto["level"], { dot: string; text: string }> = {
  info: { dot: "bg-brand", text: "text-ink-muted" },
  warn: { dot: "bg-warning", text: "text-warning" },
  error: { dot: "bg-destructive", text: "text-destructive" },
};

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * Newest first, as a timeline: a coloured dot per line on a thin rail. Lines already there on page
 * load render settled; a line that arrives over the stream slides in at the top. `live` shows the
 * pulsing mark while the worker still owns the import.
 */
export function EventLog({ events, live = false }: { events: ImportEventDto[]; live?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="log-heading" className={cn(CARD, "flex min-h-0 w-full min-w-0 flex-col")}>
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 id="log-heading" className="font-display text-base text-ink">
          Event log
        </h2>
        <span className="flex items-center gap-3 text-[11px] text-ink-muted">
          {live ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 font-semibold text-success" role="status">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
              Live
            </span>
          ) : null}
          <span className="num">
            {events.length}
            {events.length >= MAX_EVENTS ? "+" : ""} · newest first
          </span>
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-5 py-8 text-sm text-ink-muted">No events yet.</p>
      ) : (
        <ol className="relative max-h-96 overflow-y-auto px-5 py-3 text-xs before:absolute before:top-3 before:bottom-3 before:left-[27px] before:w-px before:bg-border">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const hasData = e.data !== null && Object.keys(e.data).length > 0;
              const { dot, text } = LEVEL[e.level];
              return (
                <motion.li key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={settle(reduce, 0.25)} className="relative flex gap-3 py-1.5 pl-1">
                  <span aria-hidden className={cn("mt-[5px] size-[9px] shrink-0 rounded-full ring-[3px] ring-card", dot)} />
                  <time dateTime={e.createdAt} className="num w-[62px] shrink-0 text-ink-muted" suppressHydrationWarning>
                    {clock(e.createdAt)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-ink">
                      {e.level !== "info" ? <span className={cn("mr-1.5 font-semibold uppercase tracking-wide", text)}>{e.level}</span> : null}
                      {e.message}
                    </p>
                    {hasData ? (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-ink-muted hover:text-ink">data</summary>
                        <pre className="num mt-1 overflow-x-auto rounded-lg bg-surface-2/70 p-2 text-[11px] leading-snug">{JSON.stringify(e.data, null, 2)}</pre>
                      </details>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
