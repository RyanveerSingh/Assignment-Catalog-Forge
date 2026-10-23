import { sanitizeDescriptionHtml, htmlToText } from "@/core/clean/html";
import { foldForMatch } from "@/core/clean/text";
import type { Issue, ProductGroup } from "@/core/types";
import { issue } from "@/core/types";
import { findNegationInRows, findQuoteInRows, findTermInRows, prepareSourceRows, verifyCitation, type Found } from "./grounding-source";
import { CLAIM_LEXICON, evidenceFor, PLACE_AFTER_RE } from "./lexicon";
import { collectSourceNumbers, extractNumbers } from "./numbers";
import { claimPolarity, isNegated, tokenizeClauses } from "./negation";
import { clampConfidence, type AiProductOutput } from "./schema";
import { nearestTaxonomyPath, resolveSourceCategory, TAXONOMY, TAXONOMY_FALLBACK } from "./taxonomy";

export { claimPolarity, isNegated, tokenizeClauses };

/**
 * Grounding validator: checks the model's words against the supplier's text.
 * It does not trust the model. Anything it cannot find in the source is removed and the product
 * is sent to review with a reason (EC-D2, D3, D4, D7, B15). Everything it removes is reported in
 * `blocked`, pointing at the source cell that contradicts the listing when there is one.
 */

export { collectSourceNumbers, extractNumbers } from "./numbers";

export interface GroundingInput {
  output: AiProductOutput;
  group: ProductGroup;
  rows: Array<{ row: number; cells: Record<string, string> }>;
}

export interface GroundedContent {
  title: string;
  descriptionHtml: string | null;
  category: string;
  tags: string[];
  attributes: Record<string, string>;
  seo: { metaTitle: string | null; metaDescription: string | null };
}

export interface VerifiedClaim {
  text: string;
  source: string;
  row: number;
  column: string;
  quote: string;
  verified: boolean;
}

/** unsupported: nowhere in the source. negated: the source says "not X". contradicted: the listing says "not X", the source says X. */
export type BlockedKind = "unsupported" | "negated" | "contradicted";

/** A claim the validator removed or a lexicon term it stripped from the text; shown as a guardrail in the review drawer. */
export interface BlockedClaim {
  text: string;
  kind: BlockedKind;
  reason: string;
  /** Canonical lexicon term, when the block came from the lexicon sweep. */
  term?: string;
  /** The source cell holding the negation or the assertion the listing contradicts; absent when nothing was found. */
  row?: number;
  column?: string;
  quote?: string;
}

export interface GroundingResult {
  content: GroundedContent;
  claims: VerifiedClaim[];
  blocked: BlockedClaim[];
  confidence: Record<string, number>;
  reviewReasons: string[];
  status: "draft" | "needs_review";
  issues: Issue[];
}

