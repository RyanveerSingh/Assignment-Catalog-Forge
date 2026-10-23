import { describe, expect, it } from "vitest";
import type { DuplicateRow, GroundTruthProduct, GroundTruthVariant } from "@/core/types";
import { aggregate, countAsserted, failingChecks, matchProducts, quoteFoundInRows, scoreDuplicates, scorePair, worstProducts, type DerivedProduct, type DerivedVariant } from "./metrics";

function tv(sku: string, priceCents: number | null = 1250, currency: string | null = priceCents === null ? null : "EUR"): GroundTruthVariant {
  return { sku, options: {}, priceCents, currency, weightGrams: null };
}

function dv(sku: string, priceCents: number | null = 1250, currency: string | null = priceCents === null ? null : "EUR"): DerivedVariant {
  return { sku, synthetic: sku.startsWith("GEN-"), priceCents, currency };
}

function truth(overrides: Partial<GroundTruthProduct> = {}): GroundTruthProduct {
  return {
    productKey: "TC-PL",
    titleKeywords: ["planter"],
    categoryPrefix: "Home & Garden > Decor > Planters",
    variants: [tv("TC-PL-20", 1250), tv("TC-PL-30", 1875)],
    allowedClaims: ["frost-resistant", "handmade in portugal", "drainage hole"],
    negatedClaims: ["frost-proof"],
    expectedStatus: "done",
    expectedReviewReasons: [],
    sourceRows: [1, 2],
    photos: [],
    language: "en",
    ...overrides,
  };
}

function derived(overrides: Partial<DerivedProduct> = {}): DerivedProduct {
  const variants = overrides.variants ?? [dv("TC-PL-20", 1250), dv("TC-PL-30", 1875)];
  return {
    productKey: "TC-PL",
    skus: variants.map((v) => v.sku),
    variants,
    title: "Terracotta Planter",
    category: "Home & Garden > Decor > Planters",
    claims: ["frost-resistant", "handmade in portugal"],
    descriptionText: "Classic terracotta planter with a drainage hole. Frost-resistant (not frost-proof).",
    tags: ["planter", "terracotta"],
    attributes: {},
    status: "draft",
    reviewReasons: [],
    blocked: [],
    claimsGrounded: overrides.claimsGrounded ?? (overrides.claims ?? ["hand-thrown", "frost-resistant"]).length,
    ungroundedClaims: [],
    confidence: { title: 95 },
    ...overrides,
  };
}

const noDuplicates = scoreDuplicates([], []);
const noUnmatched = { truth: [], derived: [] };

describe("matchProducts", () => {
  it("pairs by the most shared SKUs and uses each truth product once", () => {
    const dA = derived({ productKey: "A", variants: [dv("X-1"), dv("X-2")] });
    const dB = derived({ productKey: "B", variants: [dv("X-2"), dv("Y-1"), dv("Y-2")] });
    const tX = truth({ productKey: "X", variants: [tv("X-1"), tv("X-2")] });
    const tY = truth({ productKey: "Y", variants: [tv("Y-1"), tv("Y-2")] });
    const m = matchProducts([dB, dA], [tX, tY]);
    expect(m.pairs.map((p) => [p.derived.productKey, p.truth.productKey, p.sharedSkus])).toEqual([
      ["A", "X", 2],
      ["B", "Y", 2],
    ]);
    expect(m.unmatchedTruth).toEqual([]);
    expect(m.unmatchedDerived).toEqual([]);
  });

  it("EC-C6: falls back to an equal product key when no SKU can match (the SKU-less row)", () => {
    const d = derived({ productKey: "cotton-table-runner", variants: [dv("GEN-1A2B", 2400)] });
    const t = truth({ productKey: "cotton-table-runner", variants: [tv("", 2400)] });
    const m = matchProducts([d], [t]);
    expect(m.pairs).toHaveLength(1);
    expect(m.pairs[0].sharedSkus).toBe(0);
  });

  it("reports unmatched products on both sides", () => {
    const m = matchProducts([derived({ productKey: "Z", variants: [dv("Z-1")] })], [truth()]);
    expect(m.pairs).toEqual([]);
    expect(m.unmatchedTruth.map((t) => t.productKey)).toEqual(["TC-PL"]);
    expect(m.unmatchedDerived.map((d) => d.productKey)).toEqual(["Z"]);
  });
});

