import { describe, expect, it } from "vitest";
import type { ColumnMapping, RawRow } from "@/core/types";
import { buildCleanRowContext, cleanRow } from "./row";
import { asColumnMappings, buildCleaningXray, isCleanedRow, type CleaningXrayEntry } from "./xray";

const headers = ["SKU", "Title", "Description", "Price", "Currency", "Size", "Farbe", "Weight", "Height", "Dimensions", "Qty", "Notes", "Supplier Ref"] as const;
type Header = (typeof headers)[number];

function m(header: string, index: number, canonical: ColumnMapping["canonical"]): ColumnMapping {
  return { header, originalHeader: header, index, canonical, confidence: 100, via: canonical ? "synonym" : "none" };
}

const mappings: ColumnMapping[] = [
  m("SKU", 0, "sku"),
  m("Title", 1, "title"),
  m("Description", 2, "description"),
  m("Price", 3, "price"),
  m("Currency", 4, "currency"),
  m("Size", 5, "option_size"),
  m("Farbe", 6, "option_color"),
  m("Weight", 7, "weight"),
  m("Height", 8, "height"),
  m("Dimensions", 9, "dimensions"),
  m("Qty", 10, "quantity"),
  m("Notes", 11, "notes"),
  m("Supplier Ref", 12, null),
];

function row(values: Partial<Record<Header, string>>): RawRow {
  const cells: Record<string, string> = {};
  for (const h of headers) cells[h] = values[h] ?? "";
  return { rowNumber: 14, cells };
}

/** Runs the real cleaner so the X-ray is built from exactly what the pipeline stores. */
function xray(values: Partial<Record<Header, string>>, maps: ColumnMapping[] | undefined = mappings): CleaningXrayEntry[] {
  const r = row(values);
  const ctx = buildCleanRowContext({ rows: [r] }, mappings, "EUR");
  const cleaned = cleanRow(r, ctx);
  return buildCleaningXray(r.cells, cleaned, cleaned.issues, maps);
}

function entry(entries: CleaningXrayEntry[], field: string): CleaningXrayEntry | undefined {
  return entries.find((e) => e.field === field);
}

