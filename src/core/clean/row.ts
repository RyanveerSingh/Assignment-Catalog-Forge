import { createHash } from "node:crypto";
import type { CanonicalField, CleanedRow, ColumnMapping, CurrencyCode, Dimensions, Issue, ParsedPrice, ParsedSheet, RawRow } from "@/core/types";
import { issue } from "@/core/types";
import { normalizeColor } from "./color";
import { detectCurrencyInHeader, isCurrencyCode } from "./currency";
import { htmlToText, sanitizeDescriptionHtml } from "./html";
import { detectLanguage } from "./language";
import { inferColumnNumberLocale, parsePrice, type NumberLocale } from "./price";
import { cleanCell, isPlaceholder, normalizeText, repairMojibake, truncateForModel } from "./text";
import { formatCm, parseDimensions, parseLength, parseWeight } from "./units";

/**
 * Turn one raw sheet row into a CleanedRow by composing the field cleaners.
 * Never throws: every problem becomes an Issue. Prices, units and identity are deterministic here;
 * nothing in this file is ever decided by a model.
 */

export interface CleanRowContext {
  mappings: ColumnMapping[];
  defaultCurrency: CurrencyCode;
  priceLocale: NumberLocale;
  compareAtLocale: NumberLocale;
  priceHeaderCurrency: CurrencyCode | null;
  compareAtHeaderCurrency: CurrencyCode | null;
}

export function buildCleanRowContext(sheet: Pick<ParsedSheet, "rows">, mappings: ColumnMapping[], defaultCurrency: CurrencyCode): CleanRowContext {
  const priceMap = findMapping(mappings, "price");
  const compareMap = findMapping(mappings, "compare_at_price");
  const column = (m: ColumnMapping | undefined): Array<string | undefined> => (m ? sheet.rows.map((r) => r.cells[m.header]) : []);
  return {
    mappings,
    defaultCurrency,
    priceLocale: priceMap ? inferColumnNumberLocale(column(priceMap)) : "unknown",
    compareAtLocale: compareMap ? inferColumnNumberLocale(column(compareMap)) : "unknown",
    priceHeaderCurrency: priceMap ? detectCurrencyInHeader(priceMap.originalHeader) : null,
    compareAtHeaderCurrency: compareMap ? detectCurrencyInHeader(compareMap.originalHeader) : null,
  };
}

export function findMapping(mappings: ColumnMapping[], field: CanonicalField): ColumnMapping | undefined {
  return mappings.find((m) => m.canonical === field);
}

const LIST_SPLIT = /\s*[,;|\n]\s*/;
const MODEL_TEXT_LIMIT = 20_000;

