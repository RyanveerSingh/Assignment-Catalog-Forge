import { foldForMatch } from "@/core/clean/text";
import type { Issue } from "@/core/types";
import { issue } from "@/core/types";
import { assertedIn, claimCoverage, contradictedPhrase, deniesTerm, lexiconTermsIn, ownSpellings } from "./claim-support";
import {
  cellText,
  findContradictionInRows,
  findDenialInRows,
  findQuoteInRows,
  findTermInRows,
  verifyCitation,
  type Found,
  type SourceRowCells,
} from "./grounding-source";
import type { BlockedClaim, BlockedKind, VerifiedClaim } from "./grounding-types";
import { CLAIM_LEXICON, evidenceFor, spellingsOf, type ClaimTerm } from "./lexicon";
import { claimPolarity, tokenizeClauses } from "./negation";
import { extractNumbers } from "./numbers";
import { findOriginClaims, originSupported, placeNames } from "./origin";
import type { AiClaim } from "./schema";
import { stripFromListing, type ListingText } from "./strip";

/**
 * The claim checks of the grounding validator (EC-D2, B15): the model's cited claims, then a sweep
 * of everything it wrote for lexicon terms and origins. Whatever fails is removed from the listing,
 * recorded in `blocked` and, unless it is a soft marketing word, sent to review.
 */

/** Below this share of its content words found in its quote (or the quoted cell), a claim is not what the source says. */
const MIN_COVERAGE = 0.5;

export interface ClaimContext {
  listing: ListingText;
  tags: readonly string[];
  sourceRows: SourceRowCells[];
  sourceCorpus: string;
  corpusTokens: string[];
  /** ` folded corpus `, for whole-word lookups. */
  corpus: string;
  allowedNumbers: ReadonlySet<string>;
  /** A translated listing shares no words with its quotes, so word coverage is not checked. */
  nonEnglish: boolean;
  claims: VerifiedClaim[];
  blocked: BlockedClaim[];
  issues: Issue[];
  reviewReasons: string[];
  /** Removals that cost confidence. */
  stripped: number;
}

interface Rejection {
  kind: BlockedKind;
  reason: string;
  review: string;
  issue: Issue;
  term?: string;
  where?: Found | null;
}

function reject(ctx: ClaimContext, text: string, r: Rejection, phrases: readonly string[]): void {
  const where = r.where ?? null;
  const base: BlockedClaim = { text, kind: r.kind, reason: r.reason, ...(r.term ? { term: r.term } : {}) };
  ctx.blocked.push(where ? { ...base, row: where.row, column: where.column, quote: where.quote } : base);
  ctx.issues.push(r.issue);
  ctx.reviewReasons.push(r.review);
  stripFromListing(ctx.listing, phrases, true);
  ctx.stripped += 1;
}

function entryFor(folded: string): ClaimTerm | undefined {
  return CLAIM_LEXICON.find((e) => !e.placeAfter && (foldForMatch(e.term) === folded || spellingsOf(e).includes(folded)));
}

function entryNamed(term: string): ClaimTerm | undefined {
  return CLAIM_LEXICON.find((e) => e.term === term);
}

function padded(text: string): string {
  return ` ${foldForMatch(text)} `;
}

/** Every spelling of every lexicon term the claim names, plus the claim's own words: what to strip when it falls. */
function claimPhrases(text: string, core: string, entries: readonly ClaimTerm[]): string[] {
  return [...new Set([foldForMatch(text), foldForMatch(core), ...entries.flatMap((e) => [...ownSpellings(e), ...spellingsOf(e)])])];
}

/** Checks each cited claim; returns the lexicon terms it verified so the sweep does not judge them twice. */
export function checkClaims(ctx: ClaimContext, claims: readonly AiClaim[]): Set<string> {
  const claimedTerms = new Set<string>();
  for (const c of claims) {
    const polarity = claimPolarity(c.text);
    const core = foldForMatch(polarity.core);
    const entry = entryFor(core);
    const named = [...new Set([...(entry ? [entry] : []), ...lexiconTermsIn(polarity.core).map(entryNamed).filter((e): e is ClaimTerm => e !== undefined)])];
    const evidence = entry ? [...new Set([foldForMatch(entry.term), ...evidenceFor(entry)])] : [core];
    const strip = claimPhrases(c.text, polarity.core, entry ? [entry] : []);
    const found = verifyCitation(c, ctx.sourceRows, evidence) ?? findTermInRows(ctx.sourceRows, evidence) ?? findQuoteInRows(ctx.sourceRows, c.quote);
    if (!found) {
      reject(ctx, c.text, { kind: "unsupported", reason: "not found in the source cells", review: `AI claimed "${c.text}" but the source does not say it`, issue: unsupportedIssue(c.text) }, strip);
      continue;
    }
    const failure = polarityFailure(ctx, c.text, polarity.negated, named) ?? phraseFailure(ctx, c.text) ?? supportFailure(ctx, c, found);
    if (failure) {
      reject(ctx, c.text, failure, failure.kind === "unsupported" ? strip : claimPhrases(c.text, polarity.core, named));
      continue;
    }
    if (entry) claimedTerms.add(entry.term);
    ctx.claims.push({ text: c.text, source: `row ${found.row}, column ${found.column}`, row: found.row, column: found.column, quote: found.quote, verified: true });
  }
  return claimedTerms;
}

