import { foldForMatch } from "@/core/clean/text";
import { NEGATION_TOKENS } from "./lexicon";

/**
 * Polarity helpers for the grounding validator (EC-B15): which clause a claim lives in, whether a
 * term is negated there, and where the negation sits so the drawer can point at it.
 */

const NEGATION_WINDOW = 3;
/** Marks a clause boundary in token streams so "will not scratch floors. Suits hallways" cannot negate "suits". */
export const BOUNDARY = "|";
const CLAUSE_SPLIT = /[.;:!?,()\n]+|\s[-–—]\s/;

/**
 * "Not frost-proof; bring indoors" → { core: "frost proof", negated: true }. Only the first clause
 * carries the polarity; a claim is one statement, and the rest is qualification.
 */
export function claimPolarity(text: string): { core: string; negated: boolean } {
  const firstClause = text.split(CLAUSE_SPLIT).find((s) => foldForMatch(s).length > 0) ?? text;
  const tokens = foldForMatch(firstClause).split(" ").filter(Boolean);
  let negated = false;
  while (tokens.length > 1 && NEGATION_TOKENS.includes(tokens[0] ?? "")) {
    tokens.shift();
    negated = true;
  }
  return { core: tokens.join(" "), negated };
}

/** Fold text into match tokens, keeping clause boundaries so a negation never leaks into the next sentence. */
export function tokenizeClauses(text: string): string[] {
  const out: string[] = [];
  for (const clause of text.split(CLAUSE_SPLIT)) {
    const tokens = foldForMatch(clause).split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    if (out.length > 0) out.push(BOUNDARY);
    out.push(...tokens);
  }
  return out;
}

function matchesAt(tokens: string[], at: number, term: string[]): boolean {
  for (let j = 0; j < term.length; j++) if (tokens[at + j] !== term[j]) return false;
  return true;
}

/** Index of the negation governing the term that starts at `at`, or -1: within three tokens, same clause. */
function negationBefore(tokens: string[], at: number): number {
  for (let k = at - 1, steps = 0; k >= 0 && steps < NEGATION_WINDOW; k--, steps++) {
    const t = tokens[k];
    if (t === undefined || t === BOUNDARY) return -1;
    if (NEGATION_TOKENS.includes(t)) return k;
  }
  return -1;
}

/**
 * True when every occurrence of the term is preceded by a negation within three tokens of the same
 * clause (EC-B15). Tokens from `tokenizeClauses` carry boundaries; plain token arrays work too.
 */
export function isNegated(corpusTokens: string[], variants: string[]): boolean {
  let occurrences = 0;
  let negated = 0;
  for (const v of variants) {
    const term = v.split(" ");
    for (let i = 0; i + term.length <= corpusTokens.length; i++) {
      if (!matchesAt(corpusTokens, i, term)) continue;
      occurrences += 1;
      if (negationBefore(corpusTokens, i) >= 0) negated += 1;
    }
  }
  return occurrences > 0 && negated === occurrences;
}

/** Token range [start, end) of the first negated occurrence, from the negation word to the end of the term. */
export function findNegatedSpan(tokens: string[], variants: string[]): { start: number; end: number } | null {
  for (const v of variants) {
    const term = v.split(" ");
    for (let i = 0; i + term.length <= tokens.length; i++) {
      if (!matchesAt(tokens, i, term)) continue;
      const k = negationBefore(tokens, i);
      if (k >= 0) return { start: k, end: i + term.length };
    }
  }
  return null;
}
