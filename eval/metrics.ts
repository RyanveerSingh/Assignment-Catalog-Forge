/**
 * Pure scoring for the evaluation harness: what the pipeline derived from a sample sheet, compared
 * with the ground truth generated alongside it (`samples/ground-truth/*.json`). No I/O; `run.ts`
 * feeds it and `metrics.test.ts` pins every rule down.
 *
 * Every rate is a fraction 0–1, or null when there was nothing to score. `negatedViolations` is a
 * count and the one hard rule (EC-B15): a listing may never assert what the source negates.
 */
import { assertsNegated, countAsserted, foldClaim, sameClaim } from "./claims";

export { countAsserted, quoteFoundInRows } from "./claims";
import type { DuplicateRow, GroundTruthProduct, GroundTruthStatus } from "@/core/types";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface DerivedVariant {
  sku: string;
  synthetic: boolean;
  priceCents: number | null;
  currency: string | null;
}

export type DerivedStatus = "draft" | "needs_review" | "failed";

export interface DerivedProduct {
  productKey: string;
  /** What the grounding validator removed, as "kind: text — reason", so a review flag explains itself in the report. */
  blocked: string[];
  /** Claims whose cited quote the eval itself found in the raw source rows (independent of the validator's own verdict). */
  claimsGrounded: number;
  /** The claims it could not find, as `text ← "quote"`, so a grounding miss explains itself in the report. */
  ungroundedClaims: string[];
  /** Variant SKUs as the grouper produced them; a synthetic `GEN-…` SKU never matches a truth SKU (EC-C6). */
  skus: string[];
  variants: DerivedVariant[];
  title: string;
  category: string;
  /** Claim texts that survived grounding. */
  claims: string[];
  descriptionText: string;
  tags: string[];
  attributes: Record<string, string>;
  status: DerivedStatus;
  reviewReasons: string[];
  /** 0–100 per field, as the grounding validator returns them. */
  confidence: Record<string, number>;
  /** Set when no usable model answer arrived; the product still counts against every rate. */
  error?: string;
}

export interface Matchable {
  productKey: string;
  skus: string[];
}

export interface MatchedPair<D extends Matchable> {
  derived: D;
  truth: GroundTruthProduct;
  sharedSkus: number;
}

