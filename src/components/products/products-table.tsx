"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type RowSelectionState } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { settle } from "@/components/ext/motion";
import { EmptyState } from "@/components/ext/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, storeApi } from "@/lib/client/api";
import { formatNumber } from "@/lib/format";
import { buildColumns, type ColumnMeta } from "./products-columns";
import { applyFilterPatch, countActiveFilters, DEFAULT_FILTERS, PAGE_SIZES, parseFilters, toApiQuery, toExportQuery, toSearchParams, type ProductFilters } from "./products-filters";
import { BulkRerunPopover, ProductsToolbar } from "./products-toolbar";
import { ReviewDrawer } from "./review-drawer";
import type { BulkApproveResponse, BulkRerunResponse, ProductListItem, ProductListResponse, RerunSettings } from "./types";

const SEARCH_DEBOUNCE_MS = 300;
const EXPORTS = [
  { format: "csv", label: "CSV" },
  { format: "json", label: "JSON" },
  { format: "shopify", label: "Shopify CSV" },
] as const;

type BulkAction = "approve" | "rerun";

/** "2 skipped: no source rows", or with several causes "3 skipped: no source rows (2), deleted (1)". */
function skippedSummary(skipped: ReadonlyArray<{ reason: string }>): string {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const reasons = [...counts.entries()].map(([reason, n]) => (counts.size > 1 ? `${reason} (${n})` : reason)).join(", ");
  return `${skipped.length} skipped: ${reasons}`;
}

