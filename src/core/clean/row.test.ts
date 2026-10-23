import { describe, expect, it } from "vitest";
import type { ColumnMapping, RawRow } from "@/core/types";
import { buildCleanRowContext, cleanRow, hashRow, normalizeSizeValue, parseCombinedVariant } from "./row";

const headers = ["SKU", "Parent SKU", "Title", "Beschreibung", "Category", "Preis (€)", "Currency", "Size", "Farbe", "Weight", "Dimensions", "Image", "Notes", "Supplier Ref"];
const mappings: ColumnMapping[] = [
  m("SKU", 0, "sku"),
  m("Parent SKU", 1, "parent_sku"),
  m("Title", 2, "title"),
  m("Beschreibung", 3, "description"),
  m("Category", 4, "category"),
  m("Preis (€)", 5, "price"),
  m("Currency", 6, "currency"),
  m("Size", 7, "option_size"),
  m("Farbe", 8, "option_color"),
  m("Weight", 9, "weight"),
  m("Dimensions", 10, "dimensions"),
  m("Image", 11, "image"),
  m("Notes", 12, "notes"),
  m("Supplier Ref", 13, null),
];

function m(header: string, index: number, canonical: ColumnMapping["canonical"]): ColumnMapping {
  return { header, originalHeader: header, index, canonical, confidence: 100, via: canonical ? "synonym" : "none" };
}

function row(rowNumber: number, values: Partial<Record<(typeof headers)[number], string>>): RawRow {
  const cells: Record<string, string> = {};
  for (const h of headers) cells[h] = values[h] ?? "";
  return { rowNumber, cells };
}

const base = row(14, {
  SKU: " tc-pl-20 ",
  "Parent SKU": "TC-PL",
  Title: "Terracotta Planter 20cm",
  Beschreibung: "<p>Hand-thrown planter with drainage hole.</p><script>alert(1)</script>",
  Category: "Garden",
  "Preis (€)": "1.299,00 €",
  Currency: "",
  Size: "20cm",
  Farbe: "terracota",
  Weight: "1.8 kg",
  Dimensions: "H20 x W15 cm",
  Image: "TC-PL-20.jpg, TC-PL-20_2.jpg",
  Notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)",
  "Supplier Ref": "X-991",
});

const ctx = buildCleanRowContext({ rows: [base, row(15, { "Preis (€)": "12,50" })] }, mappings, "EUR");

describe("cleanRow", () => {
  const cleaned = cleanRow(base, ctx);

  it("EC-B14: normalises SKU identity but keeps the display form", () => {
    expect(cleaned.sku).toBe("TC-PL-20");
    expect(cleaned.skuDisplay).toBe("tc-pl-20");
    expect(cleaned.parentKey).toBe("TC-PL");
  });

  it("EC-B5/B2: parses the EU price into integer cents with the value's currency", () => {
    expect(cleaned.price?.money).toEqual({ cents: 129900, currency: "EUR" });
    expect(cleaned.price?.currencySource).toBe("value");
  });

  it("EC-B11: strips unsafe HTML and records it", () => {
    expect(cleaned.descriptionHtml).toBe("<p>Hand-thrown planter with drainage hole.</p>");
    expect(cleaned.descriptionText).toBe("Hand-thrown planter with drainage hole.");
    expect(cleaned.issues.some((i) => i.code === "html.unsafe_removed")).toBe(true);
  });

  it("EC-B18/B9: normalises option values", () => {
    expect(cleaned.options).toEqual({ size: "20 cm", color: "terracotta" });
  });

  it("EC-B7: converts weight and dimensions", () => {
    expect(cleaned.weightGrams).toBe(1800);
    expect(cleaned.dimensions).toEqual({ heightCm: 20, widthCm: 15 });
  });

  it("splits image lists and keeps unmapped columns as attributes", () => {
    expect(cleaned.images).toEqual(["TC-PL-20.jpg", "TC-PL-20_2.jpg"]);
    expect(cleaned.attributes).toEqual({ "Supplier Ref": "X-991" });
  });

  it("builds a grounding corpus with plain text and the row's notes", () => {
    expect(cleaned.sourceText).toContain("Notes: frost-resistant (not frost-proof, bring indoors below 0 °C)");
    expect(cleaned.sourceText).toContain("Beschreibung: Hand-thrown planter with drainage hole.");
    expect(cleaned.sourceText).not.toContain("<script>");
  });

  it("EC-C6: a row without a SKU is flagged, not dropped", () => {
    const r = cleanRow(row(3, { Title: "Mystery vase", "Preis (€)": "9,90" }), ctx);
    expect(r.sku).toBeNull();
    expect(r.issues.some((i) => i.code === "sku.missing" && i.ec === "C6")).toBe(true);
    expect(r.price?.money?.cents).toBe(990);
  });

  it("EC-B10: detects a German row", () => {
    const r = cleanRow(row(4, { Title: "Handgefertigter Übertopf aus Terrakotta", Beschreibung: "Mit Abflussloch, für drinnen und draußen geeignet.", "Preis (€)": "19,90" }), ctx);
    expect(r.language.lang).toBe("de");
    expect(r.issues.some((i) => i.code === "language.non_english")).toBe(true);
  });

  it("EC-B1: a missing price cell is a warning with the row's number", () => {
    const r = cleanRow(row(5, { SKU: "X-1", Title: "Thing" }), ctx);
    expect(r.price?.money).toBeNull();
    expect(r.issues.find((i) => i.code === "price.missing")?.row).toBe(5);
  });

  it("EC-A4: repairs mojibake before cleaning", () => {
    const r = cleanRow(row(6, { SKU: "X-2", Title: "GrÃ¶ÃŸe XL Kissen", "Preis (€)": "5" }), ctx);
    expect(r.title).toBe("Größe XL Kissen");
    expect(r.issues.some((i) => i.code === "text.mojibake_repaired")).toBe(true);
  });

  it("EC-A15: truncates a huge description for the model but keeps the HTML", () => {
    const long = "word ".repeat(6_000);
    const r = cleanRow(row(7, { SKU: "X-3", Title: "Long", Beschreibung: long, "Preis (€)": "5" }), ctx);
    expect(r.descriptionText?.length).toBeLessThanOrEqual(20_100);
    expect(r.issues.some((i) => i.code === "description.truncated")).toBe(true);
    expect(r.descriptionHtml?.length).toBeGreaterThan(20_000);
  });
});

describe("helpers", () => {
  it("EC-C3: hashRow ignores whitespace and header case", () => {
    expect(hashRow({ SKU: "A-1 ", Title: "Vase" })).toBe(hashRow({ sku: "A-1", title: "  Vase" }));
    expect(hashRow({ SKU: "A-1" })).not.toBe(hashRow({ SKU: "A-2" }));
  });

  it.each([
    ["20cm", "20 cm"],
    ["20 CM", "20 cm"],
    ["Size 20", "20 cm"],
    ["20,5 cm", "20.5 cm"],
    ["xl", "XL"],
    ["Large", "Large"],
    ["50 x 100 cm", "50 x 100 cm"],
    ["30×50cm", "30 x 50cm"],
  ])("EC-B18: normalizeSizeValue(%s) = %s", (input, expected) => {
    expect(normalizeSizeValue(input)).toBe(expected);
  });

  it("EC-B4: parses a combined variant column", () => {
    expect(parseCombinedVariant("20cm / Blue", {})).toEqual({ size: "20 cm", color: "blue" });
    expect(parseCombinedVariant("Rot, L", {})).toEqual({ color: "red", size: "L" });
    expect(parseCombinedVariant("matte", {})).toEqual({ style: "matte" });
  });
});
