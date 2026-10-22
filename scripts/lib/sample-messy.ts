/**
 * messy-120: 120 data rows that exercise every corruption in mess.ts, plus the plan for the
 * matching photo ZIP. Every mess is targeted at a named SKU or picked from "free" rows with
 * the seeded PRNG, so the same seed always produces the same sheet.
 */

import type { GroundTruthFile, Lang } from "../../src/core/types";
import { insertConflict, insertDuplicate, pickVariantRows, scatterProduct } from "./arrange";
import { CATALOG, templateByStem } from "./catalog";
import * as mess from "./mess";
import { LOGO_SVG, README_TXT, randomBytes, type ImageSpec } from "./photos";
import type { Prng } from "./prng";
import {
  buildGroundTruth,
  expandProduct,
  productRows,
  variantHex,
  type Column,
  type ParentStyle,
  type ProductSpec,
  type Row,
} from "./rows";

export const MESSY_COLUMNS: Column[] = [
  { header: "SKU", field: "sku" },
  { header: "Parent SKU", field: "parent" },
  { header: "Title", field: "title" },
  { header: "Beschreibung", field: "description" },
  { header: "Category", field: "category" },
  { header: "Brand", field: "brand" },
  { header: "Preis (€)", field: "price" },
  { header: "Currency", field: "currency" },
  { header: "Size", field: "size" },
  { header: "Farbe", field: "colour" },
  { header: "Weight", field: "weight" },
  { header: "Dimensions", field: "dimensions" },
  { header: "Image", field: "image" },
  { header: "Notes", field: "notes" },
  { header: "Tags", field: "tags" },
];

export type PhotoPlanEntry =
  | { name: string; kind: "image"; spec: ImageSpec }
  | { name: string; kind: "copy"; of: string }
  | { name: string; kind: "bytes"; data: Buffer };

export interface MessyBuild {
  rows: Row[];
  columns: Column[];
  photoPlan: PhotoPlanEntry[];
  groundTruth: GroundTruthFile;
  /** "row 17: EC-B5 EU price 1.299,00 €" lines, in row order. */
  log: string[];
}

const TOTAL_ROWS = 120;
const DUPLICATES = 3;
const CONFLICTS = 1;
const SKU_PHOTOS = 45;

interface RequiredProduct {
  stem: string;
  lang?: Lang;
  parentStyle?: ParentStyle;
}

/** Products the targeted messes need; the rest of the sheet is filled from the catalogue. */
const REQUIRED: RequiredProduct[] = [
  { stem: "TC-PL" },
  { stem: "GL-PT" },
  { stem: "TC-MG" },
  { stem: "OK-ST" },
  { stem: "TL-ST" },
  { stem: "SS-WK" },
  { stem: "TB-HL" },
  { stem: "CI-SK" },
  { stem: "WC-CN", lang: "de" },
  { stem: "BW-CA", lang: "de" },
  { stem: "ES-CP", lang: "fr" },
  { stem: "LN-NB", lang: "fr" },
  { stem: "CT-RN" },
  { stem: "KN-PD" },
  { stem: "FL-LP" },
  { stem: "SB-BW", parentStyle: "none" },
  { stem: "LN-CU", parentStyle: "handle" },
  { stem: "WL-TH", parentStyle: "handle" },
];

function selectProducts(prng: Prng): { products: ProductSpec[]; shopify: Set<ProductSpec> } {
  const budget = TOTAL_ROWS - DUPLICATES - CONFLICTS;
  const shopify = new Set<ProductSpec>();
  const products = REQUIRED.map((r) => {
    const p = expandProduct(templateByStem(r.stem), { lang: r.lang, parentStyle: r.parentStyle });
    if (r.parentStyle === "handle") shopify.add(p);
    return p;
  });
  let count = products.reduce((n, p) => n + p.variants.length, 0);
  const required = new Set(REQUIRED.map((r) => r.stem));
  for (const t of prng.shuffle(CATALOG.filter((t) => !required.has(t.stem)))) {
    if (count >= budget) break;
    const p = expandProduct(t);
    p.variants = p.variants.slice(0, budget - count);
    products.push(p);
    count += p.variants.length;
  }
  if (count !== budget) throw new Error(`messy-120: planned ${count} product rows, need ${budget}`);
  return { products, shopify };
}

