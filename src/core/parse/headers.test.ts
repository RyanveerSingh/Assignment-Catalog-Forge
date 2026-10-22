import { describe, expect, it } from "vitest";
import { CANONICAL_FIELDS, type CanonicalField } from "../types";
import { HEADER_SYNONYMS, dedupeHeaders, detectHeaderRow, mapColumns } from "./headers";

function canonicals(headers: string[], rows: string[][] = []): Array<CanonicalField | null> {
  return mapColumns(headers, rows).map((m) => m.canonical);
}

describe("detectHeaderRow (EC-A8, EC-A9)", () => {
  const found: Array<[string, string[][], number]> = [
    ["EC-A8: header on the first line", [["SKU", "Name", "Price"], ["TC-01", "Vase", "12.50"]], 0],
    [
      "EC-A8: title rows, a two-cell metadata row and a blank line above the header",
      [["Supplier price list 2024"], ["Prepared by", "John"], [""], ["SKU", "Name", "Price"], ["TC-01", "Vase", "12.50"], ["TC-02", "Bowl", "8.00"]],
      3,
    ],
    ["EC-A8: German headers after a title row", [["Preisliste Frühjahr"], ["Artikelnummer", "Bezeichnung", "Farbe", "Preis"], ["TC-01", "Übertopf", "Terrakotta", "12,50"]], 1],
    ["EC-A8: a section label row between header and data does not confuse it", [["SKU", "Name", "Price"], ["Planters"], ["TC-01", "Vase", "12.50"]], 0],
    ["EC-A8: unknown header names are still detected when the data below has numbers", [["Foo", "Bar", "Baz"], ["x", "y", "1"]], 0],
    ["EC-A8: text-only data rows still differ from the header by their codes", [["SKU", "Title", "Colour"], ["TC-01", "Vase", "Blue"], ["TC-02", "Bowl", "Red"]], 0],
    ["EC-A16: header-only sheet", [["SKU", "Name", "Price"]], 0],
    ["EC-A8: data row that is wider than a two-cell note row above the header", [["Date:", "Note"], ["SKU", "Name", "Price", "Qty"], ["TC-01", "Vase", "12.50", "3"]], 1],
  ];

  it.each(found)("%s", (_name, rows, index) => {
    const result = detectHeaderRow(rows);
    expect(result?.index).toBe(index);
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.confidence).toBeLessThanOrEqual(100);
  });

  const none: Array<[string, string[][]]> = [
    ["EC-A9: data from line 1 with prices", [["TC-01", "Vase", "12.50"], ["TC-02", "Bowl", "8.00"], ["TC-03", "Pot", "15.00"]]],
    ["EC-A9: all-numeric rows", [["1", "2", "3"], ["4", "5", "6"]]],
    ["EC-A9: empty grid", []],
    ["EC-A9: only title rows", [["Price list"], ["Spring 2024"]]],
    ["EC-A9: header beyond the first 20 rows is not searched", [...Array.from({ length: 21 }, (_, i) => [`Note ${i}`]), ["SKU", "Name"], ["TC-01", "Vase"]]],
  ];

  it.each(none)("%s → null", (_name, rows) => {
    expect(detectHeaderRow(rows)).toBeNull();
  });

  it("EC-A8: a confirmed header scores higher than an unconfirmed one", () => {
    const confirmed = detectHeaderRow([["SKU", "Name", "Price"], ["TC-01", "Vase", "12.50"]]);
    const headerOnly = detectHeaderRow([["SKU", "Name", "Price"]]);
    expect(confirmed?.confidence).toBeGreaterThan(headerOnly?.confidence ?? 0);
  });
});

describe("dedupeHeaders (EC-A10)", () => {
  const cases: Array<[string, string[], string[]]> = [
    ["EC-A10: two Price columns", ["Price", "Price"], ["price", "price_2"]],
    ["EC-A10: three duplicates", ["Price", "Price", "Price"], ["price", "price_2", "price_3"]],
    ["EC-A10: suffix never collides with an existing header", ["Price", "price_2", "Price"], ["price", "price_2", "price_3"]],
    ["empty header gets a positional name", ["SKU", "", "Price"], ["sku", "column_2", "price"]],
    ["whitespace is normalised", ["  Product   Name "], ["product_name"]],
    ["brackets become part of the key", ["Price (EUR)", "Price EUR"], ["price_eur", "price_eur_2"]],
    ["accents are stripped", ["Größe", "Länge", "Référence"], ["grosse", "lange", "reference"]],
    ["punctuation becomes underscores", ["Art.-Nr.", "Body (HTML)"], ["art_nr", "body_html"]],
    ["symbol-only header gets a positional name", ["€"], ["column_1"]],
    ["non-Latin letters survive", ["名前"], ["名前"]],
  ];

  it.each(cases)("%s", (_name, input, expected) => {
    expect(dedupeHeaders(input)).toEqual(expected);
  });
});

