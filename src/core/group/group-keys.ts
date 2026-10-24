/**
 * Steps 1–3 of grouping: drop exact duplicate rows, forward-fill Shopify-style children from their
 * parent row, then give every row a deterministic product key.
 */
import { shopifyOption, slugify } from "../clean/row";
import type { CleanedRow, DuplicateRow, ProductKeySource } from "../types";
import { issue } from "../types";
import { deriveSkuStem, syntheticSku, titleKey } from "./key";
import { stripOptionTokens } from "./options";

export interface Keyed {
  row: CleanedRow;
  key: string;
  source: ProductKeySource;
}

export function dropDuplicates(rows: CleanedRow[]): { kept: CleanedRow[]; duplicateRows: DuplicateRow[] } {
  const firstByHash = new Map<string, number>();
  const kept: CleanedRow[] = [];
  const duplicateRows: DuplicateRow[] = [];
  for (const row of rows) {
    const hash = typeof row.rowHash === "string" ? row.rowHash : "";
    const first = hash === "" ? undefined : firstByHash.get(hash);
    if (first !== undefined) {
      duplicateRows.push({ row: row.rowNumber, of: first });
      continue;
    }
    if (hash !== "") firstByHash.set(hash, row.rowNumber);
    kept.push(row);
  }
  return { kept, duplicateRows };
}

/** Shopify-style children (blank title, repeated handle) take the parent's product fields (EC-C7). */
export function forwardFill(rows: CleanedRow[]): CleanedRow[] {
  const byParentKey = new Map<string, CleanedRow>();
  // In a parent_sku layout the parent row carries no parent_sku itself; its own SKU is the children's key.
  const bySku = new Map<string, CleanedRow>();
  for (const r of rows) {
    if (!r.title) continue;
    if (r.parentKey && !byParentKey.has(r.parentKey.toLowerCase())) byParentKey.set(r.parentKey.toLowerCase(), r);
    if (r.sku && !bySku.has(r.sku.toLowerCase())) bySku.set(r.sku.toLowerCase(), r);
  }
  const out: CleanedRow[] = [];
  for (const row of rows) {
    let parent: CleanedRow | undefined;
    if (row.title === null) {
      if (row.parentKey) parent = byParentKey.get(row.parentKey.toLowerCase()) ?? bySku.get(row.parentKey.toLowerCase());
      else {
        const prev = out[out.length - 1];
        if (prev && prev.title && sameStem(prev.sku, row.sku)) parent = prev;
      }
    }
    out.push(parent && parent !== row ? inherit(row, parent) : row);
  }
  return out;
}

function sameStem(a: string | null, b: string | null): boolean {
  const sa = a ? deriveSkuStem(a) : null;
  const sb = b ? deriveSkuStem(b) : null;
  return sa !== null && sb !== null && sa.toLowerCase() === sb.toLowerCase();
}

/** Shopify children carry "option1" values whose names ("Size") only the parent row states. */
function nameOptions(child: CleanedRow, parent: CleanedRow): Record<string, string> {
  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(child.options)) {
    const n = /^option([1-3])$/.exec(key)?.[1];
    const name = n === undefined ? undefined : parent.attributes[`option${n}_name`];
    const pair: [string, string] | null = name === undefined ? [key, value] : shopifyOption(name, value);
    if (pair && options[pair[0]] === undefined) options[pair[0]] = pair[1];
  }
  return options;
}

function inherit(child: CleanedRow, parent: CleanedRow): CleanedRow {
  return {
    ...child,
    options: nameOptions(child, parent),
    title: parent.title,
    descriptionHtml: child.descriptionHtml ?? parent.descriptionHtml,
    descriptionText: child.descriptionText ?? parent.descriptionText,
    category: child.category ?? parent.category,
    brand: child.brand ?? parent.brand,
    tags: child.tags.length ? child.tags : [...parent.tags],
    notes: child.notes ?? parent.notes,
    care: child.care ?? parent.care,
    material: child.material ?? parent.material,
    color: child.color ?? parent.color,
    images: child.images.length ? child.images : [...parent.images],
    issues: [
      ...child.issues,
      issue("row.inherited_parent", "info", `Row ${child.rowNumber} has no title; product fields inherited from row ${parent.rowNumber}`, {
        row: child.rowNumber,
        ec: "C7",
      }),
    ],
  };
}