describe("scorePair: variants and prices", () => {
  it("EC-C6: a synthetic GEN- variant pairs with a SKU-less truth variant and its price is compared", () => {
    const s = scorePair(derived({ variants: [dv("GEN-1A2B", 2400)] }), truth({ variants: [tv("", 2400)] }));
    expect(s.variantPrecision).toBe(1);
    expect(s.variantRecall).toBe(1);
    expect(s.priceExact).toBe(1);
    expect(s.missingSkus).toEqual([]);
    const wrongPrice = scorePair(derived({ variants: [dv("GEN-1A2B", 2500)] }), truth({ variants: [tv("", 2400)] }));
    expect(wrongPrice.priceExact).toBe(0);
  });

  it("EC-C6: a synthetic GEN- variant never matches a real truth SKU", () => {
    const s = scorePair(derived({ variants: [dv("GEN-1A2B", 2400)] }), truth({ variants: [tv("TC-PL-20", 2400)] }));
    expect(s.variantPrecision).toBe(0);
    expect(s.variantRecall).toBe(0);
    expect(s.missingSkus).toEqual(["TC-PL-20"]);
    expect(s.extraSkus).toEqual(["GEN-1A2B"]);
  });

  it("EC-B14: compares upper-cased, trimmed SKUs for precision and recall", () => {
    const s = scorePair(derived({ variants: [dv(" tc-pl-20 "), dv("TC-PL-30"), dv("TC-PL-99")] }), truth({ variants: [tv("TC-PL-20"), tv("TC-PL-30"), tv("TC-PL-40")] }));
    expect(s.variantPrecision).toBeCloseTo(2 / 3);
    expect(s.variantRecall).toBeCloseTo(2 / 3);
    expect(s.missingSkus).toEqual(["TC-PL-40"]);
    expect(s.extraSkus).toEqual(["TC-PL-99"]);
  });

  const truthPrices = [tv("TC-PL-20", 1250, "EUR"), tv("TC-PL-30", null)];
  it.each([
    ["identical cents and currency, null matching null", [dv("TC-PL-20", 1250, "EUR"), dv("TC-PL-30", null)], 1],
    ["EC-B2: same cents but a different currency", [dv("TC-PL-20", 1250, "GBP"), dv("TC-PL-30", null)], 0.5],
    ["EC-B5: zero is not null", [dv("TC-PL-20", 1250, "EUR"), dv("TC-PL-30", 0, "EUR")], 0.5],
    ["a truth variant without a derived counterpart", [dv("TC-PL-20", 1250, "EUR")], 0.5],
  ])("EC-B1: priceExact — %s", (_name, variants, expected) => {
    expect(scorePair(derived({ variants }), truth({ variants: truthPrices })).priceExact).toBeCloseTo(expected);
  });
});

describe("scorePair: title and category", () => {
  it.each([
    ["Terracotta Planter", ["planter"], 1],
    ["PLANTER, 20 CM", ["planter"], 1],
    ["Clay Pot", ["planter"], 0],
    ["Terracotta Planter", ["planter", "saucer"], 0.5],
  ])("titleKeywordHit for %j with keywords %j is %d", (title, titleKeywords, expected) => {
    expect(scorePair(derived({ title }), truth({ titleKeywords })).titleKeywordHit).toBeCloseTo(expected);
  });

  it("titleKeywordHit is null when the truth lists no keywords", () => {
    expect(scorePair(derived(), truth({ titleKeywords: [] })).titleKeywordHit).toBeNull();
  });

  it.each([
    ["home & garden > decor > planters > large", true],
    ["Home & Garden > Decor > Planters", true],
    ["Home & Garden > Decor", false],
    ["", false],
  ])("EC-D3: categoryPrefixMatch for %j is %s", (category, expected) => {
    expect(scorePair(derived({ category }), truth()).categoryPrefixMatch).toBe(expected);
  });
});

