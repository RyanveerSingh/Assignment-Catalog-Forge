import { mapColumns } from "@/core/parse/headers";
import type { CanonicalField, CleanedRow, ColumnMapping, Dimensions, Issue, Lang, ParsedPrice, Severity } from "@/core/types";
import { repairMojibake } from "./text";
import { formatCm } from "./units";

/**
 * The cleaning X-ray: every deterministic transformation the cleaner applied to one row before the
 * model saw anything, as raw → cleaned pairs with the issue that explains them. Rebuilt from the stored
 * raw cells, the stored CleanedRow and its issues, so nothing is recomputed that could drift from what
 * actually ran. Only fields that changed or carried an issue are listed.
 */

export interface CleaningXrayEntry {
  /** Canonical field ("price", "weight") or the raw column header for unmapped cells. */
  field: string;
  /** Column header the raw value was read from, when there is one. */
  column?: string;
  raw: string;
  cleaned: string;
  note?: string;
  severity?: Severity;
}

const EMPTY = "—";
const CLIP = 400;
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { info: 0, warn: 1, error: 2 };
const LANGUAGE_NAMES: Readonly<Record<Lang, string>> = { en: "English", de: "German", fr: "French", und: "undetermined" };
const HAS_TAG_RE = /<[a-z][\s\S]*>/i;
const OPEN_TAG_RE = /<\s*[a-zA-Z][^>]*>/g;
const DIMENSION_FIELDS: ReadonlyArray<readonly [CanonicalField, keyof Dimensions]> = [
  ["length", "lengthCm"],
  ["width", "widthCm"],
  ["height", "heightCm"],
  ["diameter", "diameterCm"],
];

type Note = Pick<CleaningXrayEntry, "note" | "severity">;

