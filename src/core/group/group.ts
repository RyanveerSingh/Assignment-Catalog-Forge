/**
 * Rows → products (EC-C1–C11). Grouping is by a deterministic product key, never by adjacency,
 * so scattered or out-of-order variants land together and a re-upload reproduces the same keys.
 * Conflicts are recorded for the reviewer, never resolved by guessing which row is stale.
 */
import { createHash } from "node:crypto";
import { slugify } from "../clean/row";
import { foldForMatch } from "../clean/text";
import type { CleanedRow, DetectedLanguage, DuplicateRow, Issue, Lang, Money, ProductGroup, ProductKeySource, VariantDraft } from "../types";
import { issue } from "../types";
import { deriveSkuStem, syntheticSku, titleKey } from "./key";
import { inferOptionsFromTitle, stripOptionTokens } from "./options";
import { jaccard, trigramSet } from "./similarity";

export interface GroupOptions {
  storeDefaultCurrency: string;
}

export interface GroupResult {
  groups: ProductGroup[];
  duplicateRows: DuplicateRow[];
  orphanIssues: Issue[];
}

const NEAR_DUPLICATE_THRESHOLD = 0.85;
const MANY_VARIANTS = 100;

interface Keyed {
  row: CleanedRow;
  key: string;
  source: ProductKeySource;
}

export function groupRows(rows: CleanedRow[], opts: GroupOptions): GroupResult {
  if (!Array.isArray(rows) || rows.length === 0) return { groups: [], duplicateRows: [], orphanIssues: [] };
  const ordered = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
  const { kept, duplicateRows } = dropDuplicates(ordered);
  const keyed = assignKeys(forwardFill(kept));

  const buckets = new Map<string, Keyed[]>();
  for (const k of keyed) {
    const id = k.key.toLowerCase();
    const bucket = buckets.get(id);
    if (bucket) bucket.push(k);
    else buckets.set(id, [k]);
  }
  const claimed = new Map<string, string>();
  const groups = [...buckets.values()].map((bucket) => buildGroup(bucket, duplicateRows, claimed, opts));
  flagNearDuplicates(groups);
  return { groups, duplicateRows, orphanIssues: [] };
}

// ---------------------------------------------------------------------------
// Steps 1–3: duplicates, forward fill, keys
// ---------------------------------------------------------------------------

