/**
 * Rows → products (EC-C1–C11). Grouping is by a deterministic product key, never by adjacency,
 * so scattered or out-of-order variants land together and a re-upload reproduces the same keys.
 * Conflicts are recorded for the reviewer, never resolved by guessing which row is stale.
 */
import type { CleanedRow, DuplicateRow, Issue, ProductGroup, VariantDraft } from "../types";
import { issue } from "../types";
import { complexityOf, dedupeIssues, firstNonNull, hashSource, majorityLanguage, mergeAttributes, pickDescription, pickTitle, unique } from "./group-fields";
import { assignKeys, dropDuplicates, forwardFill, type Keyed } from "./group-keys";
import { flagDuplicateOptions, makeVariant, reconcile, resolveColor } from "./group-variants";
import { syntheticSku } from "./key";
import { inferOptionsFromTitle } from "./options";
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
    title: pickTitle(rows, variants.length >= 2 ? variants.map((v) => v.options) : null),
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