export function cleanRow(raw: RawRow, ctx: CleanRowContext): CleanedRow {
  const issues: Issue[] = [];
  const get = (field: CanonicalField): string | null => {
    const m = findMapping(ctx.mappings, field);
    if (!m) return null;
    const v = raw.cells[m.header];
    if (v === undefined) return null;
    const repaired = repairMojibake(v);
    if (repaired.repaired) issues.push(issue("text.mojibake_repaired", "info", `Broken text encoding repaired in "${m.header}"`, { field, row: raw.rowNumber, ec: "A4" }));
    return cleanCell(repaired.text);
  };
  const push = (list: Issue[], field: string): void => {
    for (const i of list) issues.push({ ...i, field: i.field ?? field, row: raw.rowNumber });
  };

  // --- identity -------------------------------------------------------------
  const skuDisplay = get("sku");
  const sku = skuDisplay ? normalizeSku(skuDisplay) : null;
  if (!sku) issues.push(issue("sku.missing", "warn", "No SKU in this row; one will be generated", { field: "sku", row: raw.rowNumber, ec: "C6" }));
  const parentRaw = get("parent_sku");
  const handleRaw = get("handle");
  const parentKey = parentRaw ? normalizeSku(parentRaw) : handleRaw ? slugify(handleRaw) : null;

  // --- text -----------------------------------------------------------------
  const title = get("title");
  const descriptionRaw = get("description");
  const sanitized = sanitizeDescriptionHtml(descriptionRaw);
  push(sanitized.issues, "description");
  let descriptionText = sanitized.text;
  if (descriptionText && descriptionText.length > MODEL_TEXT_LIMIT) {
    const t = truncateForModel(descriptionText, MODEL_TEXT_LIMIT);
    descriptionText = t.text;
    issues.push(issue("description.truncated", "info", "Very long description; the model sees the first 20,000 characters", { field: "description", row: raw.rowNumber, ec: "A15" }));
  }

  // --- money ----------------------------------------------------------------
  const currencyCell = get("currency");
  const columnCurrency = currencyCell && isCurrencyCode(currencyCell.toUpperCase()) ? currencyCell.toUpperCase() : null;
  if (currencyCell && !columnCurrency) {
    issues.push(issue("price.currency_unrecognised", "warn", `Currency "${currencyCell}" is not a known code`, { field: "currency", row: raw.rowNumber, value: currencyCell, ec: "B2" }));
  }
  const price = parsePriceField(raw, ctx, "price", columnCurrency, ctx.priceHeaderCurrency, ctx.priceLocale, issues);
  const compareAtPrice = parsePriceField(raw, ctx, "compare_at_price", columnCurrency, ctx.compareAtHeaderCurrency, ctx.compareAtLocale, issues);

  // --- options and attributes ----------------------------------------------
  const options: Record<string, string> = {};
  const sizeOpt = get("option_size");
  if (sizeOpt) options.size = normalizeSizeValue(sizeOpt);
  const colorOpt = get("option_color");
  if (colorOpt) {
    const c = normalizeColor(colorOpt);
    options.color = c.primary ?? colorOpt.toLowerCase();
    if (c.method === "fuzzy") issues.push(issue("color.fuzzy_match", "info", `Colour "${colorOpt}" read as "${c.primary}"`, { field: "option_color", row: raw.rowNumber, ec: "B9" }));
  }
  const materialOpt = get("option_material");
  if (materialOpt) options.material = materialOpt.toLowerCase();
  const variantCell = get("variant");
  if (variantCell) Object.assign(options, parseCombinedVariant(variantCell, options));

  let color: string | null = null;
  const colorAttr = get("color");
  if (colorAttr) {
    const c = normalizeColor(colorAttr);
    color = c.primary ?? colorAttr.toLowerCase();
    if (c.method === "fuzzy") issues.push(issue("color.fuzzy_match", "info", `Colour "${colorAttr}" read as "${c.primary}"`, { field: "color", row: raw.rowNumber, ec: "B9" }));
  }
  const sizeAttr = get("size");
  if (sizeAttr && !options.size) options.size = normalizeSizeValue(sizeAttr);
  const material = get("material") ?? get("option_material");

  // --- physical --------------------------------------------------------------
  let weightGrams: number | null = null;
  const weightRaw = get("weight");
  if (weightRaw) {
    const w = parseWeight(weightRaw);
    if (w) {
      weightGrams = w.grams;
      push(w.issues, "weight");
    } else issues.push(issue("weight.unparseable", "warn", `Could not read weight "${weightRaw}"`, { field: "weight", row: raw.rowNumber, value: weightRaw, ec: "B7" }));
  }
  const dimensions = readDimensions(get, raw.rowNumber, issues);

  // --- lists ---------------------------------------------------------------------
  const images = splitList(get("image")).concat(splitList(get("images")));
  const tags = splitList(get("tags")).map((t) => t.toLowerCase());

  // --- leftovers -------------------------------------------------------------------
  const attributes: Record<string, string> = {};
  for (const m of ctx.mappings) {
    if (m.canonical !== null && m.canonical !== "cost" && m.canonical !== "country_of_origin" && m.canonical !== "vendor") continue;
    const v = raw.cells[m.header];
    const cleaned = v === undefined ? null : cleanCell(repairMojibake(v).text);
    if (cleaned) attributes[m.canonical ?? m.header] = cleaned;
  }

  const quantityRaw = get("quantity");
  const quantity = quantityRaw ? parseQuantity(quantityRaw) : null;
  if (quantityRaw && quantity === null) issues.push(issue("quantity.unparseable", "info", `Could not read quantity "${quantityRaw}"`, { field: "quantity", row: raw.rowNumber, value: quantityRaw }));

  const notes = get("notes");
  const care = get("care");
  const language = detectLanguage([title, descriptionText, notes].filter(Boolean).join(" "));
  if (language.lang !== "en" && language.lang !== "und") {
    issues.push(issue("language.non_english", "info", `Row text appears to be ${language.lang === "de" ? "German" : "French"}`, { row: raw.rowNumber, ec: "B10" }));
  }

  return {
    rowNumber: raw.rowNumber,
    sku,
    skuDisplay,
    parentKey,
    title,
    descriptionHtml: sanitized.html,
    descriptionText,
    category: get("category"),
    brand: get("brand") ?? get("vendor"),
    price,
    compareAtPrice,
    options,
    color,
    weightGrams,
    dimensions,
    images,
    tags,
    notes,
    care,
    material,
    quantity,
    barcode: get("barcode"),
    attributes,
    language,
    issues,
    rowHash: hashRow(raw.cells),
    sourceText: buildSourceText(raw.cells),
  };
}

