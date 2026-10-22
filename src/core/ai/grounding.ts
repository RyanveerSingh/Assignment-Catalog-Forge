import { sanitizeDescriptionHtml, htmlToText } from "@/core/clean/html";
import { foldForMatch } from "@/core/clean/text";
import { parseLength, parseWeight } from "@/core/clean/units";
import type { Issue, ProductGroup } from "@/core/types";
import { issue } from "@/core/types";
import { CLAIM_LEXICON, NEGATION_TOKENS } from "./lexicon";
import { clampConfidence, type AiProductOutput } from "./schema";
import { TAXONOMY, TAXONOMY_FALLBACK } from "./taxonomy";

/**
 * Grounding validator: checks the model's words against the supplier's text.
 * It does not trust the model. Anything it cannot find in the source is removed and the product
 * is sent to review with a reason (EC-D2, D3, D4, D7, B15).
 */

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

export interface GroundingResult {
  content: GroundedContent;
  claims: VerifiedClaim[];
  removedClaims: Array<{ text: string; reason: string }>;
  confidence: Record<string, number>;
  reviewReasons: string[];
  status: "draft" | "needs_review";
  issues: Issue[];
}

const NEGATION_WINDOW = 3;

export function groundProductOutput(input: GroundingInput): GroundingResult {
  const { output, group, rows } = input;
  const issues: Issue[] = [];
  const reviewReasons: string[] = [];
  const removedClaims: Array<{ text: string; reason: string }> = [];

  const corpus = ` ${foldForMatch(group.sourceCorpus)} `;
  const corpusTokens = corpus.trim().split(" ").filter(Boolean);
  const foldedRows = rows.map((r) => ({ row: r.row, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, foldForMatch(v ?? "")])) }));

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

  // --- 2. claims: citation check, then negation check --------------------------
  const claims: VerifiedClaim[] = [];
  let strippedClaims = 0;
  for (const c of output.claims) {
    const term = canonicalTerm(c.text);
    const variants = variantsFor(term);
    const citation = verifyCitation(c, foldedRows, variants);
    const found = citation ?? findInRows(foldedRows, variants);
    if (!found) {
      removedClaims.push({ text: c.text, reason: "not found in the source cells" });
      issues.push(issue("claim.unsupported", "warn", `Claim "${c.text}" is not supported by the source`, { field: "claims", value: c.text, ec: "D2" }));
      reviewReasons.push(`AI claimed "${c.text}" but the source does not say it`);
      stripTermFromText(variants);
      strippedClaims += 1;
      continue;
    }
    if (isNegated(corpusTokens, variants)) {
      removedClaims.push({ text: c.text, reason: "the source explicitly negates it" });
      issues.push(issue("claim.negated", "error", `Source says "not ${c.text}"; the claim was removed`, { field: "claims", value: c.text, ec: "B15" }));
      reviewReasons.push(`AI asserted "${c.text}" but the source negates it`);
      stripTermFromText(variants);
      strippedClaims += 1;
      continue;
    }
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
  const claimedTerms = new Set(claims.map((c) => canonicalTerm(c.text)));
  for (const entry of CLAIM_LEXICON) {
    if (claimedTerms.has(entry.term)) continue;
    const text = ` ${foldForMatch([title, descriptionText, ...Object.values(attributes), ...output.tags].join(" "))} `;
    const hit = entry.variants.find((v) => text.includes(` ${v} `));
    if (!hit) continue;
    const inSource = entry.variants.some((v) => corpus.includes(` ${v} `));
    if (!inSource) {
      issues.push(issue("claim.unsupported", "warn", `"${entry.term}" appears in the listing but not in the source`, { value: entry.term, ec: "D2" }));
      reviewReasons.push(`Listing says "${entry.term}" but the source does not`);
      stripTermFromText(entry.variants);
      strippedClaims += 1;
    } else if (isNegated(corpusTokens, entry.variants)) {
      issues.push(issue("claim.negated", "error", `Source says "not ${entry.term}"; removed from the listing`, { value: entry.term, ec: "B15" }));
      reviewReasons.push(`Listing says "${entry.term}" but the source negates it`);
      stripTermFromText(entry.variants);
      strippedClaims += 1;
    } else {
      // Supported but not cited: keep it, record where it comes from.
      const found = findInRows(foldedRows, entry.variants);
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
  if (!TAXONOMY.includes(category)) {
    const nearest = nearestTaxonomyPath(category);
    if (nearest) {
      issues.push(issue("category.snapped", "info", `Category "${category}" mapped to "${nearest}"`, { field: "category", ec: "D3" }));
      category = nearest;
      categorySnapped = true;
    } else {
      issues.push(issue("category.unknown", "warn", `Category "${category}" is not in the taxonomy`, { field: "category", ec: "D3" }));
      reviewReasons.push(`Category "${category}" is not in the taxonomy`);
      category = TAXONOMY_FALLBACK;
      categoryFallback = true;
    }
  }

  // --- 6. mix-up check: the title must come from this product's rows (EC-D7) ------------
  let mixup = false;
  const titleTokens = foldForMatch(title).split(" ").filter((t) => t.length > 3);
  if (titleTokens.length > 0 && corpusTokens.length > 0) {
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
  const nonEnglish = group.language.lang !== "en" && group.language.lang !== "und";
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
    category: clampConfidence(Math.min(output.confidence.category, heuristic.category)),
    tags: clampConfidence(Math.min(output.confidence.tags, heuristic.tags)),
    attributes: clampConfidence(Math.min(output.confidence.attributes, heuristic.attributes)),
  };
  if (attributes.care) confidence["attributes.care"] = careDropped ? 60 : clampConfidence(Math.min(output.confidence.attributes, 95));

  // --- 10. status ----------------------------------------------------------------------------------
  if (output.status === "needs_review" && output.review_reason) reviewReasons.unshift(output.review_reason);
  if (confidence.title! < 60) reviewReasons.push("Low confidence in the title");
  if (confidence.category! < 60) reviewReasons.push("Low confidence in the category");
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
    removedClaims,
    confidence,
    reviewReasons: uniqueReasons,
    status: uniqueReasons.length > 0 ? "needs_review" : "draft",
    issues,
  };

  /** Remove a claim term from the title, description and attributes (word-boundary, hyphen/space tolerant). */
  function stripTermFromText(variants: string[]): void {
    for (const v of variants) {
      const pattern = new RegExp(`\\b${v.split(" ").map(escapeRegExp).join("[\\s-]+")}\\b[,;]?\\s*`, "gi");
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

interface Found {
  row: number;
  column: string;
  quote: string;
}

function verifyCitation(c: AiProductOutput["claims"][number], rows: Array<{ row: number; cells: Record<string, string> }>, variants: string[]): Found | null {
  const row = rows.find((r) => r.row === c.source_row);
  if (!row) return null;
  const columnKey = Object.keys(row.cells).find((k) => foldForMatch(k) === foldForMatch(c.source_column));
  if (!columnKey) return null;
  const cell = ` ${row.cells[columnKey] ?? ""} `;
  const quote = foldForMatch(c.quote);
  const quoteOk = quote.length > 0 && (cell.includes(quote) || tokenContainment(quote, cell) >= 0.9);
  const termOk = variants.some((v) => cell.includes(` ${v} `));
  if (!quoteOk && !termOk) return null;
  return { row: row.row, column: columnKey, quote: c.quote.trim().slice(0, 200) };
}

function findInRows(rows: Array<{ row: number; cells: Record<string, string> }>, variants: string[]): Found | null {
  for (const r of rows) {
    for (const [column, folded] of Object.entries(r.cells)) {
      const padded = ` ${folded} `;
      const v = variants.find((x) => padded.includes(` ${x} `));
      if (v) return { row: r.row, column, quote: v };
    }
  }
  return null;
}

function tokenContainment(needle: string, haystack: string): number {
  const n = needle.split(" ").filter(Boolean);
  if (n.length === 0) return 0;
  const h = new Set(haystack.split(" ").filter(Boolean));
  return n.filter((t) => h.has(t)).length / n.length;
}

/** True when every occurrence of the term in the corpus is preceded by a negation within three tokens (EC-B15). */
export function isNegated(corpusTokens: string[], variants: string[]): boolean {
  let occurrences = 0;
  let negated = 0;
  for (const v of variants) {
    const vt = v.split(" ");
    for (let i = 0; i + vt.length <= corpusTokens.length; i++) {
      let match = true;
      for (let j = 0; j < vt.length; j++) {
        if (corpusTokens[i + j] !== vt[j]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      occurrences += 1;
      const window = corpusTokens.slice(Math.max(0, i - NEGATION_WINDOW), i);
      if (window.some((t) => NEGATION_TOKENS.includes(t))) negated += 1;
    }
  }
  return occurrences > 0 && negated === occurrences;
}

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

function normalizeNumber(raw: string): string {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 1000) / 1000);
}

export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) out.add(normalizeNumber(m[0]));
  return out;
}

/** Every number the source supports, including unit conversions and the deterministic variant data. */
export function collectSourceNumbers(group: ProductGroup): Set<string> {
  const out = extractNumbers(group.sourceCorpus);
  // Unit conversions: "7.87 in" in the source makes "20" (cm) legitimate.
  for (const m of group.sourceCorpus.matchAll(/\d+(?:[.,]\d+)?\s?(?:cm|mm|m|in|inch|inches|"|ft|kg|g|lb|lbs|oz)\b/gi)) {
    const len = parseLength(m[0]);
    if (len) {
      out.add(normalizeNumber(String(len.cm)));
      out.add(normalizeNumber(String(Math.round(len.cm * 10))));
    }
    const w = parseWeight(m[0]);
    if (w) {
      out.add(normalizeNumber(String(w.grams)));
      out.add(normalizeNumber(String(w.grams / 1000)));
    }
  }
  for (const v of group.variants) {
    for (const val of Object.values(v.options)) for (const n of extractNumbers(val)) out.add(n);
    if (v.weightGrams !== null) {
      out.add(normalizeNumber(String(v.weightGrams)));
      out.add(normalizeNumber(String(v.weightGrams / 1000)));
    }
    if (v.dimensions) for (const d of Object.values(v.dimensions)) if (typeof d === "number") out.add(normalizeNumber(String(d)));
  }
  return out;
}

function nearestTaxonomyPath(category: string): string | null {
  const target = foldForMatch(category);
  let best: { path: string; score: number } | null = null;
  for (const path of TAXONOMY) {
    const score = jaccardTrigrams(target, foldForMatch(path));
    if (!best || score > best.score) best = { path, score };
  }
  if (best && best.score >= 0.5) return best.path;
  // Leaf-name match: "Planters" → the single path ending in Planters.
  const leaf = foldForMatch(category.split(">").pop() ?? category);
  const leafMatches = TAXONOMY.filter((p) => foldForMatch(p.split(" > ").pop() ?? "") === leaf);
  return leafMatches.length === 1 ? leafMatches[0]! : null;
}

function jaccardTrigrams(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
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
