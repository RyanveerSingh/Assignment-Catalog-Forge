import { cn } from "cn";
import type { ImportEventDto } from "./import-live-types";

export const MAX_EVENTS = 500;

const LEVEL_CLASS: Record<ImportEventDto["level"], string> = { info: "text-ink-muted", warn: "text-warning", error: "text-destructive" };

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

export function EventLog({ events }: { events: ImportEventDto[] }) {
  return (
    <section aria-labelledby="log-heading" className="flex min-h-0 flex-col bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="log-heading" className="font-display text-lg text-ink">
          Event log
        </h2>
        <span className="num text-[11px] text-ink-muted">
          {events.length}
          {events.length >= MAX_EVENTS ? "+" : ""} · newest first
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted">No events yet.</p>
      ) : (
        <ol className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
          {events.map((e) => {
            const hasData = e.data !== null && Object.keys(e.data).length > 0;
            return (
              <li key={e.id} className="flex gap-2 px-4 py-1.5">
                <time dateTime={e.createdAt} className="num shrink-0 text-ink-muted" suppressHydrationWarning>
                  {clock(e.createdAt)}
                </time>
                <span className={cn("w-10 shrink-0 font-medium uppercase tracking-wide", LEVEL_CLASS[e.level])}>{e.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-ink">{e.message}</p>
                  {hasData ? (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-ink-muted hover:text-ink">data</summary>
                      <pre className="num mt-1 overflow-x-auto bg-paper-deep/60 p-2 text-[11px] leading-snug">{JSON.stringify(e.data, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
