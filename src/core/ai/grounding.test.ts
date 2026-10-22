import { describe, expect, it } from "vitest";
import type { ProductGroup } from "@/core/types";
import { collectSourceNumbers, extractNumbers, groundProductOutput, isNegated } from "./grounding";
import type { AiProductOutput } from "./schema";

const rows: Array<{ row: number; cells: Record<string, string> }> = [
  {
    row: 14,
    cells: {
      Title: "Terracotta Planter 20cm",
      Description: "Hand-thrown planter with drainage hole. Approx. 7.87 in tall.",
      Notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)",
    },
  },
  { row: 15, cells: { Title: "Terracotta Planter 30cm" } },
];

const group: ProductGroup = {
  productKey: "TC-PL",
  keySource: "sku_stem",
  title: "Terracotta Planter",
  descriptionHtml: "<p>Hand-thrown planter with drainage hole.</p>",
  descriptionText: "Hand-thrown planter with drainage hole. Approx. 7.87 in tall.",
  category: "Garden",
  brand: null,
  tags: [],
  notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)",
  care: null,
  material: "terracotta",
  color: null,
  attributes: {},
  variants: [
    { sku: "TC-PL-20", skuDisplay: "TC-PL-20", synthetic: false, options: { size: "20 cm" }, priceCents: 2499, currency: "EUR", compareAtCents: null, weightGrams: 1800, dimensions: null, images: [], quantity: null, barcode: null, sourceRows: [14], issues: [] },
    { sku: "TC-PL-30", skuDisplay: "TC-PL-30", synthetic: false, options: { size: "30 cm" }, priceCents: null, currency: null, compareAtCents: null, weightGrams: null, dimensions: null, images: [], quantity: null, barcode: null, sourceRows: [15], issues: [] },
  ],
  sourceRows: [14, 15],
  duplicateRows: [],
  conflicts: [],
  issues: [],
  language: { lang: "en", confidence: 90 },
  images: [],
  sourceCorpus: rows.map((r) => Object.entries(r.cells).map(([k, v]) => `${k}: ${v}`).join("\n")).join("\n\n"),
  complexity: 20,
  sourceHash: "abc",
};

function output(overrides: Partial<AiProductOutput> = {}): AiProductOutput {
  return {
    product_key: "TC-PL",
    title: "Hand-thrown Terracotta Planter",
    description_html: "<p>Hand-thrown terracotta planter with drainage hole. Frost-resistant; bring indoors below 0 °C.</p>",
    category: "Home & Garden > Decor > Planters",
    tags: ["terracotta", "planter", "indoor"],
    attributes: [
      { name: "material", value: "terracotta" },
      { name: "care", value: "Bring indoors below 0 °C" },
    ],
    claims: [
      { text: "hand-thrown", source_row: 14, source_column: "Description", quote: "Hand-thrown planter" },
      { text: "frost-resistant", source_row: 14, source_column: "Notes", quote: "frost-resistant" },
    ],
    confidence: { title: 97, description: 90, category: 88, tags: 80, attributes: 85 },
    status: "ok",
    review_reason: null,
    meta_title: "Hand-thrown Terracotta Planter",
    meta_description: "Hand-thrown terracotta planter with drainage hole.",
    source_language: "en",
    ...overrides,
  };
}