describe("mapColumns: synonyms (EC-A11)", () => {
  const cases: Array<[string, string[], Array<CanonicalField | null>]> = [
    [
      "EC-A11: German headers",
      ["Artikelnummer", "Bezeichnung", "Farbe", "Größe", "Preis", "Gewicht", "Beschreibung", "Kategorie", "Bestand", "EAN"],
      ["sku", "title", "option_color", "option_size", "price", "weight", "description", "category", "quantity", "barcode"],
    ],
    [
      "EC-A11: French headers",
      ["Référence", "Désignation", "Couleur", "Taille", "Prix", "Poids", "Matière", "Catégorie", "Quantité", "Pays d'origine"],
      ["sku", "title", "option_color", "option_size", "price", "weight", "option_material", "category", "quantity", "country_of_origin"],
    ],
    [
      "EC-A11: French headers typed without accents",
      ["Reference", "Designation", "Couleur", "Prix de vente", "Prix conseille", "Libelle"],
      ["sku", "title", "option_color", "price", "compare_at_price", null],
    ],
    [
      "English Shopify export",
      ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Variant SKU", "Variant Price", "Variant Compare At Price", "Variant Grams", "Image Src"],
      ["handle", "title", "description", "vendor", "category", "tags", "sku", "price", "compare_at_price", "weight", "image"],
    ],
    [
      "German with punctuation and brackets",
      ["Art.-Nr.", "Artikel-Nr", "VK-Preis (EUR)", "UVP", "Maße (cm)", "Ø", "Höhe", "Breite", "Länge"],
      ["sku", null, "price", "compare_at_price", "dimensions", "diameter", "height", "width", "length"],
    ],
    ["exact canonical names with underscores or spaces", ["parent_sku", "compare at price", "country_of_origin"], ["parent_sku", "compare_at_price", "country_of_origin"]],
    ["unmapped columns stay attributes", ["SKU", "Glaze", "Firing temperature"], ["sku", null, null]],
    ["empty header is unmapped", ["SKU", ""], ["sku", null]],
  ];

  it.each(cases)("%s", (_name, headers, expected) => {
    expect(canonicals(headers)).toEqual(expected);
  });

  it("EC-A11: originalHeader is kept verbatim and header is the de-duplicated key", () => {
    const [m] = mapColumns(["Price (EUR)"], []);
    expect(m).toMatchObject({ originalHeader: "Price (EUR)", header: "price_eur", canonical: "price", via: "exact", confidence: 100, index: 0 });
  });

  it("every canonical field has a synonym list and every synonym maps back to its own field", () => {
    expect(Object.keys(HEADER_SYNONYMS).sort()).toEqual([...CANONICAL_FIELDS].sort());
    const plain: Partial<Record<CanonicalField, CanonicalField>> = { option_size: "size", option_color: "color", option_material: "material" };
    for (const field of CANONICAL_FIELDS) {
      for (const synonym of HEADER_SYNONYMS[field]) {
        const [m] = mapColumns([synonym], []);
        expect({ synonym, canonical: m.canonical }).toEqual({ synonym, canonical: plain[field] ?? field });
        expect(m.via).toMatch(/^(exact|synonym)$/);
      }
    }
  });
});

describe("mapColumns: fuzzy matching", () => {
  it.each([
    ["Artikelnumer", "sku"],
    ["Descrption", "description"],
    ["Quantiy", "quantity"],
    ["Lenght", "length"],
    ["Weigth", "weight"],
    ["Heigth", "height"],
    ["Coulour", "color"],
    ["Prices", "price"],
  ])("typo %s → %s", (header, field) => {
    const [m] = mapColumns([header], []);
    expect(m.canonical).toBe(field);
    expect(m.via).toBe("fuzzy");
    expect(m.confidence).toBeLessThan(90);
  });

  it.each([["Content"], ["Status"], ["Pirce"], ["Region"]])("does not over-match %s", (header) => {
    expect(canonicals([header])).toEqual([null]);
  });
});

describe("mapColumns: variants vs attributes (EC-B4)", () => {
  it("size, colour and material are variant options when a SKU column exists", () => {
    expect(canonicals(["SKU", "Name", "Color", "Material", "Size"])).toEqual(["sku", "title", "option_color", "option_material", "option_size"]);
  });

  it("…and plain attributes when there is no SKU column", () => {
    expect(canonicals(["Name", "Color", "Material", "Size"])).toEqual(["title", "color", "material", "size"]);
  });

  it("a combined Variant column stays variant either way", () => {
    expect(canonicals(["SKU", "Variant"])).toEqual(["sku", "variant"]);
    expect(canonicals(["Name", "Variante"])).toEqual(["title", "variant"]);
  });
});

