/**
 * Claim comparison for the eval: folding, allow-list matching, negation counting and the eval's own
 * citation check against the raw rows. Pure; shared by metrics.ts and the report.
 */
import { foldForMatch, repairMojibake } from "@/core/clean/text";


/** Lower-case, accent-free, punctuation → space: "Dishwasher-Safe" and "dishwasher safe" compare equal. */
export function foldClaim(text: string): string {
  return foldForMatch(text);
}

function tokens(folded: string): string[] {
  return folded.split(" ").filter(Boolean);
}

function subset(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.length > 0 && a.every((t) => set.has(t));
}

/**
 * The eval's own citation check, independent of the validator: the claim's quote must appear in one
 * of the product's raw cells (after mojibake repair and folding), verbatim or with at least 90% of its
 * tokens. A one-word quote counts only as a whole word of at least four letters ("planter", not "in")
 * or an acronym written in capitals ("FSC", "BPA").
 */
export function quoteFoundInRows(rows: Array<{ cells: Record<string, string> }>, quote: string): boolean {
  const folded = foldForMatch(repairMojibake(quote).text);
  const needle = tokens(folded);
  const acronym = /^[A-Z0-9]{2,5}$/.test(quote.trim());
  if (needle.length === 0 || (needle.length === 1 && folded.length < 4 && !acronym)) return false;
  for (const r of rows) {
    for (const cell of Object.values(r.cells)) {
      const hay = ` ${foldForMatch(repairMojibake(cell ?? "").text)} `;
      if (hay.includes(` ${folded} `)) return true;
      if (needle.length < 2) continue;
      const set = new Set(tokens(hay));
      if (needle.filter((t) => set.has(t)).length / needle.length >= 0.9) return true;
    }
  }
  return false;
}

/** Same claim when the words of one all appear in the other ("organic" ⊂ "100% organic cotton"). */
export function sameClaim(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  return a === b || subset(ta, tb) || subset(tb, ta);
}

/** A claim asserts a negated claim when it is the negated phrase, a part of it, or its joined spelling ("frostproof"). */
export function assertsNegated(claim: string, negated: string): boolean {
  return claim === negated || subset(tokens(claim), tokens(negated)) || claim === negated.replace(/ /g, "");
}

const NEGATIONS: ReadonlySet<string> = new Set(["not", "no", "non", "never", "without", "nicht", "kein", "keine", "ohne", "pas", "sans", "aucun", "aucune", "jamais"]);
const NEGATION_WINDOW = 3;

/** Occurrences of `phrase` in folded `text` that are not negated within three tokens before ("not frost-proof" does not count). */
export function countAsserted(text: string, phrase: string): number {
  const words = tokens(text);
  const forms = [tokens(phrase)];
  if (forms[0].length > 1) forms.push([forms[0].join("")]);
  let count = 0;
  for (const needle of forms) {
    if (needle.length === 0) continue;
    for (let i = 0; i + needle.length <= words.length; i++) {
      if (!needle.every((t, j) => words[i + j] === t)) continue;
      const before = words.slice(Math.max(0, i - NEGATION_WINDOW), i);
      if (!before.some((t) => NEGATIONS.has(t))) count += 1;
    }
  }
  return count;
}
