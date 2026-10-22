import * as Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  PRODUCT_CSV_COLUMNS,
  centsToDecimal,
  csvEscape,
  csvLine,
  streamProductsCsv,
  type CsvOptions,
} from "./csv";
import type { ExportProduct, ExportVariant } from "./types";

// --- fixtures -----------------------------------------------------------------

function makeVariant(overrides: Partial<ExportVariant> = {}): ExportVariant {
  return {
    sku: "POT-20-TC",
    options: { size: "20 cm", color: "terracotta" },
    priceCents: 1299,
    currency: "EUR",
    compareAtCents: null,
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
    variants: [makeVariant(), makeVariant({ sku: "POT-30-TC", options: { size: "30 cm", color: "terracotta" }, priceCents: 1999 })],
    imageUrls: ["https://cdn.example/p1.jpg"],
    ...overrides,
  };
}

/** Round-trips the generated text through an independent RFC 4180 parser. */
function parseRows(text: string, delimiter = ","): Record<string, string>[] {
  const clean = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const result = Papa.parse<Record<string, string>>(clean, { header: true, delimiter, skipEmptyLines: true });
  expect(result.errors).toEqual([]);
  return result.data;
}

function collect(products: ExportProduct[], opts?: CsvOptions): string {
  return Array.from(streamProductsCsv(products, opts)).join("");
}

// --- csvEscape -------------------------------------------------------------------

describe("csvEscape", () => {
  it.each<{ name: string; value: unknown; expected: string; opts?: CsvOptions }>([
    { name: "plain text is untouched", value: "hello", expected: "hello" },
    { name: "null is an empty cell", value: null, expected: "" },
    { name: "undefined is an empty cell", value: undefined, expected: "" },
    { name: "empty string stays empty", value: "", expected: "" },
    { name: "a comma forces quotes", value: "a,b", expected: '"a,b"' },
    { name: "a double quote is doubled and the cell quoted", value: 'say "hi"', expected: '"say ""hi"""' },
    { name: "LF forces quotes", value: "line1\nline2", expected: '"line1\nline2"' },
    { name: "CRLF forces quotes", value: "line1\r\nline2", expected: '"line1\r\nline2"' },
    { name: "leading space forces quotes", value: " padded", expected: '" padded"' },
    { name: "trailing space forces quotes", value: "padded ", expected: '"padded "' },
    { name: "a semicolon does not need quotes with the default delimiter", value: "a;b", expected: "a;b" },
    { name: "a semicolon needs quotes when it is the delimiter", value: "a;b", expected: '"a;b"', opts: { delimiter: ";" } },
    { name: "a comma does not need quotes with the ; delimiter", value: "a,b", expected: "a,b", opts: { delimiter: ";" } },
    { name: "umlauts pass through unchanged", value: "Übertopf größe", expected: "Übertopf größe" },
    { name: "an integer is emitted bare", value: 850, expected: "850" },
    { name: "a decimal is emitted bare", value: 12.5, expected: "12.5" },
    { name: "NaN is an empty cell", value: Number.NaN, expected: "" },
    { name: "Infinity is an empty cell", value: Number.POSITIVE_INFINITY, expected: "" },
    { name: "true becomes TRUE", value: true, expected: "TRUE" },
    { name: "false becomes FALSE", value: false, expected: "FALSE" },
    { name: "an object becomes a quoted JSON string", value: { a: "b" }, expected: '"{""a"":""b""}"' },
    { name: "an array becomes a JSON string, quoted because it contains the delimiter", value: [1, 2], expected: '"[1,2]"' },
    { name: "a one-element array needs no quotes", value: [1], expected: "[1]" },
    { name: "a function is an empty cell", value: () => 1, expected: "" },
  ])("$name", ({ value, expected, opts }) => {
    expect(csvEscape(value, opts)).toBe(expected);
  });

  it("does not throw on a circular object", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(csvEscape(circular)).toBe("");
  });
});

