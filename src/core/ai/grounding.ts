import { sanitizeDescriptionHtml, htmlToText } from "@/core/clean/html";
import { foldForMatch } from "@/core/clean/text";
import { issue } from "@/core/types";
import { checkClaims, sweepLexicon, type ClaimContext } from "./grounding-claims";
import { decideCategory } from "./grounding-category";
import { prepareSourceRows } from "./grounding-source";
import type { GroundingInput, GroundingResult } from "./grounding-types";
import { lexiconTermsIn } from "./claim-support";
import { claimPolarity, isNegated, tokenizeClauses } from "./negation";
import { collectSourceNumbers, numbersInContext } from "./numbers";
import { priceDoubtReasons } from "./price-doubt";
import { clampConfidence } from "./schema";

export { claimPolarity, isNegated, tokenizeClauses };
export { collectSourceNumbers, extractNumbers } from "./numbers";
export type { BlockedClaim, BlockedKind, GroundedContent, GroundingInput, GroundingResult, VerifiedClaim } from "./grounding-types";

/**
 * Grounding validator: checks the model's words against the supplier's text.
 * It does not trust the model. Anything it cannot find in the source is removed and the product
 * is sent to review with a reason (EC-D2, D3, D4, D7, B5, B15). Everything it removes is reported in
 * `blocked`, pointing at the source cell that contradicts the listing when there is one.
 */
export function groundProductOutput(input: GroundingInput): GroundingResult {
  const { output, group, rows } = input;
  const nonEnglish = group.language.lang !== "en" && group.language.lang !== "und";
  const corpus = ` ${foldForMatch(group.sourceCorpus)} `;
  const corpusTokens = tokenizeClauses(group.sourceCorpus);

  // --- 1. sanitise the model's HTML (defence in depth) -------------------------
  const sanitized = sanitizeDescriptionHtml(output.description_html);
  const attributes: Record<string, string> = {};
  for (const a of output.attributes) {
    const name = a.name.trim().toLowerCase().replace(/\s+/g, "_");
    const value = a.value.trim();
    if (name && value) attributes[name] = value;
  }
  const ctx: ClaimContext = {
    listing: { title: output.title.replace(/\s+/g, " ").trim().slice(0, 120), descriptionHtml: sanitized.html, descriptionText: sanitized.text ?? "", attributes },
    tags: output.tags,
    sourceRows: prepareSourceRows(rows),
    sourceCorpus: group.sourceCorpus,
    corpusTokens,
    corpus,
    allowedNumbers: collectSourceNumbers(group),
    nonEnglish,
    claims: [],
    blocked: [],
    issues: [],
    reviewReasons: [],
    stripped: 0,
  };
  const { issues, reviewReasons } = ctx;

  // --- 2. cited claims: citation, polarity, wording; 3. lexicon and origin sweep -------------
  sweepLexicon(ctx, checkClaims(ctx, output.claims));
  const { title, descriptionHtml, descriptionText } = ctx.listing;
  const strippedClaims = ctx.stripped;

  // --- 4. number audit: a number tied to a unit, a percentage or a claim is itself a claim -----
  const unsupportedNumbers = new Set<string>();
  const anchored = new Set<string>();
  for (const n of numbersInContext(`${title}. ${descriptionText}. ${Object.values(attributes).join(". ")}`)) {
    if (ctx.allowedNumbers.has(n.value)) continue;
    unsupportedNumbers.add(n.value);
    if (n.unit || lexiconTermsIn(n.context).length > 0) anchored.add(n.written);
  }
  if (unsupportedNumbers.size > 0) {
    issues.push(issue("number.unsupported", "warn", `Numbers not found in the source: ${[...unsupportedNumbers].join(", ")}`, { ec: "D4", value: [...unsupportedNumbers].join(", ") }));
    if (anchored.size > 0) reviewReasons.push(`Listing contains numbers the source does not: ${[...anchored].slice(0, 3).map((w) => `"${w}"`).join(", ")}`);
    else if (unsupportedNumbers.size >= 2) reviewReasons.push(`Listing contains numbers the source does not (${[...unsupportedNumbers].slice(0, 3).join(", ")})`);
  }

  // --- 5. category must be a taxonomy path ------------------------------------------------
  const cat = decideCategory(output.category, output.confidence.category, group);
  const { category } = cat;
  issues.push(...cat.issues);
  reviewReasons.push(...cat.reviewReasons);

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
  reviewReasons.push(...priceDoubtReasons(group));

  // --- 9. confidence = min(model, heuristic) --------------------------------------------------
  const hasSourceTitle = !!group.title;
  const heuristic = {
    title: 100 - (hasSourceTitle ? 0 : 40) - (nonEnglish ? 10 : 0) - (mixup ? 50 : 0),
    description: 100 - (group.descriptionText ? 0 : 25) - unsupportedNumbers.size * 15 - strippedClaims * 20,
    category: 100 - (cat.snapped ? 15 : 0) - (cat.fallback ? 50 : 0),
    tags: 90,
    attributes: 100 - (careDropped ? 20 : 0) - strippedClaims * 15,
  };
  const confidence: Record<string, number> = {
    title: clampConfidence(Math.min(output.confidence.title, heuristic.title)),
    description: clampConfidence(Math.min(output.confidence.description, heuristic.description)),
    category: clampConfidence(Math.min(cat.modelConfidence, heuristic.category)),
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
    claims: ctx.claims,
    blocked: ctx.blocked,
    confidence,
    reviewReasons: uniqueReasons,
    status: uniqueReasons.length > 0 ? "needs_review" : "draft",
    issues,
  };
}

const CARE_PATTERNS = /\b(bring indoors|hand wash|machine wash|do not|don t|wipe clean|keep away|store in|not dishwasher|nicht spulmaschinen|hand waschen|von hand|lavage|ne pas|laver a la main)\b/;

function findCareSentence(corpus: string): string | null {
  const text = htmlToText(corpus);
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (CARE_PATTERNS.test(foldForMatch(sentence))) return sentence.replace(/^[^:]*:\s*/, "").trim().slice(0, 200);
  }
  return null;
}