function dropDuplicates(rows: CleanedRow[]): { kept: CleanedRow[]; duplicateRows: DuplicateRow[] } {
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
function forwardFill(rows: CleanedRow[]): CleanedRow[] {
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

function inherit(child: CleanedRow, parent: CleanedRow): CleanedRow {
  return {
    ...child,
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

function assignKeys(rows: CleanedRow[]): Keyed[] {
  const info = rows.map((row) => ({
    row,
    stem: row.sku ? deriveSkuStem(row.sku) : null,
    tkey: row.title ? titleKey(row.title) : "",
  }));
  // (b) a stem counts when at least two different SKUs share it; parent-keyed rows are already placed.
  const stemSkus = new Map<string, Set<string>>();
  for (const i of info) {
    if (i.row.parentKey || !i.stem || !i.row.sku) continue;
    const set = stemSkus.get(i.stem.toLowerCase()) ?? new Set<string>();
    set.add(i.row.sku.toUpperCase());
    stemSkus.set(i.stem.toLowerCase(), set);
  }
  const byStem = (i: (typeof info)[number]): boolean =>
    !i.row.parentKey && i.stem !== null && (stemSkus.get(i.stem.toLowerCase())?.size ?? 0) >= 2;
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
    if (byStem(i) && i.stem) return { row: i.row, key: i.stem, source: "sku_stem" };
    const t = titleRows.get(i.tkey);
    if (t && t.count >= 2 && (t.skus.size >= 2 || t.missing)) {
      const key = slugify(stripOptionTokens(i.row.title ?? "")) || i.tkey.replace(/ /g, "-");
      return { row: i.row, key, source: "title" };
    }
    return { row: i.row, key: i.row.sku ?? syntheticSku(i.row), source: "single_row" };
  });
}

// ---------------------------------------------------------------------------
// Steps 4–6: variants, product fields, complexity
// ---------------------------------------------------------------------------

function buildGroup(bucket: Keyed[], allDuplicates: DuplicateRow[], claimed: Map<string, string>, opts: GroupOptions): ProductGroup {
  const rows = bucket.map((k) => k.row);
  const productKey = bucket[0].key;
  const issues: Issue[] = [];
  const conflicts: Issue[] = [];
  const variants: VariantDraft[] = [];
  const bySku = new Map<string, { variant: VariantDraft; row: CleanedRow }>();
  let inferred = false;

  for (const row of rows) {
    const sku = row.sku ?? syntheticSku(row);
    const id = sku.toUpperCase();
    let options: Record<string, string> = { ...row.options };
    if (Object.keys(options).length === 0 && rows.length >= 2 && row.title) {
      const fromTitle = inferOptionsFromTitle(row.title).options;
      if (Object.keys(fromTitle).length > 0) {
        options = fromTitle;
        inferred = true;
      }
    }
    const existing = bySku.get(id);
    if (existing) {
      reconcile(existing.variant, existing.row, row, options, conflicts);
      continue;
    }
    const owner = claimed.get(id);
    if (owner !== undefined && owner.toLowerCase() !== productKey.toLowerCase()) {
      issues.push(
        issue("sku.collision", "error", `SKU ${sku} in row ${row.rowNumber} already belongs to product "${owner}"; the row was not added to "${productKey}"`, {
          field: "sku",
          row: row.rowNumber,
          value: sku,
          ec: "C4",
        }),
      );
      continue;
    }
    claimed.set(id, productKey);
    const variant = makeVariant(row, sku, options, opts);
    bySku.set(id, { variant, row });
    variants.push(variant);
  }

  const color = resolveColor(rows, [...bySku.values()]);
  flagDuplicateOptions(variants, issues);
  if (variants.length > MANY_VARIANTS) {
    issues.push(issue("product.many_variants", "info", `${variants.length} variants; the model sees an options summary instead of every row`, { ec: "C8" }));
  }
  for (const i of dedupeIssues(rows.flatMap((r) => r.issues).filter((i) => i.severity !== "info"))) issues.push(i);

  const description = pickDescription(rows);
  const sourceRows = [...new Set(rows.map((r) => r.rowNumber))].sort((a, b) => a - b);
  const sourceSet = new Set(sourceRows);
  const draft: Omit<ProductGroup, "complexity" | "sourceHash"> = {
    productKey,
    keySource: bucket[0].source,
    title: pickTitle(rows, variants.length >= 2),
    descriptionHtml: description.html,
    descriptionText: description.text,
    category: firstNonNull(rows, (r) => r.category),
    brand: firstNonNull(rows, (r) => r.brand),
    tags: unique(rows.flatMap((r) => r.tags.map((t) => t.toLowerCase()))),
    notes: unique(rows.map((r) => r.notes).filter((n): n is string => n !== null && n !== "")).join(" | ") || null,
    care: firstNonNull(rows, (r) => r.care),
    material: firstNonNull(rows, (r) => r.material),
    color,
    attributes: mergeAttributes(rows),
    variants,
    sourceRows,
    duplicateRows: allDuplicates.filter((d) => sourceSet.has(d.of)),
    conflicts,
    issues,
    language: majorityLanguage(rows),
    images: unique(rows.flatMap((r) => r.images)),
    sourceCorpus: rows.map((r) => r.sourceText).filter((t) => typeof t === "string" && t !== "").join("\n\n"),
  };
  return { ...draft, complexity: complexityOf(draft, rows, inferred), sourceHash: hashSource(draft) };
}

function makeVariant(row: CleanedRow, sku: string, options: Record<string, string>, opts: GroupOptions): VariantDraft {
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
function reconcile(variant: VariantDraft, first: CleanedRow, row: CleanedRow, options: Record<string, string>, conflicts: Issue[]): void {
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
function resolveColor(rows: CleanedRow[], entries: Array<{ variant: VariantDraft; row: CleanedRow }>): string | null {
  const colors = unique(rows.map((r) => r.color).filter((c): c is string => c !== null && c !== ""));
  if (colors.length === 1) return colors[0];
  if (colors.length > 1) {
    for (const { variant, row } of entries) {
      if (row.color && variant.options.color === undefined) variant.options = { ...variant.options, color: row.color };
    }
  }
  return null;
}

function flagDuplicateOptions(variants: VariantDraft[], issues: Issue[]): void {
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

/** Most frequent (base) title, ties broken by length then by earliest row, so the choice is stable. */
function pickTitle(rows: CleanedRow[], strip: boolean): string | null {
  const counts = new Map<string, { text: string; count: number; row: number }>();
  for (const r of rows) {
    if (!r.title) continue;
    const text = strip ? stripOptionTokens(r.title) : r.title;
    const id = foldForMatch(text);
    const entry = counts.get(id);
    if (entry) entry.count++;
    else counts.set(id, { text, count: 1, row: r.rowNumber });
  }
  let best: { text: string; count: number; row: number } | null = null;
  for (const c of counts.values()) {
    if (!best || c.count > best.count || (c.count === best.count && (c.text.length > best.text.length || (c.text.length === best.text.length && c.row < best.row)))) best = c;
  }
  return best ? best.text : null;
}

function pickDescription(rows: CleanedRow[]): { html: string | null; text: string | null } {
  let best: CleanedRow | null = null;
  for (const r of rows) {
    const len = r.descriptionText?.length ?? r.descriptionHtml?.length ?? -1;
    if (len < 0) continue;
    const bestLen = best ? (best.descriptionText?.length ?? best.descriptionHtml?.length ?? -1) : -1;
    if (len > bestLen) best = r;
  }
  return best ? { html: best.descriptionHtml, text: best.descriptionText } : { html: null, text: null };
}

function firstNonNull(rows: CleanedRow[], pick: (r: CleanedRow) => string | null): string | null {
  for (const r of rows) {
    const v = pick(r);
    if (v !== null && v !== "") return v;
  }
  return null;
}

function mergeAttributes(rows: CleanedRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.attributes)) if (!(k in out)) out[k] = v;
  }
  return out;
}

function majorityLanguage(rows: CleanedRow[]): DetectedLanguage {
  const votes = new Map<Lang, { total: number; n: number }>();
  for (const r of rows) {
    const v = votes.get(r.language.lang) ?? { total: 0, n: 0 };
    v.total += r.language.confidence;
    v.n++;
    votes.set(r.language.lang, v);
  }
  let winner: DetectedLanguage = { lang: "und", confidence: 0 };
  let bestTotal = -1;
  for (const [lang, v] of votes) {
    if (v.total > bestTotal) {
      bestTotal = v.total;
      winner = { lang, confidence: Math.round(v.total / v.n) };
    }
  }
  return winner;
}

function unique(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

function dedupeIssues(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const id = `${i.code}|${i.row ?? ""}|${i.field ?? ""}|${i.value ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function complexityOf(g: Omit<ProductGroup, "complexity" | "sourceHash">, rows: CleanedRow[], inferred: boolean): number {
  const all = [...g.issues, ...g.conflicts, ...g.variants.flatMap((v) => v.issues)];
  let score = 0;
  if (all.some((i) => i.severity === "error")) score += 25;
  score += Math.min(30, 10 * g.issues.filter((i) => i.severity === "warn").length);
  if (g.language.lang !== "en" && g.language.lang !== "und") score += 15;
  if (!g.descriptionText) score += 15;
  if (g.conflicts.length > 0) score += 20;
  if (g.variants.length > 10) score += 10;
  if (!g.title) score += 15;
  if (rows.some((r) => r.issues.some((i) => i.code === "html.unsafe_removed"))) score += 10;
  if (inferred) score += 10;
  return Math.min(100, score);
}

/** Hash over the normalised inputs only; variants sorted by SKU so row order cannot change it (EC-D20). */
function hashSource(g: Omit<ProductGroup, "complexity" | "sourceHash">): string {
  const variants = g.variants
    .map((v) => ({ sku: v.sku, options: v.options, priceCents: v.priceCents, currency: v.currency, weightGrams: v.weightGrams }))
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
  const payload = [g.productKey, variants, g.title, g.descriptionText, g.category, g.brand, g.notes, g.care, g.material, g.tags, g.images];
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) out[k] = canonical(record[k]);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Step 7: near-duplicates (EC-C9) — badge both sides, never merge
// ---------------------------------------------------------------------------

function flagNearDuplicates(groups: ProductGroup[]): void {
  const sets = groups.map((g) => (g.title ? trigramSet(g.title) : null));
  for (let i = 0; i < groups.length; i++) {
    const a = sets[i];
    if (!a) continue;
    for (let j = i + 1; j < groups.length; j++) {
      const b = sets[j];
      if (!b) continue;
      // Jaccard cannot reach the threshold when the set sizes differ by more than it allows.
      if (Math.min(a.size, b.size) / Math.max(a.size, b.size) < NEAR_DUPLICATE_THRESHOLD) continue;
      const similarity = jaccard(a, b);
      if (similarity < NEAR_DUPLICATE_THRESHOLD) continue;
      const pct = Math.round(similarity * 100);
      groups[i].issues.push(possibleDuplicate(groups[j].productKey, pct));
      groups[j].issues.push(possibleDuplicate(groups[i].productKey, pct));
    }
  }
}

function possibleDuplicate(otherKey: string, pct: number): Issue {
  return issue("product.possible_duplicate", "info", `Title is ${pct}% similar to product "${otherKey}"; possibly the same product`, {
    field: "title",
    value: otherKey,
    ec: "C9",
  });
}
