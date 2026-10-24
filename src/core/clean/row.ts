import { createHash } from "node:crypto";
import type { CanonicalField, CleanedRow, ColumnMapping, CurrencyCode, Dimensions, Issue, ParsedPrice, ParsedSheet, RawRow } from "@/core/types";
import { issue } from "@/core/types";
import { normalizeColor } from "./color";
import { DOLLAR_CURRENCIES, detectCurrencyInHeader, extractCurrency, isCurrencyCode } from "./currency";
import { htmlToText, sanitizeDescriptionHtml } from "./html";
import { detectLanguage } from "./language";
import { inferColumnNumberLocale, parsePrice, type NumberLocale } from "./price";
import { cleanCell, isPlaceholder, normalizeText, repairMojibake, truncateForModel } from "./text";
import { formatCm, parseDimensions, parseLength, readWeight, unitFromHeader, type LengthUnit } from "./units";

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
  /** The currency most price cells state; bare cells in the same column inherit it (EC-B2). */
  priceColumnCurrency?: CurrencyCode | null;
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
    priceColumnCurrency: priceMap ? dominantValueCurrency(column(priceMap), defaultCurrency) : null,
  };
}

/**
 * "$12" on some rows and "12.00" on others: the bare cells are the same supplier's dollars, not the
 * store default. Only an overwhelming majority counts (≥ 80% of the cells that state a currency).
 */
