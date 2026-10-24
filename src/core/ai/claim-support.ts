import { foldForMatch } from "@/core/clean/text";
import { CLAIM_LEXICON, evidenceFor, spellingsOf, type ClaimTerm } from "./lexicon";
import { BOUNDARY, findDeniedUse, isNegated, isNegationToken, negatedAt, tokenizeClauses } from "./negation";

/**
 * Does a claim say what its quote says? (EC-D2, B15.) A citation proves the quote exists; these
 * helpers prove the claim's words come from it, and catch a claim that asserts a phrase the source
 * denies even when the phrase is not a lexicon term ("Frost-proof down to -10 °C" against "not
 * frost-proof", "Suitable for outdoor use" against "not suitable for outdoor use").
 */

const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "and", "or", "but", "of", "for", "to", "in", "on", "at", "by", "with", "from", "as", "into", "onto", "per", "via",
  "is", "are", "be", "been", "was", "were", "it", "its", "this", "that", "these", "those", "can", "will", "may", "so", "very", "fully", "also", "all", "any", "each", "your", "you", "our", "we",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "und", "oder", "mit", "fur", "von", "zu", "im", "am", "ist", "sind", "auf", "aus",
  "le", "la", "les", "un", "une", "et", "ou", "de", "du", "en", "au", "aux", "avec", "pour", "sur", "est", "sont", "d", "l", "n", "s",
]);
/** Skipped when reading what a negation denies: "not suitable for outdoor use" denies "outdoor use". */
const NEGATION_FILLER: ReadonlySet<string> = new Set([
  ...STOPWORDS, "suitable", "geeignet", "adapte", "adaptee", "make", "makes", "making", "get", "gets", "do", "does", "did", "have", "has", "t",
  "isn", "aren", "wasn", "weren", "doesn", "don", "didn", "won", "couldn", "shouldn", "wouldn", "hasn", "haven", "hadn",
]);
/** Words that mean nothing on their own after a negation: "not included" denies nothing a claim could name. */
const GENERIC: ReadonlySet<string> = new Set([
  "included", "include", "includes", "required", "needed", "necessary", "available", "recommended", "supplied", "possible", "intended", "provided", "allowed", "applicable",
]);
const MAX_PHRASE = 2;
const MIN_SINGLE_WORD = 6;

/** Crude stem: enough to equate "washable"/"wash", "planters"/"planter", "glazed"/"glaze". */
export function stem(token: string): string {
  if (/^\d/.test(token)) return token;
  for (const [suffix, replacement] of SUFFIXES) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) return token.slice(0, -suffix.length) + replacement;
  }
  return token;
}

const SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ["ingly", ""], ["ically", "ic"], ["ness", ""], ["ing", ""], ["ies", "y"], ["ied", "y"], ["ed", ""], ["es", ""], ["ly", ""], ["s", ""], ["e", ""],
];
/** GENERIC as stems, since negated phrases are compared stemmed ("included" → "includ"). */
const GENERIC_STEMS: ReadonlySet<string> = new Set([...GENERIC].map(stem));

/** Same word, allowing one to extend the other ("wash" in "washable", "frost" in "frostproof"). */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && !/^\d/.test(short) && long.startsWith(short);
}

/** Stemmed content words: folded, stopwords and negations removed, single letters dropped. */
export function contentStems(text: string): string[] {
  const tokens = foldForMatch(text).split(" ").filter(Boolean);
  return tokens.filter((t, i) => !STOPWORDS.has(t) && !isNegationToken(tokens, i) && (t.length > 1 || /\d/.test(t))).map(stem);
}

function padded(text: string): string {
  return ` ${foldForMatch(text)} `;
}

/**
 * Share of the claim's content words found in its quote. A lexicon term the quote proves in another
 * spelling or language counts as found ("dishwasher-safe" quoting "spülmaschinenfest").
 */
export function claimCoverage(claim: string, quote: string): number {
  const stems = contentStems(claim);
  if (stems.length === 0) return 1;
  const quoteStems = contentStems(quote);
  const claimText = padded(claim);
  const quoteText = padded(quote);
  const covered: string[] = [];
  for (const entry of CLAIM_LEXICON) {
    const proven = evidenceFor(entry).some((v) => quoteText.includes(` ${v} `));
    if (!proven) continue;
    for (const spelling of [...evidenceFor(entry), foldForMatch(entry.term)]) {
      if (claimText.includes(` ${spelling} `)) covered.push(...contentStems(spelling));
    }
  }
  const found = stems.filter((s) => covered.includes(s) || quoteStems.some((q) => sameStem(s, q)));
  return found.length / stems.length;
}

/** Lexicon entries the claim text names, by any spelling ("100% organic cotton cover" → organic). */
export function lexiconTermsIn(text: string): string[] {
  const hay = padded(text);
  return CLAIM_LEXICON.filter((e) => !e.placeAfter && [...spellingsOf(e), foldForMatch(e.term)].some((v) => hay.includes(` ${v} `))).map((e) => e.term);
}

export interface NegatedPhrase {
  /** Stemmed content words the negation governs. */
  stems: string[];
  /** Token range in the tokens it was read from, negation included. */
  start: number;
  end: number;
}

