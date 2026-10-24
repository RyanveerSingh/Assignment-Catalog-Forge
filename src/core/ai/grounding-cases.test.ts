import { describe, expect, it } from "vitest";
import type { Issue, ProductGroup, VariantDraft } from "@/core/types";
import { groundProductOutput, type GroundingResult } from "./grounding";
import type { AiClaim, AiProductOutput } from "./schema";

/** Table-driven cases for the "no invented claims" rules: one product, one source cell set, one listing each. */

type Cells = Record<string, string>;

function variant(sku: string, priceCents: number | null, issues: Issue[] = []): VariantDraft {
  return { sku, skuDisplay: sku, synthetic: false, options: { size: sku.slice(-2) }, priceCents, currency: "EUR", compareAtCents: null, weightGrams: null, dimensions: null, images: [], quantity: null, barcode: null, sourceRows: [2], issues };
}

function groupFor(cells: Cells, lang: "en" | "de" | "fr" = "en", variants: VariantDraft[] = [variant("PT-20", 2499)]): ProductGroup {
  return {
    productKey: "PT",
    keySource: "sku_stem",
    title: cells.Title ?? null,
    descriptionHtml: null,
    descriptionText: cells.Description ?? null,
    category: null,
    brand: null,
    tags: [],
    notes: null,
    care: null,
    material: null,
    color: null,
    attributes: {},
    variants,
    sourceRows: [2],
    duplicateRows: [],
    conflicts: [],
    issues: [],
    language: { lang, confidence: 90 },
    images: [],
    sourceCorpus: Object.entries(cells).map(([k, v]) => `${k}: ${v}`).join("\n"),
    complexity: 10,
    sourceHash: "x",
  };
}

interface Case {
  cells: Cells;
  title?: string;
  html: string;
  claims?: AiClaim[];
  lang?: "en" | "de" | "fr";
  variants?: VariantDraft[];
}

function run(c: Case): GroundingResult {
  const cells = { Title: c.cells.Title ?? "Stoneware Planter Pot", ...c.cells };
  const output: AiProductOutput = {
    product_key: "PT",
    title: c.title ?? "Stoneware Planter Pot",
    description_html: c.html,
    category: "Home & Garden > Decor > Planters",
    tags: [],
    attributes: [],
    claims: c.claims ?? [],
    confidence: { title: 95, description: 90, category: 90, tags: 80, attributes: 85 },
    status: "ok",
    review_reason: null,
    meta_title: "",
    meta_description: "",
    source_language: c.lang ?? "en",
  };
  return groundProductOutput({ output, group: groupFor(cells, c.lang, c.variants), rows: [{ row: 2, cells }] });
}

const cite = (text: string, column: string, quote: string): AiClaim => ({ text, source_row: 2, source_column: column, quote });
const FROST_NOTE = "Frost-resistant (not frost-proof, bring indoors below 0 °C)";

