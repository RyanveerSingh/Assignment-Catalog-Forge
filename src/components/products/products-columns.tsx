"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from our own blob route */
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "cn";
import { ImageIcon } from "lucide-react";
import { ConfidenceChip } from "@/components/ext/confidence-chip";
import { StatusBadge } from "@/components/ext/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCents, formatMicrosUsd, formatRelative, modelLabel, tierLabel } from "@/lib/format";
import { imageUrl, type ProductListItem, type ProductSortKey } from "./types";

export interface ColumnMeta {
  sortKey?: ProductSortKey;
  align?: "right";
  className?: string;
}

const CONFIDENCE_FIELDS: ReadonlyArray<[string, string]> = [
  ["title", "Title"],
  ["description", "Description"],
  ["category", "Category"],
  ["tags", "Tags"],
  ["attributes", "Attributes"],
];

function TranslationChips({ t }: { t: ProductListItem["translations"] }) {
  const chips: Array<{ n: number; label: string; className: string }> = [
    { n: t.fresh, label: "fresh", className: "bg-success-soft text-success ring-success/25" },
    { n: t.outdated, label: "outdated", className: "bg-warning-soft text-warning ring-warning/25" },
    { n: t.failed, label: "failed", className: "bg-destructive/10 text-destructive ring-destructive/25" },
    { n: t.pending, label: "pending", className: "bg-muted text-ink-muted ring-border" },
  ].filter((c) => c.n > 0);
  if (chips.length === 0) return <span className="text-ink-muted">—</span>;
  return (
    <span className="inline-flex gap-1">
      {chips.map((c) => (
        <span key={c.label} className={cn("inline-flex h-4 items-center gap-0.5 px-1 text-[10px] ring-1 ring-inset", c.className)} title={`${c.n} ${c.label}`}>
          <span className="num">{c.n}</span>
          <span className="uppercase tracking-wide">{c.label}</span>
        </span>
      ))}
    </span>
  );
}

export function buildColumns(storeSlug: string): ColumnDef<ProductListItem, unknown>[] {
  return [
    {
      id: "select",
      size: 32,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
          className="cursor-pointer"
        />
      ),
      cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.title ?? row.original.productKey}`} checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked)} className="cursor-pointer" />,
    },
    {
      id: "thumb",
      size: 40,
      header: () => <span className="sr-only">Photo</span>,
      cell: ({ row }) =>
        row.original.thumbBlobId ? (
          <img src={imageUrl(storeSlug, row.original.thumbBlobId)} alt="" width={32} height={32} loading="lazy" className="size-8 border border-border object-cover" />
        ) : (
          <span className="flex size-8 items-center justify-center border border-dashed border-border text-ink-muted" aria-label="No photo">
            <ImageIcon className="size-3.5" />
          </span>
        ),
    },
    {
      id: "title",
      meta: { sortKey: "title", className: "min-w-[220px]" } satisfies ColumnMeta,
      header: "Title",
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className={cn("truncate text-[13px] text-ink", !row.original.title && "italic text-ink-muted")}>{row.original.title ?? "Untitled"}</span>
          <span className="truncate num text-[11px] text-ink-muted">{row.original.handle}</span>
        </div>
      ),
    },
    {
      id: "status",
      meta: { sortKey: "status" } satisfies ColumnMeta,
      header: "Status",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center gap-1.5">
              <StatusBadge status={p.status} />
              {p.published ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-success" title="Live on the storefront">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  live
                </span>
              ) : null}
            </span>
            {p.sourceChangedAt || p.missingFromImportId || p.deletedAt ? (
              <span className="flex flex-wrap gap-1">
                {p.sourceChangedAt ? <span className="bg-warning-soft px-1 text-[10px] uppercase tracking-wide text-warning">source changed</span> : null}
                {p.missingFromImportId ? <span className="bg-destructive/10 px-1 text-[10px] uppercase tracking-wide text-destructive">missing from latest upload</span> : null}
                {p.deletedAt ? <span className="bg-muted px-1 text-[10px] uppercase tracking-wide text-ink-muted">deleted</span> : null}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "confidence",
      meta: { sortKey: "confidence" } satisfies ColumnMeta,
      header: "Confidence",
      cell: ({ row }) => {
        const p = row.original;
        const entries = CONFIDENCE_FIELDS.map(([k, label]) => [label, p.confidence[k]] as const).filter((e): e is readonly [string, number] => typeof e[1] === "number");
        return (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-default" tabIndex={0} />}>
              <ConfidenceChip score={p.minConfidence} />
            </TooltipTrigger>
            <TooltipContent side="right">
              {entries.length === 0 ? (
                "No confidence scores yet"
              ) : (
                <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                  {entries.map(([label, score]) => (
                    <div key={label} className="contents">
                      <dt>{label}</dt>
                      <dd className="num text-right">{score}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      id: "variants",
      meta: { align: "right" } satisfies ColumnMeta,
      header: "Variants",
      cell: ({ row }) => <span className="num">{row.original.variantCount}</span>,
    },
    {
      id: "price",
      meta: { sortKey: "price", align: "right" } satisfies ColumnMeta,
      header: "From",
      cell: ({ row }) => <span className="num">{formatCents(row.original.priceFromCents, row.original.currency)}</span>,
    },
    {
      id: "translations",
      header: "Translations",
      cell: ({ row }) => <TranslationChips t={row.original.translations} />,
    },
    {
      id: "ai",
      header: "Written by",
      cell: ({ row }) => {
        const { aiModel, aiTier } = row.original;
        if (!aiModel && !aiTier) return <span className="text-ink-muted">—</span>;
        // The raw model id stays one hover away for anyone comparing runs.
        const raw = [aiModel, aiTier ? `${aiTier} tier` : null].filter((s) => s !== null).join(" · ");
        return (
          <span className="flex flex-col leading-tight" title={raw}>
            <span className="text-[12px] text-ink">{aiModel ? modelLabel(aiModel) : "—"}</span>
            {aiTier ? <span className="text-[10px] text-ink-muted">{tierLabel(aiTier)}</span> : null}
          </span>
        );
      },
    },
    {
      id: "cost",
      meta: { align: "right" } satisfies ColumnMeta,
      header: "Cost",
      cell: ({ row }) => <span className="num text-ink-muted">{formatMicrosUsd(row.original.aiCostMicros)}</span>,
    },
    {
      id: "updatedAt",
      meta: { sortKey: "updatedAt", align: "right" } satisfies ColumnMeta,
      header: "Updated",
      cell: ({ row }) => (
        <time dateTime={row.original.updatedAt} title={new Date(row.original.updatedAt).toLocaleString("en-GB")} className="num text-ink-muted">
          {formatRelative(row.original.updatedAt)}
        </time>
      ),
    },
  ];
}
