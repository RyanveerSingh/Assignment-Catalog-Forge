/**
 * Row model shared by all sample builders: a product expanded from a template, its variant
 * rows with clean cells, and the ground truth assembled from the final row order.
 *
 * The truth lives on the row (`Row.truth`) so a mess that destroys information (blank price,
 * "TBD" weight) can null the matching truth field in the same place it corrupts the cell.
 */

import type { DuplicateRow, GroundTruthFile, GroundTruthProduct, GroundTruthVariant, Lang } from "../../src/core/types";
import { COLOUR_HEX, MATERIAL_HEX, type ProductTemplate, type SizeOption } from "./catalog";
import { colourDe, colourFr, dimsClean, dimsRound, priceClean, slugify, weightClean, type Dims } from "./mess";

export type Field =
  | "sku"
  | "parent"
  | "title"
  | "description"
  | "category"
  | "brand"
  | "price"
  | "currency"
  | "size"
  | "colour"
  | "weight"
  | "dimensions"
  | "image"
  | "notes"
  | "tags"
  | "material"
  | "care";

export type Cells = Partial<Record<Field, string>>;

export interface Column {
  header: string;
  field: Field;
}

/** Clean English layout used by tiny-10, no-header, header-only and the bulk files. */
export const ENGLISH_COLUMNS: Column[] = [
  { header: "SKU", field: "sku" },
  { header: "Parent SKU", field: "parent" },
  { header: "Title", field: "title" },
  { header: "Description", field: "description" },
  { header: "Category", field: "category" },
  { header: "Brand", field: "brand" },
  { header: "Price", field: "price" },
  { header: "Currency", field: "currency" },
  { header: "Size", field: "size" },
  { header: "Colour", field: "colour" },
  { header: "Weight", field: "weight" },
  { header: "Dimensions", field: "dimensions" },
  { header: "Image", field: "image" },
  { header: "Notes", field: "notes" },
  { header: "Tags", field: "tags" },
];

export interface VariantSpec {
  sku: string;
  /** Normalised option name → canonical value, e.g. { size: "20 cm", color: "terracotta" }. */
  options: Record<string, string>;
  priceCents: number;
  weightGrams: number;
  sizeLabel: string | null;
  colourLabel: string | null;
  dims: Dims;
  round: boolean;
}

export interface ProductSpec {
  /** The productKey the importer should derive. */
  key: string;
  template: ProductTemplate;
  lang: Lang;
  title: string;
  description: string;
  category: string;
  brand: string;
  notes: string;
  care: string;
  material: string;
  tags: string[];
  /** Value for a "Parent SKU" column; "" when the sheet gives no explicit parent. */
  parentCell: string;
  variants: VariantSpec[];
  /** ZIP filenames that belong to this product; filled by the photo plan. */
  photos: string[];
  /** Photo background colour when the variant has no colour option. */
  hex: string;
}

export type VariantTruth = GroundTruthVariant;

export type RowKind = "variant" | "duplicate" | "conflict";

export interface Row {
  cells: Cells;
  product: ProductSpec;
  variant: VariantSpec;
  /** Only on kind "variant"; duplicates and conflicts carry no truth of their own. */
  truth: VariantTruth | null;
  kind: RowKind;
  dupOf: Row | null;
  /** EC-A7: serialise with two cells fewer / one cell more than the header. */
  ragged: "short" | "long" | null;
  /** Messes applied, for the console log ("EC-B5 price 1.299,00 €"). */
  messes: string[];
}

export type ParentStyle = "stem" | "handle" | "none";

