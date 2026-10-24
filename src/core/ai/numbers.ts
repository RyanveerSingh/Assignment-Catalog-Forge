/**
 * Number audit for the grounding validator (EC-D4): every number the model writes must exist in the
 * source, after unit conversion, or come from the deterministic variant data.
 */
import { parseLength, parseWeight } from "@/core/clean/units";
import type { ProductGroup } from "@/core/types";

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 1000) / 1000);
}

export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) out.add(normalizeNumber(m[0]));
  return out;
}

/** Every number the source supports, including unit conversions and the deterministic variant data. */
export function collectSourceNumbers(group: ProductGroup): Set<string> {
  const out = extractNumbers(group.sourceCorpus);
  // Unit conversions: "7.87 in" in the source makes "20" (cm) legitimate.
  for (const m of group.sourceCorpus.matchAll(/\d+(?:[.,]\d+)?\s?(?:cm|mm|m|in|inch|inches|"|ft|kg|g|lb|lbs|oz)\b/gi)) {
    const len = parseLength(m[0]);
    if (len) {
      out.add(normalizeNumber(String(len.cm)));
      out.add(normalizeNumber(String(Math.round(len.cm * 10))));
    }
    const w = parseWeight(m[0]);
    if (w) {
      out.add(normalizeNumber(String(w.grams)));
      out.add(normalizeNumber(String(w.grams / 1000)));
    }
  }
  for (const v of group.variants) {
    for (const val of Object.values(v.options)) for (const n of extractNumbers(val)) out.add(n);
    if (v.weightGrams !== null) {
      out.add(normalizeNumber(String(v.weightGrams)));
      out.add(normalizeNumber(String(v.weightGrams / 1000)));
    }
    if (v.dimensions) for (const d of Object.values(v.dimensions)) if (typeof d === "number") out.add(normalizeNumber(String(d)));
  }
  return out;
}

/** A unit, percent or degree straight after a number: "100%", "-10 °C", "5-year". */
const UNIT_AFTER_RE = /^[\s-]?(?:%|°|"|(?:cm|mm|m|inch|inches|ft|kg|g|lbs?|oz|l|ml|cl|litres?|liters?|degrees?|grad|w|watts?|v|kw|mah|lm|lumens?|h|hrs?|hours?|years?|yrs?|months?|jahre?|ans?)(?![\p{L}\p{N}]))/iu;
const CONTEXT_CHARS = 30;

export interface NumberInContext {
  value: string;
  /** The number as written with its unit: "100%", "10 °C". */
  written: string;
  /** A unit, percent sign or degree follows it. */
  unit: boolean;
  /** The words around it in the same sentence, for finding a claim term next to it. */
  context: string;
}

/** Every number in the text with what surrounds it; the audit treats a number tied to a unit or a claim as a claim. */
export function numbersInContext(text: string): NumberInContext[] {
  const out: NumberInContext[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const unit = UNIT_AFTER_RE.exec(text.slice(end));
    const before = text.slice(Math.max(0, start - CONTEXT_CHARS), start).split(/[.!?;\n]\s/).pop() ?? "";
    const after = text.slice(end, end + CONTEXT_CHARS).split(/[.!?;\n](?:\s|$)/)[0] ?? "";
    out.push({ value: normalizeNumber(m[0]), written: `${m[0]}${unit ? unit[0] : ""}`.trim(), unit: unit !== null, context: `${before}${m[0]}${after}` });
  }
  return out;
}