describe("groundProductOutput", () => {
  it("keeps cited, supported claims and sends the product to review only for the missing price", () => {
    const r = groundProductOutput({ output: output(), group, rows });
    expect(r.claims.map((c) => c.text)).toEqual(expect.arrayContaining(["hand-thrown", "frost-resistant"]));
    expect(r.claims.every((c) => c.verified && c.row === 14)).toBe(true);
    expect(r.removedClaims).toEqual([]);
    expect(r.reviewReasons).toEqual(["No price for 30 cm"]);
    expect(r.status).toBe("needs_review");
    expect(r.content.category).toBe("Home & Garden > Decor > Planters");
    expect(r.confidence.title).toBe(97);
  });

  it("EC-B15: strips a claim the source negates, even when cited", () => {
    const r = groundProductOutput({
      output: output({
        description_html: "<p>Frost-proof terracotta planter with drainage hole.</p>",
        claims: [{ text: "frost-proof", source_row: 14, source_column: "Notes", quote: "not frost-proof" }],
      }),
      group,
      rows,
    });
    expect(r.claims.map((c) => c.text)).not.toContain("frost-proof");
    expect(r.removedClaims[0]).toEqual({ text: "frost-proof", reason: "the source explicitly negates it" });
    expect(r.content.descriptionHtml).not.toMatch(/frost-proof/i);
    expect(r.reviewReasons.some((x) => x.includes("negates"))).toBe(true);
    expect(r.issues.some((i) => i.code === "claim.negated" && i.ec === "B15")).toBe(true);
  });

  it("EC-D2: strips an invented claim and lowers confidence", () => {
    const r = groundProductOutput({
      output: output({
        description_html: "<p>Organic, hand-thrown planter with drainage hole.</p>",
        claims: [{ text: "organic", source_row: 14, source_column: "Description", quote: "organic" }],
      }),
      group,
      rows,
    });
    expect(r.claims.map((c) => c.text)).not.toContain("organic");
    expect(r.content.descriptionHtml).not.toMatch(/organic/i);
    expect(r.reviewReasons.some((x) => x.includes('"organic"'))).toBe(true);
    expect(r.confidence.description).toBeLessThan(90);
  });

  it("EC-D2: catches an uncited marketing term in the text via the lexicon sweep", () => {
    const r = groundProductOutput({ output: output({ title: "Handmade Dishwasher-safe Terracotta Planter", claims: [] }), group, rows });
    expect(r.content.title).not.toMatch(/dishwasher/i);
    expect(r.reviewReasons.some((x) => x.includes("dishwasher-safe"))).toBe(true);
  });

  it("EC-D4: flags numbers that are not in the source but accepts unit conversions", () => {
    const ok = groundProductOutput({ output: output({ description_html: "<p>Planter, 20 cm tall with drainage hole.</p>" }), group, rows });
    expect(ok.issues.some((i) => i.code === "number.unsupported")).toBe(false);
    const bad = groundProductOutput({ output: output({ description_html: "<p>Planter, 25 cm tall, holds 3 litres, fired at 1200 degrees.</p>" }), group, rows });
    expect(bad.issues.some((i) => i.code === "number.unsupported")).toBe(true);
    expect(bad.reviewReasons.some((x) => x.includes("numbers"))).toBe(true);
  });

  it("EC-D3: snaps a near-miss category and falls back with review for nonsense", () => {
    const near = groundProductOutput({ output: output({ category: "Home & Garden > Decor > Planter" }), group, rows });
    expect(near.content.category).toBe("Home & Garden > Decor > Planters");
    const bad = groundProductOutput({ output: output({ category: "Spaceships > Warp Drives" }), group, rows });
    expect(bad.content.category).toBe("Home & Garden > Decor");
    expect(bad.reviewReasons.some((x) => x.includes("taxonomy"))).toBe(true);
  });

  it("EC-D7: detects a title that belongs to a different product", () => {
    const r = groundProductOutput({ output: output({ title: "Stainless Steel Chef Knife Set" }), group, rows });
    expect(r.issues.some((i) => i.code === "title.mismatch")).toBe(true);
    expect(r.confidence.title).toBeLessThan(60);
  });

  it("EC-B15: restores dropped care instructions from the source", () => {
    const r = groundProductOutput({
      output: output({ description_html: "<p>Hand-thrown planter with drainage hole.</p>", attributes: [{ name: "material", value: "terracotta" }] }),
      group,
      rows,
    });
    expect(r.content.attributes.care).toMatch(/bring indoors below 0 °C/i);
    expect(r.issues.some((i) => i.code === "care.restored")).toBe(true);
  });

  it("EC-C4: surfaces grouping conflicts as review reasons", () => {
    const conflicted: ProductGroup = { ...group, conflicts: [{ code: "sku.conflict", severity: "error", message: "SKU TC-PL-20 has prices 24.99 (row 14) and 29.99 (row 40)" }] };
    const r = groundProductOutput({ output: output(), group: conflicted, rows });
    expect(r.reviewReasons).toContain("SKU TC-PL-20 has prices 24.99 (row 14) and 29.99 (row 40)");
  });
});

describe("helpers", () => {
  it("isNegated requires every occurrence to be negated", () => {
    const tokens = "frost resistant not frost proof bring indoors".split(" ");
    expect(isNegated(tokens, ["frost proof"])).toBe(true);
    expect(isNegated(tokens, ["frost resistant"])).toBe(false);
    expect(isNegated("frost proof and sturdy not frost proof".split(" "), ["frost proof"])).toBe(false);
  });

  it("collects source numbers including unit conversions and variant data", () => {
    const nums = collectSourceNumbers(group);
    expect(nums.has("20")).toBe(true); // 7.87 in → 20 cm, and the option
    expect(nums.has("1800")).toBe(true);
    expect(nums.has("1.8")).toBe(true);
    expect(extractNumbers("Holds 1,5 l and 500 ml")).toEqual(new Set(["1.5", "500"]));
  });
});