export function buildMessy(root: Prng, seed: number): MessyBuild {
  const prng = root.fork("messy-120");
  const { products, shopify } = selectProducts(prng);
  const byStem = (stem: string): ProductSpec => {
    const p = products.find((x) => x.template.stem === stem);
    if (!p) throw new Error(`messy-120: product ${stem} missing`);
    return p;
  };

  // EC-A13: Excel turned a numeric SKU into scientific notation; the sheet only has "1E5".
  const kneelingPad = byStem("KN-PD");
  kneelingPad.variants[0].sku = "1E5";
  kneelingPad.key = "1E5";
  // EC-C6: the only row of this product has no SKU; the importer must key it by title.
  const runner = byStem("CT-RN");
  runner.key = mess.slugify(runner.title);

  const groups = products.map((p) => {
    const rows = productRows(p, { shopify: shopify.has(p) });
    // EC-C2: children before the parent row for one Shopify-style product.
    if (p.template.stem === "WL-TH") rows.reverse();
    return rows;
  });
  const rows = prng.shuffle(groups).flat();

  const rowOf = (sku: string): Row => {
    const r = rows.find((x) => x.variant.sku === sku && x.kind === "variant");
    if (!r) throw new Error(`messy-120: no row for ${sku}`);
    return r;
  };
  // Rows of the required products get their targeted messes; random picks stay on fillers.
  const required = new Set(REQUIRED.map((r) => r.stem));
  const reserved = new Set<Row>(rows.filter((r) => required.has(r.product.template.stem)));
  const note = (row: Row, text: string): Row => {
    row.messes.push(text);
    reserved.add(row);
    return row;
  };
  /** Unreserved English variant rows, optionally only from products with ≥2 or exactly 1 row. */
  const free = (arity: "multi" | "single" | "any" = "any"): Row[] =>
    rows.filter(
      (r) =>
        r.kind === "variant" &&
        !reserved.has(r) &&
        r.product.lang === "en" &&
        !shopify.has(r.product) &&
        r.cells.title !== "" &&
        (arity === "any" || (arity === "multi" ? r.product.variants.length > 1 : r.product.variants.length === 1)),
    );
  const pickFree = (arity: "multi" | "single" | "any" = "any"): Row => prng.pick(free(arity));
  const dropPrice = (row: Row, cell: string, text: string): void => {
    row.cells.price = cell;
    if (row.truth) {
      row.truth.priceCents = null;
      row.truth.currency = null;
    }
    note(row, text);
  };

  // --- prices (EC-B2, EC-B5)
  const oakNatural = rowOf("OK-ST-NO");
  oakNatural.cells.price = mess.priceEu(129900);
  oakNatural.cells.currency = "";
  note(oakNatural, "EC-B5 EU price 1.299,00 €");
  const oakSmoked = rowOf("OK-ST-SO");
  oakSmoked.cells.price = mess.priceAmbiguous(129900);
  note(oakSmoked, "EC-B5 ambiguous price 1.299");
  const tealights = rowOf("TL-ST-01");
  tealights.cells.price = mess.priceGbp(800);
  tealights.cells.currency = "GBP";
  if (tealights.truth) tealights.truth.currency = "GBP";
  note(tealights, "EC-B2/B5 price £8");
  const whisk = rowOf("SS-WK-01");
  whisk.cells.price = mess.priceUsd(1299);
  whisk.cells.currency = "";
  if (whisk.truth) whisk.truth.currency = "USD";
  note(whisk, "EC-B2/B5 price $ 12.99, no currency column value");
  const holderWhite = rowOf("TB-HL-WH");
  holderWhite.cells.price = mess.priceCodePrefix(1200, "EUR");
  holderWhite.cells.currency = "";
  note(holderWhite, "EC-B5 price EUR 12");
  const holderCharcoal = rowOf("TB-HL-CH");
  holderCharcoal.cells.price = mess.priceEuPlain(1200);
  holderCharcoal.cells.currency = "€";
  note(holderCharcoal, "EC-B5 price 12,00 with currency cell €");
  const skillet20 = rowOf("CI-SK-20");
  skillet20.cells.price = mess.priceEuSymbolFirst(4500);
  skillet20.cells.currency = "Euro";
  skillet20.cells.weight = mess.weightKg(1800);
  note(skillet20, "EC-B5 price € 45,00; EC-B7 weight 1.8 kg");
  const skillet26 = rowOf("CI-SK-26");
  skillet26.cells.price = mess.priceCodeSuffix(6750, "EUR");
  skillet26.cells.weight = mess.weightKgEu(2700);
  note(skillet26, "EC-B5 price 67.5 EUR; EC-B7 weight 2,7 kg");
  dropPrice(pickFree("multi"), "", "EC-B1/B5 price missing");
  dropPrice(pickFree("single"), "0", "EC-B5 zero price");
  dropPrice(pickFree("single"), "N/A", "EC-B5/B13 price N/A");

  // --- colours (EC-B9)
  const potTerracotta = rowOf("GL-PT-TC");
  potTerracotta.cells.colour = mess.colourTypo("terracotta");
  note(potTerracotta, "EC-B9 colour typo terracota");
  const potBlue = rowOf("GL-PT-DB");
  potBlue.cells.colour = mess.colourDe("dark blue");
  note(potBlue, "EC-B9 German colour dunkelblau in an English row");
  const potSage = rowOf("GL-PT-SG");
  potSage.cells.colour = mess.colourTitleCase("sage green");
  note(potSage, "EC-B9 colour title-cased");
  const potWhite = rowOf("GL-PT-WH");
  potWhite.cells.dimensions = mess.dimsLabelled(potWhite.variant.dims);
  note(potWhite, "EC-B7 dimensions H x W x D cm");

  // --- units and option spellings (EC-B7, EC-B18)
  const planter20 = rowOf("TC-PL-20");
  planter20.cells.sku = mess.messySku("TC-PL-20", "lower-trailing");
  planter20.cells.dimensions = mess.dimsInches(planter20.variant.dims);
  note(planter20, "EC-B14 SKU 'tc-pl-20 '; EC-B7 dimensions in inches");
  const planter30 = rowOf("TC-PL-30");
  planter30.cells.size = mess.sizeSpelling("30 cm", "nospace");
  note(planter30, "EC-B18 size 30cm");
  const planter40 = rowOf("TC-PL-40");
  planter40.cells.size = mess.sizeSpelling("40 cm", "prefixed");
  planter40.cells.weight = mess.weightNoSpace(planter40.variant.weightGrams);
  note(planter40, "EC-B18 size 'Size 40'; EC-B7 weight without space");
  const mm = pickFree();
  mm.cells.dimensions = mess.dimsMm(mm.variant.dims);
  note(mm, "EC-B7 dimensions in mm");
  const bare = pickFree();
  bare.cells.dimensions = mess.dimsBare(bare.variant.dims);
  bare.cells.weight = mess.weightBare(bare.variant.weightGrams);
  note(bare, "EC-B7 dimensions and weight without units");

  // --- text corruption (EC-A4, EC-B13, EC-B14, EC-B16)
  const mugCream = rowOf("TC-MG-01");
  mugCream.cells.title = mess.withNbsp(mugCream.cells.title ?? "");
  note(mugCream, "EC-B13 NBSP in title");
  const mugBlue = rowOf("TC-MG-02");
  mugBlue.cells.description = mess.withSmartQuotes(`${mugBlue.cells.description} Supplier's note: "best seller".`);
  note(mugBlue, "EC-B13 smart quotes in description");
  const mugSage = rowOf("TC-MG-03");
  mugSage.cells.sku = mess.withZeroWidth("TC-MG-03");
  note(mugSage, "EC-B13 zero-width characters in SKU");
  const canSage = rowOf("WC-CN-SG");
  canSage.cells.description = mess.toMojibake(canSage.cells.description ?? "");
  canSage.cells.notes = mess.toMojibake(canSage.cells.notes ?? "");
  note(canSage, "EC-A4 mojibake (GrÃ¶ÃŸe) in a German row");
  const leading = pickFree();
  leading.cells.sku = mess.messySku(leading.variant.sku, "leading-space");
  note(leading, "EC-B14 SKU with leading space");
  const padded = pickFree();
  padded.cells.sku = mess.messySku(padded.variant.sku, "padded");
  note(padded, "EC-B14 SKU padded with spaces");

  // --- identity (EC-A13, EC-C6)
  note(rowOf("1E5"), "EC-A13 scientific-notation SKU 1E5");
  const runnerRow = rowOf("CT-RN-01");
  runnerRow.cells.sku = "";
  if (runnerRow.truth) runnerRow.truth.sku = "";
  note(runnerRow, "EC-C6 row without SKU");
  for (const r of rows.filter((x) => x.product.template.stem === "SB-BW")) note(r, "EC-C1 no Parent SKU; key from SKU stem");
  for (const p of shopify) {
    for (const r of rows.filter((x) => x.product === p)) note(r, "EC-C7 Shopify-style handle in Parent SKU, blank title on children");
  }
  for (const r of rows.filter((x) => x.product.template.stem === "WL-TH")) r.messes.push("EC-C2 child rows before parent");

  // --- descriptions (EC-A6, EC-A15, EC-B11, EC-B12)
  const floorLamp = rowOf("FL-LP-01");
  floorLamp.cells.description = mess.longDescription(floorLamp.product.description);
  note(floorLamp, "EC-A15 25,000-character description");
  const unsafe = pickFree();
  unsafe.cells.description = mess.htmlUnsafe(unsafe.product.description);
  note(unsafe, "EC-B11 <script> and onclick in description");
  const benign = pickFree();
  benign.cells.description = mess.htmlBenign(benign.product.description, [
    `Material: ${benign.product.material}`,
    benign.product.care || benign.product.notes,
  ]);
  note(benign, "EC-B11 allowlisted HTML in description");
  const broken = pickFree();
  broken.cells.description = mess.htmlBroken(broken.product.description);
  note(broken, "EC-B12 unclosed HTML tags");
  const multiline = pickFree();
  multiline.cells.description = mess.withLineBreak(multiline.product.description);
  note(multiline, "EC-A6 line break inside a quoted cell");

  // --- placeholders and ragged rows (EC-B13, EC-A7)
  const brandNa = pickFree();
  brandNa.cells.brand = "N/A";
  note(brandNa, "EC-B13 brand N/A");
  const brandDash = pickFree();
  brandDash.cells.brand = "-";
  note(brandDash, "EC-B13 brand -");
  const sizeNa = pickFree("single");
  sizeNa.cells.size = "n/a";
  note(sizeNa, "EC-B13 size n/a");
  const weightTbd = pickFree();
  weightTbd.cells.weight = "TBD";
  if (weightTbd.truth) weightTbd.truth.weightGrams = null;
  note(weightTbd, "EC-B13 weight TBD");
  const short = pickFree("multi");
  short.ragged = "short";
  note(short, "EC-A7 ragged row (two cells short)");
  const long = pickFree();
  long.ragged = "long";
  note(long, "EC-A7 ragged row (one cell extra)");
  for (let i = 0; i < 6; i++) {
    const r = pickFree();
    r.cells.currency = prng.pick(mess.EUR_CURRENCY_SPELLINGS);
    note(r, `EC-B2 currency cell "${r.cells.currency}"`);
  }

  // --- photos (EC-C12 … C18) and image column (EC-C14, EC-C15)
  const photoPlan = planPhotos(rows, prng, shopify);
  const url = rowOf("OK-ST-NO");
  url.cells.image = "http://images.example.com/products/OK-ST-NO.jpg";
  url.messes.push("EC-C14 image URL");
  const hasPhoto = (x: Row): boolean => x.product.photos.some((n) => n.toUpperCase().includes(x.variant.sku.toUpperCase()));
  for (let i = 0; i < 2; i++) {
    const r = prng.pick(free().filter((x) => !hasPhoto(x) && x.cells.image === ""));
    r.cells.image = `${r.variant.sku}-front.jpg`;
    note(r, "EC-C15 image file not in the ZIP");
  }

  // --- order (EC-C1, EC-C3, EC-C4)
  const scatterable = products.filter((p) => p.variants.length > 1 && !shopify.has(p) && p.lang === "en");
  for (const p of prng.shuffle(scatterable).slice(0, 3)) scatterProduct(rows, p, prng, 15);
  insertConflict(rows, rowOf("TC-PL-30"), prng, 10, "tc-pl-30").messes.push("EC-B14 conflicting row written as tc-pl-30");
  for (const source of pickVariantRows(rows, prng, DUPLICATES, true)) insertDuplicate(rows, source, prng, 20);
  if (rows.length !== TOTAL_ROWS) throw new Error(`messy-120: built ${rows.length} rows`);

  const unmatchedPhotos = photoPlan.map((e) => e.name).filter((name) => !products.some((p) => p.photos.includes(name)));
  const groundTruth = buildGroundTruth({ sample: "messy-120", seed, rows, unmatchedPhotos, includeClaims: true });
  const log = rows.flatMap((r, i) => (r.messes.length > 0 ? [`row ${i + 1} (${r.cells.sku?.trim() || "no sku"}): ${r.messes.join("; ")}`] : []));
  return { rows, columns: MESSY_COLUMNS, photoPlan, groundTruth, log };
}

