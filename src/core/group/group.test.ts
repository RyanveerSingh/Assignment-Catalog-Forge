import { describe, expect, it } from "vitest";
import type { CleanedRow, ParsedPrice } from "../types";
import { issue } from "../types";
import { groupRows } from "./group";

type RowPatch = Partial<CleanedRow> & { rowNumber: number };

function makeRow(p: RowPatch): CleanedRow {
  return {
    sku: null,
    skuDisplay: p.sku ?? null,
    parentKey: null,
    title: null,
    descriptionHtml: null,
    descriptionText: null,
    category: null,
    brand: null,
    price: null,
    compareAtPrice: null,
    options: {},
    color: null,
    weightGrams: null,
    dimensions: null,
    images: [],
    tags: [],
    notes: null,
    care: null,
    material: null,
    quantity: null,
    barcode: null,
    attributes: {},
    language: { lang: "en", confidence: 80 },
    issues: [],
    rowHash: `hash-${p.rowNumber}`,
    sourceText: `row: ${p.rowNumber}`,
    ...p,
  };
}

function price(cents: number, currency = "EUR"): ParsedPrice {
  return { money: { cents, currency }, confidence: 100, currencySource: "value", issues: [], raw: String(cents) };
}

const opts = { storeDefaultCurrency: "EUR" };