describe("grounding: claims the source negates are removed and sent to review", () => {
  it.each<[string, Case, string, RegExp]>([
    ["EC-B15: a contraction denies the claim (isn't frost-proof)", { cells: { Notes: "This pot isn't frost-proof." }, html: "<p>Frost-proof stoneware planter pot.</p>" }, "frost-proof", /frost/i],
    ["EC-B15: \"doesn't make it dishwasher safe\" denies dishwasher-safe", { cells: { Notes: "Glaze doesn't make it dishwasher safe; hand wash only." }, html: "<p>Stoneware planter pot. Dishwasher-safe.</p>" }, "dishwasher-safe", /dishwasher/i],
    ["EC-B15: a post-positioned answer denies the claim (Dishwasher-safe? No.)", { cells: { Notes: "Dishwasher-safe? No. Hand wash only." }, html: "<p>Stoneware planter pot, dishwasher-safe.</p>" }, "dishwasher-safe", /dishwasher/i],
    ["EC-B15: a labelled answer denies the claim (Dishwasher safe: no)", { cells: { Care: "Dishwasher safe: no" }, html: "<p>Stoneware planter pot. Dishwasher safe and easy to clean.</p>" }, "dishwasher-safe", /dishwasher/i],
    ["EC-B15: a ruled-out use denies the -safe claim (Not suitable for dishwasher or microwave)", { cells: { Care: "Not suitable for dishwasher or microwave" }, html: "<p>Stoneware planter pot. Dishwasher-safe and microwave-safe.</p>" }, "dishwasher-safe", /dishwasher|microwave/i],
    ["EC-B15: German kein still negates", { cells: { Notes: "Kein veganes Produkt, echtes Leder." }, html: "<p>Vegan stoneware planter pot.</p>", lang: "de" }, "vegan", /vegan/i],
    ["EC-B15: German nicht still negates", { cells: { Notes: "Nicht frostsicher." }, html: "<p>Frost-proof stoneware planter pot.</p>", lang: "de" }, "frost-proof", /frost/i],
    ["EC-B15: French n'est pas still negates", { cells: { Notes: "Ce pot n'est pas compatible lave-vaisselle." }, html: "<p>Stoneware planter pot. Dishwasher-safe.</p>", lang: "fr" }, "dishwasher-safe", /dishwasher/i],
    ["EC-B15: paraphrases of frost-proof are denied with it", { cells: { Notes: FROST_NOTE }, html: "<p>Stoneware planter pot. Fully weatherproof and winter-hardy, can stay outside all winter.</p>" }, "frost-proof", /weatherproof|winter/i],
  ])("%s", (_name, c, term, gone) => {
    const r = run(c);
    expect(r.status).toBe("needs_review");
    expect(r.blocked).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "negated", term })]));
    expect(r.content.descriptionHtml ?? "").not.toMatch(gone);
    expect(r.content.descriptionHtml ?? "").toMatch(/Stoneware planter pot/i);
  });

  it("EC-B15: the frost note blocks frost-proof, keeps frost-resistant, and a faithful denial passes", () => {
    const naive = run({ cells: { Notes: FROST_NOTE }, html: "<p>Frost-proof and frost-resistant stoneware planter pot.</p>" });
    expect(naive.status).toBe("needs_review");
    expect(naive.content.descriptionHtml).toMatch(/frost-resistant/i);
    expect(naive.content.descriptionHtml).not.toMatch(/frost-proof/i);
    const faithful = run({ cells: { Notes: FROST_NOTE }, html: "<p>Frost-resistant stoneware planter pot, not frost-proof: bring indoors below 0 °C.</p>", claims: [cite("frost-resistant", "Notes", "Frost-resistant")] });
    expect(faithful.blocked).toEqual([]);
    expect(faithful.status).toBe("draft");
    expect(faithful.claims.map((c) => c.text)).toContain("frost-resistant");
  });
});

describe("grounding: origin, wording and certification claims", () => {
  it("EC-D2: 'Designed in Germany, made in China' does not back 'Made in Germany'", () => {
    const r = run({ cells: { Description: "Designed in Germany, made in China." }, html: "<p>Stoneware planter pot. Made in Germany.</p>" });
    expect(r.status).toBe("needs_review");
    expect(r.blocked).toEqual([expect.objectContaining({ text: "Made in Germany", kind: "unsupported", term: "made in", row: 2, column: "Description" })]);
    expect(r.content.descriptionHtml).toBe("<p>Stoneware planter pot.</p>");
    const china = run({ cells: { Description: "Designed in Germany, made in China." }, html: "<p>Stoneware planter pot. Made in China.</p>" });
    expect(china.status).toBe("draft");
    expect(china.claims.map((c) => c.text)).toContain("made in China");
  });

  it.each<[string, Case, string]>([
    ["EC-D2: a claim its quote does not say is removed", { cells: { Description: "Glazed inside, matte outside." }, html: "<p>Stoneware planter pot, glazed inside.</p>", claims: [cite("Suitable for year-round outdoor use", "Description", "Glazed inside")] }, "unsupported"],
    ["EC-B15: a claim asserting what its own quote denies is removed", { cells: { Notes: FROST_NOTE }, html: "<p>Stoneware planter pot.</p>", claims: [cite("Frost-proof down to -10°C", "Notes", FROST_NOTE)] }, "negated"],
    ["EC-B15: a non-lexicon phrase the source denies is removed", { cells: { Notes: "Not suitable for outdoor use." }, html: "<p>Stoneware planter pot.</p>", claims: [cite("Suitable for outdoor use", "Notes", "suitable for outdoor use")] }, "negated"],
  ])("%s", (_name, c, kind) => {
    const r = run(c);
    expect(r.status).toBe("needs_review");
    expect(r.claims).toEqual([]);
    expect(r.blocked).toEqual(expect.arrayContaining([expect.objectContaining({ text: c.claims?.[0]?.text, kind })]));
  });

  it.each([
    ["Child-safe", "child-safe"],
    ["Safe for kids", "child-safe"],
    ["Food-safe glaze", "food-safe"],
    ["Waterproof", "waterproof"],
    ["Fireproof", "fireproof"],
    ["Certified", "certified"],
    ["Organic", "organic"],
    ["BPA-free", "bpa-free"],
    ["Non-toxic", "non-toxic"],
    ["UV-stable", "uv-resistant"],
    ["Scratch-proof", "scratch-resistant"],
  ])("EC-D2: an unsupported safety or certification claim (%s) is removed and sent to review", (phrase, term) => {
    const r = run({ cells: { Description: "Stoneware planter pot with drainage hole." }, html: `<p>Stoneware planter pot with drainage hole. ${phrase}.</p>` });
    expect(r.status).toBe("needs_review");
    expect(r.blocked).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "unsupported", term })]));
    expect(r.content.descriptionHtml).toBe("<p>Stoneware planter pot with drainage hole.</p>");
  });

  it("EC-D2: a listing that says only what the source says stays a draft", () => {
    const r = run({
      cells: { Description: "Stoneware planter pot with drainage hole, hand-thrown in Portugal. Glazed inside." },
      html: "<p>Hand-thrown stoneware planter pot with a drainage hole, glazed inside. Made in Portugal.</p>",
      claims: [cite("Hand-thrown", "Description", "hand-thrown in Portugal"), cite("Glazed inside", "Description", "Glazed inside")],
    });
    expect(r.blocked).toEqual([]);
    expect(r.reviewReasons).toEqual([]);
    expect(r.status).toBe("draft");
  });
});