function unsupportedIssue(text: string, why = "is not supported by the source"): Issue {
  return issue("claim.unsupported", "warn", `Claim "${text}" ${why}`, { field: "claims", value: text, ec: "D2" });
}

/**
 * "not frost-proof" against a source that says "not frost-proof" is a faithful claim; the two
 * polarities disagreeing is the one thing that must never reach the storefront (EC-B15). A claim
 * proven only by a quote in another language has nothing to compare against and stands on its citation.
 */
function polarityFailure(ctx: ClaimContext, text: string, claimNegated: boolean, named: readonly ClaimTerm[]): Rejection | null {
  for (const e of named) {
    const denied = deniesTerm(ctx.corpusTokens, e);
    if (!claimNegated && denied) {
      // The claim's own wording asserted verbatim in the source is a qualification, not a denial ("Weatherproof glaze, not frost-proof").
      const used = spellingsOf(e).filter((v) => padded(text).includes(` ${v} `));
      if (used.length > 0 && used.every((v) => assertedIn(ctx.corpusTokens, v))) continue;
      return {
        kind: "negated",
        reason: "the source explicitly negates it",
        term: e.term,
        where: findDenialInRows(ctx.sourceRows, e),
        review: `AI asserted "${text}" but the source negates it`,
        issue: issue("claim.negated", "error", `Source says "not ${e.term}"; the claim "${text}" was removed`, { field: "claims", value: text, ec: "B15" }),
      };
    }
    if (claimNegated && !denied && ownSpellings(e).some((v) => assertedIn(ctx.corpusTokens, v))) {
      return {
        kind: "contradicted",
        reason: "the source asserts it",
        term: e.term,
        where: findTermInRows(ctx.sourceRows, ownSpellings(e)),
        review: `AI denied "${e.term}" but the source asserts it`,
        issue: issue("claim.negated", "error", `Source says "${e.term}" but the claim denies it; the claim was removed`, { field: "claims", value: text, ec: "B15" }),
      };
    }
  }
  return null;
}

/** A phrase the source denies, asserted by the claim even though it is no lexicon term: "Suitable for outdoor use" against "not suitable for outdoor use". */
function phraseFailure(ctx: ClaimContext, text: string): Rejection | null {
  if (!contradictedPhrase(text, ctx.corpusTokens)) return null;
  return {
    kind: "negated",
    reason: "the source explicitly negates it",
    where: findContradictionInRows(ctx.sourceRows, text),
    review: `AI asserted "${text}" but the source negates it`,
    issue: issue("claim.negated", "error", `The source denies what the claim "${text}" asserts; the claim was removed`, { field: "claims", value: text, ec: "B15" }),
  };
}

/** The claim's words must come from its quote (or the cell it quotes), and its numbers from the source. */
function supportFailure(ctx: ClaimContext, c: AiClaim, found: Found): Rejection | null {
  const origin = findOriginClaims(c.text).find((o) => !originSupported(o.place, ctx.sourceCorpus));
  if (origin) {
    return { kind: "unsupported", reason: "the source does not say it was made there", review: `AI claimed "${c.text}" but the source does not say it was made there`, issue: unsupportedIssue(c.text), where: found };
  }
  const missing = [...extractNumbers(c.text)].filter((n) => !ctx.allowedNumbers.has(n));
  if (missing.length > 0) {
    return { kind: "unsupported", reason: `the source does not give ${missing.join(", ")}`, review: `AI claimed "${c.text}" but the source does not give ${missing.join(", ")}`, issue: unsupportedIssue(c.text, `contains numbers the source does not (${missing.join(", ")})`), where: found };
  }
  if (ctx.nonEnglish) return null;
  const coverage = Math.max(claimCoverage(c.text, found.quote), claimCoverage(c.text, c.quote), claimCoverage(c.text, cellText(ctx.sourceRows, found.row, found.column)));
  if (coverage >= MIN_COVERAGE) return null;
  return { kind: "unsupported", reason: "its quote does not say it", review: `AI claimed "${c.text}" but its quote does not say it`, issue: unsupportedIssue(c.text, "is not what its quote says"), where: found };
}

