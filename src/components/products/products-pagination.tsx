"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import { PAGE_SIZES, type ProductFilters } from "./products-filters";

/** Rows-per-page and the page stepper under the table. */
export function ProductsPagination({ filters, total, loading, onChange }: { filters: ProductFilters; total: number; loading: boolean; onChange: (patch: Partial<ProductFilters>) => void }) {
  const pageIndex = Math.floor(filters.offset / filters.limit);
  const pageCount = Math.max(1, Math.ceil(total / filters.limit));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-ink-muted">
      <div className="flex items-center gap-2">
        <Label htmlFor="page-size" className="text-xs font-normal">
          Rows
        </Label>
        <Select value={String(filters.limit)} onValueChange={(v) => v && onChange({ limit: Number(v) })}>
          <SelectTrigger id="page-size" size="sm" aria-label="Rows per page" className="num h-9 cursor-pointer rounded-full bg-card px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)} className="num rounded-lg">
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
        <Button type="button" variant="outline" size="icon-lg" disabled={pageIndex === 0 || loading} onClick={() => onChange({ offset: Math.max(0, filters.offset - filters.limit) })} aria-label="Previous page" className="cursor-pointer rounded-full">
          <ChevronLeftIcon />
        </Button>
        <span className="num">
          {pageIndex + 1} / {pageCount}
        </span>
        <Button type="button" variant="outline" size="icon-lg" disabled={pageIndex + 1 >= pageCount || loading} onClick={() => onChange({ offset: filters.offset + filters.limit })} aria-label="Next page" className="cursor-pointer rounded-full">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
