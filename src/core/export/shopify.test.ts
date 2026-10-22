import * as Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { SHOPIFY_COLUMNS, streamShopifyCsv } from "./shopify";
import type { ExportProduct, ExportStatus, ExportVariant } from "./types";

// --- fixtures -----------------------------------------------------------------

function makeVariant(overrides: Partial<ExportVariant> = {}): ExportVariant {
  return {
    sku: "POT-20-TC",
    options: { size: "20 cm", color: "terracotta" },
    priceCents: 2499,
    currency: "EUR",
    compareAtCents: 2999,
    weightGrams: 850,
    dimensionsCm: null,
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
    attributes: {},
    seo: { metaTitle: "Terracotta Planter | Shop", metaDescription: "A planter." },
    vendor: "Clay & Co",
    status: "approved",
    reviewReasons: [],
    confidence: {},
    claims: [],
    sourceRows: [1],
    variants: [
      makeVariant(),
      makeVariant({ sku: "POT-30-TC", options: { size: "30 cm", color: "terracotta" }, priceCents: 3499, quantity: null }),
    ],
    imageUrls: ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg", "https://cdn.example/p3.jpg"],
    ...overrides,
  };
}

function rows(products: ExportProduct[]): Record<string, string>[] {
  const text = Array.from(streamShopifyCsv(products)).join("");
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  expect(result.errors).toEqual([]);
  return result.data;
}

/** Columns that must be empty on every row except the first of a handle. */
const PRODUCT_ONLY_COLUMNS = [
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option2 Name",
  "Option3 Name",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Status",
];

const VARIANT_COLUMNS = [
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Option1 Value",
  "Option2 Value",
  "Option3 Value",
];

// --- tests ------------------------------------------------------------------------

