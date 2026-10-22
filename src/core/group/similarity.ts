/**
 * String similarity for the near-duplicate badge (EC-C9) and the fuzzy photo rung (EC-C12).
 * Pure and cheap; the only language awareness is foldForMatch.
 */
import { foldForMatch } from "../clean/text";

/** Character trigrams of the folded string, padded like pg_trgm so short titles still compare. */
export function trigramSet(s: string): Set<string> {
  const folded = foldForMatch(typeof s === "string" ? s : "");
  const out = new Set<string>();
  if (folded === "") return out;
  const padded = `  ${folded} `;
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** 0–1 Jaccard over character trigrams of the folded strings. */
export function trigramSimilarity(a: string, b: string): number {
  return jaccard(trigramSet(a), trigramSet(b));
}

/** Optimal string alignment distance. `limit` lets callers stop early and get `limit + 1` back. */
export function damerauLevenshtein(a: string, b: string, limit = Number.POSITIVE_INFINITY): number {
  const s = typeof a === "string" ? a : "";
  const t = typeof b === "string" ? b : "";
  if (s === t) return 0;
  if (Math.abs(s.length - t.length) > limit) return limit + 1;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[t.length];
}
