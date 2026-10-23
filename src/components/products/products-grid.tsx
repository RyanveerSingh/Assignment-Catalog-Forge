"use client";

import { type ColumnDef, flexRender, type Table as TableInstance } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { settle, stagger } from "@/components/ext/motion";
import { CARD, TH } from "@/components/ext/surfaces";
import { Skeleton } from "@/components/ui/skeleton";
import type { ColumnMeta } from "./products-columns";
import type { ProductFilters } from "./products-filters";
import type { ProductListItem } from "./types";

const SKELETON_WIDTHS = ["w-4", "w-12", "w-40", "w-24", "w-16", "w-14", "w-20", "w-20", "w-12"];

/**
 * The table itself, inside a raised card. A fixed layout (widths from the column defs, the title
 * taking the rest) keeps it exactly as wide as the card, so from xl up the header can stick under
 * the top bar; narrower screens scroll the card sideways instead. Rows fade in with a short stagger
 * on each page; shimmer rows stand in while the first page loads.
 */
export function ProductsGrid({ table, columns, filters, loading, onSort, onOpen }: { table: TableInstance<ProductListItem>; columns: ColumnDef<ProductListItem, unknown>[]; filters: ProductFilters; loading: boolean; onSort: (key: ProductFilters["sort"]) => void; onOpen: (id: string) => void }) {
  const reduce = useReducedMotion();
  const rows = table.getRowModel().rows;
  const showSkeleton = loading && rows.length === 0;
  return (
    <div className={cn(CARD, "relative max-xl:overflow-x-auto xl:overflow-visible", loading && rows.length > 0 && "opacity-60")} aria-busy={loading}>
      <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          {columns.map((c, j) => (
            <col key={c.id ?? j} style={{ width: c.size !== undefined && c.size !== 150 ? c.size : undefined }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, i) => {
                const meta = (h.column.columnDef.meta ?? {}) as ColumnMeta;
                const sorted = meta.sortKey && filters.sort === meta.sortKey ? filters.dir : null;
                const content = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      TH,
                      "h-11 border-b border-border bg-card/95 px-3 text-left whitespace-nowrap backdrop-blur xl:sticky xl:top-14 xl:z-10",
                      i === 0 && "rounded-tl-2xl pl-4",
                      i === hg.headers.length - 1 && "rounded-tr-2xl pr-4",
                      meta.align === "right" && "text-right",
                      meta.className,
                    )}
                  >
                    {meta.sortKey ? (
                      <button type="button" onClick={() => onSort(meta.sortKey as ProductFilters["sort"])} className={cn("inline-flex h-7 cursor-pointer items-center gap-1 rounded-md uppercase transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none", sorted && "text-brand")}>
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
          {showSkeleton
            ? Array.from({ length: Math.min(filters.limit, 8) }).map((_, i) => (
                <tr key={i} aria-hidden>
                  {columns.map((c, j) => (
                    <td key={c.id ?? j} className={cn("h-[60px] border-b border-border/70 px-3", j === 0 && "pl-4")}>
                      {j === 1 ? <Skeleton className="size-12 rounded-xl" /> : <Skeleton className={cn("h-3.5", SKELETON_WIDTHS[j] ?? "w-16")} />}
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={settle(reduce, 0.3, stagger(i, 0.03, 12))}
                  tabIndex={0}
                  aria-selected={row.getIsSelected()}
                  onClick={() => onOpen(row.original.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) onOpen(row.original.id);
                  }}
                  className={cn(
                    "group h-[60px] cursor-pointer transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&>td]:border-b [&>td]:border-border/70 last:[&>td]:border-0",
                    row.getIsSelected() ? "bg-brand-soft/50 hover:bg-brand-soft/60" : "hover:bg-surface-2/60",
                    row.original.deletedAt && "text-ink-muted",
                  )}
                >
                  {row.getVisibleCells().map((cell, j) => {
                    const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta;
                    return (
                      <td
                        key={cell.id}
                        onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}
                        className={cn("overflow-hidden px-3 py-1.5 align-middle whitespace-nowrap", j === 0 && "pl-4", j === columns.length - 1 && "pr-4", i === rows.length - 1 && j === 0 && "rounded-bl-2xl", i === rows.length - 1 && j === columns.length - 1 && "rounded-br-2xl", meta.align === "right" && "text-right", meta.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
