/**
 * new-12: twelve products that appear in no other sample, 26 rows and an 18-file photo ZIP.
 * Fewer messes than messy-120, but every one sits on a row the README can name: mixed price
 * formats, two German and one French product, mojibake, unsafe HTML, a SKU conflict, an exact
 * duplicate, a row without a SKU and one negated claim. Same mechanics as sample-messy.ts.
 */

import type { Lang } from "../../src/core/types";
import { insertConflict, insertDuplicate } from "./arrange";
import { templateByStem } from "./catalog";
import * as mess from "./mess";
import type { Prng } from "./prng";
import { buildGroundTruth, ENGLISH_COLUMNS, expandProduct, productRows, variantHex, type Column, type ProductSpec, type Row } from "./rows";
import type { MessyBuild, PhotoPlanEntry } from "./sample-messy";

/** The clean English layout plus a "Care" column, which this supplier fills in. */
export const NEW_COLUMNS: Column[] = ENGLISH_COLUMNS.flatMap((c) => (c.field === "notes" ? [{ header: "Care", field: "care" as const }, c] : [c]));

export type NewBuild = MessyBuild;

const PRODUCTS: Array<{ stem: string; lang?: Lang }> = [
  { stem: "EN-SP" },
  { stem: "SG-BK", lang: "de" },
  { stem: "ST-VS", lang: "de" },
  { stem: "SS-SP", lang: "fr" },
  { stem: "OK-WC" },
  { stem: "TK-GB" },
  { stem: "BW-FW" },
  { stem: "WX-DC" },
  { stem: "WN-PH" },
  { stem: "LN-AP" },
  { stem: "GL-FC" },
  { stem: "FC-CV" },
];
const TOTAL_ROWS = 26;

/** 1814 g → "4 lbs"; one decimal when it is not a whole number of pounds. */
function weightLbs(grams: number): string {
  return `${(grams / 453.592).toFixed(1).replace(/\.0$/, "")} lbs`;
}

/** "12.50" → "12.5", the way a spreadsheet drops a trailing zero. */
function priceTrimmed(cents: number): string {
  return mess.priceClean(cents).replace(/\.?0+$/, "");
}

export function buildNew12(root: Prng, seed: number): NewBuild {
  const prng = root.fork("new-12");
  const products = PRODUCTS.map((p) => expandProduct(templateByStem(p.stem), { lang: p.lang }));
  const byStem = (stem: string): ProductSpec => {
    const p = products.find((x) => x.template.stem === stem);
    if (!p) throw new Error(`new-12: product ${stem} missing`);
    return p;
  };

  // EC-C6: the pen holder's only row has no SKU; the importer must key it by title.
  const penHolder = byStem("WN-PH");
  penHolder.key = mess.slugify(penHolder.title);

  const rows = prng.shuffle(products.map((p) => productRows(p))).flat();
  const rowOf = (sku: string): Row => {
    const r = rows.find((x) => x.variant.sku === sku && x.kind === "variant");
    if (!r) throw new Error(`new-12: no row for ${sku}`);
    return r;
  };
  const note = (row: Row, text: string): void => {
    row.messes.push(text);
  };

  // --- prices (EC-B2, EC-B5, EC-B13)
  const bench = rowOf("TK-GB-01");
  bench.cells.price = mess.priceEu(bench.variant.priceCents);
  bench.cells.currency = "";
  bench.cells.weight = mess.weightKg(bench.variant.weightGrams);
  note(bench, "EC-B5 price 1.299,00 €, empty currency cell; EC-B7 weight 24 kg");
  const wraps = rowOf("BW-FW-01");
  wraps.cells.price = mess.priceGbp(wraps.variant.priceCents);
  wraps.cells.currency = "";
  if (wraps.truth) wraps.truth.currency = "GBP";
  note(wraps, "EC-B2/B5 price £8, empty currency cell → 800 GBP");
  const container500 = rowOf("GL-FC-05");
  container500.cells.price = priceTrimmed(container500.variant.priceCents);
  note(container500, "EC-B5 price 12.5");
  const vaseOchre = rowOf("ST-VS-OC");
  vaseOchre.cells.price = mess.priceCodePrefix(vaseOchre.variant.priceCents, "EUR");
  vaseOchre.cells.currency = "";
  note(vaseOchre, "EC-B5 price EUR 24, empty currency cell");
  const apron = rowOf("LN-AP-01");
  apron.cells.price = "n/a";
  if (apron.truth) {
    apron.truth.priceCents = null;
    apron.truth.currency = null;
  }
  note(apron, "EC-B5/B13 price n/a → needs_review / no_price");
  // German and French suppliers write the decimal comma (EC-B5); the vase row above keeps "EUR 24".
  for (const r of rows) {
    if (r.product.lang === "en" || r === vaseOchre) continue;
    r.cells.price = mess.priceEuPlain(r.variant.priceCents);
    note(r, `EC-B10 ${r.product.lang === "de" ? "German" : "French"} row; EC-B5 price ${r.cells.price}`);
  }

  // --- units (EC-B7)
  const pot20 = rowOf("EN-SP-20");
  pot20.cells.weight = weightLbs(pot20.variant.weightGrams);
  note(pot20, `EC-B7 weight ${pot20.cells.weight}`);
  const coatL = rowOf("WX-DC-L");
  coatL.cells.dimensions = mess.dimsInches(coatL.variant.dims);
  note(coatL, "EC-B7 dimensions in inches");

  // --- text (EC-A4, EC-B11, EC-B15)
  const basketM = rowOf("SG-BK-M");
  basketM.cells.description = mess.toMojibake(basketM.cells.description ?? "");
  basketM.cells.notes = mess.toMojibake(basketM.cells.notes ?? "");
  note(basketM, "EC-A4 mojibake (nÃ¤chstgrÃ¶ÃŸere) in a German row");
  const clock = rowOf("OK-WC-01");
  clock.cells.description = mess.htmlUnsafe(clock.product.description);
  note(clock, "EC-B11 <script>, onclick=, javascript: link and onerror= in the description");
  for (const r of rows.filter((x) => x.product.template.stem === "WX-DC")) note(r, "EC-B15 notes negate waterproof");

  // --- identity (EC-C6)
  const penRow = rowOf("WN-PH-01");
  penRow.cells.sku = "";
  if (penRow.truth) penRow.truth.sku = "";
  note(penRow, "EC-C6 row without SKU; productKey walnut-pen-holder");

  // --- photos (EC-C12 … C15)
  const photoPlan = planPhotos(rows, penRow);

  // --- order (EC-C3, EC-C4)
  insertConflict(rows, rowOf("EN-SP-24"), prng, 4);
  insertDuplicate(rows, rowOf("GL-FC-15"), prng, 6);
  if (rows.length !== TOTAL_ROWS) throw new Error(`new-12: built ${rows.length} rows`);

  const unmatchedPhotos = photoPlan.map((e) => e.name).filter((name) => !products.some((p) => p.photos.includes(name)));
  const groundTruth = buildGroundTruth({ sample: "new-12", seed, rows, unmatchedPhotos, includeClaims: true });
  const log = rows.flatMap((r, i) => (r.messes.length > 0 ? [`row ${i + 1} (${r.cells.sku?.trim() || "no sku"}): ${r.messes.join("; ")}`] : []));
  return { rows, columns: NEW_COLUMNS, photoPlan, groundTruth, log };
}

