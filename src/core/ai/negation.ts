import { foldForMatch } from "@/core/clean/text";
import { NEGATION_TOKENS } from "./lexicon";

/**
 * Polarity helpers for the grounding validator (EC-B15): which clause a claim lives in, whether a
 * term is negated there, and where the negation sits so the drawer can point at it.
 *
 * Tokens stay as the supplier wrote them (folded), so a negation can always be quoted back from the
 * cell; contractions and bare "no" answers are recognised in place instead of being rewritten.
 */

const NEGATION_WINDOW = 3;
/** Marks a clause boundary in token streams so "will not scratch floors. Suits hallways" cannot negate "suits". */
export const BOUNDARY = "|";
const CLAUSE_SPLIT = /[.;:!?,()\n]+|\s[-–—]\s/;

/** "isn't" folds to "isn t": the "t" negates when it follows one of these stems. */
const CONTRACTED_STEMS: ReadonlySet<string> = new Set([
  "isn", "aren", "wasn", "weren", "doesn", "don", "didn", "won", "can", "couldn", "shouldn", "wouldn", "hasn", "haven", "hadn", "mustn", "needn", "ain",
]);
/** Contractions written without the apostrophe, and words that carry their own negation. */
const FUSED_NEGATIONS: ReadonlySet<string> = new Set([
  "isnt", "arent", "wasnt", "werent", "doesnt", "dont", "didnt", "wont", "cant", "cannot", "couldnt", "shouldnt", "wouldnt", "hasnt", "havent", "mustnt",
  "unsuitable", "unsafe", "ungeeignet", "inadapte", "inadaptee", "none", "neither", "nor", "nein",
]);
/** A bare answer after the phrase it denies: "Dishwasher-safe? No.", "Frostsicher: nein". */
const POST_NEGATIONS: ReadonlySet<string> = new Set(["no", "none", "nein", "non", "nope"]);
/**
 * "X? no" / "X: none" / "X – non": the separator would split the answer into its own clause, so it is
 * dropped first and the answer joins the phrase it denies. Only a bare answer qualifies; "Note: no
 * drainage hole" keeps its separator because "no" there heads a new phrase.
 */
const POST_ANSWER_RE = /\s*(?:[?:]|\s[-–—])\s*(no|none|nein|non|nope)\s*(?=$|[.;,!?)\n])/giu;
/** Auxiliaries that may precede a claim's negation: "Won't scratch floors", "Is not frost-proof". */
const LEADING_AUX: ReadonlySet<string> = new Set(["is", "are", "was", "does", "do", "did", "will", "can", "it", "this", "they", "ist", "est", "n", "ne"]);

/** True when the token at `k` negates: "not", "kein", the "t" of "isn t", "cannot", "unsuitable". */
export function isNegationToken(tokens: readonly string[], k: number): boolean {
  const t = tokens[k];
  if (t === undefined || t === BOUNDARY) return false;
  if (NEGATION_TOKENS.includes(t) || FUSED_NEGATIONS.has(t)) return true;
  return t === "t" && CONTRACTED_STEMS.has(tokens[k - 1] ?? "");
}

/** Start of the negation at `k`, widened to include the contracted stem so "isn t" quotes as "isn't". */
function negationStart(tokens: readonly string[], k: number): number {
  return tokens[k] === "t" && k > 0 ? k - 1 : k;
}

/** Joins a bare "no" answer to the phrase it answers, before clauses are split. */
export function attachPostAnswers(text: string): string {
  return text.replace(POST_ANSWER_RE, " $1");
}

/** Fold text into match tokens, keeping clause boundaries so a negation never leaks into the next sentence. */
export function tokenizeClauses(text: string): string[] {
  const out: string[] = [];
  for (const clause of attachPostAnswers(text).split(CLAUSE_SPLIT)) {
    const tokens = foldForMatch(clause).split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    if (out.length > 0) out.push(BOUNDARY);
    out.push(...tokens);
  }
  return out;
}

/**
 * "Not frost-proof; bring indoors" → { core: "frost proof", negated: true }. Only the first clause
 * carries the polarity; a claim is one statement, and the rest is qualification. "Isn't frost-proof",
 * "Won't scratch floors" and "Dishwasher-safe: no" are negated too.
 */
export function claimPolarity(text: string): { core: string; negated: boolean } {
  const firstClause = attachPostAnswers(text).split(CLAUSE_SPLIT).find((s) => foldForMatch(s).length > 0) ?? text;
  const tokens = foldForMatch(firstClause).split(" ").filter(Boolean);
  let negated = false;
  const leadingNegation = (): number => {
    let i = 0;
    while (i < tokens.length - 1 && LEADING_AUX.has(tokens[i] ?? "") && !isNegationToken(tokens, i)) i++;
    if (isNegationToken(tokens, i)) return i + 1;
    // "isn t": the stem is the auxiliary and "t" the negation.
    if (isNegationToken(tokens, i + 1) && tokens[i + 1] === "t") return i + 2;
    return -1;
  };
  for (let cut = leadingNegation(); cut > 0 && cut < tokens.length; cut = leadingNegation()) {
    tokens.splice(0, cut);
    negated = true;
  }
  if (tokens.length > 1 && POST_NEGATIONS.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
    negated = !negated;
  }
  return { core: tokens.join(" "), negated };
}

