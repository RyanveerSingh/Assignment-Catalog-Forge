/**
 * bulk-1000 / bulk-10000: templates with numeric suffixes and option combinations, ~15% of
 * rows messy. Description and notes appear on the first row of each product only, which is
 * how most suppliers export and what keeps bulk-10000.csv under 4 MB.
 */

import type { GroundTruthFile } from "../../src/core/types";
import { insertConflict, insertDuplicate, pickVariantRows, scatterProduct } from "./arrange";
import { CATALOG } from "./catalog";
import * as mess from "./mess";
import type { Prng } from "./prng";
import { buildGroundTruth, ENGLISH_COLUMNS, expandProduct, productRows, type Column, type ProductSpec, type Row } from "./rows";

export interface BulkStats {
  products: number;
  germanProducts: number;
  scatteredProducts: number;
  duplicates: number;
  conflicts: number;
  /** Rows with at least one cell-level mess (duplicates and conflicts not counted). */
  messyRows: number;
}

export interface BulkBuild {
  rows: Row[];
  columns: Column[];
  groundTruth: GroundTruthFile;
  stats: BulkStats;
}

const PRICE_FORMATS: ((cents: number) => string)[] = [
  mess.priceEu,
  mess.priceEuPlain,
  mess.priceEuSymbolFirst,
  mess.priceUsThousands,
  (c) => mess.priceCodePrefix(c, "EUR"),
];

const WEIGHT_FORMATS: ((grams: number) => string)[] = [mess.weightKg, mess.weightKgEu, mess.weightNoSpace];

/** Cell-level messes with independent probabilities tuned to hit ~15% of rows overall. */
function messRow(row: Row, prng: Prng): void {
  const first = row.cells.description !== "";
  if (prng.chance(0.04)) {
    row.cells.price = prng.pick(PRICE_FORMATS)(row.variant.priceCents);
    if (prng.chance(0.5)) row.cells.currency = "";
    row.messes.push("EC-B5 price format");
  } else if (prng.chance(0.012)) {
    row.cells.price = prng.pick(["", "", "N/A", "-", "0"]);
    if (row.truth) {
      row.truth.priceCents = null;
      row.truth.currency = null;
    }
    row.messes.push("EC-B1 price missing");
  }
  if (prng.chance(0.02)) {
    row.cells.weight = prng.pick(WEIGHT_FORMATS)(row.variant.weightGrams);
    row.messes.push("EC-B7 weight unit");
  } else if (prng.chance(0.01)) {
    row.cells.weight = prng.pick(["", "TBD", "-"]);
    if (row.truth) row.truth.weightGrams = null;
    row.messes.push("EC-B13 weight missing");
  }
  if (prng.chance(0.015)) {
    row.cells.brand = prng.pick(mess.PLACEHOLDERS);
    row.messes.push("EC-B13 brand placeholder");
  }
  if (prng.chance(0.02)) {
    row.cells.sku = mess.messySku(row.variant.sku, prng.pick(["lower", "trailing-space", "leading-space"] as const));
    row.messes.push("EC-B14 SKU case/whitespace");
  }
  if (row.variant.colourLabel && row.product.lang === "en" && prng.chance(0.02)) {
    row.cells.colour = prng.chance(0.5) ? mess.colourTypo(row.variant.colourLabel) : mess.colourDe(row.variant.colourLabel);
    row.messes.push("EC-B9 colour spelling");
  }
  if (row.variant.sizeLabel && prng.chance(0.02)) {
    row.cells.size = mess.sizeSpelling(row.variant.sizeLabel, prng.pick(["nospace", "prefixed", "upper"] as const));
    row.messes.push("EC-B18 size spelling");
  }
  if (prng.chance(0.015)) {
    row.cells.currency = prng.pick(mess.EUR_CURRENCY_SPELLINGS);
    row.messes.push("EC-B2 currency spelling");
  }
  if (prng.chance(0.015)) {
    row.cells.dimensions = prng.pick([mess.dimsLabelled, mess.dimsMm, mess.dimsInches, mess.dimsBare])(row.variant.dims);
    row.messes.push("EC-B7 dimension format");
  }
  if (first && prng.chance(0.01)) {
    row.cells.description = "";
    row.messes.push("EC-B1 description missing");
  }
}

export function buildBulk(root: Prng, seed: number, name: string, total: number): BulkBuild {
  const prng = root.fork(name);
  const duplicates = Math.round(total * 0.03);
  const conflicts = Math.max(1, Math.round(total * 0.002));
  const budget = total - duplicates - conflicts;

  const products: ProductSpec[] = [];
  let count = 0;
  for (let i = 0; count < budget; i++) {
    const template = CATALOG[i % CATALOG.length];
    const series = Math.floor(i / CATALOG.length) + 1;
    const german = template.de !== undefined && prng.chance(0.06);
    const p = expandProduct(template, {
      suffix: String(series).padStart(3, "0"),
      lang: german ? "de" : "en",
      titleSuffix: german ? ` Nr. ${series}` : ` No. ${series}`,
    });
    p.variants = p.variants.slice(0, budget - count);
    products.push(p);
    count += p.variants.length;
  }

  const rows = products.flatMap((p) => productRows(p, { firstRowOnly: true }));
  for (const row of rows) messRow(row, prng);
  const messyRows = rows.filter((r) => r.messes.length > 0).length;

  const gap = Math.max(20, Math.floor(total / 40));
  let scattered = 0;
  for (const p of products) {
    if (p.variants.length > 1 && prng.chance(0.04)) {
      scatterProduct(rows, p, prng, gap);
      scattered++;
    }
  }
  const intact = rows.filter((r) => r.truth?.priceCents !== null);
  for (const source of pickVariantRows(intact, prng, conflicts, true)) insertConflict(rows, source, prng, gap);
  for (const source of pickVariantRows(rows, prng, duplicates, false)) insertDuplicate(rows, source, prng, gap);
  if (rows.length !== total) throw new Error(`${name}: built ${rows.length} rows, expected ${total}`);

  const groundTruth = buildGroundTruth({ sample: name, seed, rows, includeClaims: false });
  return {
    rows,
    columns: ENGLISH_COLUMNS,
    groundTruth,
    stats: {
      products: products.length,
      germanProducts: products.filter((p) => p.lang === "de").length,
      scatteredProducts: scattered,
      duplicates,
      conflicts,
      messyRows,
    },
  };
}