describe("scorePair: claims", () => {
  it("EC-D2: claim grounding is the share of claims whose quote the eval found in the raw rows", () => {
    const s = scorePair(derived({ claims: ["Dishwasher safe", "organic"], claimsGrounded: 1 }), truth({ allowedClaims: ["dishwasher-safe"], negatedClaims: [] }));
    expect(s.claimGrounding).toBe(0.5);
    expect(s.claimsGrounded).toBe(1);
    expect(s.claimCount).toBe(2);
  });

  it("EC-D2: quoteFoundInRows matches verbatim, at 90% of tokens, through mojibake, and single whole words of 4+ letters", () => {
    const rows = [{ cells: { Description: "Hand-thrown planter with drainage hole.", Notes: "Innen und auÃŸen pulverbeschichtet" } }];
    expect(quoteFoundInRows(rows, "planter with drainage hole")).toBe(true);
    expect(quoteFoundInRows(rows, "Innen und außen pulverbeschichtet")).toBe(true);
    expect(quoteFoundInRows(rows, "hand thrown planter with drainage holes and saucer")).toBe(false);
    expect(quoteFoundInRows(rows, "planter")).toBe(true);
    expect(quoteFoundInRows(rows, "plant")).toBe(false);
    expect(quoteFoundInRows(rows, "und")).toBe(false);
    expect(quoteFoundInRows([{ cells: { Notes: "FSC-certified timber" } }], "FSC")).toBe(true);
    expect(quoteFoundInRows(rows, "made in Portugal")).toBe(false);
  });

  it("allowed-claim coverage counts allowed claims covered by output claims, sub-phrases included", () => {
    const s = scorePair(derived({ claims: ["organic", "machine-washable"] }), truth({ allowedClaims: ["100% organic cotton", "machine washable", "non-slip backing"], negatedClaims: [] }));
    expect(s.allowedClaimCoverage).toBeCloseTo(2 / 3);
    expect(s.missingClaims).toEqual(["non slip backing"]);
  });

  it("EC-B15: asserting a negated claim counts once per claim and once per occurrence in the listing text", () => {
    const s = scorePair(derived({ claims: ["frost-proof"], descriptionText: "A frost-proof planter for the patio. Frost-proof all winter." }), truth());
    expect(s.negatedViolations).toBe(3);
    expect(s.violations).toHaveLength(2);
  });

  it("EC-B15: a negated phrase that the listing itself negates is not a violation", () => {
    const care = "Frost-resistant (not frost-proof, bring indoors below 0 °C).";
    const s = scorePair(derived({ descriptionText: care, attributes: { care } }), truth());
    expect(s.negatedViolations).toBe(0);
  });

  it("EC-B15: the joined spelling and a partial claim still count as assertions", () => {
    expect(scorePair(derived({ descriptionText: "Frostproof planter." }), truth()).negatedViolations).toBe(1);
    expect(scorePair(derived({ claims: ["organic"] }), truth({ allowedClaims: [], negatedClaims: ["certified organic"] })).negatedViolations).toBe(1);
  });

  it("countAsserted only honours a negation within three tokens before the phrase", () => {
    expect(countAsserted("this planter is frost proof", "frost proof")).toBe(1);
    expect(countAsserted("not at all frost proof", "frost proof")).toBe(0);
    expect(countAsserted("not really ever truly frost proof", "frost proof")).toBe(1);
    expect(countAsserted("frost proof is not what this is", "frost proof")).toBe(1);
  });
});

