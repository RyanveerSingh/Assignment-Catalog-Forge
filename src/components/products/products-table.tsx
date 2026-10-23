"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getCoreRowModel, useReactTable, type RowSelectionState } from "@tanstack/react-table";
import { cn } from "cn";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { EmptyState } from "@/components/ext/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropIllustration } from "@/components/upload/drop-illustration";
import { api, storeApi } from "@/lib/client/api";
import { formatNumber } from "@/lib/format";
import { BulkBar } from "./bulk-bar";
import { buildColumns } from "./products-columns";
import { applyFilterPatch, countActiveFilters, DEFAULT_FILTERS, parseFilters, toApiQuery, toExportQuery, toSearchParams, type ProductFilters } from "./products-filters";
import { ProductsGrid } from "./products-grid";
import { ProductsPagination } from "./products-pagination";
import { ProductsToolbar } from "./products-toolbar";
import { ReviewDrawer } from "./review-drawer";
import type { BulkApproveResponse, BulkRerunResponse, ProductListItem, ProductListResponse, ProductStatusCounts, RerunSettings } from "./types";

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

export function ProductsTable({ storeSlug, initialImportId = "", onStatusCounts }: { storeSlug: string; initialImportId?: string; onStatusCounts?: (counts: ProductStatusCounts) => void }) {
  // Read through a ref so a parent re-rendering with a new callback never triggers a refetch.
  const onStatusCountsRef = useRef(onStatusCounts);
  onStatusCountsRef.current = onStatusCounts;
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
  // Adopt the URL's q only when someone else changed it (back button, Clear filters, the top-bar search), never our own push.
  useEffect(() => {
    if (filters.q === lastPushedQ.current) return;
    lastPushedQ.current = filters.q;
    setSearchText(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    api<ProductListResponse>(`${storeApi(storeSlug)}/products?${queryString}&withStatusCounts=true`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setItems(res.items);
        setTotal(res.total);
        if (res.categories) setCategories(res.categories);
        if (res.statusCounts) onStatusCountsRef.current?.(res.statusCounts);
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

  const noFilters = countActiveFilters(filters) === 0;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <ProductsToolbar filters={filters} searchText={searchText} onSearchChange={setSearchText} onChange={setFilters} onReset={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, dir: filters.dir, limit: filters.limit })} categories={categories} />

        <div className="flex min-h-9 flex-wrap items-center gap-3 px-1">
          <span className="text-xs text-ink-muted" aria-live="polite">
            {loading && items.length === 0 ? "Loading…" : `${formatNumber(total)} ${total === 1 ? "product" : "products"}`}
            {selected.length > 0 ? <span className="num text-brand"> · {selected.length} selected</span> : null}
          </span>
          {bulkNotice ? (
            <span role="status" className="rounded-full bg-success-soft px-3 py-1 text-xs text-success">
              {bulkNotice}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="outline" size="icon-lg" onClick={refresh} aria-label="Refresh" className="cursor-pointer rounded-full">
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" className="h-9 cursor-pointer rounded-full" />}>
                <DownloadIcon data-icon="inline-start" />
                Export
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
                {EXPORTS.map((e) => (
                  <DropdownMenuItem key={e.format} render={<a href={`${storeApi(storeSlug)}/products/export?${toExportQuery(filters, e.format)}`} download />} className="cursor-pointer rounded-lg">
                    {e.label}
                    <span className="ml-auto text-[10px] text-ink-muted">{filters.status.length || filters.importId ? "filtered" : "all"}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl bg-destructive/5 p-4 text-sm ring-1 ring-destructive/20">
            <p className="text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={refresh} className="cursor-pointer">
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
          </div>
        ) : !loading && items.length === 0 ? (
          <EmptyState
            title={noFilters ? "No products yet" : "No products match"}
            description={noFilters ? "Upload a sheet and the pipeline will fill this table." : "Try widening or clearing the filters."}
            art={noFilters ? <DropIllustration active={false} className="w-56 opacity-90" /> : undefined}
            action={
              noFilters ? undefined : (
                <Button type="button" variant="outline" size="sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })} className="cursor-pointer rounded-full">
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <ProductsGrid table={table} columns={columns} filters={filters} loading={loading} onSort={toggleSort} onOpen={setOpenId} />
        )}

        <ProductsPagination filters={filters} total={total} loading={loading} onChange={setFilters} />
      </div>

      <BulkBar count={selected.length} needsReview={selectedNeedsReview} includeNeedsReview={includeNeedsReview} busy={bulkBusy} onIncludeChange={setIncludeNeedsReview} onApprove={() => void bulkApprove()} onRerun={bulkRerun} onClear={() => setRowSelection({})} />
      <ReviewDrawer storeSlug={storeSlug} productId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </TooltipProvider>
  );
}
