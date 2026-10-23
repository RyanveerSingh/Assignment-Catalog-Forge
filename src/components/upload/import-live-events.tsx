"use client";

import { CircleXIcon, InfoIcon, type LucideIcon, TriangleAlertIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import type { ImportEventDto } from "./import-live-types";

export const MAX_EVENTS = 500;

const LEVEL: Record<ImportEventDto["level"], { className: string; icon: LucideIcon }> = {
  info: { className: "text-ink-muted", icon: InfoIcon },
  warn: { className: "text-warning", icon: TriangleAlertIcon },
  error: { className: "text-destructive", icon: CircleXIcon },
};

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

/**
 * Newest first. Lines already there on page load render settled; a line that arrives over the
 * stream slides in at the top. `live` shows the pulsing mark while the worker still owns the import.
 */
export function EventLog({ events, live = false }: { events: ImportEventDto[]; live?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="log-heading" className="flex min-h-0 flex-col bg-card hairline">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 id="log-heading" className="font-display text-lg text-ink">
          Event log
        </h2>
        <span className="flex items-center gap-3 text-[11px] text-ink-muted">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-success" role="status">
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
        <p className="px-4 py-6 text-sm text-ink-muted">No events yet.</p>
      ) : (
        <ol className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const hasData = e.data !== null && Object.keys(e.data).length > 0;
              const { className, icon: Icon } = LEVEL[e.level];
              return (
                <motion.li key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={settle(reduce, 0.25)} className="flex gap-2 px-4 py-1.5">
                  <time dateTime={e.createdAt} className="num shrink-0 text-ink-muted" suppressHydrationWarning>
                    {clock(e.createdAt)}
                  </time>
                  <span className={cn("flex w-14 shrink-0 items-center gap-1 font-medium uppercase tracking-wide", className)}>
                    <Icon className="size-3 shrink-0" aria-hidden />
                    {e.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-ink">{e.message}</p>
                    {hasData ? (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-ink-muted hover:text-ink">data</summary>
                        <pre className="num mt-1 overflow-x-auto bg-paper-deep/60 p-2 text-[11px] leading-snug">{JSON.stringify(e.data, null, 2)}</pre>
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
