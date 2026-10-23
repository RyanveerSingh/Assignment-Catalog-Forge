/**
 * Steps 5–6 of grouping: the product-level fields chosen across a group's rows, the complexity
 * score and the source hash.
 */
import { createHash } from "node:crypto";
import { foldForMatch } from "../clean/text";
import type { CleanedRow, DetectedLanguage, Issue, Lang, ProductGroup } from "../types";
import { stripOptionTokens } from "./options";

/** Most frequent (base) title, ties broken by length then by earliest row, so the choice is stable. */
export function pickTitle(rows: CleanedRow[], strip: boolean): string | null {
  const counts = new Map<string, { text: string; count: number; row: number }>();
  for (const r of rows) {
    if (!r.title) continue;
    const text = strip ? stripOptionTokens(r.title) : r.title;
    const id = foldForMatch(text);
    const entry = counts.get(id);
    if (entry) entry.count++;
    else counts.set(id, { text, count: 1, row: r.rowNumber });
  }
  let best: { text: string; count: number; row: number } | null = null;
  for (const c of counts.values()) {
    if (!best || c.count > best.count || (c.count === best.count && (c.text.length > best.text.length || (c.text.length === best.text.length && c.row < best.row)))) best = c;
  }
  return best ? best.text : null;
}

export function pickDescription(rows: CleanedRow[]): { html: string | null; text: string | null } {
  let best: CleanedRow | null = null;
  for (const r of rows) {
    const len = r.descriptionText?.length ?? r.descriptionHtml?.length ?? -1;
    if (len < 0) continue;
    const bestLen = best ? (best.descriptionText?.length ?? best.descriptionHtml?.length ?? -1) : -1;
    if (len > bestLen) best = r;
  }
  return best ? { html: best.descriptionHtml, text: best.descriptionText } : { html: null, text: null };
}

export function firstNonNull(rows: CleanedRow[], pick: (r: CleanedRow) => string | null): string | null {
  for (const r of rows) {
    const v = pick(r);
    if (v !== null && v !== "") return v;
  }
  return null;
}

export function mergeAttributes(rows: CleanedRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.attributes)) if (!(k in out)) out[k] = v;
  }
  return out;
}

export function majorityLanguage(rows: CleanedRow[]): DetectedLanguage {
  const votes = new Map<Lang, { total: number; n: number }>();
  for (const r of rows) {
    const v = votes.get(r.language.lang) ?? { total: 0, n: 0 };
    v.total += r.language.confidence;
    v.n++;
    votes.set(r.language.lang, v);
  }
  let winner: DetectedLanguage = { lang: "und", confidence: 0 };
  let bestTotal = -1;
  for (const [lang, v] of votes) {
    if (v.total > bestTotal) {
      bestTotal = v.total;
      winner = { lang, confidence: Math.round(v.total / v.n) };
    }
  }
  return winner;
}

export function unique(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

export function dedupeIssues(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const id = `${i.code}|${i.row ?? ""}|${i.field ?? ""}|${i.value ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function complexityOf(g: Omit<ProductGroup, "complexity" | "sourceHash">, rows: CleanedRow[], inferred: boolean): number {
  const all = [...g.issues, ...g.conflicts, ...g.variants.flatMap((v) => v.issues)];
  let score = 0;
  if (all.some((i) => i.severity === "error")) score += 25;
  score += Math.min(30, 10 * g.issues.filter((i) => i.severity === "warn").length);
  if (g.language.lang !== "en" && g.language.lang !== "und") score += 15;
  if (!g.descriptionText) score += 15;
  if (g.conflicts.length > 0) score += 20;
  if (g.variants.length > 10) score += 10;
  if (!g.title) score += 15;
  if (rows.some((r) => r.issues.some((i) => i.code === "html.unsafe_removed"))) score += 10;
  if (inferred) score += 10;
  return Math.min(100, score);
}

/** Hash over the normalised inputs only; variants sorted by SKU so row order cannot change it (EC-D20). */
export function hashSource(g: Omit<ProductGroup, "complexity" | "sourceHash">): string {
  const variants = g.variants
    .map((v) => ({ sku: v.sku, options: v.options, priceCents: v.priceCents, currency: v.currency, weightGrams: v.weightGrams }))
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
  const payload = [g.productKey, variants, g.title, g.descriptionText, g.category, g.brand, g.notes, g.care, g.material, g.tags, g.images];
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) out[k] = canonical(record[k]);
    return out;
  }
  return value;
}