describe("scorePair: status and review reasons", () => {
  it.each([
    ["draft", "done", true],
    ["needs_review", "needs_review", true],
    ["draft", "needs_review", false],
    ["needs_review", "done", false],
    ["failed", "done", false],
  ] as const)("statusCorrect: derived %s vs expected %s → %s", (status, expectedStatus, expected) => {
    expect(scorePair(derived({ status }), truth({ expectedStatus })).statusCorrect).toBe(expected);
  });

  it("EC-B1: reviewReasonHit for no_price needs a reason that mentions the price", () => {
    const expectsNoPrice = truth({ expectedStatus: "needs_review", expectedReviewReasons: ["no_price"] });
    expect(scorePair(derived({ status: "needs_review", reviewReasons: ["No price for 20 cm"] }), expectsNoPrice).reviewReasonHit).toBe(true);
    expect(scorePair(derived({ status: "needs_review", reviewReasons: ["Low confidence in the title"] }), expectsNoPrice).reviewReasonHit).toBe(false);
    expect(scorePair(derived(), truth()).reviewReasonHit).toBeNull();
  });

  it("EC-C4: reviewReasonHit for sku_conflict needs a reason that mentions a conflict", () => {
    const expectsConflict = truth({ expectedStatus: "needs_review", expectedReviewReasons: ["sku_conflict"] });
    const grouperWording = "SKU TC-PL-30 appears in rows 90 and 102 with a different price: price 18.75 EUR (row 90) vs 17.50 EUR (row 102)";
    expect(scorePair(derived({ status: "needs_review", reviewReasons: [grouperWording] }), expectsConflict).reviewReasonHit).toBe(true);
    expect(scorePair(derived({ status: "needs_review", reviewReasons: ["SKU conflict between rows 90 and 102"] }), expectsConflict).reviewReasonHit).toBe(true);
    expect(scorePair(derived({ status: "needs_review", reviewReasons: ["No price for 30 cm"] }), expectsConflict).reviewReasonHit).toBe(false);
  });
});

describe("scoreDuplicates", () => {
  it("EC-C3: precision and recall compare {row, of} pairs", () => {
    const derivedDuplicates: DuplicateRow[] = [
      { row: 85, of: 31 },
      { row: 113, of: 88 },
      { row: 50, of: 49 },
    ];
    const truthDuplicates: DuplicateRow[] = [
      { row: 85, of: 31 },
      { row: 113, of: 88 },
      { row: 120, of: 112 },
    ];
    const d = scoreDuplicates(derivedDuplicates, truthDuplicates);
    expect(d.precision).toBeCloseTo(2 / 3);
    expect(d.recall).toBeCloseTo(2 / 3);
    expect(d.missed).toEqual([{ row: 120, of: 112 }]);
    expect(d.extra).toEqual([{ row: 50, of: 49 }]);
  });

  it("EC-C3: nothing to score gives null rates, not a division by zero", () => {
    expect(noDuplicates).toMatchObject({ precision: null, recall: null, hits: 0 });
  });
});

