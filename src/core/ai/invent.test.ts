import { describe, expect, it } from "vitest";
import type { EnrichInput, EnrichProductInput } from "./prompts";
import type { AiEnrichBatch } from "./schema";
import { findNegatedTerm, injectInventedClaims } from "./invent";

const planter: EnrichProductInput = {
  product_key: "TC-PL",
  source_title: "Terracotta Planter",
  source_description: "Hand-thrown planter with drainage hole.",
  category_hint: "Garden",
  brand: null,
  material: "terracotta",
  color: null,
  care: null,
  notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)",
  tags: [],
  option_names: [],
  option_values: {},
  variant_count: 1,
  attributes: {},
  photo_names: [],
  rows: [{ row: 14, cells: { Title: "Terracotta Planter", Notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)" } }],
  issues: [],
  language: "en",
};

const answer: AiEnrichBatch = {
  products: [
    {
      product_key: "TC-PL",
      title: "Terracotta Planter",
      description_html: "<p>Hand-thrown planter.</p>",
      category: "Home & Garden > Decor > Planters",
      tags: [],
      attributes: [],
      claims: [{ text: "frost-resistant", source_row: 14, source_column: "Notes", quote: "frost-resistant" }],
      confidence: { title: 95, description: 90, category: 90, tags: 80, attributes: 80 },
      status: "ok",
      review_reason: null,
      meta_title: "Terracotta Planter",
      meta_description: "Hand-thrown planter.",
      source_language: "en",
    },
  ],
};

describe("invented-claim chaos", () => {
  it("EC-B15: finds the term the supplier negated and quotes the negation as written", () => {
    expect(findNegatedTerm(planter)).toEqual({ text: "frost-proof", source_row: 14, source_column: "Notes", quote: "not frost-proof" });
  });

  it("EC-B15: returns null when nothing is negated", () => {
    const plain: EnrichProductInput = { ...planter, rows: [{ row: 1, cells: { Notes: "frost-resistant" } }] };
    expect(findNegatedTerm(plain)).toBeNull();
  });

  it("EC-D2: injects one claim and one sentence per product that has a negated term", () => {
    const input: EnrichInput = { products: [planter] };
    const { output, injected } = injectInventedClaims(answer, input);
    expect(injected).toBe(1);
    const p = output.products[0]!;
    expect(p.claims.map((c) => c.text)).toEqual(["frost-resistant", "frost-proof"]);
    expect(p.description_html).toBe("<p>Hand-thrown planter.</p><p>Frost-proof.</p>");
    expect(answer.products[0]!.claims).toHaveLength(1);
  });
});