describe("EC-J8: Shopify CSV layout", () => {
  it("EC-J8: the header is Shopify's column list and every chunk ends with CRLF", () => {
    const chunks = Array.from(streamShopifyCsv([makeProduct()]));
    expect(chunks[0]).toBe(SHOPIFY_COLUMNS.join(",") + "\r\n");
    expect(SHOPIFY_COLUMNS[0]).toBe("Handle");
    expect(SHOPIFY_COLUMNS[SHOPIFY_COLUMNS.length - 1]).toBe("Status");
    expect(SHOPIFY_COLUMNS).toHaveLength(32);
    for (const chunk of chunks) expect(chunk.endsWith("\r\n")).toBe(true);
  });

  it("EC-J8: repeats the handle on every row: 2 variants + 3 images → 4 rows", () => {
    const data = rows([makeProduct()]);
    expect(data).toHaveLength(4);
    for (const row of data) {
      expect(Object.keys(row)).toEqual([...SHOPIFY_COLUMNS]);
      expect(row.Handle).toBe("terracotta-planter");
    }
  });

  it("EC-J8: only the first row of a handle carries the product fields", () => {
    const [first, second, image2, image3] = rows([makeProduct()]);
    expect(first.Title).toBe("Terracotta Planter");
    expect(first["Body (HTML)"]).toBe("<p>Hand-thrown planter.</p>");
    expect(first.Vendor).toBe("Clay & Co");
    expect(first["Product Category"]).toBe("Home & Garden > Planters");
    expect(first.Type).toBe("Planters");
    expect(first.Tags).toBe("garden, terracotta");
    expect(first["Gift Card"]).toBe("FALSE");
    expect(first["SEO Title"]).toBe("Terracotta Planter | Shop");
    expect(first["SEO Description"]).toBe("A planter.");
    for (const row of [second, image2, image3]) {
      for (const col of PRODUCT_ONLY_COLUMNS) expect(row[col], col).toBe("");
    }
  });

  it("EC-J8: option names appear on the first row only, values on every variant row", () => {
    const [first, second] = rows([makeProduct()]);
    expect(first["Option1 Name"]).toBe("Size");
    expect(first["Option1 Value"]).toBe("20 cm");
    expect(first["Option2 Name"]).toBe("Color");
    expect(first["Option2 Value"]).toBe("terracotta");
    expect(first["Option3 Name"]).toBe("");
    expect(first["Option3 Value"]).toBe("");
    expect(second["Option1 Name"]).toBe("");
    expect(second["Option1 Value"]).toBe("30 cm");
    expect(second["Option2 Name"]).toBe("");
    expect(second["Option2 Value"]).toBe("terracotta");
  });

  it("EC-J8: option names are the union of keys in order of first appearance, capped at three", () => {
    const [first, second] = rows([
      makeProduct({
        imageUrls: [],
        variants: [
          makeVariant({ options: { color: "red" } }),
          makeVariant({ sku: "B", options: { shoe_size: "42", color: "blue", material: "wool", fourth: "x" } }),
        ],
      }),
    ]);
    expect(first["Option1 Name"]).toBe("Color");
    expect(first["Option2 Name"]).toBe("Shoe Size");
    expect(first["Option3 Name"]).toBe("Material");
    expect(first["Option1 Value"]).toBe("red");
    expect(first["Option2 Value"]).toBe("");
    expect(second["Option1 Value"]).toBe("blue");
    expect(second["Option2 Value"]).toBe("42");
    expect(second["Option3 Value"]).toBe("wool");
  });

  it("EC-J8: a single variant without options gets Option1 'Title' / 'Default Title'", () => {
    const [first] = rows([makeProduct({ imageUrls: [], variants: [makeVariant({ options: {} })] })]);
    expect(first["Option1 Name"]).toBe("Title");
    expect(first["Option1 Value"]).toBe("Default Title");
    expect(first["Option2 Name"]).toBe("");
    expect(first["Option2 Value"]).toBe("");
  });

  it("EC-J8: several variants without options are told apart by SKU so Shopify does not reject duplicates", () => {
    const [first, second] = rows([
      makeProduct({ imageUrls: [], variants: [makeVariant({ sku: "A", options: {} }), makeVariant({ sku: "B", options: {} })] }),
    ]);
    expect(first["Option1 Name"]).toBe("Title");
    expect(first["Option1 Value"]).toBe("A");
    expect(second["Option1 Value"]).toBe("B");
  });

  it("EC-J8: a product with zero variants still gets one row with Default Title and empty variant fields", () => {
    const data = rows([makeProduct({ variants: [], imageUrls: [] })]);
    expect(data).toHaveLength(1);
    expect(data[0].Title).toBe("Terracotta Planter");
    expect(data[0]["Option1 Name"]).toBe("Title");
    expect(data[0]["Option1 Value"]).toBe("Default Title");
    expect(data[0]["Variant SKU"]).toBe("");
    expect(data[0]["Variant Price"]).toBe("");
    expect(data[0]["Variant Inventory Tracker"]).toBe("");
  });

  it("EC-J8: variant columns carry Shopify's fixed values and decimal prices", () => {
    const [first, second] = rows([makeProduct()]);
    expect(first["Variant SKU"]).toBe("POT-20-TC");
    expect(first["Variant Grams"]).toBe("850");
    expect(first["Variant Inventory Tracker"]).toBe("shopify");
    expect(first["Variant Inventory Qty"]).toBe("12");
    expect(first["Variant Inventory Policy"]).toBe("deny");
    expect(first["Variant Fulfillment Service"]).toBe("manual");
    expect(first["Variant Price"]).toBe("24.99");
    expect(first["Variant Compare At Price"]).toBe("29.99");
    expect(first["Variant Requires Shipping"]).toBe("TRUE");
    expect(first["Variant Taxable"]).toBe("TRUE");
    expect(first["Variant Barcode"]).toBe("4006381333931");
    // Second variant has no quantity: tracker off, qty empty.
    expect(second["Variant SKU"]).toBe("POT-30-TC");
    expect(second["Variant Price"]).toBe("34.99");
    expect(second["Variant Inventory Tracker"]).toBe("");
    expect(second["Variant Inventory Qty"]).toBe("");
  });

  it("EC-J8: the first image sits on the first variant row; the rest get image-only rows", () => {
    const [first, second, image2, image3] = rows([makeProduct()]);
    expect(first["Image Src"]).toBe("https://cdn.example/p1.jpg");
    expect(first["Image Position"]).toBe("1");
    expect(first["Image Alt Text"]).toBe("Terracotta Planter");
    expect(second["Image Src"]).toBe("");
    expect(second["Image Position"]).toBe("");

    expect(image2["Image Src"]).toBe("https://cdn.example/p2.jpg");
    expect(image2["Image Position"]).toBe("2");
    expect(image3["Image Src"]).toBe("https://cdn.example/p3.jpg");
    expect(image3["Image Position"]).toBe("3");
    for (const row of [image2, image3]) {
      for (const col of [...PRODUCT_ONLY_COLUMNS, ...VARIANT_COLUMNS, "Image Alt Text"]) {
        expect(row[col], col).toBe("");
      }
    }
  });

  it("EC-J8: a product without images has empty image columns and no extra rows", () => {
    const data = rows([makeProduct({ imageUrls: [] })]);
    expect(data).toHaveLength(2);
    expect(data[0]["Image Src"]).toBe("");
    expect(data[0]["Image Position"]).toBe("");
    expect(data[0]["Image Alt Text"]).toBe("");
  });

  it.each<{ status: ExportStatus; published: string; shopifyStatus: string }>([
    { status: "approved", published: "TRUE", shopifyStatus: "active" },
    { status: "draft", published: "FALSE", shopifyStatus: "draft" },
    { status: "needs_review", published: "FALSE", shopifyStatus: "draft" },
    { status: "rejected", published: "FALSE", shopifyStatus: "draft" },
    { status: "archived", published: "FALSE", shopifyStatus: "draft" },
    { status: "failed", published: "FALSE", shopifyStatus: "draft" },
    { status: "pending_ai", published: "FALSE", shopifyStatus: "draft" },
  ])("EC-J8: status '$status' → Published $published, Status $shopifyStatus", ({ status, published, shopifyStatus }) => {
    const [first] = rows([makeProduct({ status, imageUrls: [] })]);
    expect(first.Published).toBe(published);
    expect(first.Status).toBe(shopifyStatus);
  });

  it("EC-J8: several products follow each other with their own handles", () => {
    const data = rows([
      makeProduct({ imageUrls: [] }),
      makeProduct({ handle: "glazed-bowl", title: "Glazed Bowl", variants: [makeVariant({ sku: "BOWL-1", options: {} })], imageUrls: ["https://cdn.example/b.jpg"] }),
    ]);
    expect(data.map((r) => r.Handle)).toEqual(["terracotta-planter", "terracotta-planter", "glazed-bowl"]);
    expect(data[2].Title).toBe("Glazed Bowl");
    expect(data[2]["Image Src"]).toBe("https://cdn.example/b.jpg");
  });

  it("EC-I6: the formula guard from csv.ts applies to Shopify cells too", () => {
    const [first] = rows([makeProduct({ title: "=HYPERLINK(\"http://evil\")", vendor: "+Clay", imageUrls: [] })]);
    expect(first.Title).toBe("'=HYPERLINK(\"http://evil\")");
    expect(first.Vendor).toBe("'+Clay");
  });

  it("round-trips HTML with commas, quotes and newlines in Body (HTML)", () => {
    const html = '<p class="a">Red, round\nand "sturdy"</p>';
    const [first] = rows([makeProduct({ descriptionHtml: html, imageUrls: [] })]);
    expect(first["Body (HTML)"]).toBe(html);
  });

  it("does not throw when nullable fields are missing entirely", () => {
    const sparse = { handle: "sparse", status: "draft", variants: [{ sku: "X" }] } as unknown as ExportProduct;
    const data = rows([sparse]);
    expect(data).toHaveLength(1);
    expect(data[0].Handle).toBe("sparse");
    expect(data[0]["Variant SKU"]).toBe("X");
    expect(data[0]["Option1 Value"]).toBe("Default Title");
    expect(data[0].Published).toBe("FALSE");
  });

  it("EC-J7: pulls products lazily", () => {
    const counter = { pulled: 0 };
    function* counted(): Generator<ExportProduct, void, unknown> {
      for (let i = 0; i < 100; i++) {
        counter.pulled++;
        yield makeProduct({ handle: `p-${i}` });
      }
    }
    const gen = streamShopifyCsv(counted());
    gen.next(); // header
    expect(counter.pulled).toBe(0);
    gen.next(); // first row
    expect(counter.pulled).toBe(1);
  });
});