/** Photos named by SKU; the fourth element puts the name in the row's Image column as well. */
const SKU_PHOTOS: Array<[string, string, "jpg" | "png", boolean?]> = [
  ["EN-SP-20.jpg", "EN-SP-20", "jpg"],
  ["EN-SP-24.png", "EN-SP-24", "png"],
  ["ST-VS-WH.jpg", "ST-VS-WH", "jpg"],
  ["ST-VS-SG.jpg", "ST-VS-SG", "jpg"],
  ["SS-SP-16.jpg", "SS-SP-16", "jpg", true],
  ["SS-SP-18.jpg", "SS-SP-18", "jpg"],
  ["OK-WC-01.jpg", "OK-WC-01", "jpg"],
  ["TK-GB-01.jpg", "TK-GB-01", "jpg", true],
  ["BW-FW-01.png", "BW-FW-01", "png"],
  ["WX-DC-M.jpg", "WX-DC-M", "jpg"],
  ["LN-AP-01.jpg", "LN-AP-01", "jpg"],
  ["GL-FC-10.jpg", "GL-FC-10", "jpg", true],
  ["FC-CV-GR.jpg", "FC-CV-GR", "jpg"],
];

/** Referenced only from the pen holder's Image column; nothing in the name points at a product. */
const IMAGE_COLUMN_ONLY = "desk_walnut_holder_studio.jpg";
/**
 * A camera name carrying the SKU as a token run: the matcher's token rung attaches it to the
 * coat's L variant (EC-C13).
 */
const FUZZY_PHOTO = "IMG_2031_WX-DC-L.jpg";
/** Matches nothing at all (EC-C13). */
const ORPHAN_PHOTO = "DSC_0417.jpg";

function planPhotos(rows: Row[], penRow: Row): PhotoPlanEntry[] {
  const plan: PhotoPlanEntry[] = [];
  const bySku = new Map<string, Row>();
  for (const r of rows) if (r.kind === "variant") bySku.set(r.variant.sku, r);
  const rowFor = (sku: string): Row => {
    const r = bySku.get(sku);
    if (!r) throw new Error(`photo plan: no row for ${sku}`);
    return r;
  };
  const image = (name: string, row: Row, format: "jpg" | "png", label = row.variant.sku): void => {
    plan.push({ name, kind: "image", spec: { sku: label, title: row.product.title, hex: variantHex(row.product, row.variant), format } });
    row.product.photos.push(name);
  };

  for (const [name, sku, format, inColumn] of SKU_PHOTOS) {
    const row = rowFor(sku);
    image(name, row, format);
    if (inColumn) {
      row.cells.image = name;
      row.messes.push("EC-C14 Image column names the ZIP file");
    }
  }
  // EC-C12: two files named by the product stem rather than a SKU.
  const basket = rowFor("SG-BK-S");
  image("SG-BK-front.png", basket, "png", "SG-BK");
  image("SG-BK-2.png", basket, "png", "SG-BK");
  // EC-C14: a studio file name that only the Image column connects to the product.
  image(IMAGE_COLUMN_ONLY, penRow, "jpg", penRow.product.key);
  penRow.cells.image = IMAGE_COLUMN_ONLY;
  penRow.messes.push(`EC-C14 Image column references ${IMAGE_COLUMN_ONLY}`);
  // Rendered with the coat's colour and title so the Unmatched tray shows what it is.
  const coat = rowFor("WX-DC-L");
  plan.push({ name: FUZZY_PHOTO, kind: "image", spec: { sku: "WX-DC-L", title: coat.product.title, hex: variantHex(coat.product, coat.variant), format: "jpg" } });
  coat.product.photos.push(FUZZY_PHOTO);
  plan.push({ name: ORPHAN_PHOTO, kind: "image", spec: { sku: "DSC_0417", title: "Untitled", hex: "#9a9a9a", format: "jpg" } });
  return plan;
}