describe("mapColumns: price columns (EC-A10, EC-B3)", () => {
  const costHeaders = ["Cost", "Cost Price", "Costs", "EK", "EK-Preis", "Einkaufspreis", "Kosten", "Prix d'achat", "Coût", "Wholesale Price", "Purchase price", "Cost (EUR)"];
  it.each(costHeaders)("EC-B3: %s maps to cost, never price", (header) => {
    const rows = [["A", "12.50"], ["B", "8.00"]];
    const [, m] = mapColumns(["SKU", header], rows);
    expect(m.canonical).toBe("cost");
  });

  it("EC-B3: cost-like unknown headers with money values are never promoted to price by content", () => {
    const rows = [["A", "12.50 €"], ["B", "8.00 €"]];
    const [, m] = mapColumns(["SKU", "Cost per unit"], rows);
    expect(m.canonical).toBeNull();
  });

  it("EC-B3: cost and price side by side keep their roles", () => {
    expect(canonicals(["SKU", "Cost", "Price", "RRP"])).toEqual(["sku", "cost", "price", "compare_at_price"]);
    expect(canonicals(["SKU", "EK-Preis", "VK-Preis", "UVP"])).toEqual(["sku", "cost", "price", "compare_at_price"]);
    expect(canonicals(["SKU", "Prix d'achat", "Prix de vente", "Prix barré"])).toEqual(["sku", "cost", "price", "compare_at_price"]);
  });

  it("EC-A10: two Price columns — the one that parses as money more often wins", () => {
    const rows = [["A", "12.50", "-"], ["B", "8.00", "n/a"], ["C", "", "15.00"]];
    const mappings = mapColumns(["SKU", "Price", "Price"], rows);
    expect(mappings.map((m) => m.header)).toEqual(["sku", "price", "price_2"]);
    expect(mappings[1]).toMatchObject({ canonical: "price", via: "exact" });
    expect(mappings[2]).toMatchObject({ canonical: null, via: "content", confidence: 0 });
  });

  it("EC-A10: …regardless of column order", () => {
    const rows = [["A", "-", "12.50"], ["B", "n/a", "8.00"]];
    const mappings = mapColumns(["SKU", "Price", "Price"], rows);
    expect(mappings[1]).toMatchObject({ header: "price", canonical: null, via: "content" });
    expect(mappings[2]).toMatchObject({ header: "price_2", canonical: "price" });
  });

  it("content-based: an unknown column of money values becomes price when nothing else did", () => {
    const rows = [["A", "Vase", "12.50 €", "a.jpg"], ["B", "Bowl", "€ 8,00", "b.png"], ["C", "Pot", "15.00", "https://cdn.example.com/c.webp?v=2"]];
    const mappings = mapColumns(["SKU", "Name", "Col3", "Col4"], rows);
    expect(mappings[2]).toMatchObject({ canonical: "price", via: "content", confidence: 50 });
    expect(mappings[3]).toMatchObject({ canonical: "image", via: "content" });
  });

  it("content-based: a second image-like column becomes images", () => {
    const rows = [["A", "a.jpg", "a2.jpg"], ["B", "b.png", "b2.png"]];
    expect(canonicals(["SKU", "Foo", "Bar"], rows)).toEqual(["sku", "image", "images"]);
  });

  it("content-based: integers alone are not money", () => {
    const rows = [["A", "10"], ["B", "20"]];
    expect(canonicals(["SKU", "Faktor"], rows)).toEqual(["sku", null]);
  });

  it("content-based: never adds a second price", () => {
    const rows = [["A", "12.50", "99.00 €"], ["B", "8.00", "49.00 €"]];
    const mappings = mapColumns(["SKU", "Price", "Other"], rows);
    expect(mappings[2]).toMatchObject({ canonical: null, via: "none" });
  });
});

describe("mapColumns: other conflicts", () => {
  it("two description columns keep the one with longer text", () => {
    const rows = [["A", "A long, detailed description of the vase and its glaze.", "short"]];
    const first = mapColumns(["SKU", "Description", "Desc"], rows);
    expect(first.map((m) => m.canonical)).toEqual(["sku", "description", null]);
    const swapped = mapColumns(["SKU", "Desc", "Description"], [["A", "short", "A long, detailed description of the vase and its glaze."]]);
    expect(swapped.map((m) => m.canonical)).toEqual(["sku", null, "description"]);
    expect(swapped[1].via).toBe("content");
  });

  it("otherwise the first column wins", () => {
    const mappings = mapColumns(["SKU", "Name", "Title"], []);
    expect(mappings.map((m) => m.canonical)).toEqual(["sku", "title", null]);
    expect(mappings[2]).toMatchObject({ via: "none", confidence: 0 });
  });

  it("EC-B1: a sheet without sku, title or price maps what it can and never throws", () => {
    expect(canonicals(["Glaze", "Firing"], [["matte", "1200"]])).toEqual([null, null]);
    expect(canonicals([], [])).toEqual([]);
  });
});