describe("EC-I6: formula injection guard", () => {
  it.each<{ name: string; value: string; expected: string }>([
    { name: "=SUM() gets a leading apostrophe", value: "=SUM(A1:A9)", expected: "'=SUM(A1:A9)" },
    { name: "-1 as text gets a leading apostrophe", value: "-1", expected: "'-1" },
    { name: "+x gets a leading apostrophe", value: "+x", expected: "'+x" },
    { name: "@y gets a leading apostrophe", value: "@y", expected: "'@y" },
    { name: "a leading tab gets a leading apostrophe", value: "\tcmd", expected: "'\tcmd" },
    { name: "a leading CR gets a leading apostrophe and quotes", value: "\rcmd", expected: "\"'\rcmd\"" },
    { name: "a formula containing the delimiter is prefixed and quoted", value: "=1,2", expected: "\"'=1,2\"" },
    { name: "the classic DDE payload is neutralised", value: '=cmd|"/c calc"!A0', expected: "\"'=cmd|\"\"/c calc\"\"!A0\"" },
    { name: "a formula character in the middle is left alone", value: "a=b", expected: "a=b" },
    { name: "an apostrophe at the start is not a trigger", value: "'quoted", expected: "'quoted" },
  ])("EC-I6: $name", ({ value, expected }) => {
    expect(csvEscape(value)).toBe(expected);
  });

  it("EC-I6: numeric values are never prefixed, so negative numbers stay numbers", () => {
    expect(csvEscape(-1)).toBe("-1");
    expect(csvEscape(-12.5)).toBe("-12.5");
  });

  it("EC-I6: the guard applies inside a streamed product file", () => {
    const text = collect([makeProduct({ title: "=HYPERLINK(\"http://evil\")", vendor: "@vendor", tags: ["-dash"] })]);
    const [row] = parseRows(text);
    expect(row.title).toBe("'=HYPERLINK(\"http://evil\")");
    expect(row.vendor).toBe("'@vendor");
    expect(row.tags).toBe("'-dash");
  });
});

describe("EC-I6: BOM", () => {
  it("EC-I6: the first chunk starts with a UTF-8 BOM when requested", () => {
    const chunks = Array.from(streamProductsCsv([makeProduct()], { bom: true }));
    expect(chunks[0].startsWith(CSV_BOM)).toBe(true);
    expect(chunks[0].slice(1).startsWith("handle,")).toBe(true);
    expect(chunks.slice(1).some((c) => c.includes(CSV_BOM))).toBe(false);
  });

  it("EC-I6: no BOM by default", () => {
    const chunks = Array.from(streamProductsCsv([makeProduct()]));
    expect(chunks[0].startsWith("handle,")).toBe(true);
  });

  it("EC-I6: umlauts survive the round trip with a BOM", () => {
    const text = collect([makeProduct({ title: "Übertopf Größe L" })], { bom: true });
    expect(parseRows(text)[0].title).toBe("Übertopf Größe L");
  });
});

// --- helpers -----------------------------------------------------------------

describe("centsToDecimal", () => {
  it.each<{ cents: number | null | undefined; expected: string }>([
    { cents: 1299, expected: "12.99" },
    { cents: 5, expected: "0.05" },
    { cents: 100000, expected: "1000.00" },
    { cents: 0, expected: "0.00" },
    { cents: 1999, expected: "19.99" },
    { cents: 1234.6, expected: "12.35" },
    { cents: null, expected: "" },
    { cents: undefined, expected: "" },
    { cents: Number.NaN, expected: "" },
  ])("formats $cents as '$expected'", ({ cents, expected }) => {
    expect(centsToDecimal(cents)).toBe(expected);
  });
});

describe("csvLine", () => {
  it("joins with the delimiter and ends with CRLF", () => {
    expect(csvLine(["a", 1, null])).toBe("a,1,\r\n");
    expect(csvLine(["a", "b"], { delimiter: ";" })).toBe("a;b\r\n");
  });
});

// --- streamProductsCsv ---------------------------------------------------------------

