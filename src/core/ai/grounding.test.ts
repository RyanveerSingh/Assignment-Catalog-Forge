import { describe, expect, it } from "vitest";
import type { ProductGroup } from "@/core/types";
import { claimPolarity, collectSourceNumbers, extractNumbers, groundProductOutput, isNegated, tokenizeClauses } from "./grounding";
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

describe("tokenizeClauses + isNegated", () => {
  it.each([
    ["will not scratch floors. Suits hallways and living rooms", ["suits hallways"], false],
    ["Not for outdoor use, dishwasher safe", ["dishwasher safe"], false],
    ["folds flat when not in use. 7 W, 450 lumens", ["450 lumens"], false],
    ["Hand wash, not dishwasher-safe.", ["dishwasher safe"], true],
    ["frost-resistant (not frost-proof, bring indoors)", ["frost proof"], true],
    ["frost-resistant (not frost-proof, bring indoors)", ["frost resistant"], false],
    ["Nicht spülmaschinenfest", ["spulmaschinenfest"], true],
  ])("EC-B15: %j negates %j → %s", (text, variants, expected) => {
    expect(isNegated(tokenizeClauses(text), variants)).toBe(expected);
  });

  it("marks clause boundaries with a token that never matches a claim", () => {
    expect(tokenizeClauses("Soft rug. Indoor only; not outdoors")).toEqual(["soft", "rug", "|", "indoor", "only", "|", "not", "outdoors"]);
  });
});

describe("claimPolarity", () => {
  it.each([
    ["Not frost-proof", { core: "frost proof", negated: true }],
    ["no drainage hole", { core: "drainage hole", negated: true }],
    ["Dishwasher-safe", { core: "dishwasher safe", negated: false }],
    ["Not indestructible; supervise play", { core: "indestructible", negated: true }],
    ["No soak, not dishwasher-safe", { core: "soak", negated: true }],
    ["Water-resistant, not waterproof", { core: "water resistant", negated: false }],
    ["not", { core: "not", negated: false }],
  ])("%j → %j", (text, expected) => {
    expect(claimPolarity(text)).toEqual(expected);
  });
});