describe("grounding: numbers, bare 'bio' and prices", () => {
  it("EC-D4: a single unsupported percentage sends the product to review", () => {
    const r = run({ cells: { Description: "Organic cotton blend (20% organic cotton, 80% polyester)" }, html: "<p>Planter pot cover. 100% organic cotton cover.</p>" });
    expect(r.status).toBe("needs_review");
    expect(r.reviewReasons).toContain('Listing contains numbers the source does not: "100%"');
  });

  it("EC-D4: a single bare number without a unit or claim nearby is noted but not reviewed", () => {
    const r = run({ cells: { Description: "Stoneware planter pot." }, html: "<p>Stoneware planter pot, one of 3 colours.</p>" });
    expect(r.issues.some((i) => i.code === "number.unsupported")).toBe(true);
    expect(r.status).toBe("draft");
  });

  it("EC-D2: bare 'bio' is not evidence for organic", () => {
    const r = run({ cells: { Description: "Planter pot in bio-based plastic." }, html: "<p>Organic planter pot in bio-based plastic.</p>" });
    expect(r.status).toBe("needs_review");
    expect(r.blocked).toEqual([expect.objectContaining({ kind: "unsupported", term: "organic" })]);
  });

  it("EC-B5: a warn-level price issue sends the product to review with the raw value", () => {
    const ambiguous: Issue = { code: "price.ambiguous", severity: "warn", message: "ambiguous", field: "price", value: "1.299", ec: "B5" };
    const r = run({ cells: { Description: "Stoneware planter pot." }, html: "<p>Stoneware planter pot.</p>", variants: [variant("PT-20", 129900, [ambiguous])] });
    expect(r.status).toBe("needs_review");
    expect(r.reviewReasons).toEqual(["Price unclear: 1.299"]);
  });

  it("EC-B5: a sibling that states the same price unambiguously does not settle the doubt", () => {
    const ambiguous: Issue = { code: "price.ambiguous", severity: "warn", message: "ambiguous", field: "price", value: "1.299", ec: "B5" };
    const r = run({ cells: { Description: "Stoneware planter pot." }, html: "<p>Stoneware planter pot.</p>", variants: [variant("PT-20", 129900, [ambiguous]), variant("PT-30", 129900)] });
    expect(r.status).toBe("needs_review");
    expect(r.reviewReasons).toEqual(["Price unclear: 1.299"]);
  });

  it("EC-B5: info-level price notes and compare-at doubts do not send a product to review", () => {
    const notes: Issue[] = [
      { code: "price.currency_assumed", severity: "info", message: "assumed EUR", field: "price" },
      { code: "price.ambiguous", severity: "warn", message: "ambiguous", field: "compare_at_price", value: "1.499" },
    ];
    const r = run({ cells: { Description: "Stoneware planter pot." }, html: "<p>Stoneware planter pot.</p>", variants: [variant("PT-20", 2499, notes)] });
    expect(r.status).toBe("draft");
  });
});