describe("buildCleaningXray", () => {
  // The last column says whether the entry must come with no note at all (a plain conversion, nothing flagged).
  it.each<[string, Partial<Record<Header, string>>, string, Partial<CleaningXrayEntry>, boolean]>([
    ["EC-B5: '1.299,00 €' becomes 129900 cents EUR with no note", { Price: "1.299,00 €" }, "price", { raw: "1.299,00 €", cleaned: "129900 cents · EUR" }, true],
    ["EC-B5: a lone '1.299' is read as thousands and flagged ambiguous", { Price: "1.299" }, "price", { cleaned: "129900 cents · EUR", severity: "warn" }, false],
    ["EC-B2: a bare number takes the store currency and says so", { Price: "24.99" }, "price", { cleaned: "2499 cents · EUR", note: "No currency given; assumed the store default EUR.", severity: "info" }, false],
    ["EC-B2: the currency column is credited when it decides", { Price: "24.99", Currency: "GBP" }, "price", { cleaned: "2499 cents · GBP", note: "Currency from the currency column" }, false],
    ["EC-B5: extra decimals are rounded and flagged", { Price: "24.9999 EUR" }, "price", { cleaned: "2500 cents · EUR", note: "More than two decimals; rounded to the nearest cent.", severity: "warn" }, false],
    ["EC-B1: a placeholder price is empty with the reason", { Price: "N/A" }, "price", { raw: "N/A", cleaned: "—", note: "No price given.", severity: "warn" }, false],
    ["EC-B7: '1.8 kg' becomes 1800 g", { Weight: "1.8 kg" }, "weight", { raw: "1.8 kg", cleaned: "1800 g" }, true],
    ["EC-B7: a bare weight is assumed grams and says so", { Weight: "1800" }, "weight", { cleaned: "1800 g", note: "No unit given; assumed grams.", severity: "info" }, false],
    ["EC-B7: inches become cm to one decimal", { Height: "7.87 in" }, "height", { raw: "7.87 in", cleaned: "20 cm" }, true],
    ["EC-B7: a combined dimensions cell is labelled in cm", { Dimensions: "H20 x W15 cm" }, "dimensions", { cleaned: "W 15 × H 20 cm" }, true],
    ["EC-B7: unlabelled dimensions carry the order note", { Dimensions: "20 x 15 x 10" }, "dimensions", { cleaned: "L 20 × W 15 × H 10 cm", note: "No unit given; assumed cm. No labels; assumed length × width × height order.", severity: "info" }, false],
    ["EC-B11: unsafe HTML is counted and the text kept", { Description: "<p>Hand-thrown planter.</p><script>alert(1)</script>" }, "description", { cleaned: "Hand-thrown planter.", severity: "warn" }, false],
    ["EC-B12: allow-listed HTML is shown as the text the model sees", { Description: "<p>Hand-thrown <b>planter</b>.</p>" }, "description", { cleaned: "Hand-thrown planter.", note: "Allow-listed HTML; no tags removed." }, false],
    ["EC-A4: a mojibake title is shown raw → repaired", { Title: "GrÃ¶ÃŸe 20 cm" }, "title", { raw: "GrÃ¶ÃŸe 20 cm", cleaned: "Größe 20 cm", note: "Broken text encoding repaired" }, false],
    ["EC-B9: a fuzzy colour match is explained", { Farbe: "terracota" }, "option_color", { raw: "terracota", cleaned: "terracotta", note: 'Colour "terracota" read as "terracotta"' }, false],
    ["EC-B9: a German colour is translated without an issue", { Farbe: "Dunkelblau" }, "option_color", { raw: "Dunkelblau", cleaned: "dark blue" }, true],
    ["EC-B14: the SKU is upper-cased and trimmed", { SKU: " tc-pl-20 " }, "sku", { raw: " tc-pl-20 ", cleaned: "TC-PL-20" }, true],
    ["EC-C6: a placeholder SKU is empty with the reason", { SKU: "n/a" }, "sku", { cleaned: "—", note: "No SKU in this row; one will be generated", severity: "warn" }, false],
    ["EC-B18: '20cm' becomes '20 cm'", { Size: "20cm" }, "option_size", { raw: "20cm", cleaned: "20 cm" }, true],
    ["EC-B13: a placeholder note is treated as empty", { Notes: "---" }, "notes", { raw: "---", cleaned: "—", note: "Placeholder treated as empty" }, false],
    ["EC-B13: invisible characters are normalised", { Title: "Terracotta Planter​" }, "title", { cleaned: "Terracotta Planter", note: "Whitespace and invisible characters normalised" }, false],
    ["quantity: '12 pcs' becomes 12", { Qty: "12 pcs" }, "quantity", { raw: "12 pcs", cleaned: "12" }, true],
    ["EC-B10: German text is reported with its confidence", { Title: "Terrakotta Übertopf", Description: "Handgedrehter Übertopf mit Abflussloch, nicht frostsicher, im Winter nach innen bringen." }, "language", { raw: "(title, description, notes)", note: "Row text appears to be German", severity: "info" }, false],
  ])("%s", (_name, values, field, expected, noNote) => {
    const e = entry(xray(values), field);
    expect(e).toBeDefined();
    expect(e).toMatchObject(expected);
    if (noNote) expect(e?.note).toBeUndefined();
  });

  it("EC-B5: the ambiguity note names the separator", () => {
    expect(entry(xray({ Price: "1.299" }), "price")?.note).toMatch(/thousands separator/);
  });

  it("EC-B11: the removed-tag count is in the note", () => {
    expect(entry(xray({ Description: "<p>Planter.</p><script>alert(1)</script><iframe src=x></iframe>" }), "description")?.note).toMatch(/^2 tags removed\. Unsafe HTML/);
  });

  it("EC-B10: German is named", () => {
    expect(entry(xray({ Title: "Terrakotta Übertopf", Description: "Handgedrehter Übertopf mit Abflussloch, nicht frostsicher, im Winter nach innen bringen." }), "language")?.cleaned).toMatch(/^German · \d+%$/);
  });

  it("lists only what changed: a clean English row yields the price conversion and nothing else", () => {
    const entries = xray({ SKU: "TC-PL-20", Title: "Terracotta Planter", Description: "Hand-thrown planter with drainage hole.", Price: "24.99 EUR", Weight: "1800 g", Height: "20 cm", Size: "S", Farbe: "blue", Qty: "12" });
    expect(entries.map((e) => e.field)).toEqual(["price"]);
    expect(entries.every((e) => e.note === undefined)).toBe(true);
  });

  it.each([
    ["Weight", "450g", "weight"],
    ["Height", "20,0 cm", "height"],
  ] as const)("EC-B7: %s %j is the same reading after cleaning and is not listed", (header, value, field) => {
    expect(entry(xray({ [header]: value }), field)).toBeUndefined();
  });

  it("an empty row yields only issue-backed entries with empty values, and no language guess", () => {
    const entries = xray({});
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.note !== undefined && e.raw === "—" && e.cleaned === "—")).toBe(true);
    expect(entries.map((e) => e.field)).toEqual(expect.arrayContaining(["sku", "price"]));
    expect(entry(entries, "language")).toBeUndefined();
  });

  it("falls back to header mapping when the import has no column map", () => {
    const entries = xray({ Price: "1.299,00 €", Weight: "1.8 kg" }, undefined);
    expect(entry(entries, "price")).toMatchObject({ column: "Price", cleaned: "129900 cents · EUR" });
    expect(entry(entries, "weight")).toMatchObject({ column: "Weight", cleaned: "1800 g" });
  });

  it("clips very long values so the payload stays small", () => {
    const long = `<p>${"x".repeat(2000)}</p>`;
    const e = entry(xray({ Description: long }), "description");
    expect(e?.raw.length).toBeLessThanOrEqual(401);
    expect(e?.raw.endsWith("…")).toBe(true);
  });

  it("an unmapped column is named by its header when it carries mojibake", () => {
    const e = entry(xray({ "Supplier Ref": "RÃ©f 12" }), "Supplier Ref");
    expect(e).toMatchObject({ column: "Supplier Ref", raw: "RÃ©f 12", cleaned: "Réf 12" });
  });
});

describe("guards", () => {
  it("isCleanedRow accepts a real cleaned row and rejects junk", () => {
    const r = row({ Title: "x" });
    const cleaned = cleanRow(r, buildCleanRowContext({ rows: [r] }, mappings, "EUR"));
    expect(isCleanedRow(cleaned)).toBe(true);
    expect(isCleanedRow(null)).toBe(false);
    expect(isCleanedRow({ rowNumber: 1 })).toBe(false);
    expect(isCleanedRow("cleaned")).toBe(false);
  });

  it("asColumnMappings accepts a stored column map and rejects anything else", () => {
    expect(asColumnMappings(mappings)).toBe(mappings);
    expect(asColumnMappings(null)).toBeUndefined();
    expect(asColumnMappings([{ nope: true }])).toBeUndefined();
    expect(asColumnMappings([])).toEqual([]);
  });
});