export function ProductsTable({ storeSlug, initialImportId = "" }: { storeSlug: string; initialImportId?: string }) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString()), initialImportId), [searchParams, initialImportId]);
  const queryString = useMemo(() => toApiQuery(filters, true), [filters]);

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Array<{ category: string; n: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState(filters.q);
  const [includeNeedsReview, setIncludeNeedsReview] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const lastPushedQ = useRef(filters.q);

  // Always patch the latest URL state: a debounced search must not undo a chip toggled during the delay.
  const setFilters = useCallback(
    (patch: Partial<ProductFilters>) => {
      const next = applyFilterPatch(filtersRef.current, patch);
      const qs = toSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Debounced search: the input is instant, the URL (and the request) follows 300 ms later.
  useEffect(() => {
    if (searchText === filters.q) return;
    const t = setTimeout(() => {
      lastPushedQ.current = searchText;
      setFilters({ q: searchText });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText, filters.q, setFilters]);
  // Adopt the URL's q only when someone else changed it (back button, Clear filters), never our own push.
  useEffect(() => {
    if (filters.q === lastPushedQ.current) return;
    lastPushedQ.current = filters.q;
    setSearchText(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    api<ProductListResponse>(`${storeApi(storeSlug)}/products?${queryString}`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setItems(res.items);
        setTotal(res.total);
        if (res.categories) setCategories(res.categories);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Could not load products");
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [storeSlug, queryString, reloadTick]);

  // Selection only ever refers to the rows on screen; a new query means a new page of rows.
  useEffect(() => {
    setRowSelection({});
    setBulkNotice(null);
  }, [queryString]);

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);
  const columns = useMemo(() => buildColumns(storeSlug), [storeSlug]);
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    state: { rowSelection, sorting: [{ id: filters.sort, desc: filters.dir === "desc" }] },
    onRowSelectionChange: setRowSelection,
  });

  const selected = useMemo(() => items.filter((i) => rowSelection[i.id]), [items, rowSelection]);
  const selectedNeedsReview = selected.filter((i) => i.status === "needs_review").length;
  const pageIndex = Math.floor(filters.offset / filters.limit);
  const pageCount = Math.max(1, Math.ceil(total / filters.limit));

  const toggleSort = (key: ProductFilters["sort"]) => {
    if (filters.sort === key) setFilters({ dir: filters.dir === "asc" ? "desc" : "asc" });
    else setFilters({ sort: key, dir: key === "title" || key === "status" ? "asc" : "desc" });
  };

  const bulkApprove = async () => {
    setBulkBusy("approve");
    setBulkNotice(null);
    try {
      const res = await api<BulkApproveResponse>(`${storeApi(storeSlug)}/products`, { method: "POST", json: { action: "approve", ids: selected.map((s) => s.id), includeNeedsReview } });
      const reasons = new Map<string, number>();
      for (const s of res.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
      const skippedText = res.skipped.length ? ` Skipped ${res.skipped.length}: ${[...reasons.entries()].map(([r, n]) => `${r} (${n})`).join(", ")}.` : "";
      setBulkNotice(`Approved ${res.approved.length}.${skippedText}`);
      setRowSelection({});
      setIncludeNeedsReview(false);
      refresh();
    } catch (err) {
      setBulkNotice(err instanceof Error ? err.message : "Bulk approve failed");
    } finally {
      setBulkBusy(null);
    }
  };

  // One job per selected product (EC-F10); the refresh shows them as "pending AI" until the worker answers.
  const bulkRerun = async (settings: RerunSettings): Promise<boolean> => {
    setBulkBusy("rerun");
    setBulkNotice(null);
    try {
      const res = await api<BulkRerunResponse>(`${storeApi(storeSlug)}/products`, { method: "POST", json: { action: "rerun", ids: selected.map((s) => s.id), ...settings } });
      const n = res.queued.length;
      setBulkNotice(`Queued ${n} ${n === 1 ? "re-run" : "re-runs"}${res.skipped.length ? ` (${skippedSummary(res.skipped)})` : ""}.`);
      setRowSelection({});
      refresh();
      return true;
    } catch (err) {
      setBulkNotice(err instanceof Error ? err.message : "Bulk re-run failed");
      return false;
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        <ProductsToolbar filters={filters} searchText={searchText} onSearchChange={setSearchText} onChange={setFilters} onReset={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir, limit: filters.limit })} categories={categories} />

        <div className="relative flex min-h-9 flex-wrap items-center gap-2">
          {/* The bar rises into the slot the count occupied; popLayout keeps the one leaving out of the flow so the row never jumps. */}
          <AnimatePresence initial={false} mode="popLayout">
            {selected.length > 0 ? (
              <motion.div
                key="bulk"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8, transition: settle(reduce, 0.15) }}
                transition={settle(reduce, 0.22)}
                className="flex flex-wrap items-center gap-2 border border-brand/30 bg-brand-soft/50 px-2 py-1 text-xs"
                role="region"
                aria-label="Bulk actions"
              >
                <span className="num font-medium text-ink">{selected.length} selected</span>
                {selectedNeedsReview > 0 ? (
                  <Label className="flex cursor-pointer items-center gap-1.5 text-xs font-normal text-ink">
                    <Checkbox checked={includeNeedsReview} onCheckedChange={(c) => setIncludeNeedsReview(c)} className="cursor-pointer" />
                    Include {selectedNeedsReview} that {selectedNeedsReview === 1 ? "needs" : "need"} review?
                  </Label>
                ) : null}
                <Button type="button" size="xs" disabled={bulkBusy !== null} onClick={() => void bulkApprove()} className="cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90">
                  {bulkBusy === "approve" ? "Approving…" : `Approve ${selected.length - (includeNeedsReview ? 0 : selectedNeedsReview)}`}
                </Button>
                <BulkRerunPopover count={selected.length} busy={bulkBusy === "rerun"} disabled={bulkBusy !== null} onQueue={bulkRerun} />
                <Button type="button" variant="ghost" size="xs" disabled={bulkBusy !== null} onClick={() => setRowSelection({})} className="cursor-pointer">
                  Clear
                </Button>
              </motion.div>
            ) : (
              <motion.span key="count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: settle(reduce, 0.1) }} transition={settle(reduce, 0.2, 0.05)} className="text-xs text-ink-muted" aria-live="polite">
                {loading && items.length === 0 ? "Loading…" : `${formatNumber(total)} ${total === 1 ? "product" : "products"}`}
              </motion.span>
            )}
          </AnimatePresence>
          {bulkNotice ? (
            <span role="status" className="text-xs text-ink">
              {bulkNotice}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh" className="cursor-pointer">
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="cursor-pointer" />}>
                <DownloadIcon data-icon="inline-start" />
                Export
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {EXPORTS.map((e) => (
                  <DropdownMenuItem key={e.format} render={<a href={`${storeApi(storeSlug)}/products/export?${toExportQuery(filters, e.format)}`} download />} className="cursor-pointer">
                    {e.label}
                    <span className="ml-auto text-[10px] text-ink-muted">{filters.status.length || filters.importId ? "filtered" : "all"}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-start gap-2 border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={refresh} className="cursor-pointer">
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <EmptyState
            title={countActiveFilters(filters) === 0 ? "No products yet" : "No products match"}
            description={countActiveFilters(filters) === 0 ? "Upload a sheet and the pipeline will fill this table." : "Try widening or clearing the filters."}
            action={
              countActiveFilters(filters) > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="cursor-pointer">
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn("overflow-x-auto border border-border bg-card", loading && items.length > 0 && "opacity-60")} aria-busy={loading}>
            <table className="w-full min-w-[960px] border-collapse text-xs">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-paper-deep/50">
                    {hg.headers.map((h) => {
                      const meta = (h.column.columnDef.meta ?? {}) as ColumnMeta;
                      const sorted = meta.sortKey && filters.sort === meta.sortKey ? filters.dir : null;
                      const content = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                      return (
                        <th key={h.id} scope="col" aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined} style={{ width: h.column.columnDef.size !== 150 ? h.column.columnDef.size : undefined }} className={cn("h-9 px-2 text-left text-[11px] font-medium uppercase tracking-wide whitespace-nowrap text-ink-muted", meta.align === "right" && "text-right", meta.className)}>
                          {meta.sortKey ? (
                            <button type="button" onClick={() => toggleSort(meta.sortKey as ProductFilters["sort"])} className={cn("inline-flex cursor-pointer items-center gap-1 rounded-sm uppercase hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", sorted && "text-ink")}>
                              {content}
                              {sorted === "asc" ? <ArrowUpIcon className="size-3" /> : sorted === "desc" ? <ArrowDownIcon className="size-3" /> : null}
                            </button>
                          ) : (
                            content
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {loading && items.length === 0
                  ? Array.from({ length: Math.min(filters.limit, 8) }).map((_, i) => (
                      <tr key={i} className="h-9 border-b border-border/60">
                        {columns.map((c, j) => (
                          <td key={c.id ?? j} className="px-2">
                            <Skeleton className="h-3.5 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        aria-selected={row.getIsSelected()}
                        onClick={() => setOpenId(row.original.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) setOpenId(row.original.id);
                        }}
                        className={cn("h-9 cursor-pointer border-b border-border/60 transition-colors duration-100 last:border-0 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand", row.getIsSelected() && "bg-brand-soft/40 ring-1 ring-inset ring-brand hover:bg-brand-soft/50", row.original.deletedAt && "text-ink-muted")}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta;
                          return (
                            <td key={cell.id} onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined} className={cn("px-2 py-1 align-middle whitespace-nowrap", meta.align === "right" && "text-right", meta.className)}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-xs font-normal">
              Rows
            </Label>
            <Select value={String(filters.limit)} onValueChange={(v) => v && setFilters({ limit: Number(v) })}>
              <SelectTrigger id="page-size" size="sm" aria-label="Rows per page" className="cursor-pointer bg-card num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)} className="num">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="num" aria-live="polite">
              {total === 0 ? "0" : `${formatNumber(filters.offset + 1)}–${formatNumber(Math.min(total, filters.offset + filters.limit))}`} of {formatNumber(total)}
            </span>
            <Button type="button" variant="outline" size="icon-sm" disabled={pageIndex === 0 || loading} onClick={() => setFilters({ offset: Math.max(0, filters.offset - filters.limit) })} aria-label="Previous page" className="cursor-pointer">
              <ChevronLeftIcon />
            </Button>
            <span className="num">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button type="button" variant="outline" size="icon-sm" disabled={pageIndex + 1 >= pageCount || loading} onClick={() => setFilters({ offset: filters.offset + filters.limit })} aria-label="Next page" className="cursor-pointer">
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>

      <ReviewDrawer storeSlug={storeSlug} productId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </TooltipProvider>
  );
}