function matchesAt(tokens: readonly string[], at: number, term: readonly string[]): boolean {
  for (let j = 0; j < term.length; j++) if (tokens[at + j] !== term[j]) return false;
  return true;
}

/** Index of the negation governing the term that starts at `at`, or -1: within three tokens, same clause. */
function negationBefore(tokens: readonly string[], at: number): number {
  for (let k = at - 1, steps = 0; k >= 0 && steps < NEGATION_WINDOW; k--, steps++) {
    const t = tokens[k];
    if (t === undefined || t === BOUNDARY) return -1;
    if (isNegationToken(tokens, k)) return negationStart(tokens, k);
  }
  return -1;
}

/**
 * A bare "no" straight after the term that closes its clause: "dishwasher safe no" (from
 * "Dishwasher-safe? No."). "BPA free non toxic" is a list, not an answer, so the clause must end there.
 */
function negationAfter(tokens: readonly string[], end: number): number {
  if (!POST_NEGATIONS.has(tokens[end] ?? "")) return -1;
  const next = tokens[end + 1];
  return next === undefined || next === BOUNDARY ? end : -1;
}

/**
 * Whether the occurrence of a phrase at [at, at + length) is negated: a negation within three tokens
 * before it, or a bare "no" answer right after it. Works on any folded token array, with or without
 * clause boundaries, so the eval counts negations exactly the way the validator does.
 */
export function negatedAt(tokens: readonly string[], at: number, length: number): boolean {
  return negationBefore(tokens, at) >= 0 || negationAfter(tokens, at + length) >= 0;
}

/**
 * True when every occurrence of the term is negated in its clause (EC-B15). Tokens from
 * `tokenizeClauses` carry boundaries; plain token arrays work too.
 */
export function isNegated(corpusTokens: readonly string[], variants: readonly string[]): boolean {
  let occurrences = 0;
  let negated = 0;
  for (const v of variants) {
    const term = v.split(" ");
    for (let i = 0; i + term.length <= corpusTokens.length; i++) {
      if (!matchesAt(corpusTokens, i, term)) continue;
      occurrences += 1;
      if (negatedAt(corpusTokens, i, term.length)) negated += 1;
    }
  }
  return occurrences > 0 && negated === occurrences;
}

/** Token range [start, end) of the first negated occurrence, covering the negation word and the term. */
export function findNegatedSpan(tokens: readonly string[], variants: readonly string[]): { start: number; end: number } | null {
  for (const v of variants) {
    const term = v.split(" ");
    for (let i = 0; i + term.length <= tokens.length; i++) {
      if (!matchesAt(tokens, i, term)) continue;
      const k = negationBefore(tokens, i);
      if (k >= 0) return { start: k, end: i + term.length };
      const after = negationAfter(tokens, i + term.length);
      if (after >= 0) return { start: i, end: after + 1 };
    }
  }
  return null;
}

/** Words that may sit between a negation and the use it rules out: "not suitable for the", "do not put in". */
const USE_LINKS: ReadonlySet<string> = new Set([
  "suitable", "safe", "for", "in", "into", "the", "a", "an", "use", "used", "put", "place", "go", "goes", "or", "and", "nor", "either", "recommended", "intended",
  "geeignet", "fur", "die", "den", "der", "das", "im", "in", "oder", "und", "geben", "verwenden",
  "convient", "pas", "au", "aux", "a", "la", "le", "les", "dans", "passe", "va", "mettre", "ou", "et", "adapte", "adaptee",
]);

/**
 * Token range of a negation that rules out a use rather than naming the claim: "Not suitable for
 * dishwasher or microwave" denies dishwasher-safe and microwave-safe, "Do not put in the dishwasher"
 * denies dishwasher-safe. `stems` are the folded use words ("dishwasher", "lave vaisselle").
 */
export function findDeniedUse(tokens: readonly string[], stems: readonly string[]): { start: number; end: number } | null {
  if (stems.length === 0) return null;
  const stemTokens = stems.map((s) => s.split(" "));
  for (let k = 0; k < tokens.length; k++) {
    if (!isNegationToken(tokens, k)) continue;
    for (let i = k + 1; i < tokens.length && i <= k + 8; i++) {
      const t = tokens[i];
      if (t === undefined || t === BOUNDARY) break;
      const hit = stemTokens.find((s) => matchesAt(tokens, i, s));
      if (hit) return { start: negationStart(tokens, k), end: i + hit.length };
      if (!USE_LINKS.has(t) && !CONTRACTED_STEMS.has(t) && !ANY_USE_STEM.has(t)) break;
    }
  }
  return null;
}

/** Use words of every lexicon entry, so a list ("dishwasher or microwave") is walked through. */
const ANY_USE_STEM: ReadonlySet<string> = new Set([
  "dishwasher", "dishwashers", "microwave", "microwaves", "oven", "ovens", "freezer", "freezers", "tumble", "dryer", "dryers", "washing", "machine",
  "spulmaschine", "geschirrspuler", "mikrowelle", "backofen", "ofen", "gefrierschrank", "waschmaschine", "trockner",
  "lave", "vaisselle", "micro", "ondes", "four", "congelateur", "machine",
]);