describe("groupRows: keys and grouping", () => {
  it("EC-C1: variants scattered across non-adjacent rows land in one product by SKU stem", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "TC-PL-20", title: "Terracotta Planter 20cm", price: price(1000) }),
      makeRow({ rowNumber: 2, sku: "CM-01", title: "Ceramic Mug", price: price(800) }),
      makeRow({ rowNumber: 3, sku: "TC-PL-30", title: "Terracotta Planter 30cm", price: price(1500) }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups.map((g) => g.productKey)).toEqual(["TC-PL", "CM-01"]);
    const planter = groups[0];
    expect(planter.keySource).toBe("sku_stem");
    expect(planter.sourceRows).toEqual([1, 3]);
    expect(planter.variants.map((v) => v.sku)).toEqual(["TC-PL-20", "TC-PL-30"]);
    expect(planter.title).toBe("Terracotta Planter");
    expect(groups[1].keySource).toBe("single_row");
  });

  it("EC-C2: child rows before the parent row still form one product, sorted by row number", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "terracotta-planter", sku: "TC-PL-20", price: price(1000) }),
      makeRow({ rowNumber: 2, parentKey: "terracotta-planter", sku: "TC-PL-30", title: "Terracotta Planter", price: price(1500) }),
    ];
    const { groups } = groupRows([rows[1], rows[0]], opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toBe("terracotta-planter");
    expect(groups[0].keySource).toBe("handle");
    expect(groups[0].variants.map((v) => v.sku)).toEqual(["TC-PL-20", "TC-PL-30"]);
    expect(groups[0].sourceRows).toEqual([1, 2]);
    expect(groups[0].variants[0].issues.some((i) => i.code === "row.inherited_parent")).toBe(true);
  });

  it("EC-C7: a parent_sku layout keys on the parent SKU and is reported as 'parent'", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "TC-PL", sku: "TC-PL-20", price: price(1000) }),
      makeRow({ rowNumber: 2, parentKey: "TC-PL", sku: "TC-PL-30", price: price(1500) }),
      makeRow({ rowNumber: 3, sku: "TC-PL", title: "Terracotta Planter", descriptionText: "Hand-thrown clay" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].keySource).toBe("parent");
    expect(groups[0].title).toBe("Terracotta Planter");
    expect(groups[0].descriptionText).toBe("Hand-thrown clay");
    expect(groups[0].sourceRows).toEqual([1, 2, 3]);
  });

  it("keys are compared case-insensitively and keep the first spelling", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "Planter-A", sku: "A-1", title: "Planter" }),
      makeRow({ rowNumber: 2, parentKey: "planter-a", sku: "A-2", title: "Planter" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toBe("Planter-A");
  });

  it("EC-C5: same base title with option tokens in the titles becomes one product with variants", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "P100", title: "Terracotta Planter 20cm", price: price(1000) }),
      makeRow({ rowNumber: 2, sku: "P200", title: "Terracotta Planter 30cm Blue", price: price(1500) }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toBe("terracotta-planter");
    expect(groups[0].keySource).toBe("title");
    expect(groups[0].title).toBe("Terracotta Planter");
    expect(groups[0].variants.map((v) => v.options)).toEqual([{ size: "20 cm" }, { size: "30 cm", color: "blue" }]);
    expect(groups[0].complexity).toBeGreaterThanOrEqual(10);
  });

  it("EC-C5: explicit option columns win over tokens in the title", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "S1", title: "Shirt 20cm", options: { size: "XL" } }),
      makeRow({ rowNumber: 2, sku: "S2", title: "Shirt 30cm", options: { size: "XXL" } }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups[0].variants.map((v) => v.options)).toEqual([{ size: "XL" }, { size: "XXL" }]);
  });

  it("EC-C5: identical titles with nothing to tell the variants apart are grouped and flagged", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "GNOME1", title: "Garden Gnome", price: price(900) }),
      makeRow({ rowNumber: 2, sku: "GNOME2", title: "Garden Gnome", price: price(900) }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    const flag = groups[0].issues.find((i) => i.code === "variant.duplicate_options");
    expect(flag?.severity).toBe("warn");
    expect(flag?.ec).toBe("C5");
    expect(flag?.message).toContain("GNOME1");
  });

  it("EC-C5: a colour attribute that differs across rows becomes a variant option", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "C-1", title: "Cushion", color: "red" }),
      makeRow({ rowNumber: 2, sku: "C-2", title: "Cushion", color: "blue" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups[0].color).toBeNull();
    expect(groups[0].variants.map((v) => v.options)).toEqual([{ color: "red" }, { color: "blue" }]);
    expect(groups[0].issues.some((i) => i.code === "variant.duplicate_options")).toBe(false);
  });

  it("a colour attribute all rows agree on stays on the product", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "C-1", title: "Cushion", color: "red", options: { size: "S" } }),
      makeRow({ rowNumber: 2, sku: "C-2", title: "Cushion", color: "red", options: { size: "M" } }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups[0].color).toBe("red");
    expect(groups[0].variants.map((v) => v.options)).toEqual([{ size: "S" }, { size: "M" }]);
  });

  it("EC-C6: a row without a SKU is keyed by its title and its variant gets a synthetic GEN- SKU", () => {
    const { groups } = groupRows([makeRow({ rowNumber: 1, title: "Mystery Item", price: price(500) })], opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toBe("mystery-item");
    expect(groups[0].keySource).toBe("title");
    const [variant] = groups[0].variants;
    expect(variant.synthetic).toBe(true);
    expect(variant.sku).toMatch(/^GEN-[0-9A-F]{8}$/);
    expect(variant.skuDisplay).toBe(variant.sku);
    expect(variant.priceCents).toBe(500);
  });

  it("EC-C6: a row with neither SKU nor title falls back to the synthetic key", () => {
    const { groups } = groupRows([makeRow({ rowNumber: 1, title: null, price: price(500) })], opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toMatch(/^GEN-[0-9A-F]{8}$/);
    expect(groups[0].keySource).toBe("single_row");
  });

  it("EC-C6: two SKU-less rows with the same title are one product with two synthetic variants", () => {
    const rows = [
      makeRow({ rowNumber: 1, title: "Mystery Item 20cm" }),
      makeRow({ rowNumber: 2, title: "Mystery Item 30cm" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].keySource).toBe("title");
    expect(groups[0].variants.every((v) => v.synthetic)).toBe(true);
    expect(new Set(groups[0].variants.map((v) => v.sku)).size).toBe(2);
  });
});

describe("groupRows: duplicates and conflicts", () => {
  it("EC-C3: exact duplicate rows are recorded once and excluded from the variants", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "MUG-01", title: "Mug", price: price(800), rowHash: "same" }),
      makeRow({ rowNumber: 2, sku: "MUG-01", title: "Mug", price: price(800), rowHash: "same" }),
      makeRow({ rowNumber: 3, sku: "BOWL-01", title: "Bowl", price: price(900) }),
    ];
    const result = groupRows(rows, opts);
    expect(result.duplicateRows).toEqual([{ row: 2, of: 1 }]);
    const mug = result.groups.find((g) => g.productKey === "MUG-01");
    expect(mug?.variants).toHaveLength(1);
    expect(mug?.sourceRows).toEqual([1]);
    expect(mug?.duplicateRows).toEqual([{ row: 2, of: 1 }]);
    expect(mug?.conflicts).toEqual([]);
    expect(result.groups.find((g) => g.productKey === "BOWL-01")?.duplicateRows).toEqual([]);
  });

  it("EC-C4: the same SKU with a different price is one variant with a conflict naming both rows and values", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "MUG-01", title: "Mug", price: price(1000) }),
      makeRow({ rowNumber: 2, sku: "MUG-01", title: "Mug", price: price(1200) }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    const [variant] = groups[0].variants;
    expect(variant.priceCents).toBe(1000);
    expect(variant.sourceRows).toEqual([1, 2]);
    const conflict = groups[0].conflicts[0];
    expect(conflict.code).toBe("sku.conflict");
    expect(conflict.severity).toBe("error");
    expect(conflict.ec).toBe("C4");
    expect(conflict.message).toContain("rows 1 and 2");
    expect(conflict.message).toContain("10.00 EUR");
    expect(conflict.message).toContain("12.00 EUR");
    expect(variant.issues).toContainEqual(conflict);
    expect(groups[0].complexity).toBeGreaterThanOrEqual(45);
  });

  it("EC-C4: the same SKU with a different title is also a conflict", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "MUG-01", title: "Mug", price: price(1000) }),
      makeRow({ rowNumber: 2, sku: "MUG-01", title: "Large Mug", price: price(1000) }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups[0].conflicts[0]?.field).toBe("title");
    expect(groups[0].conflicts[0]?.message).toContain('"Large Mug"');
  });

  it("EC-C4: the same SKU repeated with identical values merges silently", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "MUG-01", title: "Mug", price: price(1000), rowHash: "a" }),
      makeRow({ rowNumber: 2, sku: "MUG-01", title: "Mug", price: price(1000), rowHash: "b", notes: "restock" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups[0].conflicts).toEqual([]);
    expect(groups[0].variants[0].sourceRows).toEqual([1, 2]);
    expect(groups[0].notes).toBe("restock");
  });

  it("EC-C4: a SKU that appears in two different products stays in the first and is reported on the second", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "PROD-A", sku: "SHARED-1", title: "Product A" }),
      makeRow({ rowNumber: 2, parentKey: "PROD-B", sku: "SHARED-1", title: "Product B" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups.map((g) => g.productKey)).toEqual(["PROD-A", "PROD-B"]);
    expect(groups[0].variants.map((v) => v.sku)).toEqual(["SHARED-1"]);
    expect(groups[1].variants).toEqual([]);
    const collision = groups[1].issues.find((i) => i.code === "sku.collision");
    expect(collision?.severity).toBe("error");
    expect(collision?.ec).toBe("C4");
    expect(collision?.row).toBe(2);
    expect(collision?.message).toContain("PROD-A");
  });
});