function parsePriceField(
  raw: RawRow,
  ctx: CleanRowContext,
  field: "price" | "compare_at_price",
  columnCurrency: CurrencyCode | null,
  headerCurrency: CurrencyCode | null,
  locale: NumberLocale,
  issues: Issue[],
): ParsedPrice | null {
  const m = findMapping(ctx.mappings, field);
  if (!m) {
    if (field === "price") issues.push(issue("price.missing", "warn", "The sheet has no price column", { field: "price", row: raw.rowNumber, ec: "B1" }));
    return null;
  }
  const parsed = parsePrice(raw.cells[m.header], { defaultCurrency: ctx.defaultCurrency, columnCurrency, headerCurrency, locale });
  for (const i of parsed.issues) issues.push({ ...i, field: i.field ?? field, row: raw.rowNumber });
  return parsed;
}

function readDimensions(get: (f: CanonicalField) => string | null, row: number, issues: Issue[]): Dimensions | null {
  const dims: Dimensions = {};
  const single = (field: CanonicalField, key: keyof Dimensions): void => {
    const v = get(field);
    if (!v) return;
    const parsed = parseLength(v);
    if (parsed) {
      dims[key] = parsed.cm;
      for (const i of parsed.issues) issues.push({ ...i, field, row });
    } else issues.push(issue("length.unparseable", "warn", `Could not read ${field} "${v}"`, { field, row, value: v, ec: "B7" }));
  };
  single("length", "lengthCm");
  single("width", "widthCm");
  single("height", "heightCm");
  single("diameter", "diameterCm");
  const combined = get("dimensions");
  if (combined) {
    const parsed = parseDimensions(combined);
    if (parsed) {
      for (const [k, v] of Object.entries(parsed.dims) as Array<[keyof Dimensions, number | undefined]>) {
        if (v !== undefined && dims[k] === undefined) dims[k] = v;
      }
      for (const i of parsed.issues) issues.push({ ...i, field: "dimensions", row });
    } else issues.push(issue("dimensions.unparseable", "warn", `Could not read dimensions "${combined}"`, { field: "dimensions", row, value: combined, ec: "B7" }));
  }
  return Object.keys(dims).length ? dims : null;
}

/** "20cm", "20 CM", "Size 20" → "20 cm"; "S", "Large" → "S", "Large" (EC-B18). */
export function normalizeSizeValue(raw: string): string {
  const text = normalizeText(raw).replace(/^(size|größe|groesse|taille)\s*:?\s*/i, "");
  // "50 x 100 cm" is a two-dimensional size (towels, rugs), not a length; keep both numbers.
  if (/\d\s*[x×*]\s*\d/i.test(text)) return text.replace(/\s*[x×*]\s*/gi, " x ");
  const len = parseLength(text);
  if (len && /\d/.test(text)) {
    // Only treat as a length when a unit was present or the value is purely numeric.
    const hasUnit = /(cm|mm|m|in|inch|"|ft)\b/i.test(text) || /^\d+([.,]\d+)?$/.test(text);
    if (hasUnit) return formatCm(len.cm);
  }
  return text.length <= 4 ? text.toUpperCase() : text;
}

/** "20cm / Blue", "Blue, 20 cm", "S - red" → { size: "20 cm", color: "blue" } for the parts not already set. */
export function parseCombinedVariant(raw: string, existing: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = normalizeText(raw)
    .split(/\s*[/,|]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let styleIndex = 0;
  for (const part of parts) {
    const color = normalizeColor(part);
    if (color.primary && !existing.color && !out.color) {
      out.color = color.primary;
      continue;
    }
    const len = parseLength(part);
    if ((len && /\d/.test(part)) || /^(xs|s|m|l|xl|xxl|xxxl|small|medium|large)$/i.test(part)) {
      if (!existing.size && !out.size) out.size = normalizeSizeValue(part);
      continue;
    }
    const key = styleIndex === 0 ? "style" : `style_${styleIndex + 1}`;
    if (!existing[key]) out[key] = part.toLowerCase();
    styleIndex += 1;
  }
  return out;
}

export function normalizeSku(raw: string): string | null {
  const s = normalizeText(raw).replace(/\s+/g, " ").toUpperCase();
  return s && !isPlaceholder(s) ? s : null;
}

export function slugify(raw: string): string {
  return normalizeText(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(LIST_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isPlaceholder(s));
}

function parseQuantity(raw: string): number | null {
  const m = normalizeText(raw).match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Identical content → identical hash, regardless of whitespace or header case (EC-C3). */
export function hashRow(cells: Record<string, string>): string {
  const entries = Object.entries(cells)
    .map(([k, v]) => [k.trim().toLowerCase(), normalizeText(v ?? "")] as const)
    .filter(([, v]) => v.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

/** "column: value" lines for grounding; HTML is reduced to text so quotes match what the model saw. */
export function buildSourceText(cells: Record<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(cells)) {
    if (v === undefined || v === null) continue;
    const repaired = repairMojibake(String(v)).text;
    const text = /<[a-z][\s\S]*>/i.test(repaired) ? htmlToText(repaired) : normalizeText(repaired);
    if (text && !isPlaceholder(text)) lines.push(`${k.trim()}: ${text}`);
  }
  return lines.join("\n");
}