export interface ExpandOptions {
  /** Numeric suffix for bulk files: "003" → stem "TC-PL-003". */
  suffix?: string;
  lang?: Lang;
  parentStyle?: ParentStyle;
  titleSuffix?: string;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
/** A lone thousands dot and no decimals ("1.299"): the mess `priceAmbiguous` writes. */
const AMBIGUOUS_PRICE = /^\d{1,3}(?:\.\d{3})+$/;

/** Base dims scaled to a size option; a "NN cm" label is the diameter (or height for tall items). */
function scaledDims(base: Dims, size: SizeOption | null): Dims {
  if (!size) return base;
  const m = /^(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?cm$/.exec(size.label);
  if (m) {
    const a = parseFloat(m[1]);
    if (m[2]) return [a, parseFloat(m[2]), base[2]];
    const tall = base[2] > base[0];
    return tall ? [round1((base[0] * a) / base[2]), round1((base[1] * a) / base[2]), a] : [a, a, round1((base[2] * a) / base[0])];
  }
  const k = Math.cbrt(size.factor);
  return [round1(base[0] * k), round1(base[1] * k), round1(base[2] * k)];
}

function materialHex(material: string): string {
  const key = Object.keys(MATERIAL_HEX).find((k) => material.includes(k));
  return key ? MATERIAL_HEX[key] : "#b8a894";
}

export function expandProduct(template: ProductTemplate, opts: ExpandOptions = {}): ProductSpec {
  const lang = opts.lang ?? "en";
  const stem = opts.suffix ? `${template.stem}-${opts.suffix}` : template.stem;
  const sizes: (SizeOption | null)[] = template.sizes ?? [null];
  const colours = template.colours ?? [null];
  const variants: VariantSpec[] = [];
  for (const size of sizes) {
    for (const colour of colours) {
      const segments = [size?.code, colour?.code].filter((s): s is string => typeof s === "string");
      const factor = size?.factor ?? 1;
      variants.push({
        sku: segments.length > 0 ? `${stem}-${segments.join("-")}` : `${stem}-01`,
        options: { ...(size ? { size: size.label } : {}), ...(colour ? { color: colour.label } : {}) },
        priceCents: Math.round(template.basePriceCents * factor),
        weightGrams: Math.round(template.weightGrams * factor),
        sizeLabel: size?.label ?? null,
        colourLabel: colour?.label ?? null,
        dims: scaledDims(template.dimsCm, size),
        round: template.dimsCm[0] === template.dimsCm[1] && template.dimsCm[2] > 2,
      });
    }
  }

  const tr = lang === "de" ? template.de : lang === "fr" ? template.fr : undefined;
  if (lang !== "en" && !tr) throw new Error(`${template.stem} has no ${lang} translation`);
  const title = `${tr?.title ?? template.titleEn}${opts.titleSuffix ?? ""}`;
  const multi = variants.length > 1;
  const parentStyle = opts.parentStyle ?? "stem";
  const handle = slugify(title);
  const key = !multi ? variants[0].sku : parentStyle === "handle" ? handle : stem;
  const parentCell = !multi || parentStyle === "none" ? "" : parentStyle === "handle" ? handle : stem;

  return {
    key,
    template,
    lang,
    title,
    description: tr?.description ?? template.descriptionEn,
    category: tr?.category ?? template.categoryPrefix,
    brand: template.brand ?? "",
    notes: tr?.notes ?? template.notes ?? "",
    care: tr?.care ?? template.care ?? "",
    material: template.material,
    tags: template.tags,
    parentCell,
    variants,
    photos: [],
    hex: materialHex(template.material),
  };
}

export function variantHex(product: ProductSpec, variant: VariantSpec): string {
  return variant.colourLabel ? COLOUR_HEX[variant.colourLabel] : product.hex;
}

export interface CellOptions {
  /** Shopify-style child rows leave title and description blank (EC-C7). */
  child?: boolean;
  /** Bulk files carry description and notes on the first row of a product only. */
  firstRowOnly?: boolean;
}

export function cleanCells(product: ProductSpec, variant: VariantSpec, opts: CellOptions = {}): Cells {
  const text = !opts.child && !opts.firstRowOnly;
  const colour = variant.colourLabel
    ? product.lang === "de"
      ? colourDe(variant.colourLabel)
      : product.lang === "fr"
        ? colourFr(variant.colourLabel)
        : variant.colourLabel
    : "";
  return {
    sku: variant.sku,
    parent: product.parentCell,
    title: opts.child ? "" : product.title,
    description: text ? product.description : "",
    category: opts.child ? "" : product.category,
    brand: opts.child ? "" : product.brand,
    price: priceClean(variant.priceCents),
    currency: "EUR",
    size: variant.sizeLabel ?? "",
    colour,
    weight: weightClean(variant.weightGrams),
    dimensions: variant.round ? dimsRound(variant.dims) : dimsClean(variant.dims),
    image: "",
    notes: text ? product.notes : "",
    tags: opts.child ? "" : product.tags.join(", "),
    material: product.material,
    care: text ? product.care : "",
  };
}

export function variantRow(product: ProductSpec, variant: VariantSpec, opts: CellOptions = {}): Row {
  return {
    cells: cleanCells(product, variant, opts),
    product,
    variant,
    truth: {
      sku: variant.sku,
      options: { ...variant.options },
      priceCents: variant.priceCents,
      currency: "EUR",
      weightGrams: variant.weightGrams,
    },
    kind: "variant",
    dupOf: null,
    ragged: null,
    messes: [],
  };
}

/** Rows of one product in sheet order; the first row is the "parent" for Shopify layouts. */
export function productRows(product: ProductSpec, opts: { shopify?: boolean; firstRowOnly?: boolean } = {}): Row[] {
  return product.variants.map((v, i) =>
    variantRow(product, v, { child: opts.shopify === true && i > 0, firstRowOnly: opts.firstRowOnly === true && i > 0 }),
  );
}

/** Cells → matrix in column order, honouring ragged rows (EC-A7). */
export function rowsToMatrix(rows: Row[], columns: Column[]): string[][] {
  return rows.map((row) => {
    const cells = columns.map((c) => row.cells[c.field] ?? "");
    if (row.ragged === "short") return cells.slice(0, -2);
    if (row.ragged === "long") return [...cells, "extra"];
    return cells;
  });
}

export interface GroundTruthOptions {
  sample: string;
  seed: number;
  rows: Row[];
  unmatchedPhotos?: string[];
  /** Bulk files leave the claim lists empty to keep the JSON small. */
  includeClaims: boolean;
}

/** Assembles the GroundTruthFile from the final row order (row n = rows[n - 1]). */
export function buildGroundTruth(opts: GroundTruthOptions): GroundTruthFile {
  const numbers = new Map<Row, number>();
  opts.rows.forEach((row, i) => numbers.set(row, i + 1));

  interface Acc {
    product: ProductSpec;
    variants: Map<string, GroundTruthVariant>;
    sourceRows: number[];
    reasons: Set<string>;
  }
  const byKey = new Map<string, Acc>();
  const duplicateRows: DuplicateRow[] = [];

  for (const row of opts.rows) {
    const rowNumber = numbers.get(row) ?? 0;
    if (row.kind === "duplicate") {
      const of = row.dupOf ? numbers.get(row.dupOf) : undefined;
      if (of === undefined || of >= rowNumber) throw new Error(`duplicate row ${rowNumber} must follow its original`);
      duplicateRows.push({ row: rowNumber, of });
      continue;
    }
    let acc = byKey.get(row.product.key);
    if (!acc) {
      acc = { product: row.product, variants: new Map(), sourceRows: [], reasons: new Set() };
      byKey.set(row.product.key, acc);
    }
    acc.sourceRows.push(rowNumber);
    if (row.kind === "conflict") acc.reasons.add("sku_conflict");
    // "1.299" could be 1.299 or 1,299: the app sends it to review rather than publish a guess (EC-B5).
    if (AMBIGUOUS_PRICE.test(row.cells.price ?? "")) acc.reasons.add("price_unclear");
    if (row.truth && !acc.variants.has(row.truth.sku)) acc.variants.set(row.truth.sku, row.truth);
  }

  const products: GroundTruthProduct[] = [...byKey.values()].map((acc) => {
    const variants = [...acc.variants.values()];
    if (variants.some((v) => v.priceCents === null)) acc.reasons.add("no_price");
    const reasons = [...acc.reasons].sort();
    const t = acc.product.template;
    return {
      productKey: acc.product.key,
      titleKeywords: t.keywords,
      categoryPrefix: t.categoryPrefix,
      variants,
      allowedClaims: opts.includeClaims ? t.allowedClaims : [],
      negatedClaims: opts.includeClaims ? t.negatedClaims : [],
      expectedStatus: reasons.length > 0 ? "needs_review" : "done",
      expectedReviewReasons: reasons,
      sourceRows: acc.sourceRows,
      photos: acc.product.photos,
      language: acc.product.lang,
    };
  });

  return {
    sample: opts.sample,
    generatedAt: `seed-${opts.seed}`,
    seed: opts.seed,
    products,
    unmatchedPhotos: opts.unmatchedPhotos ?? [],
    duplicateRows,
  };
}