describe("groupRows: forward fill, many variants, near-duplicates", () => {
  it("EC-C7: Shopify-style children with a blank title inherit the parent's fields", () => {
    const rows = [
      makeRow({
        rowNumber: 1,
        parentKey: "ceramic-mug",
        sku: "CM-RED",
        title: "Ceramic Mug",
        descriptionHtml: "<p>Stoneware</p>",
        descriptionText: "Stoneware",
        images: ["cm.jpg"],
        tags: ["Kitchen"],
        options: { color: "red" },
        price: price(800),
      }),
      makeRow({ rowNumber: 2, parentKey: "ceramic-mug", sku: "CM-BLUE", options: { color: "blue" }, price: price(800) }),
      makeRow({ rowNumber: 3, parentKey: "ceramic-mug", sku: "CM-GREEN", options: { color: "green" }, price: price(800), images: ["cm-green.jpg"] }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.keySource).toBe("handle");
    expect(g.title).toBe("Ceramic Mug");
    expect(g.descriptionText).toBe("Stoneware");
    expect(g.tags).toEqual(["kitchen"]);
    expect(g.variants.map((v) => v.sku)).toEqual(["CM-RED", "CM-BLUE", "CM-GREEN"]);
    expect(g.variants[1].images).toEqual(["cm.jpg"]);
    expect(g.variants[2].images).toEqual(["cm-green.jpg"]);
    expect(g.images).toEqual(["cm.jpg", "cm-green.jpg"]);
    for (const v of g.variants.slice(1)) {
      const inherited = v.issues.find((i) => i.code === "row.inherited_parent");
      expect(inherited?.severity).toBe("info");
      expect(inherited?.ec).toBe("C7");
    }
    expect(g.variants[0].issues.some((i) => i.code === "row.inherited_parent")).toBe(false);
  });

  it("EC-C7: a blank-title row without a handle inherits from the previous row when the SKU stems match", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "MUG-RED", title: "Mug", category: "Kitchen", price: price(800) }),
      makeRow({ rowNumber: 2, sku: "MUG-BLUE", price: price(800) }),
      makeRow({ rowNumber: 3, sku: "BOWL-1", price: price(900) }),
    ];
    const { groups } = groupRows(rows, opts);
    const mug = groups.find((g) => g.productKey === "MUG");
    expect(mug?.keySource).toBe("sku_stem");
    expect(mug?.variants.map((v) => v.sku)).toEqual(["MUG-RED", "MUG-BLUE"]);
    expect(mug?.category).toBe("Kitchen");
    expect(mug?.variants[1].issues.some((i) => i.code === "row.inherited_parent")).toBe(true);
    const bowl = groups.find((g) => g.productKey === "BOWL-1");
    expect(bowl?.title).toBeNull();
  });

  it("EC-C8: a product with 120 variants keeps all of them and is flagged", () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      makeRow({ rowNumber: i + 1, sku: `BIG-${i + 1}`, title: "Big Product", options: { size: `${i + 1} cm` }, price: price(100 * (i + 1)) }),
    );
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].productKey).toBe("BIG");
    expect(groups[0].variants).toHaveLength(120);
    const flag = groups[0].issues.find((i) => i.code === "product.many_variants");
    expect(flag?.severity).toBe("info");
    expect(flag?.ec).toBe("C8");
    expect(groups[0].complexity).toBeGreaterThanOrEqual(10);
  });

  it("EC-C9: near-identical titles under different keys get a possible-duplicate badge and are never merged", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "PROD-A", sku: "A-1", title: "Terracotta Planter Classic" }),
      makeRow({ rowNumber: 2, parentKey: "PROD-B", sku: "B-1", title: "Terracotta Planter Classics" }),
      makeRow({ rowNumber: 3, parentKey: "PROD-C", sku: "C-1", title: "Ceramic Mug" }),
    ];
    const { groups } = groupRows(rows, opts);
    expect(groups).toHaveLength(3);
    const badge = (key: string) => groups.find((g) => g.productKey === key)?.issues.find((i) => i.code === "product.possible_duplicate");
    expect(badge("PROD-A")?.value).toBe("PROD-B");
    expect(badge("PROD-A")?.ec).toBe("C9");
    expect(badge("PROD-A")?.severity).toBe("info");
    expect(badge("PROD-B")?.value).toBe("PROD-A");
    expect(badge("PROD-C")).toBeUndefined();
  });
});