describe("aggregate", () => {
  it("computes product recall/precision, review precision/recall and status accuracy over the pairs", () => {
    const flaggedCorrectly = scorePair(derived({ productKey: "A", status: "needs_review", reviewReasons: ["No price for 20 cm"] }), truth({ productKey: "A", expectedStatus: "needs_review", expectedReviewReasons: ["no_price"] }));
    const flaggedWrongly = scorePair(derived({ productKey: "B", status: "needs_review", reviewReasons: ["Low confidence in the title"] }), truth({ productKey: "B" }));
    const m = aggregate([flaggedCorrectly, flaggedWrongly], { truth: [truth({ productKey: "C" })], derived: [derived({ productKey: "D" })] }, noDuplicates);
    expect(m.products).toEqual({ truth: 3, derived: 3, matched: 2, failed: 0 });
    expect(m.productRecall).toBeCloseTo(2 / 3);
    expect(m.productPrecision).toBeCloseTo(2 / 3);
    expect(m.reviewPrecision).toBe(0.5);
    expect(m.reviewRecall).toBe(1);
    expect(m.reviewReasonRate).toBe(1);
    expect(m.statusAccuracy).toBe(0.5);
    expect(m.categoryAccuracy).toBe(1);
    expect(m.negatedViolations).toBe(0);
  });

  it("counts the variants of unmatched products against recall, price exactness and precision", () => {
    const pair = scorePair(derived(), truth());
    const missing = truth({ productKey: "WS-SH", variants: [tv("WS-SH-60", 3900), tv("WS-SH-90", 5460)] });
    const lost = aggregate([pair], { truth: [missing], derived: [] }, noDuplicates);
    expect(lost.variantRecall).toBe(0.5);
    expect(lost.priceExactness).toBe(0.5);
    expect(lost.variantPrecision).toBe(1);
    const invented = aggregate([pair], { truth: [], derived: [derived({ productKey: "Z", variants: [dv("Z-1"), dv("Z-2")] })] }, noDuplicates);
    expect(invented.variantPrecision).toBe(0.5);
    expect(invented.variantRecall).toBe(1);
  });

  it("EC-B15: a flag raised by a blocked negated claim counts as a correct flag and is reported on its own", () => {
    const caught = scorePair(derived({ productKey: "A", status: "needs_review", reviewReasons: ['Listing says "frost-proof" but the source negates it'], blocked: ['negated: "frost-proof" — the source explicitly negates it'] }), truth({ productKey: "A", expectedStatus: "done" }));
    expect(caught.statusCorrect).toBe(true);
    expect(caught.justifiedFlag).toBe(true);
    const needless = scorePair(derived({ productKey: "B", status: "needs_review", reviewReasons: ["Low confidence in the title"] }), truth({ productKey: "B", expectedStatus: "done" }));
    expect(needless.statusCorrect).toBe(false);
    const m = aggregate([caught, needless], noUnmatched, noDuplicates);
    expect(m.reviewPrecision).toBe(0.5);
    expect(m.modelErrorFlags).toBe(1);
    expect(m.statusAccuracy).toBe(0.5);
  });

  it("micro-averages claim grounding and allowed-claim coverage across products", () => {
    const a = scorePair(derived({ productKey: "A", claims: ["frost-resistant", "organic"], claimsGrounded: 1 }), truth({ productKey: "A" }));
    const b = scorePair(derived({ productKey: "B", claims: ["handmade"], claimsGrounded: 1 }), truth({ productKey: "B" }));
    const m = aggregate([a, b], noUnmatched, noDuplicates);
    expect(m.claimGrounding).toBeCloseTo(2 / 3);
    expect(m.allowedClaimCoverage).toBeCloseTo(2 / 6);
  });

  it("splits confidence calibration on a title keyword hit of at least 0.5", () => {
    const good = scorePair(derived({ confidence: { title: 90 } }), truth());
    const bad = scorePair(derived({ title: "Clay Pot", confidence: { title: 40 } }), truth());
    const m = aggregate([good, bad], noUnmatched, noDuplicates);
    expect(m.confidenceCalibration).toEqual({ meanConfidenceWhenCorrect: 0.9, meanConfidenceWhenWrong: 0.4, correct: 1, wrong: 1 });
  });

  it("returns null rates and zero counts when there is nothing to score", () => {
    const m = aggregate([], noUnmatched, noDuplicates);
    expect(m.productRecall).toBeNull();
    expect(m.claimGrounding).toBeNull();
    expect(m.duplicatePrecision).toBeNull();
    expect(m.titleKeywordRate).toBeNull();
    expect(m.negatedViolations).toBe(0);
    expect(m.confidenceCalibration.meanConfidenceWhenWrong).toBeNull();
  });
});

describe("worstProducts and failingChecks", () => {
  it("orders by negated violations, then the lowest title keyword hit, and names what failed", () => {
    const clean = scorePair(derived(), truth());
    const badTitle = scorePair(derived({ productKey: "B", title: "Clay Pot" }), truth());
    const negated = scorePair(derived({ productKey: "C", claims: ["frost-proof"] }), truth());
    expect(worstProducts([clean, badTitle, negated], 2).map((s) => s.productKey)).toEqual(["C", "B"]);
    expect(failingChecks(badTitle)).toEqual(expect.arrayContaining([expect.stringContaining('title: missing "planter"')]));
    expect(failingChecks(negated)[0]).toMatch(/^negated: claim "frost proof"/);
    expect(failingChecks(clean).filter((c) => !c.startsWith("claims missed"))).toEqual([]);
  });

  it("lists a failed product's error, missing variants and wrong status", () => {
    const s = scorePair(derived({ status: "failed", error: "model returned no output", title: "", variants: [dv("TC-PL-20")] }), truth());
    const checks = failingChecks(s);
    expect(checks[0]).toBe("error: model returned no output");
    expect(checks).toEqual(expect.arrayContaining([expect.stringContaining("variants: 1/2 recovered; missing TC-PL-30"), "status: failed (expected done)"]));
  });
});