export function groundProductOutput(input: GroundingInput): GroundingResult {
  const { output, group, rows } = input;
  const issues: Issue[] = [];
  const reviewReasons: string[] = [];
  const blocked: BlockedClaim[] = [];

  const corpus = ` ${foldForMatch(group.sourceCorpus)} `;
  const corpusTokens = tokenizeClauses(group.sourceCorpus);
  const sourceRows = prepareSourceRows(rows);
  const nonEnglish = group.language.lang !== "en" && group.language.lang !== "und";

  // --- 1. sanitise the model's HTML (defence in depth) -------------------------
  const sanitized = sanitizeDescriptionHtml(output.description_html);
  let descriptionHtml = sanitized.html;
  let descriptionText = sanitized.text ?? "";
  let title = output.title.replace(/\s+/g, " ").trim().slice(0, 120);
  const attributes: Record<string, string> = {};
  for (const a of output.attributes) {
    const name = a.name.trim().toLowerCase().replace(/\s+/g, "_");
    const value = a.value.trim();
    if (name && value) attributes[name] = value;
  }

  // --- 2. claims: citation check, then polarity check --------------------------
  const claims: VerifiedClaim[] = [];
  const claimedTerms = new Set<string>();
  let strippedClaims = 0;
  for (const c of output.claims) {
    const polarity = claimPolarity(c.text);
    const term = canonicalTerm(polarity.core);
    const variants = variantsFor(term);
    const evidence = evidenceVariantsFor(term);
    const citation = verifyCitation(c, sourceRows, evidence);
    // A quote that lives in a sibling row of the same product is still a citation (models slip on row numbers).
    const found = citation ?? findTermInRows(sourceRows, evidence) ?? findQuoteInRows(sourceRows, c.quote);
    if (!found) {
      blocked.push({ text: c.text, kind: "unsupported", reason: "not found in the source cells" });
      issues.push(issue("claim.unsupported", "warn", `Claim "${c.text}" is not supported by the source`, { field: "claims", value: c.text, ec: "D2" }));
      reviewReasons.push(`AI claimed "${c.text}" but the source does not say it`);
      stripTermFromText(variants, polarity.negated);
      strippedClaims += 1;
      continue;
    }
    // "not frost-proof" against a source that says "not frost-proof" is a faithful claim; the two
    // polarities disagreeing is the one thing that must never reach the storefront (EC-B15). The
    // comparison needs the term itself in the source; a claim proven only by a quote in another
    // language has nothing to compare against and stands on its citation.
    const termInCorpus = variants.some((v) => corpus.includes(` ${v} `));
    if (termInCorpus && polarity.negated !== isNegated(corpusTokens, variants)) {
      const where = polarity.negated ? findTermInRows(sourceRows, variants) : findNegationInRows(sourceRows, variants);
      blocked.push(block(c.text, polarity.negated ? "contradicted" : "negated", term, where));
      issues.push(issue("claim.negated", "error", polarity.negated ? `Source says "${term}" but the claim denies it; the claim was removed` : `Source says "not ${c.text}"; the claim was removed`, { field: "claims", value: c.text, ec: "B15" }));
      reviewReasons.push(polarity.negated ? `AI denied "${term}" but the source asserts it` : `AI asserted "${c.text}" but the source negates it`);
      stripTermFromText(variants, polarity.negated);
      strippedClaims += 1;
      continue;
    }
    claimedTerms.add(term);
    claims.push({
      text: c.text,
      source: `row ${found.row}, column ${found.column}`,
      row: found.row,
      column: found.column,
      quote: found.quote,
      verified: true,
    });
  }

  // --- 3. lexicon sweep over everything the model wrote -------------------------
  for (const entry of CLAIM_LEXICON) {
    if (claimedTerms.has(entry.term)) continue;
    const listingText = [title, descriptionText, ...Object.values(attributes), ...output.tags].join(". ");
    const text = ` ${foldForMatch(listingText)} `;
    const hit = entry.variants.find((v) => text.includes(` ${v} `));
    if (!hit) continue;
    if (entry.placeAfter) {
      const origin = PLACE_AFTER_RE.exec(listingText);
      if (!origin) continue;
      // "Made in Nepal" is backed by any source cell that names Nepal ("feutrée à la main au Népal"),
      // whatever verb the supplier used; only an origin the source never mentions is invented.
      const place = foldForMatch(origin[1] ?? "");
      if (place && corpus.includes(` ${place} `)) {
        const found = findTermInRows(sourceRows, [place]);
        if (found) claims.push({ text: `made in ${origin[1]}`, source: `row ${found.row}, column ${found.column}`, row: found.row, column: found.column, quote: found.quote, verified: true });
        continue;
      }
    }
    // Supporting evidence ("solid oak") proves presence; only the term's own spellings decide negation.
    const evidence = evidenceFor(entry);
    const inSource = evidence.some((v) => corpus.includes(` ${v} `));
    const sourceNegated = inSource && isNegated(corpusTokens, entry.variants);
    if (isNegated(tokenizeClauses(listingText), entry.variants)) {
      // The listing itself denies the term. Fine when the source denies it too; otherwise it is invented.
      if (sourceNegated) continue;
      blocked.push(inSource ? block(`not ${entry.term}`, "contradicted", entry.term, findTermInRows(sourceRows, evidence)) : { text: `not ${entry.term}`, kind: "unsupported", reason: "the source never mentions it", term: entry.term });
      issues.push(issue("claim.unsupported", "warn", inSource ? `Listing says "not ${entry.term}" but the source says "${entry.term}"` : `Listing says "not ${entry.term}" but the source never mentions it`, { value: entry.term, ec: "D2" }));
      reviewReasons.push(inSource ? `Listing says "not ${entry.term}" but the source says it is` : `Listing says "not ${entry.term}" but the source does not mention it`);
      stripTermFromText(entry.variants, true);
      strippedClaims += 1;
      continue;
    }
    if (!inSource) {
      blocked.push({ text: entry.term, kind: "unsupported", reason: "not found in the source cells", term: entry.term });
      stripTermFromText(entry.variants);
      if (entry.soft) {
        // A marketing adjective the source does not back is simply removed; no reviewer needs to see it.
        issues.push(issue("claim.unsupported", "info", `"${entry.term}" appears in the listing but not in the source; removed`, { value: entry.term, ec: "D2" }));
        continue;
      }
      issues.push(issue("claim.unsupported", "warn", `"${entry.term}" appears in the listing but not in the source`, { value: entry.term, ec: "D2" }));
      reviewReasons.push(`Listing says "${entry.term}" but the source does not`);
      strippedClaims += 1;
    } else if (sourceNegated) {
      blocked.push(block(entry.term, "negated", entry.term, findNegationInRows(sourceRows, entry.variants)));
      issues.push(issue("claim.negated", "error", `Source says "not ${entry.term}"; removed from the listing`, { value: entry.term, ec: "B15" }));
      reviewReasons.push(`Listing says "${entry.term}" but the source negates it`);
      stripTermFromText(entry.variants);
      strippedClaims += 1;
    } else {
      // Supported but not cited: keep it, record where it comes from.
      const found = findTermInRows(sourceRows, evidence);
      if (found) claims.push({ text: entry.term, source: `row ${found.row}, column ${found.column}`, row: found.row, column: found.column, quote: found.quote, verified: true });
    }
  }

  // --- 4. number audit -----------------------------------------------------------------
  const allowedNumbers = collectSourceNumbers(group);
  const unsupportedNumbers = new Set<string>();
  for (const n of extractNumbers(`${title} ${descriptionText} ${Object.values(attributes).join(" ")}`)) {
    if (!allowedNumbers.has(n)) unsupportedNumbers.add(n);
  }
  if (unsupportedNumbers.size > 0) {
    issues.push(issue("number.unsupported", "warn", `Numbers not found in the source: ${[...unsupportedNumbers].join(", ")}`, { ec: "D4", value: [...unsupportedNumbers].join(", ") }));
    if (unsupportedNumbers.size >= 2) reviewReasons.push(`Listing contains numbers the source does not (${[...unsupportedNumbers].slice(0, 3).join(", ")})`);
  }

  // --- 5. category must be a taxonomy path ------------------------------------------------
  let category = output.category.trim();
  let categorySnapped = false;
  let categoryFallback = false;
  let categoryModelConfidence = output.confidence.category;
  // The supplier's own category column is source data; when it maps to a taxonomy node it outranks
  // the model's opinion, exactly as prices and SKUs do (EC-D3).
  const sourceCategory = group.category ? resolveSourceCategory(group.category) : null;
  const isParentNode = !TAXONOMY.includes(category) && TAXONOMY.some((p) => p.startsWith(`${category} > `));
  if (isParentNode) {
    // A parent node ("Home & Garden > Decor") is a legitimate, deliberately vague answer: keep it, cap confidence.
    issues.push(issue("category.generic", "info", `Category "${category}" is a parent node, not a leaf`, { field: "category", ec: "D3" }));
    categorySnapped = true;
  } else if (!TAXONOMY.includes(category)) {
    const nearest = nearestTaxonomyPath(category);
    if (nearest) {
      issues.push(issue("category.snapped", "info", `Category "${category}" mapped to "${nearest}"`, { field: "category", ec: "D3" }));
      category = nearest;
      categorySnapped = true;
    } else if (sourceCategory) {
      issues.push(issue("category.snapped", "info", `Category "${category}" is not in the taxonomy; the supplier's category "${sourceCategory}" is used`, { field: "category", ec: "D3" }));
      category = sourceCategory;
      categorySnapped = true;
      categoryModelConfidence = Math.max(categoryModelConfidence, 75);
    } else {
      issues.push(issue("category.unknown", "warn", `Category "${category}" is not in the taxonomy`, { field: "category", ec: "D3" }));
      reviewReasons.push(`Category "${category}" is not in the taxonomy`);
      category = TAXONOMY_FALLBACK;
      categoryFallback = true;
    }
  }
  if (sourceCategory && !categoryFallback && !category.toLowerCase().startsWith(sourceCategory.toLowerCase())) {
    issues.push(issue("category.source", "info", `Model chose "${category}"; the supplier's category "${sourceCategory}" is used`, { field: "category", ec: "D3" }));
    category = sourceCategory;
    categorySnapped = !TAXONOMY.includes(sourceCategory);
    categoryModelConfidence = Math.max(categoryModelConfidence, 85);
  }
  // A leaf the model itself doubts ("Pencils" for a sharpener at 55) becomes its parent node: vague
  // beats wrong, the storefront still files it sensibly, and no reviewer is needed for it (EC-D3).
  if (!categoryFallback && categoryModelConfidence < 60 && category.includes(" > ")) {
    const parent = category.slice(0, category.lastIndexOf(" > "));
    issues.push(issue("category.generic", "info", `Low confidence in "${category}"; filed under its parent "${parent}"`, { field: "category", ec: "D3" }));
    category = parent;
    categorySnapped = true;
    categoryModelConfidence = Math.max(categoryModelConfidence, 70);
  }

  // --- 6. mix-up check: the title must come from this product's rows (EC-D7) ------------
  // Skipped for German/French sources: the English title is a translation and shares no tokens.
  let mixup = false;
  const titleTokens = foldForMatch(title).split(" ").filter((t) => t.length > 3);
  if (!nonEnglish && titleTokens.length > 0 && corpusTokens.length > 0) {
    const overlap = titleTokens.filter((t) => corpus.includes(` ${t} `)).length / titleTokens.length;
    if (overlap < 0.34) {
      mixup = true;
      issues.push(issue("title.mismatch", "error", "The title does not match this product's source rows", { field: "title", ec: "D7" }));
      reviewReasons.push("Title does not match the source rows (possible mix-up between products)");
    }
  }

  // --- 7. care instructions must survive (EC-B15) -------------------------------------------
  let careDropped = false;
  const careSource = group.care ?? findCareSentence(group.sourceCorpus);
  if (careSource) {
    const careTokens = foldForMatch(careSource).split(" ").filter((t) => t.length > 2);
    const target = ` ${foldForMatch(`${descriptionText} ${attributes.care ?? ""}`)} `;
    const kept = careTokens.filter((t) => target.includes(` ${t} `)).length / Math.max(1, careTokens.length);
    if (kept < 0.6) {
      careDropped = true;
      attributes.care = careSource;
      issues.push(issue("care.restored", "warn", "Care instructions from the source were missing and have been restored", { field: "attributes.care", ec: "B15" }));
    }
  }

  // --- 8. price and variant facts the model never saw (EC-B1, B6, C4) ------------------------
  for (const v of group.variants) {
    if (v.priceCents === null) {
      const label = Object.values(v.options).join(" / ") || v.sku;
      reviewReasons.push(`No price for ${label}`);
    }
  }
  const currencies = new Set(group.variants.map((v) => v.currency).filter((c): c is string => !!c));
  if (currencies.size > 1) reviewReasons.push(`Mixed currencies: ${[...currencies].join(", ")}`);
  for (const c of group.conflicts) reviewReasons.push(c.message);

  // --- 9. confidence = min(model, heuristic) --------------------------------------------------
  const hasSourceTitle = !!group.title;
  const heuristic = {
    title: 100 - (hasSourceTitle ? 0 : 40) - (nonEnglish ? 10 : 0) - (mixup ? 50 : 0),
    description: 100 - (group.descriptionText ? 0 : 25) - unsupportedNumbers.size * 15 - strippedClaims * 20,
    category: 100 - (categorySnapped ? 15 : 0) - (categoryFallback ? 50 : 0),
    tags: 90,
    attributes: 100 - (careDropped ? 20 : 0) - strippedClaims * 15,
  };
  const confidence: Record<string, number> = {
    title: clampConfidence(Math.min(output.confidence.title, heuristic.title)),
    description: clampConfidence(Math.min(output.confidence.description, heuristic.description)),
    category: clampConfidence(Math.min(categoryModelConfidence, heuristic.category)),
    tags: clampConfidence(Math.min(output.confidence.tags, heuristic.tags)),
    attributes: clampConfidence(Math.min(output.confidence.attributes, heuristic.attributes)),
  };
  if (attributes.care) confidence["attributes.care"] = careDropped ? 60 : clampConfidence(Math.min(output.confidence.attributes, 95));

  // --- 10. status ----------------------------------------------------------------------------------
  if (output.status === "needs_review" && output.review_reason) reviewReasons.unshift(output.review_reason);
  if ((confidence.title ?? 100) < 60) reviewReasons.push("Low confidence in the title");
  if ((confidence.category ?? 100) < 60) reviewReasons.push("Low confidence in the category");
  const uniqueReasons = [...new Set(reviewReasons.map((r) => r.trim()).filter(Boolean))];

  const tags = [...new Set(output.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 1))].slice(0, 10);

  return {
    content: {
      title,
      descriptionHtml,
      category,
      tags,
      attributes,
      seo: {
        metaTitle: output.meta_title.trim().slice(0, 60) || null,
        metaDescription: output.meta_description.trim().slice(0, 155) || null,
      },
    },
    claims,
    blocked,
    confidence,
    reviewReasons: uniqueReasons,
    status: uniqueReasons.length > 0 ? "needs_review" : "draft",
    issues,
  };

  /** Remove a claim term from the title, description and attributes (word-boundary, hyphen/space tolerant). */
  function stripTermFromText(variants: string[], withNegation = false): void {
    for (const v of variants) {
      const prefix = withNegation ? "(?:\\b(?:not|no|non|never|without)\\s+)?" : "";
      const pattern = new RegExp(`${prefix}\\b${v.split(" ").map(escapeRegExp).join("[\\s-]+")}\\b[,;]?\\s*`, "gi");
      title = title.replace(pattern, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
      if (descriptionHtml) descriptionHtml = descriptionHtml.replace(pattern, "").replace(/\s{2,}/g, " ");
      descriptionText = descriptionText.replace(pattern, "").replace(/\s{2,}/g, " ");
      for (const [k, val] of Object.entries(attributes)) {
        const cleaned = val.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
        if (cleaned) attributes[k] = cleaned;
        else delete attributes[k];
      }
    }
    if (descriptionHtml) descriptionHtml = descriptionHtml.replace(/<p>\s*<\/p>/g, "") || null;
  }
}

