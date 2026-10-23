import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import type { LiveImport } from "@/db/repositories/overview";
import { formatNumber, statusLabel } from "@/lib/format";
import type { ImportDto } from "./import-live-types";
import { PIPELINE_STEPS, stepIndexFor } from "./stage-stepper";

/**
 * The blue card at the end of the overview row. While the worker owns an import it names the
 * stage, shows the rows done and lights the pipeline up to that stage; otherwise it says so and
 * points at the drop zone. Plain HTML: the pulse is CSS, so it needs no JavaScript to be right.
 */
export function LiveNowTile({ storeSlug, live, latest, className }: { storeSlug: string; live: LiveImport | null; latest: ImportDto | null; className?: string }) {
  const paused = live?.status === "paused";
  const idx = live ? stepIndexFor(live.status) : -1;
  const face = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-14 -bottom-20 size-52 rounded-full border border-white/15" />
      <span aria-hidden className="pointer-events-none absolute -right-4 -bottom-8 size-28 rounded-full border border-white/15" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-white/70">Live now</span>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold text-white" role="status">
          <span aria-hidden className={cn("size-1.5 rounded-full", live ? (paused ? "bg-warning" : "animate-pulse bg-white") : "bg-white/50")} />
          {live ? (paused ? "Paused" : "Running") : "Idle"}
        </span>
      </div>
      <div className="relative min-w-0">
        <div className="line-clamp-2 font-display text-[1.5rem] leading-[1.1] text-white">{live ? statusLabel(live.status) : "Nothing running"}</div>
        <div className="mt-2 truncate text-xs text-white/75">
          {live ? (
            <>
              <span className="text-white">{live.name}</span> · <span className="num">{formatNumber(live.finished)}</span> of <span className="num">{formatNumber(live.totalRows)}</span> rows
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
            <li key={step.key} title={step.label} className={cn("h-1.5 flex-1 rounded-full", state === "done" && "bg-white", state === "current" && "animate-pulse bg-white", state === "upcoming" && "bg-white/25")}>
              <span className="sr-only">
                {step.label}, {state === "done" ? "completed" : state === "current" ? "in progress" : "not started"}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="relative flex min-h-4 items-center gap-1 text-xs">
        {live ? (
          <span className="inline-flex items-center gap-1 font-medium text-white">
            Open the import <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        ) : latest ? (
          <span className="truncate text-white/70">
            Last import · <span className="text-white/90">{latest.name}</span> · {statusLabel(latest.status).toLowerCase()}
          </span>
        ) : (
          <span className="text-white/70">No imports yet</span>
        )}
      </div>
    </>
  );
  const box = cn("relative flex flex-col justify-between gap-3 overflow-hidden rounded-2xl bg-brand px-5 pt-4 pb-4 text-white shadow-[var(--shadow-float)]", className);
  if (live) {
    return (
      <Link href={`/app/${storeSlug}/upload/${live.id}`} className={cn(box, "group cursor-pointer outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2")}>
        {face}
      </Link>
    );
  }
  return <div className={box}>{face}</div>;
}
