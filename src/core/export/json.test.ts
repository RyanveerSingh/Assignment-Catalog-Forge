import { describe, expect, it } from "vitest";
import { streamJsonArray, toExportJson } from "./json";
import type { ExportProduct, ExportVariant } from "./types";

// --- fixtures -----------------------------------------------------------------

function makeVariant(overrides: Partial<ExportVariant> = {}): ExportVariant {
  return {
    sku: "POT-20-TC",
    options: { size: "20 cm", color: "terracotta" },
    priceCents: 1299,
    currency: "EUR",
    compareAtCents: 1599,
    weightGrams: 850,
    dimensionsCm: { heightCm: 18, diameterCm: 20 },
    barcode: "4006381333931",
    quantity: 12,
    imageUrls: [],
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ExportProduct> = {}): ExportProduct {
  return {
    handle: "terracotta-planter",
    title: "Terracotta Planter",
    descriptionHtml: "<p>Hand-thrown planter.</p>",
    category: "Home & Garden > Planters",
    tags: ["garden", "terracotta"],
    attributes: { material: "clay" },
    seo: { metaTitle: "Terracotta Planter | Shop", metaDescription: "A planter." },
    vendor: "Clay & Co",
    status: "approved",
    reviewReasons: [],
    confidence: { title: 95, category: 80 },
    claims: [{ text: "frost resistant", source: "notes: frostfest" }],
    sourceRows: [3, 4],
    variants: [makeVariant()],
    imageUrls: ["https://cdn.example/p1.jpg"],
    ...overrides,
  };
}

const PRODUCT_KEYS = [
  "title",
  "handle",
  "description_html",
  "category",
  "tags",
  "attributes",
  "variants",
  "claims",
  "confidence",
  "status",
  "review_reason",
  "source_rows",
  "images",
  "seo",
];

const VARIANT_KEYS = [
  "sku",
  "options",
  "price_cents",
  "currency",
  "weight_grams",
  "compare_at_cents",
  "barcode",
  "quantity",
  "dimensions_cm",
];

// --- toExportJson -------------------------------------------------------------------

describe("toExportJson", () => {
  it("produces exactly the snake_case key set from the brief", () => {
    const json = toExportJson(makeProduct());
    expect(Object.keys(json)).toEqual(PRODUCT_KEYS);
    const variants = json.variants as Record<string, unknown>[];
    expect(Object.keys(variants[0])).toEqual(VARIANT_KEYS);
    expect(Object.keys(json.seo as object)).toEqual(["meta_title", "meta_description"]);
    expect(Object.keys((json.claims as object[])[0])).toEqual(["text", "source"]);
  });

  it("maps every field to its snake_case counterpart", () => {
    const json = toExportJson(makeProduct());
    expect(json).toEqual({
      title: "Terracotta Planter",
      handle: "terracotta-planter",
      description_html: "<p>Hand-thrown planter.</p>",
      category: "Home & Garden > Planters",
      tags: ["garden", "terracotta"],
      attributes: { material: "clay" },
      variants: [
        {
          sku: "POT-20-TC",
          options: { size: "20 cm", color: "terracotta" },
          price_cents: 1299,
          currency: "EUR",
          weight_grams: 850,
          compare_at_cents: 1599,
          barcode: "4006381333931",
          quantity: 12,
          dimensions_cm: { heightCm: 18, diameterCm: 20 },
        },
      ],
      claims: [{ text: "frost resistant", source: "notes: frostfest" }],
      confidence: { title: 95, category: 80 },
      status: "approved",
      review_reason: null,
      source_rows: [3, 4],
      images: ["https://cdn.example/p1.jpg"],
      seo: { meta_title: "Terracotta Planter | Shop", meta_description: "A planter." },
    });
  });

  it.each<{ name: string; reasons: string[]; expected: string | null }>([
    { name: "no reasons → null", reasons: [], expected: null },
    { name: "one reason → the reason", reasons: ["no_price"], expected: "no_price" },
    { name: "several reasons → joined with '; '", reasons: ["no_price", "sku_conflict"], expected: "no_price; sku_conflict" },
    { name: "empty strings are dropped", reasons: ["", "no_price", ""], expected: "no_price" },
  ])("review_reason: $name", ({ reasons, expected }) => {
    expect(toExportJson(makeProduct({ reviewReasons: reasons })).review_reason).toBe(expected);
  });

  it("omits translations when undefined and passes them through when given", () => {
    expect("translations" in toExportJson(makeProduct())).toBe(false);
    const translations = { de: { title: "Terrakotta-Übertopf", descriptionHtml: "<p>Handgedreht.</p>" } };
    const json = toExportJson(makeProduct({ translations }));
    expect(Object.keys(json)).toEqual([...PRODUCT_KEYS, "translations"]);
    expect(json.translations).toEqual(translations);
  });

  it("emits null for every nullable field that is null", () => {
    const json = toExportJson(
      makeProduct({
        title: null,
        descriptionHtml: null,
        category: null,
        vendor: null,
        seo: { metaTitle: null, metaDescription: null },
        variants: [
          makeVariant({
            priceCents: null,
            currency: null,
            compareAtCents: null,
            weightGrams: null,
            dimensionsCm: null,
            barcode: null,
            quantity: null,
          }),
        ],
      }),
    );
    expect(json.title).toBeNull();
    expect(json.description_html).toBeNull();
    expect(json.category).toBeNull();
    expect(json.seo).toEqual({ meta_title: null, meta_description: null });
    const [variant] = json.variants as Record<string, unknown>[];
    expect(variant).toEqual({
      sku: "POT-20-TC",
      options: { size: "20 cm", color: "terracotta" },
      price_cents: null,
      currency: null,
      weight_grams: null,
      compare_at_cents: null,
      barcode: null,
      quantity: null,
      dimensions_cm: null,
    });
  });

  it("does not throw when fields are missing entirely", () => {
    const sparse = { handle: "sparse", status: "draft" } as unknown as ExportProduct;
    const json = toExportJson(sparse);
    expect(Object.keys(json)).toEqual(PRODUCT_KEYS);
    expect(json).toMatchObject({
      handle: "sparse",
      title: null,
      tags: [],
      attributes: {},
      variants: [],
      claims: [],
      confidence: {},
      review_reason: null,
      source_rows: [],
      images: [],
      seo: { meta_title: null, meta_description: null },
    });
  });
});

// --- streamJsonArray --------------------------------------------------------------

describe("EC-J7: streamJsonArray", () => {
  function* counted(n: number, counter: { pulled: number }): Generator<ExportProduct, void, unknown> {
    for (let i = 0; i < n; i++) {
      counter.pulled++;
      yield makeProduct({ handle: `product-${i}` });
    }
  }

  it("EC-J7: yields '[', each object, ',' separators and ']' so the chunks form valid JSON", () => {
    const chunks = Array.from(streamJsonArray([makeProduct(), makeProduct({ handle: "second" })]));
    expect(chunks[0]).toBe("[");
    expect(chunks[chunks.length - 1]).toBe("]");
    expect(chunks.filter((c) => c === ",")).toHaveLength(1);
    const parsed = JSON.parse(chunks.join("")) as Record<string, unknown>[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].handle).toBe("terracotta-planter");
    expect(parsed[1].handle).toBe("second");
    expect(Object.keys(parsed[0])).toEqual(PRODUCT_KEYS);
  });

  it("EC-J7: an empty export is '[]'", () => {
    expect(Array.from(streamJsonArray([])).join("")).toBe("[]");
  });

  it("EC-J7: a single product has no separator", () => {
    expect(Array.from(streamJsonArray([makeProduct()]))).toHaveLength(3);
  });

  it("EC-J7: pulls products lazily, one at a time", () => {
    const counter = { pulled: 0 };
    const gen = streamJsonArray(counted(1000, counter));
    gen.next(); // "["
    expect(counter.pulled).toBe(0);
    gen.next(); // first object
    expect(counter.pulled).toBe(1);
    gen.next(); // ","
    expect(counter.pulled).toBe(2);
  });

  it("EC-J7: 10,000 products stream as one chunk per product and still parse when joined", () => {
    const counter = { pulled: 0 };
    let objects = 0;
    let longest = 0;
    for (const chunk of streamJsonArray(counted(10_000, counter))) {
      if (chunk.startsWith("{")) objects++;
      longest = Math.max(longest, chunk.length);
    }
    expect(counter.pulled).toBe(10_000);
    expect(objects).toBe(10_000);
    expect(longest).toBeLessThan(2_000);

    const parsed = JSON.parse(Array.from(streamJsonArray(counted(250, { pulled: 0 }))).join("")) as unknown[];
    expect(parsed).toHaveLength(250);
  });
});
