import type { ExportProduct, ExportVariant } from "./types";

export interface CsvOptions {
  /** Prefix the output with a UTF-8 BOM so Excel decodes umlauts correctly (EC-I6). */
  bom?: boolean;
  delimiter?: "," | ";";
}

export const PRODUCT_CSV_COLUMNS: ReadonlyArray<string> = [
  "handle",
  "title",
  "status",
  "review_reason",
  "category",
  "tags",
  "vendor",
  "description_html",
  "meta_title",
  "meta_description",
  "attributes",
  "claims",
  "confidence_title",
  "confidence_category",
  "source_rows",
  "variant_sku",
  "variant_options",
  "price",
  "currency",
  "compare_at_price",
  "weight_grams",
  "length_cm",
  "width_cm",
  "height_cm",
  "diameter_cm",
  "barcode",
  "quantity",
  "images",
];

export const CSV_BOM = "﻿";
const EOL = "\r\n";
const LIST_SEPARATOR = "|";

/**
 * Characters Excel, LibreOffice and Google Sheets treat as the start of a formula when a
 * CSV is opened directly (EC-I6). Tab and CR are included because some spreadsheets strip
 * them before looking at the next character.
 */
const FORMULA_START_RE = /^[=+\-@\t\r]/;

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    // Circular structures are a programmer error upstream; an empty cell beats a crashed export.
    return "";
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return "";
  return safeJson(value);
}

/**
 * RFC 4180 escaping of one cell plus the EC-I6 formula guard. Numbers are emitted as-is
 * (they can neither contain the delimiter nor start a formula, and prefixing them would
 * turn prices into text in Excel). Objects and arrays become a JSON string.
 */
export function csvEscape(value: unknown, opts: CsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ",";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";

  let text = cellText(value);
  if (text === "") return "";
  if (FORMULA_START_RE.test(text)) text = `'${text}`;

  const needsQuotes =
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\r") ||
    text.includes("\n") ||
    text.startsWith(" ") ||
    text.endsWith(" ");
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV record, terminated with CRLF as RFC 4180 prescribes. */
export function csvLine(cells: ReadonlyArray<unknown>, opts: CsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ",";
  return cells.map((c) => csvEscape(c, opts)).join(delimiter) + EOL;
}

/** Integer cents → "12.99". Done with integer arithmetic so no float rounding can creep in. */
export function centsToDecimal(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  const rounded = Math.round(cents);
  const abs = Math.abs(rounded);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${rounded < 0 ? "-" : ""}${major}.${minor}`;
}

function productCells(p: ExportProduct): unknown[] {
  const reasons = (p.reviewReasons ?? []).filter((r) => typeof r === "string" && r.length > 0);
  return [
    p.handle ?? "",
    p.title ?? "",
    p.status ?? "",
    reasons.join("; "),
    p.category ?? "",
    (p.tags ?? []).join(LIST_SEPARATOR),
    p.vendor ?? "",
    p.descriptionHtml ?? "",
    p.seo?.metaTitle ?? "",
    p.seo?.metaDescription ?? "",
    safeJson(p.attributes ?? {}),
    safeJson(p.claims ?? []),
    p.confidence?.title ?? "",
    p.confidence?.category ?? "",
    (p.sourceRows ?? []).join(LIST_SEPARATOR),
  ];
}

/** Product images first, then any variant-specific ones, so nothing is lost in a flat file. */
function imageList(p: ExportProduct, v: ExportVariant | null): string[] {
  const urls = [...(p.imageUrls ?? []), ...(v?.imageUrls ?? [])].filter(
    (u) => typeof u === "string" && u.length > 0,
  );
  return Array.from(new Set(urls));
}

function variantCells(p: ExportProduct, v: ExportVariant | null): unknown[] {
  const dims = v?.dimensionsCm ?? null;
  return [
    v?.sku ?? "",
    v ? safeJson(v.options ?? {}) : "",
    centsToDecimal(v?.priceCents),
    v?.currency ?? "",
    centsToDecimal(v?.compareAtCents),
    v?.weightGrams ?? "",
    dims?.lengthCm ?? "",
    dims?.widthCm ?? "",
    dims?.heightCm ?? "",
    dims?.diameterCm ?? "",
    v?.barcode ?? "",
    v?.quantity ?? "",
    imageList(p, v).join(LIST_SEPARATOR),
  ];
}

/**
 * Flat CSV: header first, then one record per variant with the product columns repeated.
 * A product without variants still gets one record so it is not silently dropped.
 * Each yielded chunk is a complete line so the caller can stream it straight out (EC-J7).
 */
export function* streamProductsCsv(
  products: Iterable<ExportProduct>,
  opts: CsvOptions = {},
): Generator<string, void, unknown> {
  const header = csvLine(PRODUCT_CSV_COLUMNS, opts);
  yield opts.bom ? CSV_BOM + header : header;

  for (const p of products) {
    if (p == null) continue;
    const base = productCells(p);
    const variants = (p.variants ?? []).filter((v) => v != null);
    if (variants.length === 0) {
      yield csvLine([...base, ...variantCells(p, null)], opts);
      continue;
    }
    for (const v of variants) {
      yield csvLine([...base, ...variantCells(p, v)], opts);
    }
  }
}