/** Sweeps the listing for lexicon terms and origins the model wrote without citing them. */
export function sweepLexicon(ctx: ClaimContext, claimedTerms: ReadonlySet<string>): void {
  for (const entry of CLAIM_LEXICON) {
    if (claimedTerms.has(entry.term)) continue;
    const listingText = [ctx.listing.title, ctx.listing.descriptionText, ...Object.values(ctx.listing.attributes), ...ctx.tags].join(". ");
    if (entry.placeAfter) {
      checkOrigins(ctx, listingText);
      continue;
    }
    const spellings = [...new Set([...ownSpellings(entry), ...spellingsOf(entry)])];
    const text = padded(listingText);
    const hits = spellings.filter((v) => text.includes(` ${v} `));
    if (hits.length === 0) continue;
    // Supporting evidence ("solid oak") proves presence; only the term's spellings decide negation.
    const evidence = evidenceFor(entry);
    const inSource = evidence.some((v) => ctx.corpus.includes(` ${v} `));
    const sourceDenied = deniesTerm(ctx.corpusTokens, entry) && !hits.every((h) => assertedIn(ctx.corpusTokens, h));
    if (deniesTerm(tokenizeClauses(listingText), entry)) {
      // The listing itself denies the term. Fine when the source denies it too; otherwise it is invented.
      if (sourceDenied) continue;
      const rejection: Rejection = inSource
        ? { kind: "contradicted", reason: "the source asserts it", term: entry.term, where: findTermInRows(ctx.sourceRows, evidence), review: `Listing says "not ${entry.term}" but the source says it is`, issue: issue("claim.unsupported", "warn", `Listing says "not ${entry.term}" but the source says "${entry.term}"`, { value: entry.term, ec: "D2" }) }
        : { kind: "unsupported", reason: "the source never mentions it", term: entry.term, review: `Listing says "not ${entry.term}" but the source does not mention it`, issue: issue("claim.unsupported", "warn", `Listing says "not ${entry.term}" but the source never mentions it`, { value: entry.term, ec: "D2" }) };
      reject(ctx, `not ${entry.term}`, rejection, spellings);
      continue;
    }
    if (sourceDenied) {
      reject(ctx, entry.term, { kind: "negated", reason: "the source explicitly negates it", term: entry.term, where: findDenialInRows(ctx.sourceRows, entry), review: `Listing says "${entry.term}" but the source negates it`, issue: issue("claim.negated", "error", `Source says "not ${entry.term}"; removed from the listing`, { value: entry.term, ec: "B15" }) }, spellings);
    } else if (!inSource) {
      if (entry.soft) {
        // A marketing adjective the source does not back is simply removed; no reviewer needs to see it.
        ctx.blocked.push({ text: entry.term, kind: "unsupported", reason: "not found in the source cells", term: entry.term });
        ctx.issues.push(issue("claim.unsupported", "info", `"${entry.term}" appears in the listing but not in the source; removed`, { value: entry.term, ec: "D2" }));
        stripFromListing(ctx.listing, spellings, true);
        continue;
      }
      reject(ctx, entry.term, { kind: "unsupported", reason: "not found in the source cells", term: entry.term, review: `Listing says "${entry.term}" but the source does not`, issue: issue("claim.unsupported", "warn", `"${entry.term}" appears in the listing but not in the source`, { value: entry.term, ec: "D2" }) }, spellings);
    } else {
      // Supported but not cited: keep it, record where it comes from.
      const found = findTermInRows(ctx.sourceRows, evidence);
      if (found) ctx.claims.push({ text: entry.term, source: `row ${found.row}, column ${found.column}`, row: found.row, column: found.column, quote: found.quote, verified: true });
    }
  }
}

/**
 * "Made in Germany" stands only on a source clause that says it was produced there (EC-D2):
 * "Designed in Germany, made in China" backs "Made in China" and nothing else.
 */
function checkOrigins(ctx: ClaimContext, listingText: string): void {
  for (const o of findOriginClaims(listingText)) {
    const where = findTermInRows(ctx.sourceRows, placeNames(o.place));
    if (originSupported(o.place, ctx.sourceCorpus)) {
      if (where) ctx.claims.push({ text: `made in ${o.place}`, source: `row ${where.row}, column ${where.column}`, row: where.row, column: where.column, quote: where.quote, verified: true });
      continue;
    }
    const reason = where ? `the source names ${o.place} but not as where it was made` : "the source never mentions it";
    reject(ctx, o.phrase, { kind: "unsupported", reason, term: "made in", where, review: `Listing says "${o.phrase}" but the source does not say it was made there`, issue: issue("claim.unsupported", "warn", `"${o.phrase}" is not supported by the source`, { value: o.phrase, ec: "D2" }) }, [foldForMatch(o.phrase)]);
  }
}