export function buildCleaningXray(raw: Record<string, string>, cleaned: CleanedRow, issues: Issue[], mappings?: ColumnMapping[]): CleaningXrayEntry[] {
  // The import's own column map is what the cleaner used; re-deriving it from the headers is the fallback.
  const maps = mappings && mappings.length > 0 ? mappings : mapColumns(Object.keys(raw), [Object.values(raw).map((v) => String(v ?? ""))]);
  const pending = new Set(issues);
  const entries: CleaningXrayEntry[] = [];

  const cell = (field: CanonicalField): { column: string; value: string } | null => {
    const m = maps.find((x) => x.canonical === field);
    if (!m) return null;
    const value = raw[m.header];
    if (value === undefined || value === null || String(value).trim() === "") return null;
    return { column: m.header, value: String(value) };
  };
  const take = (match: (i: Issue) => boolean): Note | null => {
    const hits = [...pending].filter(match);
    if (hits.length === 0) return null;
    for (const h of hits) pending.delete(h);
    return { note: hits.map((i) => i.message).join(" "), severity: hits.reduce<Severity>((s, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[s] ? i.severity : s), "info") };
  };
  const notes = (...fields: string[]): Note | null => take((i) => i.field !== undefined && fields.includes(i.field));
  const add = (entry: CleaningXrayEntry): void => {
    entries.push({ ...entry, raw: clip(entry.raw), cleaned: clip(entry.cleaned) });
  };

  // --- encoding repair runs first so its issues are not mistaken for field notes (EC-A4) ---
  for (const [column, value] of Object.entries(raw)) {
    const text = String(value ?? "");
    const repaired = repairMojibake(text);
    if (!repaired.repaired) continue;
    add({ field: maps.find((m) => m.header === column)?.canonical ?? column, column, raw: text, cleaned: repaired.text, note: "Broken text encoding repaired", severity: "info" });
  }
  take((i) => i.code === "text.mojibake_repaired");

  // --- identity (EC-B14, C6); a blank SKU cell leaves its issue to the catch-all at the end ---
  const sku = cell("sku");
  if (sku) {
    const skuNote = notes("sku");
    if (skuNote || cleaned.sku !== sku.value) add({ field: "sku", column: sku.column, raw: sku.value, cleaned: cleaned.sku ?? EMPTY, ...skuNote });
  }

  // --- plain text: placeholders and whitespace (EC-B13) ---
  const textFields: ReadonlyArray<readonly [CanonicalField, string | null]> = [
    ["title", cleaned.title],
    ["category", cleaned.category],
    ["brand", cleaned.brand],
    ["notes", cleaned.notes],
    ["care", cleaned.care],
    ["material", cleaned.material],
    ["barcode", cleaned.barcode],
  ];
  for (const [field, value] of textFields) {
    const c = cell(field);
    if (!c) continue;
    const repaired = repairMojibake(c.value).text;
    if (value === null) add({ field, column: c.column, raw: c.value, cleaned: EMPTY, note: "Placeholder treated as empty", severity: "info" });
    else if (value !== repaired) add({ field, column: c.column, raw: c.value, cleaned: value, note: "Whitespace and invisible characters normalised" });
  }

  // --- money (EC-B1, B2, B5) ---
  for (const [field, parsed] of [
    ["price", cleaned.price],
    ["compare_at_price", cleaned.compareAtPrice],
  ] as const) {
    const c = cell(field);
    if (!c || !parsed) continue;
    add({ field, column: c.column, raw: c.value, cleaned: describePrice(parsed), ...(notes(field) ?? currencyNote(parsed)) });
  }
  const currency = cell("currency");
  if (currency) {
    const currencyNotes = notes("currency");
    if (currencyNotes) add({ field: "currency", column: currency.column, raw: currency.value, cleaned: EMPTY, ...currencyNotes });
  }

  // --- physical units (EC-B7, B8); "450 g" → "450 g" is not a change and stays out ---
  const weight = cell("weight");
  if (weight) {
    const n = notes("weight");
    const grams = cleaned.weightGrams !== null ? `${cleaned.weightGrams} g` : EMPTY;
    if (n || !sameUnitText(weight.value, grams)) add({ field: "weight", column: weight.column, raw: weight.value, cleaned: grams, ...n });
  }
  for (const [field, key] of DIMENSION_FIELDS) {
    const c = cell(field);
    if (!c) continue;
    const n = notes(field);
    const cm = cleaned.dimensions?.[key];
    const shown = cm !== undefined ? formatCm(cm) : EMPTY;
    if (n || !sameUnitText(c.value, shown)) add({ field, column: c.column, raw: c.value, cleaned: shown, ...n });
  }
  const dims = cell("dimensions");
  if (dims) add({ field: "dimensions", column: dims.column, raw: dims.value, cleaned: cleaned.dimensions ? describeDimensions(cleaned.dimensions) : EMPTY, ...notes("dimensions") });

  // --- description HTML (EC-B11, B12, A15) ---
  const description = cell("description");
  if (description) {
    const hasTags = HAS_TAG_RE.test(description.value);
    const removed = Math.max(0, countOpenTags(description.value) - countOpenTags(cleaned.descriptionHtml ?? ""));
    const n = notes("description");
    if (hasTags || n) {
      const tagNote = removed > 0 ? `${removed} tag${removed === 1 ? "" : "s"} removed.` : hasTags ? "Allow-listed HTML; no tags removed." : null;
      add({ field: "description", column: description.column, raw: description.value, cleaned: cleaned.descriptionText ?? EMPTY, note: [tagNote, n?.note].filter(Boolean).join(" "), severity: n?.severity });
    }
  }

  // --- options and colour (EC-B9, B18) ---
  for (const [field, value] of [
    ["color", cleaned.color],
    ["option_color", cleaned.options.color ?? null],
  ] as const) {
    const c = cell(field);
    if (!c) continue;
    const n = notes(field);
    if (n || (value ?? "") !== c.value.trim().toLowerCase()) add({ field, column: c.column, raw: c.value, cleaned: value ?? EMPTY, ...n });
  }
  for (const field of ["option_size", "size"] as const) {
    const c = cell(field);
    if (c && (cleaned.options.size ?? "") !== c.value.trim()) add({ field, column: c.column, raw: c.value, cleaned: cleaned.options.size ?? EMPTY, ...notes(field) });
  }
  const variant = cell("variant");
  if (variant) {
    const options = Object.entries(cleaned.options).map(([k, v]) => `${k}: ${v}`);
    add({ field: "variant", column: variant.column, raw: variant.value, cleaned: options.length ? options.join(" · ") : EMPTY, ...notes("variant") });
  }
  const quantity = cell("quantity");
  if (quantity) {
    const quantityNote = notes("quantity");
    if (quantityNote || String(cleaned.quantity ?? "") !== quantity.value.trim()) add({ field: "quantity", column: quantity.column, raw: quantity.value, cleaned: cleaned.quantity === null ? EMPTY : String(cleaned.quantity), ...quantityNote });
  }

  // --- language (EC-B10): only a detected non-English language is a finding; "undetermined" says nothing ---
  if (cleaned.language.lang === "de" || cleaned.language.lang === "fr") {
    add({ field: "language", raw: "(title, description, notes)", cleaned: `${LANGUAGE_NAMES[cleaned.language.lang]} · ${cleaned.language.confidence}%`, ...(take((i) => i.code === "language.non_english") ?? { severity: "info" }) });
  }

  // --- anything the cleaner flagged that no entry above explained ---
  for (const i of pending) {
    const m = i.field === undefined ? undefined : maps.find((x) => x.canonical === i.field || x.header === i.field);
    const column = m?.header;
    const shown = [i.value, column === undefined ? undefined : raw[column]].map((v) => (v === undefined || v === null ? "" : String(v))).find((v) => v.trim() !== "");
    add({ field: i.field ?? "row", column, raw: shown ?? EMPTY, cleaned: EMPTY, note: i.message, severity: i.severity });
  }

  return entries;
}

