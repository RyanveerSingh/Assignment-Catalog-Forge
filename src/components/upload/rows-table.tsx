"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import type { Issue } from "@/core/types";
import { StatusBadge } from "@/components/ext/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatNumber, statusLabel } from "@/lib/format";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const COUNTS_DEBOUNCE_MS = 1_000;
const FILTERS = ["all", "pending", "processing", "done", "needs_review", "failed"] as const;
type Filter = (typeof FILTERS)[number];

export interface RowCounts {
  pending: number;
  processing: number;
  done: number;
  needs_review: number;
  failed: number;
}

interface RowDto {
  id: number;
  rowNumber: number;
  status: string;
  stage: string;
  productId: string | null;
  productKey: string | null;
  duplicateOfRow: number | null;
  failureReason: string | null;
  issues: Issue[];
  raw: Record<string, string>;
}

interface RowsResponse {
  total: number;
  rows: RowDto[];
}

function isFilter(v: unknown): v is Filter {
  return typeof v === "string" && (FILTERS as readonly string[]).includes(v);
}

const SEVERITY_RULE: Record<Issue["severity"], string> = { info: "border-info", warn: "border-warning", error: "border-destructive" };

export function RowsTable({ storeSlug, importId, counts, totalRows }: { storeSlug: string; importId: string; counts: RowCounts; totalRows: number }) {
  const base = `${storeApi(storeSlug)}/imports/${encodeURIComponent(importId)}/rows`;
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<RowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Statuses move while the worker runs; refetch a beat after the counts settle rather than on every tick.
  const countsKey = `${counts.pending}|${counts.processing}|${counts.done}|${counts.needs_review}|${counts.failed}|${totalRows}`;
  const firstCountsRef = useRef(true);
  useEffect(() => {
    if (firstCountsRef.current) {
      firstCountsRef.current = false;
      return;
    }
    const t = setTimeout(() => setRefreshKey((k) => k + 1), COUNTS_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [countsKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (filter !== "all") params.set("status", filter);
    if (debouncedQ) params.set("q", debouncedQ);
    api<RowsResponse>(`${base}?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : "Could not load rows");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [base, filter, debouncedQ, page, refreshKey]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const countFor = (f: Filter): number => (f === "all" ? totalRows : counts[f]);
  const toggle = (n: number): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <section aria-labelledby="rows-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rows-heading" className="font-display text-lg text-ink">
          Rows
        </h2>
        <p className="text-xs text-ink-muted" aria-live="polite">
          {loading && data ? "Refreshing…" : total > 0 ? `${formatNumber(total)} ${total === 1 ? "row" : "rows"}` : ""}
        </p>
      </div>
      <Tabs
        value={filter}
        onValueChange={(v) => {
          if (!isFilter(v)) return;
          setFilter(v);
          setPage(0);
          setExpanded(new Set());
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f} className="cursor-pointer gap-1.5 px-2">
                {f === "all" ? "All" : statusLabel(f)}
                <span className="num text-[11px] text-ink-muted">{formatNumber(countFor(f))}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-full sm:w-64">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search raw cells" aria-label="Search raw cells" className="bg-card pl-8" />
          </div>
        </div>
        <TabsContent value={filter} className="bg-card hairline" aria-busy={loading}>
          {error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-destructive">
              <span>{error}</span>
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setRefreshKey((k) => k + 1)}>
                Retry
              </Button>
            </div>
          ) : data === null ? (
            <div className="flex flex-col gap-3 px-4 py-4" aria-label="Loading rows">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : data.rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-muted">
              {totalRows === 0 ? "No rows yet; the sheet is still being parsed." : debouncedQ ? `No rows contain “${debouncedQ}”.` : "No rows with this status."}
            </p>
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 text-right text-[11px] font-medium uppercase tracking-wider text-ink-muted">#</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Status</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Product key</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Issues</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Why it failed</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Duplicate of</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Raw cells</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => {
                    const open = expanded.has(r.rowNumber);
                    const panelId = `row-${r.rowNumber}-raw`;
                    return (
                      <Fragment key={r.id}>
                        <TableRow>
                          <TableCell className="num text-right text-ink-muted">{r.rowNumber}</TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="num text-xs">{r.productKey ?? <span className="text-ink-muted">—</span>}</TableCell>
                          <TableCell className="max-w-[320px] whitespace-normal">
                            <IssuesCell issues={r.issues} />
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate text-xs text-destructive" title={r.failureReason ?? undefined}>
                            {r.failureReason ?? <span className="text-ink-muted">—</span>}
                          </TableCell>
                          <TableCell className="num text-xs text-ink-muted">{r.duplicateOfRow !== null ? `#${r.duplicateOfRow}` : "—"}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={panelId}
                              aria-label={`${open ? "Hide" : "Show"} raw cells for row ${r.rowNumber}`}
                              onClick={() => toggle(r.rowNumber)}
                              className="cursor-pointer rounded-sm p-1 text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                            >
                              {open ? <ChevronDownIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />}
                            </button>
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow id={panelId} className="bg-paper-deep/40 hover:bg-paper-deep/40">
                            <TableCell colSpan={7} className="px-4 py-3 whitespace-normal">
                              <RawCells row={r} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-ink-muted">
            <span className="num">{total === 0 ? "No rows" : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="cursor-pointer" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Previous page">
                <ChevronLeftIcon data-icon="inline-start" aria-hidden />
                Prev
              </Button>
              <span className="num px-2">
                Page {page + 1} of {pages}
              </span>
              <Button variant="outline" size="sm" className="cursor-pointer" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                Next
                <ChevronRightIcon data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

const SEVERITY_RANK: Record<Issue["severity"], number> = { error: 0, warn: 1, info: 2 };

function IssuesCell({ issues: unsorted }: { issues: Issue[] }) {
  // Most severe first so an "assumed cm" note never hides a missing price.
  const issues = [...unsorted].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const first = issues[0];
  if (!first) return <span className="text-xs text-ink-muted">—</span>;
  const more = issues.length - 1;
  return (
    <Tooltip>
      <TooltipTrigger
        className={cn("cursor-help border-l-[3px] pl-2 text-left text-xs leading-snug text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", SEVERITY_RULE[first.severity])}
      >
        <span className="line-clamp-2">{first.message}</span>
        {more > 0 ? <span className="num text-ink-muted"> +{more} more</span> : null}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-sm">
        <ul className="flex flex-col gap-1">
          {issues.map((i, idx) => (
            <li key={`${i.code}-${idx}`}>
              <span className="uppercase tracking-wide opacity-70">{i.severity}</span> {i.message}
              {i.field ? <span className="opacity-70"> · {i.field}</span> : null}
              {/* The code and edge-case id are the engineer's handle on the issue; muted mono inside the tooltip only. */}
              <span className="num block text-[10px] opacity-60">
                {i.code}
                {i.ec ? ` · EC-${i.ec}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function RawCells({ row }: { row: RowDto }) {
  const entries = Object.entries(row.raw);
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
        <span>
          Stage: <span className="text-ink">{statusLabel(row.stage)}</span>
        </span>
        {row.productId ? (
          <span>
            Product: <span className="num text-ink">{row.productId}</span>
          </span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-ink-muted">No cells.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-2">
              <dt className="num max-w-[45%] shrink-0 truncate text-ink-muted" title={k}>
                {k}
              </dt>
              <dd className="min-w-0 break-words whitespace-pre-wrap text-ink">{v === "" ? <span className="text-ink-muted">(empty)</span> : v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