export function dominantValueCurrency(values: Array<string | null | undefined>, defaultCurrency: CurrencyCode): CurrencyCode | null {
  // A bare "$" means the store's own dollar when it has one, as parsePrice reads it.
  const dollar = DOLLAR_CURRENCIES.has(defaultCurrency) ? defaultCurrency : "USD";
  const counts = new Map<CurrencyCode, number>();
  let stated = 0;
  for (const v of values) {
    if (typeof v !== "string" || v.trim() === "") continue;
    const found = extractCurrency(v);
    if (!found.currency) continue;
    const code = found.bareDollar ? dollar : found.currency;
    stated++;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: [CurrencyCode, number] | null = null;
  for (const entry of counts) if (best === null || entry[1] > best[1]) best = entry;
  return best !== null && best[1] / stated >= 0.8 ? best[0] : null;
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
  const columnCurrency = currencyCell ? readCurrencyCell(currencyCell) : null;
  if (currencyCell && !columnCurrency) {
    issues.push(issue("price.currency_unrecognised", "warn", `Currency "${currencyCell}" is not a known code`, { field: "currency", row: raw.rowNumber, value: currencyCell, ec: "B2" }));
  }
  const price = parsePriceField(raw, ctx, "price", columnCurrency, ctx.priceHeaderCurrency, ctx.priceLocale, issues);
  const compareAtPrice = parsePriceField(raw, ctx, "compare_at_price", columnCurrency, ctx.compareAtHeaderCurrency, ctx.compareAtLocale, issues);

  // --- options and attributes ----------------------------------------------
  const lengthUnit = (field: CanonicalField): LengthUnit | null => unitFromHeader(findMapping(ctx.mappings, field)?.originalHeader).length;
  const options: Record<string, string> = {};
  const sizeOpt = get("option_size");
  if (sizeOpt) options.size = normalizeSizeValue(sizeOpt, lengthUnit("option_size"));
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
  if (sizeAttr && !options.size) options.size = normalizeSizeValue(sizeAttr, lengthUnit("size"));
  const shopify = readShopifyOptions(raw, ctx.mappings);
  for (const [k, v] of Object.entries(shopify.options)) if (!options[k]) options[k] = v;
  const material = get("material") ?? get("option_material");

  // --- physical --------------------------------------------------------------
  let weightGrams: number | null = null;
  const weightRaw = get("weight");
  if (weightRaw) {
    // "Gewicht (kg)" with a bare 2 is 2 kg, not 2 g (EC-B7).
    const headerUnit = unitFromHeader(findMapping(ctx.mappings, "weight")?.originalHeader).weight;
    const w = readWeight(weightRaw, { headerUnit });
    if (w.weight) weightGrams = w.weight.grams;
    if (w.issues.length > 0) push(w.issues, "weight");
    else if (!w.weight) issues.push(issue("weight.unparseable", "warn", `Could not read weight "${weightRaw}"`, { field: "weight", row: raw.rowNumber, value: weightRaw, ec: "B7" }));
  }
  const dimensions = readDimensions(get, lengthUnit, raw.rowNumber, issues);

  // --- lists ---------------------------------------------------------------------
  const images = splitList(get("image")).concat(splitList(get("images")));
  const tags = splitList(get("tags")).map((t) => t.toLowerCase());

  // --- leftovers -------------------------------------------------------------------
  const attributes: Record<string, string> = {};
  Object.assign(attributes, shopify.names);
  for (const m of ctx.mappings) {
    if (m.canonical !== null && m.canonical !== "cost" && m.canonical !== "country_of_origin" && m.canonical !== "vendor") continue;
    if (SHOPIFY_OPTION_RE.test(m.originalHeader.trim())) continue;
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

/** A currency column holds "EUR", but also "Euro", "€" or "C$" (EC-B2); anything with more in it is not a currency. */
function readCurrencyCell(cell: string): CurrencyCode | null {
  const upper = cell.trim().toUpperCase();
  if (isCurrencyCode(upper)) return upper;
  const found = extractCurrency(cell);
  return found.currency !== null && found.rest === "" ? found.currency : null;
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
  const parsed = parsePrice(raw.cells[m.header], {
    defaultCurrency: ctx.defaultCurrency,
    columnCurrency,
    headerCurrency,
    valueCurrency: field === "price" ? (ctx.priceColumnCurrency ?? null) : null,
    locale,
  });
  for (const i of parsed.issues) issues.push({ ...i, field: i.field ?? field, row: raw.rowNumber });
  return parsed;
}

function readDimensions(
  get: (f: CanonicalField) => string | null,
  headerUnit: (f: CanonicalField) => LengthUnit | null,
  row: number,
  issues: Issue[],
): Dimensions | null {
  const dims: Dimensions = {};
  const single = (field: CanonicalField, key: keyof Dimensions): void => {
    const v = get(field);
    if (!v) return;
    const parsed = parseLength(v, { headerUnit: headerUnit(field) });
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
    const parsed = parseDimensions(combined, { headerUnit: headerUnit("dimensions") });
    if (parsed) {
      for (const [k, v] of Object.entries(parsed.dims) as Array<[keyof Dimensions, number | undefined]>) {
        if (v !== undefined && dims[k] === undefined) dims[k] = v;
      }
      for (const i of parsed.issues) issues.push({ ...i, field: "dimensions", row });
    } else issues.push(issue("dimensions.unparseable", "warn", `Could not read dimensions "${combined}"`, { field: "dimensions", row, value: combined, ec: "B7" }));
  }
  return Object.keys(dims).length ? dims : null;
}

/** "20cm", "20 CM", "Size 20" → "20 cm"; "S", "Large" → "S", "Large" (EC-B18). A bare number takes the header's unit. */
export function normalizeSizeValue(raw: string, headerUnit: LengthUnit | null = null): string {
  const text = normalizeText(raw).replace(/^(size|größe|groesse|taille)\s*:?\s*/i, "");
  // "50 x 100 cm" is a two-dimensional size (towels, rugs), not a length; keep both numbers.
  if (/\d\s*[x×*]\s*\d/i.test(text)) return text.replace(/\s*[x×*]\s*/gi, " x ");
  const len = parseLength(text, { headerUnit });
  if (len && /\d/.test(text)) {
    // Only treat as a length when a unit was present or the value is purely numeric.
    const hasUnit = /(cm|mm|m|in|inch|"|ft)\b/i.test(text) || /^\d+([.,]\d+)?$/.test(text);
    if (hasUnit) return formatCm(len.cm);
  }
  return text.length <= 4 ? text.toUpperCase() : text;
}

/** Shopify export columns "Option1 Name" … "Option3 Value" (EC-B4, EC-C7). */
export const SHOPIFY_OPTION_RE = /^option\s*([1-3])\s*(name|value)$/i;
const SIZE_NAMES: ReadonlySet<string> = new Set(["size", "sizes", "grösse", "größe", "groesse", "taille", "dimension", "dimensions"]);
const COLOR_NAMES: ReadonlySet<string> = new Set(["color", "colour", "colors", "colours", "farbe", "couleur", "coloris"]);
const MATERIAL_NAMES: ReadonlySet<string> = new Set(["material", "materials", "matériau", "matière", "werkstoff"]);

/**
 * One Shopify option as a [key, value] pair: "Size"/"20cm" → ["size", "20 cm"], "Color"/"Blau" → ["color", "blue"].
 * Shopify's placeholder "Title"/"Default Title" means the product has no options, so it gives null.
 */
export function shopifyOption(name: string, value: string): [string, string] | null {
  const key = normalizeText(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const text = normalizeText(value);
  if (text === "" || (key === "title" && /^default title$/i.test(text))) return null;
  if (SIZE_NAMES.has(key)) return ["size", normalizeSizeValue(text)];
  if (COLOR_NAMES.has(key)) return ["color", normalizeColor(text).primary ?? text.toLowerCase()];
  if (MATERIAL_NAMES.has(key)) return ["material", text.toLowerCase()];
  return [key || "option", text.toLowerCase()];
}

/**
 * Child rows of a Shopify export leave "Option1 Name" blank; their values are kept under "option1"
 * until grouping renames them from the parent row's names (kept as attributes "option1_name").
 */
function readShopifyOptions(raw: RawRow, mappings: ColumnMapping[]): { options: Record<string, string>; names: Record<string, string> } {
  const names = new Map<string, string>();
  const values = new Map<string, string>();
  for (const m of mappings) {
    const match = SHOPIFY_OPTION_RE.exec(m.originalHeader.trim());
    const v = match ? raw.cells[m.header] : undefined;
    const cell = v === undefined ? null : cleanCell(repairMojibake(v).text);
    if (!match || !cell) continue;
    (match[2].toLowerCase() === "name" ? names : values).set(match[1], cell);
  }
  const options: Record<string, string> = {};
  const nameAttrs: Record<string, string> = {};
  for (const [n, name] of names) if (!/^title$/i.test(name)) nameAttrs[`option${n}_name`] = name;
  for (const [n, value] of values) {
    const name = names.get(n);
    if (name === undefined) {
      options[`option${n}`] = value;
      continue;
    }
    const pair = shopifyOption(name, value);
    if (pair) options[pair[0]] = pair[1];
  }
  return { options, names: nameAttrs };
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