function clip(s: string): string {
  return s.length > CLIP ? `${s.slice(0, CLIP)}…` : s;
}

/** "450g", "450 g" and "20,0 cm" vs "20 cm" are the same reading; only a real conversion is worth a row. */
function sameUnitText(raw: string, cleaned: string): boolean {
  const read = (s: string): string => {
    const t = s.toLowerCase().replace(/\s+/g, "").replace(",", ".");
    const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(t);
    return m ? `${Number(m[1])}${m[2]}` : t;
  };
  return read(raw) === read(cleaned);
}

function describePrice(p: ParsedPrice): string {
  return p.money ? `${p.money.cents} cents · ${p.money.currency}` : EMPTY;
}

/** Where the currency came from when no issue says so; a currency written in the value needs no note. */
function currencyNote(p: ParsedPrice): Note | null {
  if (p.currencySource === "column") return { note: "Currency from the currency column", severity: "info" };
  if (p.currencySource === "header") return { note: "Currency from the column header", severity: "info" };
  return null;
}

function describeDimensions(d: Dimensions): string {
  const parts: string[] = [];
  const lwh = [
    ["L", d.lengthCm],
    ["W", d.widthCm],
    ["H", d.heightCm],
  ].filter((x): x is [string, number] => typeof x[1] === "number");
  if (lwh.length) parts.push(`${lwh.map(([k, v]) => `${k} ${v}`).join(" × ")} cm`);
  if (d.diameterCm !== undefined) parts.push(`Ø ${formatCm(d.diameterCm)}`);
  return parts.length ? parts.join(" · ") : EMPTY;
}

function countOpenTags(html: string): number {
  return (html.match(OPEN_TAG_RE) ?? []).length;
}

/** Structural check for a stored `import_rows.cleaned` blob; the column is typed `unknown` in the schema. */
export function isCleanedRow(value: unknown): value is CleanedRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.rowNumber === "number" && typeof v.options === "object" && v.options !== null && typeof v.language === "object" && v.language !== null;
}

/** The import's stored column map, when it looks like one. */
export function asColumnMappings(value: unknown): ColumnMapping[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ok = value.every((m) => typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).header === "string" && "canonical" in (m as Record<string, unknown>));
  return ok ? (value as ColumnMapping[]) : undefined;
}
