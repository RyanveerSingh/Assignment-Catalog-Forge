"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails come from our own blob route */
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "cn";
import { ImageIcon, SparklesIcon } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ext/chip";
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
  const all: Array<{ n: number; label: string; tone: ChipTone }> = [
    { n: t.fresh, label: "fresh", tone: "success" },
    { n: t.outdated, label: "outdated", tone: "warning" },
    { n: t.failed, label: "failed", tone: "danger" },
    { n: t.pending, label: "pending", tone: "neutral" },
  ];
  const chips = all.filter((c) => c.n > 0);
  if (chips.length === 0) return <span className="text-ink-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <Chip key={c.label} tone={c.tone} className="h-5 px-2 text-[10px]" title={`${c.n} ${c.label}`}>
          <span className="num">{c.n}</span> {c.label}
        </Chip>
      ))}
    </span>
  );
}

export function buildColumns(storeSlug: string): ColumnDef<ProductListItem, unknown>[] {
  return [
    {
      id: "select",
      size: 36,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows on this page"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
          className="cursor-pointer rounded-[5px]"
        />
      ),
      cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.title ?? row.original.productKey}`} checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(checked)} className="cursor-pointer rounded-[5px]" />,
    },
    {
      id: "thumb",
      size: 60,
      header: () => <span className="sr-only">Photo</span>,
      // The frame clips the zoom, so a hovered row's photo swells inside its 48 px square and nothing around it moves.
      cell: ({ row }) =>
        row.original.thumbBlobId ? (
          <span className="block size-12 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
            <img src={imageUrl(storeSlug, row.original.thumbBlobId)} alt="" width={48} height={48} loading="lazy" className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-110" />
          </span>
        ) : (
          <span className="flex size-12 items-center justify-center rounded-xl border border-dashed border-line-strong text-ink-muted" aria-label="No photo">
            <ImageIcon className="size-4" />
          </span>
        ),
    },
    {
      id: "title",
      meta: { sortKey: "title" } satisfies ColumnMeta,
      header: "Title",
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("truncate text-[13.5px] font-medium text-ink", !row.original.title && "font-normal italic text-ink-muted")}>{row.original.title ?? "Untitled"}</span>
          <span className="truncate text-[11px] text-ink-muted">
            <span className="num">{row.original.handle}</span> · {row.original.variantCount} {row.original.variantCount === 1 ? "variant" : "variants"}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      size: 172,
      meta: { sortKey: "status" } satisfies ColumnMeta,
      header: "Status",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="inline-flex items-center gap-1.5">
              <StatusBadge status={p.status} />
              {p.published ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success" title="Live on the storefront">
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />
                  live
                </span>
              ) : null}
            </span>
            {p.sourceChangedAt || p.missingFromImportId || p.deletedAt ? (
              <span className="flex flex-wrap gap-1">
                {p.sourceChangedAt ? (
                  <Chip tone="warning" className="h-5 px-2 text-[10px]">
                    source changed
                  </Chip>
                ) : null}
                {p.missingFromImportId ? (
                  <Chip tone="danger" className="h-5 px-2 text-[10px]">
                    missing from latest upload
                  </Chip>
                ) : null}
                {p.deletedAt ? (
                  <Chip tone="neutral" className="h-5 px-2 text-[10px]">
                    deleted
                  </Chip>
                ) : null}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "confidence",
      size: 118,
      meta: { sortKey: "confidence" } satisfies ColumnMeta,
      header: "Confidence",
      cell: ({ row }) => {
        const p = row.original;
        const entries = CONFIDENCE_FIELDS.map(([k, label]) => [label, p.confidence[k]] as const).filter((e): e is readonly [string, number] => typeof e[1] === "number");
        return (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex cursor-default rounded-md" tabIndex={0} />}>
              <ConfidenceChip score={p.minConfidence} bar />
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
      id: "price",
      size: 104,
      meta: { sortKey: "price", align: "right" } satisfies ColumnMeta,
      header: "From",
      cell: ({ row }) => <span className="num font-medium text-ink">{formatCents(row.original.priceFromCents, row.original.currency)}</span>,
    },
    {
      id: "translations",
      size: 126,
      meta: { className: "whitespace-normal" } satisfies ColumnMeta,
      header: "Translations",
      cell: ({ row }) => <TranslationChips t={row.original.translations} />,
    },
    {
      // 150 is TanStack's default and the grid treats it as "no width", so the model column asks for one more pixel.
      id: "ai",
      size: 151,
      header: "Written by",
      cell: ({ row }) => {
        const { aiModel, aiTier, aiCostMicros } = row.original;
        if (!aiModel && !aiTier) return <span className="text-ink-muted">—</span>;
        // The raw model id stays one hover away for anyone comparing runs; the cost sits under the model so the row stays narrow.
        const raw = [aiModel, aiTier ? `${aiTier} tier` : null].filter((s) => s !== null).join(" · ");
        return (
          <span className="flex flex-col items-start gap-0.5" title={raw}>
            <Chip tone="brand" icon={SparklesIcon}>
              {aiModel ? modelLabel(aiModel) : "—"}
            </Chip>
            <span className="truncate pl-1 text-[10px] text-ink-muted">
              {aiTier ? tierLabel(aiTier) : "—"} · <span className="num">{formatMicrosUsd(aiCostMicros)}</span>
            </span>
          </span>
        );
      },
    },
    {
      id: "updatedAt",
      size: 96,
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
