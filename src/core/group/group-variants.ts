/**
 * Step 4 of grouping: one variant per SKU. A SKU seen twice is merged or recorded as a conflict,
 * never resolved by guessing, and colour becomes an option only when the rows disagree on it.
 */
import type { CleanedRow, Issue, Money, VariantDraft } from "../types";
import { issue } from "../types";
import type { GroupOptions } from "./group";
import { canonicalJson, unique } from "./group-fields";

export function makeVariant(row: CleanedRow, sku: string, options: Record<string, string>, opts: GroupOptions): VariantDraft {
  const money = row.price?.money ?? null;
  return {
    sku,
    skuDisplay: row.skuDisplay ?? sku,
    synthetic: row.sku === null,
    options,
    priceCents: money ? money.cents : null,
    currency: money ? money.currency || opts.storeDefaultCurrency : null,
    compareAtCents: row.compareAtPrice?.money?.cents ?? null,
    weightGrams: row.weightGrams,
    dimensions: row.dimensions ? { ...row.dimensions } : null,
    images: [...row.images],
    quantity: row.quantity,
    barcode: row.barcode,
    sourceRows: [row.rowNumber],
    issues: [...row.issues],
  };
}

/** Same SKU again: merge when nothing differs, otherwise keep the first row and record the conflict (EC-C4). */
export function reconcile(variant: VariantDraft, first: CleanedRow, row: CleanedRow, options: Record<string, string>, conflicts: Issue[]): void {
  const diffs: string[] = [];
  const fields: string[] = [];
  if (!sameMoney(first.price?.money ?? null, row.price?.money ?? null)) {
    fields.push("price");
    diffs.push(`price ${formatMoney(first.price?.money ?? null)} (row ${first.rowNumber}) vs ${formatMoney(row.price?.money ?? null)} (row ${row.rowNumber})`);
  }
  if ((first.title ?? "") !== (row.title ?? "")) {
    fields.push("title");
    diffs.push(`title "${first.title ?? ""}" (row ${first.rowNumber}) vs "${row.title ?? ""}" (row ${row.rowNumber})`);
  }
  if (canonicalJson(variant.options) !== canonicalJson(options)) {
    fields.push("options");
    diffs.push(`options ${canonicalJson(variant.options)} (row ${first.rowNumber}) vs ${canonicalJson(options)} (row ${row.rowNumber})`);
  }
  variant.sourceRows.push(row.rowNumber);
  variant.issues.push(...row.issues);
  if (diffs.length === 0) return;
  const conflict = issue("sku.conflict", "error", `SKU ${variant.sku} appears in rows ${first.rowNumber} and ${row.rowNumber} with a different ${fields.join(", ")}: ${diffs.join("; ")}`, {
    field: fields[0],
    row: row.rowNumber,
    value: fields[0] === "price" ? formatMoney(row.price?.money ?? null) : fields[0] === "title" ? (row.title ?? "") : canonicalJson(options),
    ec: "C4",
  });
  variant.issues.push(conflict);
  conflicts.push(conflict);
}

function sameMoney(a: Money | null, b: Money | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cents === b.cents && a.currency === b.currency;
}

function formatMoney(m: Money | null): string {
  return m ? `${(m.cents / 100).toFixed(2)} ${m.currency}` : "none";
}

/** Colour is a product attribute when every row agrees; otherwise it was really an option (EC-C5). */
export function resolveColor(rows: CleanedRow[], entries: Array<{ variant: VariantDraft; row: CleanedRow }>): string | null {
  const colors = unique(rows.map((r) => r.color).filter((c): c is string => c !== null && c !== ""));
  if (colors.length === 1) return colors[0];
  if (colors.length > 1) {
    for (const { variant, row } of entries) {
      if (row.color && variant.options.color === undefined) variant.options = { ...variant.options, color: row.color };
    }
  }
  return null;
}

export function flagDuplicateOptions(variants: VariantDraft[], issues: Issue[]): void {
  const byOptions = new Map<string, string[]>();
  for (const v of variants) {
    const key = canonicalJson(v.options);
    byOptions.set(key, [...(byOptions.get(key) ?? []), v.sku]);
  }
  for (const [options, skus] of byOptions) {
    if (skus.length < 2) continue;
    issues.push(
      issue("variant.duplicate_options", "warn", `SKUs ${skus.join(", ")} have identical options ${options}; the sheet does not say how they differ`, {
        field: "options",
        value: options,
        ec: "C5",
      }),
    );
  }
}