/** Fixed photo names the README refers to; the rest are filled from other SKUs. */
const FIXED_PHOTOS: [string, string, "jpg" | "png"][] = [
  ["TC-PL-20.jpg", "TC-PL-20", "jpg"],
  ["TC-PL-20_2.png", "TC-PL-20", "png"],
  ["tc-pl-30 (1).jpg", "TC-PL-30", "jpg"],
  ["TC-PL-40.jpg", "TC-PL-40", "jpg"],
  ["TC-MG-02.jpg", "TC-MG-02", "jpg"],
  ["subfolder/TC-MG-01.jpg", "TC-MG-01", "jpg"],
  ["TC-MG-03.png", "TC-MG-03", "png"],
  ["OK-ST-NO.jpg", "OK-ST-NO", "jpg"],
  ["OK-ST-SO.png", "OK-ST-SO", "png"],
  ["GL-PT-TC.jpg", "GL-PT-TC", "jpg"],
  ["GL-PT-DB_2.jpg", "GL-PT-DB", "jpg"],
];

function planPhotos(rows: Row[], prng: Prng, shopify: Set<ProductSpec>): PhotoPlanEntry[] {
  const plan: PhotoPlanEntry[] = [];
  const bySku = new Map<string, Row>();
  for (const r of rows) if (r.kind === "variant") bySku.set(r.variant.sku, r);
  const image = (name: string, row: Row, format: "jpg" | "png", label = row.variant.sku): void => {
    plan.push({ name, kind: "image", spec: { sku: label, title: row.product.title, hex: variantHex(row.product, row.variant), format } });
    row.product.photos.push(name);
    if (!shopify.has(row.product) && prng.chance(0.7)) {
      row.cells.image = row.cells.image ? `${row.cells.image}; ${name}` : name;
    }
  };
  const rowFor = (sku: string): Row => {
    const r = bySku.get(sku);
    if (!r) throw new Error(`photo plan: no row for ${sku}`);
    return r;
  };

  for (const [name, sku, format] of FIXED_PHOTOS) image(name, rowFor(sku), format);
  // EC-C18: identical bytes under a second name.
  plan.push({ name: "TC-MG-02_2.jpg", kind: "copy", of: "TC-MG-02.jpg" });
  rowFor("TC-MG-02").product.photos.push("TC-MG-02_2.jpg");

  const taken = new Set(FIXED_PHOTOS.map(([, sku]) => sku));
  const candidates = rows.filter(
    (r) => r.kind === "variant" && !taken.has(r.variant.sku) && !shopify.has(r.product) && r.variant.sku !== "1E5" && r.cells.sku !== "",
  );
  for (const r of prng.shuffle(candidates)) {
    if (plan.length >= SKU_PHOTOS) break;
    const format = prng.pick(["jpg", "png"] as const);
    image(`${r.variant.sku}.${format}`, r, format);
  }

  // EC-C12: three photos named by the Shopify handle rather than a SKU.
  const firstRowOf = (p: ProductSpec): Row => {
    const r = rows.find((x) => x.product === p);
    if (!r) throw new Error(`photo plan: no rows for ${p.key}`);
    return r;
  };
  const [cushion, throwBlanket] = [...shopify].sort((a, b) => (a.key < b.key ? -1 : 1));
  image(`${cushion.key}.jpg`, firstRowOf(cushion), "jpg", cushion.key);
  image(`${cushion.key}_2.png`, firstRowOf(cushion), "png", cushion.key);
  image(`${throwBlanket.key}.jpg`, firstRowOf(throwBlanket), "jpg", throwBlanket.key);

  // EC-C13: camera names that match nothing.
  for (let i = 1; i <= 5; i++) {
    const name = `IMG_${String(i).padStart(4, "0")}.jpg`;
    plan.push({ name, kind: "image", spec: { sku: name.replace(".jpg", ""), title: "Untitled", hex: "#9a9a9a", format: "jpg" } });
  }
  // EC-C16, EC-A17: not images at all.
  plan.push({ name: "broken.jpg", kind: "bytes", data: randomBytes(prng.fork("broken.jpg"), 2048) });
  plan.push({ name: "logo.svg", kind: "bytes", data: Buffer.from(LOGO_SVG, "utf8") });
  plan.push({ name: "readme.txt", kind: "bytes", data: Buffer.from(README_TXT, "utf8") });
  return plan;
}
