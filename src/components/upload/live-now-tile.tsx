import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import type { LiveImport } from "@/db/repositories/overview";
import { formatNumber, statusLabel } from "@/lib/format";
import type { ImportDto } from "./import-live-types";
import { PIPELINE_STEPS, stepIndexFor } from "./stage-stepper";

/**
 * The ink panel at the end of the overview row. While the worker owns an import it names the
 * stage, shows the rows done and lights the pipeline up to that stage; otherwise it says so and
 * points at the drop zone. Plain HTML: the pulse is CSS, so it needs no JavaScript to be right.
 */
export function LiveNowTile({ storeSlug, live, latest, className }: { storeSlug: string; live: LiveImport | null; latest: ImportDto | null; className?: string }) {
  const paused = live?.status === "paused";
  const idx = live ? stepIndexFor(live.status) : -1;
  const face = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-12 -bottom-16 size-44 rounded-full border border-paper/10" />
      <span aria-hidden className="pointer-events-none absolute -right-2 -bottom-6 size-24 rounded-full border border-paper/10" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-paper/60">Live now</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-paper/80" role="status">
          <span aria-hidden className={cn("size-1.5 rounded-full", live ? (paused ? "bg-warning" : "animate-pulse bg-brand") : "bg-paper/30")} />
          {live ? (paused ? "Paused" : "Running") : "Idle"}
        </span>
      </div>
      <div className="relative min-w-0">
        <div className="truncate font-display text-[1.75rem] leading-none text-paper">{live ? statusLabel(live.status) : "Nothing running"}</div>
        <div className="mt-2 truncate text-xs text-paper/70">
          {live ? (
            <>
              <span className="text-paper/90">{live.name}</span> · <span className="num">{formatNumber(live.finished)}</span> of <span className="num">{formatNumber(live.totalRows)}</span> rows
            </>
          ) : (
            "drop a sheet to start"
          )}
        </div>
      </div>
      <ol aria-label="Pipeline stages" className="relative flex items-center gap-1">
        {PIPELINE_STEPS.map((step, i) => {
          const state = !live || idx < 0 ? "upcoming" : i < idx ? "done" : i === idx ? "current" : "upcoming";
          return (
            <li key={step.key} title={step.label} className={cn("h-1 flex-1 rounded-full", state === "done" && "bg-brand", state === "current" && "animate-pulse bg-brand", state === "upcoming" && "bg-paper/15")}>
              <span className="sr-only">
                {step.label}, {state === "done" ? "completed" : state === "current" ? "in progress" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="relative flex min-h-4 items-center gap-1 text-xs">
        {live ? (
          <span className="inline-flex items-center gap-1 text-brand">
            Open the import <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        ) : latest ? (
          <span className="truncate text-paper/60">
            Last import · <span className="text-paper/80">{latest.name}</span> · {statusLabel(latest.status).toLowerCase()}
          </span>
        ) : (
          <span className="text-paper/60">No imports yet</span>
        )}
      </div>
    </>
  );
  const box = cn("relative flex flex-col justify-between gap-3 overflow-hidden bg-ink px-4 pt-4 pb-3.5 text-paper", className);
  if (live) {
    return (
      <Link href={`/app/${storeSlug}/upload/${live.id}`} className={cn(box, "group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand")}>
        {face}
      </Link>
    );
  }
  return <div className={box}>{face}</div>;
}