/** A blocked entry whose source cell was found (or not: `where` null leaves the location out). */
function block(text: string, kind: "negated" | "contradicted", term: string, where: Found | null): BlockedClaim {
  const reason = kind === "negated" ? "the source explicitly negates it" : "the source asserts it";
  return where ? { text, kind, reason, term, row: where.row, column: where.column, quote: where.quote } : { text, kind, reason, term };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function canonicalTerm(text: string): string {
  const folded = foldForMatch(text);
  for (const entry of CLAIM_LEXICON) {
    if (entry.term === folded || entry.variants.includes(folded)) return entry.term;
  }
  return folded;
}

function variantsFor(term: string): string[] {
  const entry = CLAIM_LEXICON.find((e) => e.term === term);
  const base = [foldForMatch(term)];
  return entry ? [...new Set([...base, ...entry.variants])] : base;
}

/** The term's spellings plus its supporting evidence, for proving presence (never for deciding negation). */
function evidenceVariantsFor(term: string): string[] {
  const entry = CLAIM_LEXICON.find((e) => e.term === term);
  return entry ? [...new Set([...variantsFor(term), ...evidenceFor(entry)])] : variantsFor(term);
}

const CARE_PATTERNS = /\b(bring indoors|hand wash|machine wash|do not|don t|wipe clean|keep away|store in|not dishwasher|nicht spulmaschinen|hand waschen|von hand|lavage|ne pas|laver a la main)\b/;

function findCareSentence(corpus: string): string | null {
  const text = htmlToText(corpus);
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (CARE_PATTERNS.test(foldForMatch(sentence))) return sentence.replace(/^[^:]*:\s*/, "").trim().slice(0, 200);
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