export function assignKeys(rows: CleanedRow[]): Keyed[] {
  const info = rows.map((row) => ({
    row,
    stem: row.sku ? deriveSkuStem(row.sku) : null,
    tkey: row.title ? titleKey(row.title) : "",
  }));
  // (b) a stem counts when at least two different SKUs share it AND their base titles agree: "ES-CP-001-01"
  // and "ES-CP-002-01" share the stem "ES-CP" but are "Espresso Cup Set No. 1" and "No. 2", two products.
  // Parent-keyed rows are already placed.
  const stemBucket = (i: (typeof info)[number]): string => `${i.stem?.toLowerCase() ?? ""}|${i.tkey}`;
  const stemSkus = new Map<string, Set<string>>();
  const titlesPerStem = new Map<string, Set<string>>();
  for (const i of info) {
    if (i.row.parentKey || !i.stem || !i.row.sku) continue;
    const bucket = stemBucket(i);
    const set = stemSkus.get(bucket) ?? new Set<string>();
    set.add(i.row.sku.toUpperCase());
    stemSkus.set(bucket, set);
    const titles = titlesPerStem.get(i.stem.toLowerCase()) ?? new Set<string>();
    titles.add(i.tkey);
    titlesPerStem.set(i.stem.toLowerCase(), titles);
  }
  const byStem = (i: (typeof info)[number]): boolean => !i.row.parentKey && i.stem !== null && (stemSkus.get(stemBucket(i))?.size ?? 0) >= 2;
  // The stem alone is the key when every row with that stem has the same base title; otherwise the
  // title is appended so two products never collapse into one key.
  const stemKey = (i: (typeof info)[number]): string => {
    const stem = i.stem ?? "";
    const titles = titlesPerStem.get(stem.toLowerCase());
    if (!titles || titles.size <= 1 || i.tkey === "") return stem;
    return `${stem}-${slugify(stripOptionTokens(i.row.title ?? "")) || i.tkey.replace(/ /g, "-")}`;
  };
  // (c) a title counts when the rows sharing it have different (or missing) SKUs.
  const titleRows = new Map<string, { skus: Set<string>; missing: boolean; count: number }>();
  for (const i of info) {
    if (i.row.parentKey || byStem(i) || i.tkey === "") continue;
    const entry = titleRows.get(i.tkey) ?? { skus: new Set<string>(), missing: false, count: 0 };
    entry.count++;
    if (i.row.sku) entry.skus.add(i.row.sku.toUpperCase());
    else entry.missing = true;
    titleRows.set(i.tkey, entry);
  }
  return info.map((i) => {
    const parentKey = i.row.parentKey;
    if (parentKey) return { row: i.row, key: parentKey, source: /[a-z]/.test(parentKey) ? "handle" : "parent" };
    if (byStem(i) && i.stem) return { row: i.row, key: stemKey(i), source: "sku_stem" };
    const t = titleRows.get(i.tkey);
    if (t && t.count >= 2 && (t.skus.size >= 2 || t.missing)) {
      const key = slugify(stripOptionTokens(i.row.title ?? "")) || i.tkey.replace(/ /g, "-");
      return { row: i.row, key, source: "title" };
    }
    if (i.row.sku) return { row: i.row, key: i.row.sku, source: "single_row" };
    // No SKU: the product is known by its title (a readable, re-upload-stable handle); the variant
    // still gets a synthetic SKU (EC-C6). A row with neither falls back to the synthetic key.
    const titleSlug = slugify(stripOptionTokens(i.row.title ?? "")) || i.tkey.replace(/ /g, "-");
    return titleSlug ? { row: i.row, key: titleSlug, source: "title" } : { row: i.row, key: syntheticSku(i.row), source: "single_row" };
  });
}