describe("groupRows: product fields and complexity", () => {
  it("merges product fields deterministically", () => {
    const rows = [
      makeRow({
        rowNumber: 1,
        sku: "X-1",
        title: "Widget Small",
        descriptionText: "short",
        descriptionHtml: "<p>short</p>",
        tags: ["Tools", "home"],
        notes: "fragile",
        attributes: { origin: "PT", finish: "matt" },
        images: ["a.jpg", "b.jpg"],
        language: { lang: "en", confidence: 60 },
        options: { size: "S" },
      }),
      makeRow({
        rowNumber: 2,
        sku: "X-2",
        title: "Widget Large",
        descriptionText: "a much longer description",
        descriptionHtml: "<p>a much longer description</p>",
        tags: ["home", "Garden"],
        notes: "fragile",
        brand: "Acme",
        attributes: { origin: "ES" },
        images: ["b.jpg", "c.jpg"],
        language: { lang: "de", confidence: 90 },
        options: { size: "L" },
      }),
      makeRow({ rowNumber: 3, sku: "X-3", title: "Widget Medium", notes: "ships flat", language: { lang: "en", confidence: 70 }, options: { size: "M" } }),
    ];
    const { groups } = groupRows(rows, opts);
    const g = groups[0];
    expect(g.productKey).toBe("X");
    // Three variants, so the size words are option tokens and the shared base title wins.
    expect(g.title).toBe("Widget");
    expect(g.descriptionText).toBe("a much longer description");
    expect(g.descriptionHtml).toBe("<p>a much longer description</p>");
    expect(g.tags).toEqual(["tools", "home", "garden"]);
    expect(g.notes).toBe("fragile | ships flat");
    expect(g.brand).toBe("Acme");
    expect(g.attributes).toEqual({ origin: "PT", finish: "matt" });
    expect(g.images).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(g.language).toEqual({ lang: "en", confidence: 65 });
    expect(g.sourceCorpus).toBe("row: 1\n\nrow: 2\n\nrow: 3");
    expect(g.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("picks the most frequent title, then the longest, then the earliest row", () => {
    const rows = [
      makeRow({ rowNumber: 1, parentKey: "P", sku: "P-1", title: "Planter" }),
      makeRow({ rowNumber: 2, parentKey: "P", sku: "P-2", title: "Planter Deluxe" }),
      makeRow({ rowNumber: 3, parentKey: "P", sku: "P-3", title: "Planter Deluxe" }),
    ];
    expect(groupRows(rows, opts).groups[0].title).toBe("Planter Deluxe");
  });

  it("scores complexity from the documented components and caps it at 100", () => {
    const plain = groupRows([makeRow({ rowNumber: 1, sku: "X-1", language: { lang: "de", confidence: 90 } })], opts).groups[0];
    expect(plain.complexity).toBe(45);

    const warn = (code: string) => issue(code, "warn", code, { row: 1 });
    const messy = groupRows(
      [
        makeRow({ rowNumber: 1, sku: "X-1", title: "Thing", price: price(100), language: { lang: "fr", confidence: 90 }, issues: [warn("a"), warn("b"), warn("c"), issue("html.unsafe_removed", "warn", "x", { row: 1 })] }),
        makeRow({ rowNumber: 2, sku: "X-1", title: "Thing", price: price(200), language: { lang: "fr", confidence: 90 } }),
      ],
      opts,
    ).groups[0];
    expect(messy.complexity).toBe(100);
    expect(messy.issues.filter((i) => i.severity === "warn")).toHaveLength(4);
  });

  it("EC-C10: the same rows in a different order produce identical keys, variants and hashes", () => {
    const rows = [
      makeRow({ rowNumber: 1, sku: "TC-PL-20", title: "Terracotta Planter 20cm", price: price(1000) }),
      makeRow({ rowNumber: 2, parentKey: "ceramic-mug", sku: "CM-BLUE", options: { color: "blue" } }),
      makeRow({ rowNumber: 3, title: "Mystery Item" }),
      makeRow({ rowNumber: 4, sku: "P100", title: "Vase 20cm" }),
      makeRow({ rowNumber: 5, parentKey: "ceramic-mug", sku: "CM-RED", title: "Ceramic Mug", options: { color: "red" } }),
      makeRow({ rowNumber: 6, sku: "TC-PL-30", title: "Terracotta Planter 30cm", price: price(1500) }),
      makeRow({ rowNumber: 7, sku: "P200", title: "Vase 30cm" }),
      makeRow({ rowNumber: 8, sku: "TC-PL-30", title: "Terracotta Planter 30cm", price: price(1500), rowHash: "hash-6" }),
    ];
    const forward = groupRows(rows, opts);
    const shuffled = groupRows([rows[7], rows[3], rows[0], rows[6], rows[1], rows[5], rows[2], rows[4]], opts);
    expect(shuffled.groups.map((g) => g.productKey)).toEqual(forward.groups.map((g) => g.productKey));
    expect(shuffled.groups.map((g) => g.variants)).toEqual(forward.groups.map((g) => g.variants));
    expect(shuffled.groups.map((g) => g.sourceHash)).toEqual(forward.groups.map((g) => g.sourceHash));
    expect(shuffled).toEqual(forward);
    expect(forward.groups.map((g) => g.keySource)).toEqual(["sku_stem", "handle", "title", "title"]);
  });

  it("returns an empty result for no rows and never mutates its input", () => {
    expect(groupRows([], opts)).toEqual({ groups: [], duplicateRows: [], orphanIssues: [] });
    const row = makeRow({ rowNumber: 1, parentKey: "p", sku: "P-1" });
    const parent = makeRow({ rowNumber: 2, parentKey: "p", sku: "P-2", title: "Parent" });
    groupRows([row, parent], opts);
    expect(row.title).toBeNull();
    expect(row.issues).toEqual([]);
  });
});
