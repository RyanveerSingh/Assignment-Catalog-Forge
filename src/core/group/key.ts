/**
 * Deterministic product identity (EC-C1, C6, C10): the same rows always produce the same keys,
 * so a re-upload upserts instead of duplicating.
 */
import { createHash } from "node:crypto";
import { normalizeColor } from "../clean/color";
import { foldForMatch } from "../clean/text";
import type { CleanedRow } from "../types";
import { stripOptionTokens } from "./options";

const SEPARATOR = /([-_/.\s]+)/;
const EDGE_SEPARATORS = /^[-_/.\s]+|[-_/.\s]+$/g;
const NUMERIC = /^\d+$/;
const SIZE_TOKEN = /^(?:\d+(?:cm|mm|m|in)|xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)$/i;

/** Only unambiguous colour words count; a fuzzy hit would turn "TEAK" into "teal". */
function isColorWord(segment: string): boolean {
  const c = normalizeColor(segment);
  return c.primary !== null && c.method !== "fuzzy";
}

/**
 * "TC-PL-20" → "TC-PL", "TC-PL-20-BLUE" → "TC-PL", "MUG-RED" → "MUG". Returns null when the SKU
 * carries no variant suffix ("ABC123") or nothing would remain.
 */
export function deriveSkuStem(sku: string): string | null {
  if (typeof sku !== "string") return null;
  const trimmed = sku.trim().replace(EDGE_SEPARATORS, "");
  if (trimmed === "") return null;
  const parts = trimmed.split(SEPARATOR);
  const segments: string[] = [];
  const separators: string[] = [];
  parts.forEach((p, i) => (i % 2 === 0 ? segments : separators).push(p));

  let keep = segments.length;
  while (keep > 0) {
    const seg = segments[keep - 1];
    const before = keep - 1;
    const droppable =
      NUMERIC.test(seg) || SIZE_TOKEN.test(seg) || isColorWord(seg) || (seg.length <= 2 && before >= 2);
    if (!droppable) break;
    keep--;
  }
  if (keep === segments.length || keep < 1) return null;
  let stem = segments[0];
  for (let i = 1; i < keep; i++) stem += separators[i - 1] + segments[i];
  return stem;
}

/** Comparison form of a title with its option tokens removed: "Planter 20cm Blue" and "Planter 30cm" agree. */
export function titleKey(title: string): string {
  if (typeof title !== "string") return "";
  return foldForMatch(stripOptionTokens(title));
}

/** "GEN-" + the first 8 hex characters of sha256(rowHash): stable across re-uploads of the same row (EC-C6). */
export function syntheticSku(row: CleanedRow): string {
  const hash = typeof row.rowHash === "string" ? row.rowHash : "";
  return `GEN-${createHash("sha256").update(hash).digest("hex").slice(0, 8).toUpperCase()}`;
}