describe("groundProductOutput", () => {
  it("keeps cited, supported claims and sends the product to review only for the missing price", () => {
    const r = groundProductOutput({ output: output(), group, rows });
    expect(r.claims.map((c) => c.text)).toEqual(expect.arrayContaining(["hand-thrown", "frost-resistant"]));
    expect(r.claims.every((c) => c.verified && c.row === 14)).toBe(true);
    expect(r.blocked).toEqual([]);
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
    expect(r.blocked).toEqual([{ text: "frost-proof", kind: "negated", reason: "the source explicitly negates it", term: "frost-proof", row: 14, column: "Notes", quote: "not frost-proof" }]);
    expect(r.content.descriptionHtml).not.toMatch(/frost-proof/i);
    expect(r.reviewReasons.some((x) => x.includes("negates"))).toBe(true);
    expect(r.issues.some((i) => i.code === "claim.negated" && i.ec === "B15")).toBe(true);
  });

  it("EC-B15: a listing that denies what the source denies is faithful, not a violation", () => {
    const r = groundProductOutput({
      output: output({
        description_html: "<p>Hand-thrown terracotta planter with drainage hole. Frost-resistant but not frost-proof; bring indoors below 0 °C.</p>",
        claims: [
          { text: "hand-thrown", source_row: 14, source_column: "Description", quote: "Hand-thrown planter" },
          { text: "Not frost-proof; bring indoors below 0 °C", source_row: 14, source_column: "Notes", quote: "not frost-proof, bring indoors below 0 °C" },
        ],
      }),
      group,
      rows,
    });
    expect(r.claims.map((c) => c.text)).toEqual(expect.arrayContaining(["hand-thrown", "Not frost-proof; bring indoors below 0 °C"]));
    expect(r.blocked).toEqual([]);
    expect(r.content.descriptionHtml).toMatch(/not frost-proof/i);
    expect(r.reviewReasons).toEqual(["No price for 30 cm"]);
  });

  it("EC-B15: a listing that denies what the source asserts is a violation", () => {
    const r = groundProductOutput({
      output: output({
        title: "Terracotta Planter",
        description_html: "<p>Terracotta planter with drainage hole. Not hand-thrown; frost-resistant.</p>",
        claims: [{ text: "frost-resistant", source_row: 14, source_column: "Notes", quote: "frost-resistant" }],
      }),
      group,
      rows,
    });
    expect(r.reviewReasons).toContain('Listing says "not hand-thrown" but the source says it is');
    expect(r.content.descriptionHtml).not.toMatch(/hand-thrown/i);
    expect(r.content.descriptionHtml).toMatch(/frost-resistant/i);
    expect(r.blocked).toEqual([{ text: "not hand-thrown", kind: "contradicted", reason: "the source asserts it", term: "hand-thrown", row: 14, column: "Description", quote: "Hand-thrown" }]);
  });

  it("EC-B15: a listing that denies something the source never mentions is invented", () => {
    const r = groundProductOutput({
      output: output({ description_html: "<p>Hand-thrown terracotta planter. Not dishwasher-safe.</p>" }),
      group,
      rows,
    });
    expect(r.reviewReasons).toContain('Listing says "not dishwasher-safe" but the source does not mention it');
    expect(r.content.descriptionHtml).not.toMatch(/dishwasher/i);
    expect(r.blocked).toEqual([{ text: "not dishwasher-safe", kind: "unsupported", reason: "the source never mentions it", term: "dishwasher-safe" }]);
  });

  it("EC-B15: a negation in the previous sentence does not poison a cited claim", () => {
    const localRows = [{ row: 3, cells: { Title: "Jute Rug", Description: "Soft underside that will not scratch floors. Suits hallways and living rooms. The arm folds flat when not in use. 7 W, 450 lumens." } }];
    const localGroup: ProductGroup = { ...group, productKey: "JT-RG", title: "Jute Rug", descriptionText: localRows[0]!.cells.Description!, notes: null, variants: [group.variants[0]!], sourceRows: [3], sourceCorpus: `Title: Jute Rug\nDescription: ${localRows[0]!.cells.Description}` };
    const r = groundProductOutput({
      output: output({
        product_key: "JT-RG",
        title: "Jute Rug",
        description_html: "<p>Jute rug that suits hallways and living rooms. 7 W, 450 lumens.</p>",
        attributes: [],
        claims: [
          { text: "Suits hallways and living rooms", source_row: 3, source_column: "Description", quote: "Suits hallways and living rooms" },
          { text: "7 W, 450 lumens", source_row: 3, source_column: "Description", quote: "7 W, 450 lumens" },
        ],
      }),
      group: localGroup,
      rows: localRows,
    });
    expect(r.blocked).toEqual([]);
    expect(r.claims.map((c) => c.text)).toEqual(["Suits hallways and living rooms", "7 W, 450 lumens"]);
    expect(r.reviewReasons.filter((x) => x.includes("negates"))).toEqual([]);
  });

  it("EC-D7: the mix-up check is skipped for a German source, whose English title shares no tokens", () => {
    const de: ProductGroup = { ...group, language: { lang: "de", confidence: 95 } };
    const r = groundProductOutput({ output: output({ title: "Galvanised Steel Watering Can with Shower Head", claims: [] }), group: de, rows });
    expect(r.reviewReasons.some((x) => x.includes("mix-up"))).toBe(false);
    expect(r.confidence.title).toBe(90);
  });

  it("EC-D2: a quote found in a sibling row is accepted as the citation", () => {
    const r = groundProductOutput({
      output: output({ claims: [{ text: "Drainage hole included", source_row: 15, source_column: "Description", quote: "planter with drainage hole" }] }),
      group,
      rows,
    });
    expect(r.blocked).toEqual([]);
    expect(r.claims).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Drainage hole included", row: 14, column: "Description", quote: "planter with drainage hole", verified: true })]));
  });

  it("EC-D2: an uncited lexicon term the source supports is kept and quoted as the supplier wrote it", () => {
    const r = groundProductOutput({ output: output({ claims: [] }), group, rows });
    expect(r.claims).toEqual(expect.arrayContaining([expect.objectContaining({ text: "hand-thrown", row: 14, column: "Description", quote: "Hand-thrown" }), expect.objectContaining({ text: "frost-resistant", row: 14, column: "Notes", quote: "frost-resistant" })]));
  });

  it("EC-B15 / EC-A4: a negated claim proven by a German quote, in a mojibake cell, stands on its citation", () => {
    const deRows = [{ row: 5, cells: { Titel: "Bienenwachskerze", Beschreibung: "Nicht tropffrei; immer in einem Halter verwenden. Innen und auÃŸen handgegossen." } }];
    const de: ProductGroup = { ...group, productKey: "BW-CA", title: "Bienenwachskerze", language: { lang: "de", confidence: 95 }, sourceRows: [5], sourceCorpus: `Titel: Bienenwachskerze\nBeschreibung: ${deRows[0]!.cells.Beschreibung}` };
    const r = groundProductOutput({
      output: output({
        product_key: "BW-CA",
        title: "Beeswax Pillar Candle",
        description_html: "<p>Beeswax pillar candle. Not drip-free; always use a holder.</p>",
        attributes: [],
        claims: [
          { text: "Not drip-free", source_row: 5, source_column: "Beschreibung", quote: "Nicht tropffrei" },
          { text: "Hand-poured inside and out", source_row: 5, source_column: "Beschreibung", quote: "Innen und außen handgegossen" },
        ],
      }),
      group: de,
      rows: deRows,
    });
    expect(r.blocked).toEqual([]);
    expect(r.claims.map((c) => c.text)).toEqual(["Not drip-free", "Hand-poured inside and out"]);
    expect(r.reviewReasons.filter((x) => x.includes("source"))).toEqual([]);
  });

  it("EC-D3: a leaf the model doubts is filed under its parent node without review", () => {
    const r = groundProductOutput({
      output: output({ category: "Office Supplies > Writing Instruments > Pencils", confidence: { title: 97, description: 90, category: 55, tags: 80, attributes: 85 } }),
      group,
      rows,
    });
    expect(r.content.category).toBe("Office Supplies > Writing Instruments");
    expect(r.confidence.category).toBe(70);
    expect(r.reviewReasons).toEqual(["No price for 30 cm"]);
    expect(r.issues.some((i) => i.code === "category.generic" && i.ec === "D3")).toBe(true);
  });

  it("EC-D2: an unsupported marketing adjective is removed from the text without a review reason", () => {
    const r = groundProductOutput({
      output: output({ description_html: "<p>Premium hand-thrown terracotta planter with drainage hole. Frost-resistant; bring indoors below 0 °C.</p>" }),
      group,
      rows,
    });
    expect(r.content.descriptionHtml).not.toMatch(/premium/i);
    expect(r.blocked).toEqual([expect.objectContaining({ text: "premium", kind: "unsupported" })]);
    expect(r.reviewReasons).toEqual(["No price for 30 cm"]);
    expect(r.confidence.description).toBe(90);
  });

  it("EC-D3: the supplier's own category outranks the model's sibling choice", () => {
    const sourced: ProductGroup = { ...group, category: "Animals & Pet Supplies > Pet Supplies > Pet Toys" };
    const r = groundProductOutput({ output: output({ category: "Animals & Pet Supplies > Pet Supplies > Dog Supplies" }), group: sourced, rows });
    expect(r.content.category).toBe("Animals & Pet Supplies > Pet Supplies > Pet Toys");
    expect(r.confidence.category).toBe(88);
    expect(r.issues.some((i) => i.code === "category.source")).toBe(true);
    expect(r.reviewReasons).toEqual(["No price for 30 cm"]);
  });

  it("EC-D3: a French supplier category resolves to its taxonomy parent and a leaf beneath it stands", () => {
    const sourced: ProductGroup = { ...group, category: "Maison & Jardin > Cuisine & Salle à manger > Vaisselle" };
    const r = groundProductOutput({ output: output({ category: "Home & Garden > Kitchen & Dining > Tableware > Coffee & Tea Sets" }), group: sourced, rows });
    expect(r.content.category).toBe("Home & Garden > Kitchen & Dining > Tableware > Coffee & Tea Sets");
    expect(r.issues.some((i) => i.code === "category.source")).toBe(false);
  });

  it("EC-D2: an origin is supported by any cell that names the place, whatever the supplier's verb", () => {
    const frRows = [{ row: 3, cells: { Titre: "Grotte pour chat", Description: "Grotte feutrée à la main au Népal en laine mérinos." } }];
    const fr: ProductGroup = { ...group, productKey: "FC-CV", title: "Grotte pour chat", language: { lang: "fr", confidence: 95 }, sourceRows: [3], sourceCorpus: `Titre: Grotte pour chat\nDescription: ${frRows[0]!.cells.Description}` };
    const r = groundProductOutput({ output: output({ product_key: "FC-CV", title: "Felted Cat Cave", description_html: "<p>Hand-felted merino cat cave. Made in Nepal.</p>", attributes: [], claims: [] }), group: fr, rows: frRows });
    expect(r.reviewReasons.some((x) => x.includes("made in"))).toBe(false);
    expect(r.content.descriptionHtml).toMatch(/Made in Nepal/);
    expect(r.claims.map((c) => c.text)).toContain("made in Nepal");
  });

  it("EC-D2: 'hand-made in natural jute' is not an origin claim, 'Made in Portugal' without a source is", () => {
    const fine = groundProductOutput({ output: output({ description_html: "<p>Hand-made in natural jute, hand-thrown look.</p>" }), group, rows });
    expect(fine.reviewReasons.some((x) => x.includes("made in"))).toBe(false);
    const invented = groundProductOutput({ output: output({ description_html: "<p>Hand-thrown terracotta planter. Made in Portugal.</p>" }), group, rows });
    expect(invented.reviewReasons).toContain('Listing says "Made in Portugal" but the source does not say it was made there');
    expect(invented.content.descriptionHtml).not.toMatch(/made in/i);
  });

  it("EC-B15: a named species supports 'solid wood' but never outvotes an explicit 'not solid wood'", () => {
    const tableRows = [{ row: 9, cells: { Title: "Bedside Table", Description: "Ash veneer over an engineered board with solid ash legs.", Notes: "Ash veneer over engineered board, not solid wood." } }];
    const table: ProductGroup = { ...group, productKey: "BS-TB", title: "Bedside Table", notes: tableRows[0]!.cells.Notes!, sourceRows: [9], sourceCorpus: `Title: Bedside Table\nDescription: ${tableRows[0]!.cells.Description}\nNotes: ${tableRows[0]!.cells.Notes}` };
    const naive = groundProductOutput({ output: output({ product_key: "BS-TB", title: "Bedside Table", description_html: "<p>Solid wood bedside table with one drawer.</p>", attributes: [], claims: [] }), group: table, rows: tableRows });
    expect(naive.content.descriptionHtml).not.toMatch(/solid wood/i);
    expect(naive.reviewReasons).toContain('Listing says "solid wood" but the source negates it');
    const faithful = groundProductOutput({
      output: output({ product_key: "BS-TB", title: "Bedside Table", description_html: "<p>Ash veneer bedside table with solid ash legs. Not solid wood.</p>", attributes: [], claims: [{ text: "Not solid wood", source_row: 9, source_column: "Notes", quote: "not solid wood" }] }),
      group: table,
      rows: tableRows,
    });
    expect(faithful.blocked).toEqual([]);
    expect(faithful.reviewReasons.filter((x) => /solid wood/.test(x))).toEqual([]);
    const oak = groundProductOutput({
      output: output({ product_key: "BS-TB", title: "Oak Table", description_html: "<p>Round solid wood table.</p>", attributes: [], claims: [] }),
      group: { ...table, sourceCorpus: "Title: Oak Table\nDescription: Round side table in solid oak." },
      rows: [{ row: 9, cells: { Title: "Oak Table", Description: "Round side table in solid oak." } }],
    });
    expect(oak.blocked).toEqual([]);
    expect(oak.claims.map((c) => c.text)).toContain("solid wood");
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
    expect(r.blocked).toEqual([{ text: "organic", kind: "unsupported", reason: "not found in the source cells" }]);
  });

  it("EC-D2: catches an uncited marketing term in the text via the lexicon sweep", () => {
    const r = groundProductOutput({ output: output({ title: "Handmade Dishwasher-safe Terracotta Planter", claims: [] }), group, rows });
    expect(r.content.title).not.toMatch(/dishwasher/i);
    expect(r.reviewReasons.some((x) => x.includes("dishwasher-safe"))).toBe(true);
    expect(r.blocked).toEqual([{ text: "dishwasher-safe", kind: "unsupported", reason: "not found in the source cells", term: "dishwasher-safe" }]);
    // "Hand-thrown" in the source is evidence of handmade, so that word stays and is recorded as a claim.
    expect(r.content.title).toMatch(/handmade/i);
    expect(r.claims.map((c) => c.text)).toContain("handmade");
  });

  it("EC-B15: a lexicon term the source negates is blocked with the negation quoted from its cell", () => {
    const r = groundProductOutput({ output: output({ title: "Frost-proof Terracotta Planter", claims: [] }), group, rows });
    expect(r.content.title).not.toMatch(/frost-proof/i);
    expect(r.blocked).toEqual([{ text: "frost-proof", kind: "negated", reason: "the source explicitly negates it", term: "frost-proof", row: 14, column: "Notes", quote: "not frost-proof" }]);
  });

  it("EC-B15: a negation quoted from a mojibake cell comes back as the readable text", () => {
    const deRows = [{ row: 5, cells: { Titel: "Terrakotta-Übertopf", Beschreibung: "Frostbeständig, aber nicht frostsicher: im Winter nach drauÃŸen bringen ist keine gute Idee." } }];
    const de: ProductGroup = { ...group, productKey: "TK-UT", title: "Terrakotta-Übertopf", language: { lang: "de", confidence: 95 }, sourceRows: [5], sourceCorpus: `Titel: Terrakotta-Übertopf\nBeschreibung: ${deRows[0]?.cells.Beschreibung}` };
    const r = groundProductOutput({ output: output({ product_key: "TK-UT", title: "Frost-proof Terracotta Planter", description_html: "<p>Frost-proof terracotta planter.</p>", attributes: [], claims: [] }), group: de, rows: deRows });
    expect(r.blocked).toEqual([{ text: "frost-proof", kind: "negated", reason: "the source explicitly negates it", term: "frost-proof", row: 5, column: "Beschreibung", quote: "nicht frostsicher" }]);
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