/** Content words a negation governs, read forwards ("not frost-proof") or back from a bare "no" ("Dishwasher-safe? No"). */
export function negatedPhrases(tokens: readonly string[]): NegatedPhrase[] {
  const out: NegatedPhrase[] = [];
  for (let k = 0; k < tokens.length; k++) {
    if (!isNegationToken(tokens, k)) continue;
    const forward = collect(tokens, k + 1, 1);
    if (forward) out.push({ stems: forward.stems, start: k, end: forward.edge + 1 });
  }
  for (let k = 1; k < tokens.length; k++) {
    if (!["no", "none", "nein", "non", "nope"].includes(tokens[k] ?? "")) continue;
    const next = tokens[k + 1];
    if (next !== undefined && next !== BOUNDARY) continue;
    const back = collect(tokens, k - 1, -1);
    if (back && !isNegationToken(tokens, back.edge - 1)) out.push({ stems: [...back.stems].reverse(), start: back.edge, end: k + 1 });
  }
  return out.filter((p) => p.stems.length >= 2 || (p.stems[0] !== undefined && p.stems[0].length >= MIN_SINGLE_WORD && !GENERIC_STEMS.has(p.stems[0])));
}

function collect(tokens: readonly string[], from: number, step: 1 | -1): { stems: string[]; edge: number } | null {
  const stems: string[] = [];
  let edge = from;
  for (let i = from; i >= 0 && i < tokens.length && stems.length < MAX_PHRASE; i += step) {
    const t = tokens[i];
    if (t === undefined || t === BOUNDARY || isNegationToken(tokens, i)) break;
    edge = i;
    if (NEGATION_FILLER.has(t) || t.length < 2) continue;
    stems.push(stem(t));
  }
  return stems.length > 0 ? { stems, edge } : null;
}

/** Stemmed content words of a token stream, with the index each came from. */
function indexedStems(tokens: readonly string[]): Array<{ stem: string; at: number }> {
  const out: Array<{ stem: string; at: number }> = [];
  tokens.forEach((t, i) => {
    if (t === BOUNDARY || NEGATION_FILLER.has(t) || isNegationToken(tokens, i) || t.length < 2) return;
    out.push({ stem: stem(t), at: i });
  });
  return out;
}

function containsAll(haystack: ReadonlyArray<{ stem: string }>, stems: readonly string[]): boolean {
  return stems.every((s) => haystack.some((h) => sameStem(h.stem, s)));
}

/** True when the source also states the phrase without a negation somewhere, which makes the denial a qualification. */
function assertedElsewhere(tokens: readonly string[], phrase: NegatedPhrase, negated: readonly NegatedPhrase[]): boolean {
  const first = phrase.stems[0];
  if (first === undefined) return false;
  for (const { stem: s, at } of indexedStems(tokens)) {
    if (!sameStem(s, first)) continue;
    if (negated.some((p) => at >= p.start && at < p.end)) continue;
    if (negatedAt(tokens, at, 1)) continue;
    // The rest of the phrase must follow in the same clause to be the same statement.
    const rest = indexedStems(tokens.slice(at, nextBoundary(tokens, at)));
    if (containsAll(rest, phrase.stems)) return true;
  }
  return false;
}

function nextBoundary(tokens: readonly string[], from: number): number {
  const i = tokens.indexOf(BOUNDARY, from);
  return i < 0 ? tokens.length : i;
}

/**
 * The phrase the source denies and the claim asserts, if any. Faithful negations ("Not suitable for
 * outdoor use" against the same words) pass; a source that also asserts the phrase elsewhere is not a denial.
 */
export function contradictedPhrase(claim: string, sourceTokens: readonly string[]): NegatedPhrase | null {
  const claimTokens = tokenizeClauses(claim);
  const claimStems = indexedStems(claimTokens);
  const claimDenials = negatedPhrases(claimTokens);
  const sourceDenials = negatedPhrases(sourceTokens);
  for (const phrase of sourceDenials) {
    if (!containsAll(claimStems, phrase.stems)) continue;
    const deniedToo = claimDenials.some((d) => phrase.stems.every((s) => d.stems.some((x) => sameStem(x, s))));
    if (deniedToo) continue;
    if (assertedElsewhere(sourceTokens, phrase, sourceDenials)) continue;
    return phrase;
  }
  return null;
}

/** Token positions where a folded phrase starts. */
function occurrencesOf(tokens: readonly string[], phrase: string): number[] {
  const words = phrase.split(" ").filter(Boolean);
  const out: number[] = [];
  if (words.length === 0) return out;
  for (let i = 0; i + words.length <= tokens.length; i++) if (words.every((w, j) => tokens[i + j] === w)) out.push(i);
  return out;
}

/** The term's own spellings (its folded name included): what an explicit denial must name. */
export function ownSpellings(entry: ClaimTerm): string[] {
  return [...new Set([foldForMatch(entry.term), ...entry.variants])];
}

/** True when the phrase occurs in the tokens at least once without a negation. */
export function assertedIn(tokens: readonly string[], phrase: string): boolean {
  const length = phrase.split(" ").filter(Boolean).length;
  return occurrencesOf(tokens, phrase).some((at) => !negatedAt(tokens, at, length));
}

function occursIn(tokens: readonly string[], phrases: readonly string[]): boolean {
  return phrases.some((p) => occurrencesOf(tokens, p).length > 0);
}

/**
 * Whether the text denies a lexicon term (EC-B15). The term's own spellings decide when the text
 * uses them ("Frost-resistant, not frost-proof"); otherwise its paraphrases do; otherwise a ruled-out
 * use does ("Not suitable for dishwasher or microwave" denies dishwasher-safe).
 */
export function deniesTerm(tokens: readonly string[], entry: ClaimTerm): boolean {
  const own = ownSpellings(entry);
  if (occursIn(tokens, own)) return isNegated(tokens, own);
  const synonyms = entry.synonyms ?? [];
  if (occursIn(tokens, synonyms)) return isNegated(tokens, synonyms);
  return entry.uses ? findDeniedUse(tokens, entry.uses) !== null : false;
}
