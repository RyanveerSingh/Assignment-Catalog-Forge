"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ext/page-header";
import { StatusBadge } from "@/components/ext/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatCountdown, formatDuration, formatMicrosUsd, formatNumber, formatRelative, modeLabel } from "@/lib/format";
import type { ImportDto } from "./import-live";
import { isImportActive } from "./stage-stepper";

const POLL_MS = 5_000;
const PAGE_LIMIT = 25;
const HEAD = "text-[11px] font-medium uppercase tracking-wider text-ink-muted";

function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function ImportsTable({ storeSlug, initialImports }: { storeSlug: string; initialImports: ImportDto[] }) {
  const router = useRouter();
  const [imports, setImports] = useState(initialImports);
  const [pollError, setPollError] = useState<string | null>(null);
  const anyActive = imports.some((i) => isImportActive(i.status));
  const anyCountdown = imports.some((i) => i.status === "paused" && i.pausedUntil !== null);
  const now = useTicker(anyCountdown ? 1_000 : anyActive ? 5_000 : 30_000);

  // The server re-renders this list on every navigation; adopt that snapshot instead of keeping a stale one.
  useEffect(() => {
    setImports(initialImports);
  }, [initialImports]);

  useEffect(() => {
    if (!anyActive) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await api<{ imports: ImportDto[] }>(`${storeApi(storeSlug)}/imports?limit=${PAGE_LIMIT}`);
        if (cancelled) return;
        setImports(r.imports);
        setPollError(null);
      } catch (err) {
        if (!cancelled) setPollError(err instanceof ApiError ? err.message : "Live refresh failed; retrying");
      }
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [anyActive, storeSlug]);

  return (
    <section aria-labelledby="imports-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="imports-heading" className="font-display text-xl text-ink">
          Recent imports
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          {anyActive ? (
            <span className="inline-flex items-center gap-1.5" role="status">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" />
              Live · refreshes every 5 s
            </span>
          ) : (
            <span>Latest {PAGE_LIMIT}</span>
          )}
          {pollError ? (
            <span className="text-destructive" role="alert">
              {pollError}
            </span>
          ) : null}
        </div>
      </div>
      {imports.length === 0 ? (
        <EmptyState title="No imports yet" description="Upload a sheet above, or download a sample file and drop it in." />
      ) : (
        <div className="bg-card hairline">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Name</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Progress</TableHead>
                <TableHead className={`${HEAD} text-right`}>Products</TableHead>
                <TableHead className={`${HEAD} text-right`}>Cost</TableHead>
                <TableHead className={HEAD}>Started</TableHead>
                <TableHead className={HEAD}>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => {
                const href = `/app/${storeSlug}/upload/${imp.id}`;
                const finished = imp.counts.done + imp.counts.needs_review + imp.counts.failed;
                const pct = imp.totalRows > 0 ? Math.min(100, (finished / imp.totalRows) * 100) : 0;
                const started = imp.startedAt ?? imp.createdAt;
                const elapsed = imp.startedAt ? Math.max(0, (imp.finishedAt ? Date.parse(imp.finishedAt) : now) - Date.parse(imp.startedAt)) : null;
                const countdown = imp.status === "paused" ? formatCountdown(imp.pausedUntil, now) : null;
                return (
                  <TableRow
                    key={imp.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (e.target instanceof Element && e.target.closest("a, button")) return;
                      router.push(href);
                    }}
                  >
                    <TableCell className="max-w-[260px]">
                      <Link href={href} className="block truncate rounded-sm font-medium text-ink underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                        {imp.name}
                      </Link>
                      <span className="text-[11px] uppercase tracking-wide text-ink-muted" title={modeLabel(imp.mode).detail}>
                        {modeLabel(imp.mode).label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={imp.status} />
                      {countdown !== null ? (
                        <div className="mt-1 text-[11px] text-warning" suppressHydrationWarning>
                          {countdown === "now" ? "Paused — resuming now" : `Paused — resuming in ${countdown}`}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <div role="progressbar" aria-label={`${imp.name} progress`} aria-valuemin={0} aria-valuemax={Math.max(1, imp.totalRows)} aria-valuenow={finished} className="h-1.5 w-24 shrink-0 bg-paper-deep">
                          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="num text-xs text-ink">
                          {formatNumber(finished)} / {imp.totalRows > 0 ? formatNumber(imp.totalRows) : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(imp.productCount)}</TableCell>
                    <TableCell className="num text-right">{formatMicrosUsd(imp.costMicros)}</TableCell>
                    <TableCell className="text-ink-muted">
                      <time dateTime={started} suppressHydrationWarning>
                        {formatRelative(started, now)}
                      </time>
                    </TableCell>
                    <TableCell className="num text-ink-muted" suppressHydrationWarning>
                      {elapsed !== null ? formatDuration(elapsed) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
