"use client";

import { formatCents } from "@/lib/format";
import { IssueList } from "./source-rows";
import type { VariantRow } from "./types";

function formatDims(d: VariantRow["dimensions"]): string {
  if (!d) return "—";
  const parts: string[] = [];
  const lwh = [d.lengthCm, d.widthCm, d.heightCm].filter((n): n is number => n !== undefined);
  if (lwh.length) parts.push(`${lwh.join(" × ")} cm`);
  if (d.diameterCm !== undefined) parts.push(`Ø ${d.diameterCm} cm`);
  return parts.length ? parts.join(", ") : "—";
}

/** Deterministic variant facts (never AI-written): SKU, options, price, weight, dimensions, with per-variant issues. */
export function VariantTable({ variants }: { variants: VariantRow[] }) {
  if (variants.length === 0) return <p className="text-xs text-ink-muted">No variants.</p>;
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="border-b border-border bg-paper-deep/50 text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="px-2 py-1 font-medium">SKU</th>
            <th className="px-2 py-1 font-medium">Options</th>
            <th className="px-2 py-1 text-right font-medium">Price</th>
            <th className="px-2 py-1 text-right font-medium">Weight</th>
            <th className="px-2 py-1 font-medium">Dims</th>
            <th className="px-2 py-1 text-right font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const opts = Object.entries(v.options);
            return (
              <tr key={v.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-2 py-1">
                  <span className="num text-ink">{v.skuDisplay}</span>
                  {v.synthetic ? <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-muted">generated</span> : null}
                  {v.issues.length > 0 ? (
                    <div className="mt-1">
                      <IssueList issues={v.issues} />
                    </div>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-ink">{opts.length ? opts.map(([k, val]) => `${k}: ${val}`).join(" · ") : "—"}</td>
                <td className="px-2 py-1 text-right num text-ink">
                  {formatCents(v.priceCents, v.currency)}
                  {v.compareAtCents !== null ? <div className="text-[11px] text-ink-muted line-through">{formatCents(v.compareAtCents, v.currency)}</div> : null}
                </td>
                <td className="px-2 py-1 text-right num text-ink">{v.weightGrams !== null ? `${v.weightGrams} g` : "—"}</td>
                <td className="px-2 py-1 num text-ink">{formatDims(v.dimensions)}</td>
                <td className="px-2 py-1 text-right num text-ink">{v.quantity ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
