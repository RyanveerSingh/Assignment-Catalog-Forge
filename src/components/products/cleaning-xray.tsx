"use client";

import { cn } from "cn";
import type { CleaningXrayEntry } from "@/core/clean/xray";
import type { Severity } from "@/core/types";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  sku: "SKU",
  parent_sku: "Parent SKU",
  title: "Title",
  description: "Description",
  category: "Category",
  brand: "Brand",
  price: "Price",
  compare_at_price: "Compare-at price",
  currency: "Currency",
  variant: "Variant",
  option_size: "Size option",
  option_color: "Colour option",
  option_material: "Material option",
  color: "Colour",
  size: "Size",
  material: "Material",
  quantity: "Quantity",
  weight: "Weight",
  length: "Length",
  width: "Width",
  height: "Height",
  diameter: "Diameter",
  dimensions: "Dimensions",
  notes: "Notes",
  care: "Care",
  barcode: "Barcode",
  language: "Language",
  row: "Row",
};

const NOTE_CLASS: Readonly<Record<Severity, string>> = { info: "text-ink-muted", warn: "text-warning", error: "text-destructive" };

/**
 * The cleaning X-ray for one source row: the raw cell on the left exactly as uploaded (mono), what the
 * deterministic cleaner made of it on the right, and the issue that explains the change. The model never saw
 * the left column; everything on the right was decided by code before the AI stage.
 */
export function CleaningXray({ entries }: { entries: CleaningXrayEntry[] }) {
  return (
    <div className="border-t border-border bg-paper/60">
      <div className="flex items-baseline gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        Cleaning
        <span className="num text-[11px] normal-case tracking-normal">{entries.length}</span>
        <span className="font-normal normal-case tracking-normal">raw → cleaned, before the model saw anything</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-2 pb-1.5 text-[11px] text-ink-muted">Nothing to clean: this row passed through as written.</p>
      ) : (
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="border-t border-border/60 bg-paper-deep/40 text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th scope="col" className="w-[19%] px-2 py-0.5 font-medium">
                Field
              </th>
              <th scope="col" className="w-[40%] px-2 py-0.5 font-medium">
                Raw
              </th>
              <th scope="col" className="px-2 py-0.5 font-medium">
                Cleaned
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.field}-${e.column ?? ""}-${i}`} className="border-t border-border/60 align-top">
                <th scope="row" className="px-2 py-1 text-left font-medium text-ink-muted">
                  {FIELD_LABELS[e.field] ?? e.field}
                  {e.column && e.column !== e.field ? (
                    <span className="block truncate text-[10px] font-normal" title={e.column}>
                      {e.column}
                    </span>
                  ) : null}
                </th>
                <td className="px-2 py-1">
                  <div className="max-h-28 overflow-y-auto font-mono text-[11px] leading-snug break-words whitespace-pre-wrap text-ink">{e.raw}</div>
                </td>
                <td className="px-2 py-1">
                  <div className="max-h-28 overflow-y-auto break-words whitespace-pre-wrap text-ink">{e.cleaned}</div>
                  {e.note ? (
                    <p className={cn("mt-0.5 text-[11px] leading-snug", NOTE_CLASS[e.severity ?? "info"])}>
                      {e.severity && e.severity !== "info" ? <span className="font-medium uppercase tracking-wide">{e.severity} · </span> : null}
                      {e.note}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