export interface MatchResult<D extends Matchable> {
  pairs: MatchedPair<D>[];
  unmatchedTruth: GroundTruthProduct[];
  unmatchedDerived: D[];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * Pair derived products with truth products by shared SKUs: the most shared wins and each side is
 * used once. An equal product key breaks ties and rescues products whose SKUs cannot match, such as
 * the SKU-less row whose truth SKU is "" (EC-C6).
 */
export function matchProducts<D extends Matchable>(derived: D[], truth: GroundTruthProduct[]): MatchResult<D> {
  const truthSkus = truth.map((t) => new Set(t.variants.map((v) => normalizeSku(v.sku)).filter((s) => s !== "")));
  const candidates: Array<{ d: number; t: number; score: number }> = [];
  derived.forEach((dp, d) => {
    const skus = new Set(dp.skus.map(normalizeSku).filter((s) => s !== ""));
    truth.forEach((tp, t) => {
      let shared = 0;
      for (const s of skus) if (truthSkus[t].has(s)) shared += 1;
      const sameKey = dp.productKey.trim().toLowerCase() === tp.productKey.trim().toLowerCase();
      const score = shared + (sameKey ? 0.5 : 0);
      if (score > 0) candidates.push({ d, t, score });
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.t - b.t || a.d - b.d);

  const usedDerived = new Set<number>();
  const usedTruth = new Set<number>();
  const chosen: Array<{ d: number; t: number; shared: number }> = [];
  for (const c of candidates) {
    if (usedDerived.has(c.d) || usedTruth.has(c.t)) continue;
    usedDerived.add(c.d);
    usedTruth.add(c.t);
    chosen.push({ d: c.d, t: c.t, shared: Math.floor(c.score) });
  }
  chosen.sort((a, b) => a.t - b.t);
  return {
    pairs: chosen.map((c) => ({ derived: derived[c.d], truth: truth[c.t], sharedSkus: c.shared })),
    unmatchedTruth: truth.filter((_, i) => !usedTruth.has(i)),
    unmatchedDerived: derived.filter((_, i) => !usedDerived.has(i)),
  };
}

// ---------------------------------------------------------------------------
// Per-product score
// ---------------------------------------------------------------------------

export interface PairScore {
  productKey: string;
  truthKey: string;
  title: string;
  category: string;
  categoryPrefix: string;
  status: DerivedStatus;
  expectedStatus: GroundTruthStatus;
  reviewReasons: string[];
  blocked: string[];
  expectedReviewReasons: string[];
  variantPrecision: number | null;
  variantRecall: number | null;
  variantHits: number;
  derivedVariants: number;
  truthVariants: number;
  missingSkus: string[];
  extraSkus: string[];
  priceExact: number | null;
  priceHits: number;
  priceMisses: string[];
  titleKeywordHit: number | null;
  missingKeywords: string[];
  categoryPrefixMatch: boolean;
  /** Share of the listing's claims whose cited quote exists in the raw rows: the "no invented claims" measure. */
  claimGrounding: number | null;
  claimsGrounded: number;
  claimCount: number;
  ungroundedClaims: string[];
  /** Share of the generator's planted facts the listing mentions. Informational: a listing may omit a true fact. */
  allowedClaimCoverage: number | null;
  allowedHits: number;
  allowedCount: number;
  missingClaims: string[];
  negatedViolations: number;
  violations: string[];
  statusCorrect: boolean;
  /** Flagged because the validator blocked a claim the model asserted against the source: a correct flag the truth could not foresee. */
  justifiedFlag: boolean;
  reviewReasonHit: boolean | null;
  titleConfidence: number | null;
  error: string | null;
}

/**
 * Reason classes in the ground truth → what a grounded review reason must mention. The grouper's
 * conflict message reads "SKU … appears in rows 90 and 102 with a different price" and never says
 * "conflict", so both phrasings count (EC-C4).
 */
const REASON_PATTERNS: Readonly<Record<string, RegExp>> = { no_price: /price/i, sku_conflict: /conflict|appears in rows \d+ and \d+ with a different/i };

function reasonReflected(cls: string, reasons: string[]): boolean {
  const re = REASON_PATTERNS[cls] ?? new RegExp(cls.replace(/_/g, "[ _-]"), "i");
  return reasons.some((r) => re.test(r));
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function formatMoney(priceCents: number | null, currency: string | null): string {
  return priceCents === null ? "null" : `${priceCents} ${currency ?? "?"}`;
}

export function scorePair(derived: DerivedProduct, truth: GroundTruthProduct): PairScore {
  // Real SKUs must match exactly. A truth variant without a SKU (the sheet had none) can only ever
  // meet a synthetic GEN- variant, so those pair up in order instead of by SKU (EC-C6).
  const truthSet = new Set(truth.variants.map((v) => normalizeSku(v.sku)).filter((s) => s !== ""));
  const derivedSet = new Set(derived.variants.filter((v) => !v.synthetic).map((v) => normalizeSku(v.sku)));
  const skulessTruth = truth.variants.filter((v) => normalizeSku(v.sku) === "");
  const synthetic = derived.variants.filter((v) => v.synthetic);
  const pairedSynthetic = new Map(skulessTruth.slice(0, synthetic.length).map((tv, i) => [tv, synthetic[i]] as const));
  const variantHits = [...derivedSet].filter((s) => truthSet.has(s)).length + pairedSynthetic.size;
  const derivedCount = derivedSet.size + synthetic.length;
  const truthCount = truthSet.size + skulessTruth.length;

  const bySku = new Map(derived.variants.filter((v) => !v.synthetic).map((v) => [normalizeSku(v.sku), v] as const));
  let priceHits = 0;
  const priceMisses: string[] = [];
  for (const tv of truth.variants) {
    const dv = normalizeSku(tv.sku) === "" ? pairedSynthetic.get(tv) : bySku.get(normalizeSku(tv.sku));
    if (dv && dv.priceCents === tv.priceCents && dv.currency === tv.currency) priceHits += 1;
    else priceMisses.push(`${tv.sku || '""'}: expected ${formatMoney(tv.priceCents, tv.currency)}, got ${dv ? formatMoney(dv.priceCents, dv.currency) : "no variant"}`);
  }

  const titleLower = derived.title.toLowerCase();
  const missingKeywords = truth.titleKeywords.filter((k) => !titleLower.includes(k.toLowerCase()));

  const allowed = [...new Set(truth.allowedClaims.map(foldClaim).filter(Boolean))];
  const claims = [...new Set(derived.claims.map(foldClaim).filter(Boolean))];
  const missingClaims = allowed.filter((a) => !claims.some((c) => sameClaim(a, c)));

  const violations: string[] = [];
  let negatedViolations = 0;
  const listingFields = [derived.title, derived.descriptionText, ...derived.tags, ...Object.values(derived.attributes)];
  for (const negated of [...new Set(truth.negatedClaims.map(foldClaim).filter(Boolean))]) {
    for (const c of claims) {
      if (!assertsNegated(c, negated)) continue;
      negatedViolations += 1;
      violations.push(`claim "${c}" (source negates "${negated}")`);
    }
    const asserted = listingFields.reduce((n, field) => n + countAsserted(foldClaim(field), negated), 0);
    if (asserted > 0) {
      negatedViolations += asserted;
      violations.push(`"${negated}" asserted ${asserted}× in the listing text`);
    }
  }

  const expectsReview = truth.expectedStatus === "needs_review";
  // The truth describes the data, not the model. A flag raised because the validator blocked a claim
  // the model asserted against the source is the guardrail working, so it counts as a correct flag;
  // such flags are also reported on their own so a careless model cannot hide behind them.
  const justifiedFlag = derived.status === "needs_review" && derived.blocked.some((b) => b.startsWith("negated:") || b.startsWith("contradicted:"));
  const statusCorrect = derived.status !== "failed" && ((derived.status === "needs_review") === expectsReview || justifiedFlag);
  const reviewReasonHit = expectsReview && truth.expectedReviewReasons.length > 0 ? truth.expectedReviewReasons.some((cls) => reasonReflected(cls, derived.reviewReasons)) : null;
  const titleConfidence = typeof derived.confidence.title === "number" ? derived.confidence.title : null;

  return {
    productKey: derived.productKey,
    truthKey: truth.productKey,
    title: derived.title,
    category: derived.category,
    categoryPrefix: truth.categoryPrefix,
    status: derived.status,
    expectedStatus: truth.expectedStatus,
    reviewReasons: derived.reviewReasons,
    blocked: derived.blocked,
    expectedReviewReasons: truth.expectedReviewReasons,
    variantPrecision: ratio(variantHits, derivedCount),
    variantRecall: ratio(variantHits, truthCount),
    variantHits,
    derivedVariants: derivedCount,
    truthVariants: truthCount,
    missingSkus: [...[...truthSet].filter((s) => !derivedSet.has(s)), ...skulessTruth.slice(synthetic.length).map(() => '""')],
    extraSkus: [...[...derivedSet].filter((s) => !truthSet.has(s)), ...synthetic.slice(skulessTruth.length).map((v) => v.sku)],
    priceExact: ratio(priceHits, truth.variants.length),
    priceHits,
    priceMisses,
    titleKeywordHit: ratio(truth.titleKeywords.length - missingKeywords.length, truth.titleKeywords.length),
    missingKeywords,
    categoryPrefixMatch: derived.category.toLowerCase().startsWith(truth.categoryPrefix.toLowerCase()),
    claimGrounding: ratio(derived.claimsGrounded, derived.claims.length),
    claimsGrounded: derived.claimsGrounded,
    claimCount: derived.claims.length,
    ungroundedClaims: derived.ungroundedClaims,
    allowedClaimCoverage: ratio(allowed.length - missingClaims.length, allowed.length),
    allowedHits: allowed.length - missingClaims.length,
    allowedCount: allowed.length,
    missingClaims,
    negatedViolations,
    violations,
    statusCorrect,
    justifiedFlag,
    reviewReasonHit,
    titleConfidence,
    error: derived.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Duplicates (EC-C3)
// ---------------------------------------------------------------------------

export interface DuplicateScore {
  precision: number | null;
  recall: number | null;
  hits: number;
  derived: number;
  truth: number;
  missed: DuplicateRow[];
  extra: DuplicateRow[];
}

export function scoreDuplicates(derived: DuplicateRow[], truth: DuplicateRow[]): DuplicateScore {
  const key = (d: DuplicateRow): string => `${d.row}:${d.of}`;
  const truthKeys = new Set(truth.map(key));
  const derivedKeys = new Set(derived.map(key));
  const hits = [...derivedKeys].filter((k) => truthKeys.has(k)).length;
  return {
    precision: ratio(hits, derivedKeys.size),
    recall: ratio(hits, truthKeys.size),
    hits,
    derived: derivedKeys.size,
    truth: truthKeys.size,
    missed: truth.filter((d) => !derivedKeys.has(key(d))),
    extra: derived.filter((d) => !truthKeys.has(key(d))),
  };
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface EvalMetrics {
  products: { truth: number; derived: number; matched: number; failed: number };
  productRecall: number | null;
  productPrecision: number | null;
  /** Denominators include the variants of unmatched products, so dropped products cost recall and invented ones cost precision. */
  variantPrecision: number | null;
  variantRecall: number | null;
  priceExactness: number | null;
  titleKeywordRate: number | null;
  categoryAccuracy: number | null;
  claimGrounding: number | null;
  allowedClaimCoverage: number | null;
  negatedViolations: number;
  reviewPrecision: number | null;
  reviewRecall: number | null;
  /** Products flagged only because the validator blocked a claim the model asserted against the source. */
  modelErrorFlags: number;
  reviewReasonRate: number | null;
  statusAccuracy: number | null;
  duplicatePrecision: number | null;
  duplicateRecall: number | null;
  confidenceCalibration: { meanConfidenceWhenCorrect: number | null; meanConfidenceWhenWrong: number | null; correct: number; wrong: number };
}

export function aggregate(scored: PairScore[], unmatched: { truth: GroundTruthProduct[]; derived: DerivedProduct[] }, duplicates: DuplicateScore): EvalMetrics {
  const sum = (pick: (s: PairScore) => number): number => scored.reduce((n, s) => n + pick(s), 0);
  const truthCount = scored.length + unmatched.truth.length;
  const derivedCount = scored.length + unmatched.derived.length;
  const truthVariants = sum((s) => s.truthVariants) + unmatched.truth.reduce((n, t) => n + t.variants.length, 0);
  const derivedVariants = sum((s) => s.derivedVariants) + unmatched.derived.reduce((n, d) => n + d.variants.length, 0);

  const flagged = scored.filter((s) => s.status === "needs_review");
  const expectedReview = scored.filter((s) => s.expectedStatus === "needs_review");
  const truePositives = flagged.filter((s) => s.expectedStatus === "needs_review" || s.justifiedFlag).length;
  const modelErrorFlags = flagged.filter((s) => s.expectedStatus !== "needs_review" && s.justifiedFlag).length;
  const reasonScored = scored.filter((s) => s.reviewReasonHit !== null);

  const titled = scored.filter((s) => s.titleKeywordHit !== null);
  const calibrated = titled.filter((s) => s.titleConfidence !== null);
  const correct = calibrated.filter((s) => (s.titleKeywordHit ?? 0) >= 0.5);
  const wrong = calibrated.filter((s) => (s.titleKeywordHit ?? 0) < 0.5);

  return {
    products: {
      truth: truthCount,
      derived: derivedCount,
      matched: scored.length,
      failed: scored.filter((s) => s.error !== null).length + unmatched.derived.filter((d) => d.error).length,
    },
    productRecall: ratio(scored.length, truthCount),
    productPrecision: ratio(scored.length, derivedCount),
    variantPrecision: ratio(sum((s) => s.variantHits), derivedVariants),
    variantRecall: ratio(sum((s) => s.variantHits), truthVariants),
    priceExactness: ratio(sum((s) => s.priceHits), truthVariants),
    titleKeywordRate: mean(titled.map((s) => s.titleKeywordHit ?? 0)),
    categoryAccuracy: ratio(scored.filter((s) => s.categoryPrefixMatch).length, scored.length),
    claimGrounding: ratio(sum((s) => s.claimsGrounded), sum((s) => s.claimCount)),
    allowedClaimCoverage: ratio(sum((s) => s.allowedHits), sum((s) => s.allowedCount)),
    negatedViolations: sum((s) => s.negatedViolations),
    reviewPrecision: ratio(truePositives, flagged.length),
    reviewRecall: ratio(flagged.filter((s) => s.expectedStatus === "needs_review").length, expectedReview.length),
    modelErrorFlags,
    reviewReasonRate: ratio(reasonScored.filter((s) => s.reviewReasonHit === true).length, reasonScored.length),
    statusAccuracy: ratio(scored.filter((s) => s.statusCorrect).length, scored.length),
    duplicatePrecision: duplicates.precision,
    duplicateRecall: duplicates.recall,
    confidenceCalibration: {
      meanConfidenceWhenCorrect: mean(correct.map((s) => (s.titleConfidence ?? 0) / 100)),
      meanConfidenceWhenWrong: mean(wrong.map((s) => (s.titleConfidence ?? 0) / 100)),
      correct: correct.length,
      wrong: wrong.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

/** Worst first: most negated violations, then lowest title keyword hit, then most failing checks. */
export function worstProducts(scored: PairScore[], limit: number): PairScore[] {
  const hit = (s: PairScore): number => s.titleKeywordHit ?? 1;
  return [...scored].sort((a, b) => b.negatedViolations - a.negatedViolations || hit(a) - hit(b) || failingChecks(b).length - failingChecks(a).length).slice(0, limit);
}

export function failingChecks(s: PairScore): string[] {
  const out: string[] = [];
  if (s.error) out.push(`error: ${s.error}`);
  if (s.negatedViolations > 0) out.push(`negated: ${s.violations.join("; ")}`);
  if (s.missingKeywords.length > 0) out.push(`title: missing ${s.missingKeywords.map((k) => `"${k}"`).join(", ")}`);
  if (!s.categoryPrefixMatch) out.push(`category: "${s.category || "(none)"}" is not under "${s.categoryPrefix}"`);
  if (s.missingSkus.length > 0 || s.extraSkus.length > 0) {
    const parts = [`${s.variantHits}/${s.truthVariants} recovered`];
    if (s.missingSkus.length > 0) parts.push(`missing ${s.missingSkus.map((x) => x || '""').join(", ")}`);
    if (s.extraSkus.length > 0) parts.push(`extra ${s.extraSkus.join(", ")}`);
    out.push(`variants: ${parts.join("; ")}`);
  }
  if (s.priceHits < s.truthVariants) out.push(`price: ${s.priceHits}/${s.truthVariants} exact (${s.priceMisses.slice(0, 2).join("; ")})`);
  if (s.claimsGrounded < s.claimCount) out.push(`claims: only ${s.claimsGrounded}/${s.claimCount} cited quotes found in the source rows (${s.ungroundedClaims.join("; ")})`);
  if (!s.statusCorrect) out.push(`status: ${s.status} (expected ${s.expectedStatus})${s.blocked.length > 0 ? `; blocked ${s.blocked.join(" | ")}` : ""}`);
  if (s.reviewReasonHit === false) out.push(`review reason: none of [${s.expectedReviewReasons.join(", ")}] reflected in [${s.reviewReasons.join(" | ")}]`);
  return out;
}
