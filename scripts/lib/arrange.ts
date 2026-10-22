/**
 * Row-order manipulation for the sample builders: scattering variants (EC-C1), exact
 * duplicates (EC-C3) and conflicting SKU rows (EC-C4). All functions mutate `rows` in place
 * and only ever move rows later, so a duplicate always follows its original.
 */

import { priceClean } from "./mess";
import type { Prng } from "./prng";
import type { ProductSpec, Row } from "./rows";

/** Keeps the product's first row where it is and moves the rest at least `minGap` rows later. */
export function scatterProduct(rows: Row[], product: ProductSpec, prng: Prng, minGap: number): void {
  const own = rows.filter((r) => r.product === product && r.kind === "variant");
  for (const row of own.slice(1)) {
    const from = rows.indexOf(row);
    rows.splice(from, 1);
    const to = Math.min(rows.length, from + minGap + prng.int(0, Math.max(0, rows.length - from - minGap)));
    rows.splice(to, 0, row);
    row.messes.push("EC-C1 variant scattered away from its siblings");
  }
}

/** Inserts an exact copy of `source` at least `minGap` rows later and returns it. */
export function insertDuplicate(rows: Row[], source: Row, prng: Prng, minGap: number): Row {
  const dup: Row = {
    cells: { ...source.cells },
    product: source.product,
    variant: source.variant,
    truth: null,
    kind: "duplicate",
    dupOf: source,
    ragged: source.ragged,
    messes: ["EC-C3 exact duplicate"],
  };
  const from = rows.indexOf(source);
  const to = Math.min(rows.length, from + minGap + prng.int(0, Math.max(0, rows.length - from - minGap)));
  rows.splice(to, 0, dup);
  return dup;
}

/**
 * Inserts a second row for the same SKU with a different price (EC-C4). `skuCell` lets the
 * caller write the SKU in a different case to combine with EC-B14.
 */
export function insertConflict(rows: Row[], source: Row, prng: Prng, minGap: number, skuCell?: string): Row {
  const conflict: Row = {
    cells: {
      ...source.cells,
      sku: skuCell ?? source.cells.sku,
      price: priceClean(Math.round(source.variant.priceCents * 1.1)),
      currency: "EUR",
    },
    product: source.product,
    variant: source.variant,
    truth: null,
    kind: "conflict",
    dupOf: null,
    ragged: null,
    messes: ["EC-C4 same SKU, different price"],
  };
  const from = rows.indexOf(source);
  const to = Math.min(rows.length, from + minGap + prng.int(0, Math.max(0, rows.length - from - minGap)));
  rows.splice(to, 0, conflict);
  return conflict;
}

/** Distinct variant rows chosen uniformly, at most one per product when `onePerProduct`. */
export function pickVariantRows(rows: Row[], prng: Prng, count: number, onePerProduct: boolean): Row[] {
  const seen = new Set<ProductSpec>();
  const out: Row[] = [];
  for (const row of prng.shuffle(rows)) {
    if (out.length >= count) break;
    if (row.kind !== "variant") continue;
    if (onePerProduct && seen.has(row.product)) continue;
    seen.add(row.product);
    out.push(row);
  }
  return out;
}