describe("streamProductsCsv", () => {
  it("yields the header line first with every column in order", () => {
    const [header] = Array.from(streamProductsCsv([]));
    expect(header).toBe(PRODUCT_CSV_COLUMNS.join(",") + "\r\n");
    const parsed = Papa.parse<string[]>(header);
    expect(parsed.data[0]).toEqual([...PRODUCT_CSV_COLUMNS]);
  });

  it("every chunk ends with CRLF", () => {
    for (const chunk of streamProductsCsv([makeProduct(), makeProduct({ variants: [] })])) {
      expect(chunk.endsWith("\r\n")).toBe(true);
    }
  });

  it("emits one line per variant with the product columns repeated", () => {
    const text = collect([makeProduct()]);
    const rows = parseRows(text);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row)).toEqual([...PRODUCT_CSV_COLUMNS]);
      expect(row.handle).toBe("terracotta-planter");
      expect(row.title).toBe("Terracotta Planter");
      expect(row.status).toBe("approved");
      expect(row.category).toBe("Home & Garden > Planters");
      expect(row.tags).toBe("garden|terracotta");
      expect(row.vendor).toBe("Clay & Co");
      expect(row.description_html).toBe("<p>Hand-thrown planter.</p>");
      expect(row.meta_title).toBe("Terracotta Planter | Shop");
      expect(row.meta_description).toBe("A planter.");
      expect(JSON.parse(row.attributes)).toEqual({ material: "clay" });
      expect(JSON.parse(row.claims)).toEqual([{ text: "frost resistant", source: "notes: frostfest" }]);
      expect(row.confidence_title).toBe("95");
      expect(row.confidence_category).toBe("80");
      expect(row.source_rows).toBe("3|4");
      expect(row.currency).toBe("EUR");
      expect(row.weight_grams).toBe("850");
      expect(row.length_cm).toBe("");
      expect(row.height_cm).toBe("18");
      expect(row.diameter_cm).toBe("20");
      expect(row.barcode).toBe("4006381333931");
      expect(row.quantity).toBe("12");
      expect(row.images).toBe("https://cdn.example/p1.jpg");
    }
    expect(rows[0].variant_sku).toBe("POT-20-TC");
    expect(rows[0].price).toBe("12.99");
    expect(JSON.parse(rows[0].variant_options)).toEqual({ size: "20 cm", color: "terracotta" });
    expect(rows[1].variant_sku).toBe("POT-30-TC");
    expect(rows[1].price).toBe("19.99");
    expect(rows[1].compare_at_price).toBe("");
  });

  it("a product with zero variants still emits one line with empty variant columns", () => {
    const rows = parseRows(collect([makeProduct({ variants: [] })]));
    expect(rows).toHaveLength(1);
    expect(rows[0].handle).toBe("terracotta-planter");
    expect(rows[0].variant_sku).toBe("");
    expect(rows[0].variant_options).toBe("");
    expect(rows[0].price).toBe("");
    expect(rows[0].weight_grams).toBe("");
    expect(rows[0].images).toBe("https://cdn.example/p1.jpg");
  });

  it("joins review reasons with '; ' and leaves the cell empty when there are none", () => {
    const rows = parseRows(
      collect([
        makeProduct({ status: "needs_review", reviewReasons: ["no_price", "sku_conflict"] }),
        makeProduct({ handle: "second", reviewReasons: [] }),
      ]),
    );
    expect(rows[0].review_reason).toBe("no_price; sku_conflict");
    expect(rows[2].review_reason).toBe("");
  });

  it("appends variant-specific images after the product images without duplicates", () => {
    const rows = parseRows(
      collect([
        makeProduct({
          imageUrls: ["https://cdn.example/a.jpg"],
          variants: [makeVariant({ imageUrls: ["https://cdn.example/b.jpg", "https://cdn.example/a.jpg"] })],
        }),
      ]),
    );
    expect(rows[0].images).toBe("https://cdn.example/a.jpg|https://cdn.example/b.jpg");
  });

  it("supports the ; delimiter and still round-trips descriptions containing commas", () => {
    const text = collect([makeProduct({ descriptionHtml: "<p>Red, round; sturdy</p>" })], { delimiter: ";" });
    expect(text.startsWith("handle;title;")).toBe(true);
    const rows = parseRows(text, ";");
    expect(rows[0].description_html).toBe("<p>Red, round; sturdy</p>");
  });

  it("round-trips quotes and newlines inside a description", () => {
    const html = '<p class="x">line one\nline two "quoted"</p>';
    const rows = parseRows(collect([makeProduct({ descriptionHtml: html })]));
    expect(rows[0].description_html).toBe(html);
  });

  it("does not throw when nullable fields are missing entirely", () => {
    const sparse = {
      handle: "sparse",
      status: "draft",
      variants: [{ sku: "X" }],
    } as unknown as ExportProduct;
    const rows = parseRows(collect([sparse]));
    expect(rows).toHaveLength(1);
    expect(rows[0].handle).toBe("sparse");
    expect(rows[0].variant_sku).toBe("X");
    expect(rows[0].attributes).toBe("{}");
    expect(rows[0].claims).toBe("[]");
  });
});

describe("EC-J7: streaming", () => {
  function* counted(n: number, counter: { pulled: number }): Generator<ExportProduct, void, unknown> {
    for (let i = 0; i < n; i++) {
      counter.pulled++;
      yield makeProduct({ handle: `product-${i}` });
    }
  }

  it("EC-J7: pulls products lazily, one at a time", () => {
    const counter = { pulled: 0 };
    const gen = streamProductsCsv(counted(1000, counter));
    gen.next(); // header
    expect(counter.pulled).toBe(0);
    gen.next(); // first variant line of product 0
    expect(counter.pulled).toBe(1);
    gen.next(); // second variant line of product 0, still no further pull
    expect(counter.pulled).toBe(1);
    gen.next();
    expect(counter.pulled).toBe(2);
  });

  it("EC-J7: 10,000 products stream as one chunk per line without being joined", () => {
    const counter = { pulled: 0 };
    let chunks = 0;
    let longest = 0;
    for (const chunk of streamProductsCsv(counted(10_000, counter))) {
      chunks++;
      longest = Math.max(longest, chunk.length);
    }
    expect(counter.pulled).toBe(10_000);
    expect(chunks).toBe(1 + 10_000 * 2);
    expect(longest).toBeLessThan(2_000);
  });
});
