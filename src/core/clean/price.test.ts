import { describe, expect, it } from "vitest";
import type { CurrencySource } from "../types";
import { detectCurrencyInHeader, extractCurrency, isCurrencyCode } from "./currency";
import { inferColumnNumberLocale, parsePrice, type PriceContext } from "./price";

// Invisible characters written as code points so the test data stays readable.
const NBSP = String.fromCodePoint(0xa0);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);

interface PriceCase {
  name: string;
  raw: string | null | undefined;
  ctx?: Partial<PriceContext>;
  cents: number | null;
  currency?: string;
  source?: CurrencySource;
  codes?: string[];
  notCodes?: string[];
  confidence?: number;
  maxConfidence?: number;
}

const cases: PriceCase[] = [
  // --- EC-B5: the formats named in the edge case ---
  { name: "EC-B5: parses '1.299,00 €' as 129900 EUR", raw: "1.299,00 €", cents: 129900, currency: "EUR", source: "value", confidence: 100 },
  { name: "EC-B5/EC-B2: parses '1,299.00' as 129900 with the default currency assumed", raw: "1,299.00", cents: 129900, currency: "EUR", source: "default", codes: ["price.currency_assumed"], confidence: 75 },
  { name: "EC-B5: parses '12.5' as 1250", raw: "12.5", cents: 1250, currency: "EUR", source: "default" },
  { name: "EC-B5: parses '£8' as 800 GBP", raw: "£8", cents: 800, currency: "GBP", source: "value", confidence: 100 },
  { name: "EC-B5: parses '$ 1 299.99' as 129999 USD (grouping space)", raw: "$ 1 299.99", cents: 129999, currency: "USD", source: "value" },
  { name: "EC-B5: parses '12,50' as 1250", raw: "12,50", cents: 1250, currency: "EUR" },
  { name: "EC-B5: parses 'EUR 12' as 1200 EUR", raw: "EUR 12", cents: 1200, currency: "EUR", source: "value" },
  { name: "EC-B5: parses '12.5 GBP' as 1250 GBP", raw: "12.5 GBP", cents: 1250, currency: "GBP", source: "value" },
  { name: "EC-B5: '-' is a missing price", raw: "-", cents: null, source: "none", codes: ["price.missing"] },
  { name: "EC-B5: 'N/A' is a missing price", raw: "N/A", cents: null, codes: ["price.missing"] },
  { name: "EC-B5: '0' is a zero price", raw: "0", cents: null, codes: ["price.zero"] },
  { name: "EC-B5: '-5' is a negative price, not a range", raw: "-5", cents: null, codes: ["price.negative"], notCodes: ["price.range"] },
  { name: "EC-B5: '1.299' with unknown locale is thousands and ambiguous", raw: "1.299", ctx: { locale: "unknown" }, cents: 129900, codes: ["price.ambiguous"], maxConfidence: 60 },
  { name: "EC-B5: '1.299' with eu locale is thousands without ambiguity", raw: "1.299", ctx: { locale: "eu" }, cents: 129900, notCodes: ["price.ambiguous"], confidence: 75 },
  { name: "EC-B5: '1,299' with us locale is thousands without ambiguity", raw: "1,299", ctx: { locale: "us" }, cents: 129900, notCodes: ["price.ambiguous"] },
  { name: "EC-B5: '1,299' with eu locale is still thousands (no retail price has three decimals) but flagged", raw: "1,299", ctx: { locale: "eu" }, cents: 129900, codes: ["price.ambiguous"], maxConfidence: 60 },
  { name: "EC-B5: '12.345' with unknown locale is thousands and ambiguous", raw: "12.345", cents: 1234500, codes: ["price.ambiguous"], maxConfidence: 60 },
  { name: "EC-B5: '12.345' with us locale is thousands and flagged, never 12.345", raw: "12.345", ctx: { locale: "us" }, cents: 1234500, codes: ["price.ambiguous"], maxConfidence: 60 },
  { name: "EC-B5: '12.3456' rounds half-up to 1235", raw: "12.3456", cents: 1235, codes: ["price.rounded"] },
  { name: "EC-B5: '12.3449' rounds down to 1234", raw: "12.3449", cents: 1234, codes: ["price.rounded"] },
  { name: "EC-B5: '1.299.000' is 129900000 (repeated separator is thousands)", raw: "1.299.000", cents: 129900000, notCodes: ["price.ambiguous"] },
  { name: "EC-B5: '1,299,000.50' is 129900050", raw: "1,299,000.50", cents: 129900050 },
  { name: "EC-B5: '1.234.567,89 €' is 123456789 EUR", raw: "1.234.567,89 €", cents: 123456789, currency: "EUR" },
  { name: "EC-B5: '$1,234,567.89' is 123456789 USD", raw: "$1,234,567.89", cents: 123456789, currency: "USD" },
  { name: "EC-B5: '1 299 000,50 €' with grouping spaces", raw: "1 299 000,50 €", cents: 129900050, currency: "EUR" },
  { name: "EC-B5: '12 345,67' with one grouping space", raw: "12 345,67", cents: 1234567 },
  { name: "EC-B5: '1'299.00' Swiss apostrophe grouping", raw: "1'299.00", cents: 129900 },
  { name: "EC-B5: 'CHF 1'250.50' is 125050 CHF", raw: "CHF 1'250.50", cents: 125050, currency: "CHF", source: "value" },
  { name: "EC-B5: '1,5' is 150", raw: "1,5", cents: 150 },
  { name: "EC-B5: '0,5' is 50", raw: "0,5", cents: 50 },
  { name: "EC-B5: '0.99' is 99", raw: "0.99", cents: 99 },
  { name: "EC-B5: '0,00 €' is zero", raw: "0,00 €", cents: null, codes: ["price.zero"] },
  { name: "EC-B5: '0.00' is zero", raw: "0.00", cents: null, codes: ["price.zero"] },
  { name: "EC-B5: '-1.299,00 €' is negative", raw: "-1.299,00 €", cents: null, codes: ["price.negative"] },
  { name: "EC-B5: '−5' with a unicode minus is negative", raw: "−5", cents: null, codes: ["price.negative"] },
  { name: "EC-B5: '12,-' German dash for no decimals is 1200", raw: "12,-", cents: 1200 },
  { name: "EC-B5: '12.–' Swiss dash for no decimals is 1200", raw: "12.–", cents: 1200 },
  { name: "EC-B5: '1.2.3' is unparseable", raw: "1.2.3", cents: null, codes: ["price.unparseable"] },
  { name: "EC-B5: '12,34,56' is unparseable", raw: "12,34,56", cents: null, codes: ["price.unparseable"] },
  { name: "EC-B5: '1,2999.00' has a bad group and is unparseable", raw: "1,2999.00", cents: null, codes: ["price.unparseable"] },
  { name: "EC-B5: 'abc' is unparseable", raw: "abc", cents: null, codes: ["price.unparseable"] },
  { name: "EC-B5: '99999999' is kept but flagged implausible", raw: "99999999", cents: 9999999900, codes: ["price.implausible"] },

  // --- EC-B2: currency precedence ---
  { name: "EC-B2: '€12,99' symbol prefix without space", raw: "€12,99", cents: 1299, currency: "EUR", source: "value" },
  { name: "EC-B2: '12,99€' symbol suffix without space", raw: "12,99€", cents: 1299, currency: "EUR", source: "value" },
  { name: "EC-B2: 'USD12' code prefix without space", raw: "USD12", cents: 1200, currency: "USD", source: "value" },
  { name: "EC-B2: '12.50USD' code suffix without space", raw: "12.50USD", cents: 1250, currency: "USD", source: "value" },
  { name: "EC-B2: '12 eur' code is case-insensitive", raw: "12 eur", cents: 1200, currency: "EUR", source: "value" },
  { name: "EC-B2: '12.5' takes the currency column", raw: "12.5", ctx: { columnCurrency: "GBP" }, cents: 1250, currency: "GBP", source: "column", confidence: 90, notCodes: ["price.currency_assumed"] },
  { name: "EC-B2: '£8' against a EUR column keeps GBP and flags the conflict", raw: "£8", ctx: { columnCurrency: "EUR" }, cents: 800, currency: "GBP", source: "value", codes: ["price.currency_conflict"] },
  { name: "EC-B2: '€ 12' against a GBP column keeps EUR", raw: "€ 12", ctx: { columnCurrency: "GBP" }, cents: 1200, currency: "EUR", source: "value", codes: ["price.currency_conflict"] },
  { name: "EC-B2: '12.5' takes the header currency when there is no column", raw: "12.5", ctx: { headerCurrency: "USD" }, cents: 1250, currency: "USD", source: "header", confidence: 90 },
  { name: "EC-B2: column currency beats header currency", raw: "12.5", ctx: { columnCurrency: "GBP", headerCurrency: "USD" }, cents: 1250, currency: "GBP", source: "column" },
  { name: "EC-B2: '1 299,99 kr' with default SEK is 129999 SEK", raw: "1 299,99 kr", ctx: { defaultCurrency: "SEK" }, cents: 129999, currency: "SEK" },
  { name: "EC-B2: 'kr 12' with default EUR is ambiguous and has no money", raw: "kr 12", cents: null, codes: ["price.currency_ambiguous"] },
  { name: "EC-B2: 'kr 12' with a NOK column resolves to NOK", raw: "kr 12", ctx: { columnCurrency: "NOK" }, cents: 1200, currency: "NOK", source: "column" },
  { name: "EC-B2: 'Fr. 12.50' is CHF", raw: "Fr. 12.50", cents: 1250, currency: "CHF", source: "value" },
  { name: "EC-B2: 'SFr. 12.50' is CHF", raw: "SFr. 12.50", cents: 1250, currency: "CHF", source: "value" },
  { name: "EC-B2: '¥1200' is JPY", raw: "¥1200", cents: 120000, currency: "JPY", source: "value" },
  { name: "EC-B2: '₹ 999' is INR", raw: "₹ 999", cents: 99900, currency: "INR", source: "value" },
  { name: "EC-B2: '12 zł' is PLN", raw: "12 zł", cents: 1200, currency: "PLN", source: "value" },
  { name: "EC-B2: '99 Kč' is CZK", raw: "99 Kč", cents: 9900, currency: "CZK", source: "value" },
  { name: "EC-B2: '12,50 EUR inkl. MwSt.' ignores trailing words", raw: "12,50 EUR inkl. MwSt.", cents: 1250, currency: "EUR", source: "value", notCodes: ["price.multiple_values"] },
  { name: "EC-B2: '€' alone is a missing price", raw: "€", cents: null, codes: ["price.missing"] },

  // --- approximations, ranges, multiple values, percentages ---
  { name: "EC-B5: 'ca. 12,50 €' is approximate", raw: "ca. 12,50 €", cents: 1250, currency: "EUR", codes: ["price.approximate"], confidence: 80 },
  { name: "EC-B5: 'approx. 15' is approximate", raw: "approx. 15", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: '~15' is approximate", raw: "~15", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: 'from 15' is approximate", raw: "from 15", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: 'ab 15 €' is approximate", raw: "ab 15 €", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: 'à partir de 15 €' is approximate", raw: "à partir de 15 €", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: 'environ 15' is approximate", raw: "environ 15", cents: 1500, codes: ["price.approximate"] },
  { name: "EC-B5: '12.50 (RRP 15.00)' uses the first number", raw: "12.50 (RRP 15.00)", cents: 1250, codes: ["price.multiple_values"], confidence: 55 },
  { name: "EC-B5: '12,50 (inkl. 19% MwSt.)' ignores the percentage", raw: "12,50 (inkl. 19% MwSt.)", cents: 1250, notCodes: ["price.multiple_values", "price.unparseable"] },
  { name: "EC-B5: '12-15 €' is a range", raw: "12-15 €", cents: null, codes: ["price.range"] },
  { name: "EC-B5: '12 – 15' is a range", raw: "12 – 15", cents: null, codes: ["price.range"] },
  { name: "EC-B5: '12 bis 15' is a range", raw: "12 bis 15", cents: null, codes: ["price.range"] },
  { name: "EC-B5: '12 à 15 €' is a range", raw: "12 à 15 €", cents: null, codes: ["price.range"] },
  { name: "EC-B5: '12 to 15' is a range", raw: "12 to 15", cents: null, codes: ["price.range"] },
  { name: "EC-B5: '20%' is unparseable", raw: "20%", cents: null, codes: ["price.unparseable"] },

  // --- EC-B1 / EC-B13: missing and placeholders ---
  { name: "EC-B1: empty string is missing", raw: "", cents: null, source: "none", codes: ["price.missing"] },
  { name: "EC-B1: null is missing", raw: null, cents: null, codes: ["price.missing"] },
  { name: "EC-B1: undefined is missing", raw: undefined, cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'tbd' is missing", raw: "tbd", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'n.a.' is missing", raw: "n.a.", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: '#N/A' is missing", raw: "#N/A", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'null' is missing", raw: "null", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'none' is missing", raw: "none", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: '?' is missing", raw: "?", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: '—' is missing", raw: "—", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'auf Anfrage' is missing", raw: "auf Anfrage", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'sur demande' is missing", raw: "sur demande", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'On request' is missing", raw: "On request", cents: null, codes: ["price.missing"] },
  { name: "EC-B1: 'POA' is missing", raw: "POA", cents: null, codes: ["price.missing"] },

  // --- EC-B13: odd whitespace ---
  { name: "EC-B13: NBSP between number and symbol", raw: `12,50${NBSP}€`, cents: 1250, currency: "EUR", source: "value" },
  { name: "EC-B13: zero-width characters are removed", raw: `${ZERO_WIDTH_SPACE}12,50${BOM}`, cents: 1250 },
  { name: "EC-B13: narrow no-break space as grouping", raw: `1${NARROW_NBSP}299,99 €`, cents: 129999 },
  { name: "EC-B13: surrounding whitespace is trimmed", raw: "  12.50  ", cents: 1250 },
];

describe("parsePrice", () => {
  it.each(cases)("$name", (c) => {
    const result = parsePrice(c.raw, { defaultCurrency: "EUR", ...c.ctx });
    expect(result.raw).toBe(c.raw ?? "");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);

    if (c.cents === null) {
      expect(result.money).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.currencySource).toBe("none");
    } else {
      expect(result.money?.cents).toBe(c.cents);
      expect(Number.isInteger(result.money?.cents)).toBe(true);
    }
    if (c.currency !== undefined) expect(result.money?.currency).toBe(c.currency);
    if (c.source !== undefined) expect(result.currencySource).toBe(c.source);

    const codes = result.issues.map((i) => i.code);
    for (const code of c.codes ?? []) expect(codes).toContain(code);
    for (const code of c.notCodes ?? []) expect(codes).not.toContain(code);
    if (c.confidence !== undefined) expect(result.confidence).toBe(c.confidence);
    if (c.maxConfidence !== undefined) expect(result.confidence).toBeLessThanOrEqual(c.maxConfidence);
  });

  it("EC-B1: price.missing carries ec B1 and warn severity", () => {
    const result = parsePrice("-", { defaultCurrency: "EUR" });
    expect(result.issues).toEqual([expect.objectContaining({ code: "price.missing", severity: "warn", ec: "B1" })]);
  });

  it("EC-B2: price.currency_assumed carries ec B2 and info severity", () => {
    const result = parsePrice("12.50", { defaultCurrency: "EUR" });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "price.currency_assumed", severity: "info", ec: "B2" }),
    ]);
  });

  it("EC-B5: price.ambiguous, price.zero and price.negative carry ec B5", () => {
    const ec = (raw: string) => parsePrice(raw, { defaultCurrency: "EUR" }).issues.map((i) => [i.code, i.ec]);
    expect(ec("1.299")).toContainEqual(["price.ambiguous", "B5"]);
    expect(ec("0")).toContainEqual(["price.zero", "B5"]);
    expect(ec("-5")).toContainEqual(["price.negative", "B5"]);
  });

  it("EC-B5: an explicit currency and an unambiguous number score 100", () => {
    expect(parsePrice("12,50 €", { defaultCurrency: "USD" }).confidence).toBe(100);
  });

  it("EC-B5: never throws and never returns a float or NaN for garbage", () => {
    const garbage = ["..", ",,", "1.", ".5", "%", "- -", "12-", "€€€", "kr", "ca.", "x".repeat(300), "1,2,3,4,5", "١٢"];
    for (const raw of garbage) {
      const result = parsePrice(raw, { defaultCurrency: "EUR" });
      expect(result.raw).toBe(raw);
      if (result.money) expect(Number.isSafeInteger(result.money.cents)).toBe(true);
      else expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("truncates long raw values in issues to 200 characters", () => {
    const raw = `${"9".repeat(250)}x`;
    const result = parsePrice(raw, { defaultCurrency: "EUR" });
    expect(result.raw).toBe(raw);
    for (const i of result.issues) expect((i.value ?? "").length).toBeLessThanOrEqual(201);
  });
});

describe("inferColumnNumberLocale", () => {
  it.each([
    { name: "EC-B5: comma decimals vote eu", values: ["12,50", "1.299,00", "8,00"], expected: "eu" },
    { name: "EC-B5: dot decimals vote us", values: ["12.50", "1,299.00"], expected: "us" },
    { name: "EC-B5: integers give no evidence", values: ["12", "15"], expected: "unknown" },
    { name: "EC-B5: empty column is unknown", values: [], expected: "unknown" },
    { name: "EC-B5: a tie is unknown", values: ["12,50", "12.50"], expected: "unknown" },
    { name: "EC-B5: a both-separator value outweighs lone ones", values: ["12,50", "12,00", "1,299.00"], expected: "us" },
    { name: "EC-B5: placeholders and nulls are ignored", values: [null, undefined, "-", "n/a", "12,50 €"], expected: "eu" },
    { name: "EC-B5: a repeated dot is a thousands separator, so comma is decimal", values: ["1.299.000"], expected: "eu" },
    { name: "EC-B5: three digits after a lone separator is no evidence", values: ["1.299", "1,299"], expected: "unknown" },
    { name: "EC-B5: currency tokens do not disturb the vote", values: ["€12,50", "USD 12.50", "8,00 €"], expected: "eu" },
  ])("$name", ({ values, expected }) => {
    expect(inferColumnNumberLocale(values)).toBe(expected);
  });
});

describe("currency helpers", () => {
  it.each<[string, boolean]>([
    ["EUR", true],
    ["GBP", true],
    ["SEK", true],
    ["eur", false],
    ["EU", false],
    ["XXX", false],
    ["", false],
  ])("isCurrencyCode(%j) → %j", (code, expected) => {
    expect(isCurrencyCode(code)).toBe(expected);
  });

  it.each([
    { header: "Price EUR", expected: "EUR" },
    { header: "Preis (€)", expected: "EUR" },
    { header: "prix en euros", expected: "EUR" },
    { header: "Price (GBP)", expected: "GBP" },
    { header: "USD price", expected: "USD" },
    { header: "Price in pounds", expected: "GBP" },
    { header: "Preis CHF", expected: "CHF" },
    { header: "Price", expected: null },
    { header: "Preis brutto", expected: null },
    { header: "Pris (kr)", expected: null },
    { header: "Price incl. VAT", expected: null },
  ])("EC-B2: detectCurrencyInHeader($header) → $expected", ({ header, expected }) => {
    expect(detectCurrencyInHeader(header)).toBe(expected);
  });

  const extractCases: Array<{
    raw: string;
    currency: string | null;
    rest: string;
    ambiguous: boolean;
    defaultForKr?: string;
  }> = [
    { raw: "12,50 €", currency: "EUR", rest: "12,50", ambiguous: false },
    { raw: "€12,50", currency: "EUR", rest: "12,50", ambiguous: false },
    { raw: "USD 12", currency: "USD", rest: "12", ambiguous: false },
    { raw: "12 usd", currency: "USD", rest: "12", ambiguous: false },
    { raw: "12 kr", currency: null, rest: "12", ambiguous: true },
    { raw: "12 kr", currency: "NOK", rest: "12", ambiguous: false, defaultForKr: "NOK" },
    { raw: "12 kr", currency: null, rest: "12", ambiguous: true, defaultForKr: "EUR" },
    { raw: "from 12", currency: null, rest: "from 12", ambiguous: false },
    { raw: "12 Fr.", currency: "CHF", rest: "12", ambiguous: false },
    { raw: "12", currency: null, rest: "12", ambiguous: false },
  ];
  it.each(extractCases)("EC-B2: extractCurrency($raw) → $currency", ({ raw, currency, rest, ambiguous, defaultForKr }) => {
    expect(extractCurrency(raw, defaultForKr)).toEqual({ currency, rest, ambiguous });
  });
});

describe("parsePrice: prefixed dollars, rupees, lakh grouping, unreadable shapes", () => {
  it.each<[string, number, string]>([
    ["C$ 15", 1500, "CAD"],
    ["CA$15", 1500, "CAD"],
    ["A$20", 2000, "AUD"],
    ["AU$ 20", 2000, "AUD"],
    ["R$ 50", 5000, "BRL"],
    ["US$ 12", 1200, "USD"],
    ["NZ$ 9.50", 950, "NZD"],
    ["HK$ 88", 8800, "HKD"],
    ["S$ 5", 500, "SGD"],
    ["MX$ 120", 12000, "MXN"],
    ["15 C$", 1500, "CAD"],
    ["Rs. 499", 49900, "INR"],
    ["Rs 499", 49900, "INR"],
    ["₹499", 49900, "INR"],
    ["INR 499", 49900, "INR"],
    ["₹1,29,999", 12999900, "INR"],
    ["₹ 12,34,567.50", 123456750, "INR"],
  ])("EC-B2/EC-B5: %j → %i %s from the value, no issue", (raw, cents, currency) => {
    const r = parsePrice(raw, { defaultCurrency: "EUR" });
    expect(r.money).toEqual({ cents, currency });
    expect(r.currencySource).toBe("value");
    expect(r.issues).toEqual([]);
  });

  it("EC-B2: a bare '$' in a EUR store is USD and says so", () => {
    const r = parsePrice("$12", { defaultCurrency: "EUR" });
    expect(r.money).toEqual({ cents: 1200, currency: "USD" });
    expect(r.issues).toEqual([expect.objectContaining({ code: "price.dollar_assumed", severity: "info", ec: "B2" })]);
  });

  it("EC-B2: a bare '$' in a USD store needs no note", () => {
    expect(parsePrice("$12", { defaultCurrency: "USD" }).issues).toEqual([]);
  });

  it.each<[Partial<PriceContext>, string]>([
    [{ defaultCurrency: "CAD" }, "CAD"],
    [{ defaultCurrency: "EUR", headerCurrency: "AUD" }, "AUD"],
    [{ defaultCurrency: "EUR", columnCurrency: "NZD" }, "NZD"],
  ])("EC-B2: a bare '$' takes the dollar the context names (%j → %s)", (ctx, currency) => {
    const r = parsePrice("$12", { defaultCurrency: "EUR", ...ctx });
    expect(r.money).toEqual({ cents: 1200, currency });
    expect(r.issues.map((i) => i.code)).toEqual(["price.dollar_resolved"]);
  });

  it.each([["1e3"], ["1E5"], ["1.2E+04"]])("EC-B5: scientific notation %j is unparseable, never 100 cents", (raw) => {
    const r = parsePrice(raw, { defaultCurrency: "EUR" });
    expect(r.money).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("price.unparseable");
  });

  it.each([["2x 9.99"], ["2 x 9,99"], ["3× 4.50 €"]])("EC-B5: multipack %j gives no price and a review warning", (raw) => {
    const r = parsePrice(raw, { defaultCurrency: "EUR" });
    expect(r.money).toBeNull();
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "price.multipack", severity: "warn", ec: "B5" }));
  });

  it("EC-B2: a bare cell inherits the currency the rest of its column states", () => {
    const r = parsePrice("12.00", { defaultCurrency: "EUR", valueCurrency: "USD" });
    expect(r.money).toEqual({ cents: 1200, currency: "USD" });
    expect(r.currencySource).toBe("column");
    expect(r.issues.map((i) => i.code)).toEqual(["price.currency_inherited"]);
  });

  it("EC-B2: a currency column still beats the column majority", () => {
    const r = parsePrice("12.00", { defaultCurrency: "EUR", valueCurrency: "USD", columnCurrency: "GBP" });
    expect(r.money?.currency).toBe("GBP");
    expect(r.issues.map((i) => i.code)).not.toContain("price.currency_inherited");
  });

  it("EC-B2: a majority equal to the store default changes nothing", () => {
    const r = parsePrice("12.00", { defaultCurrency: "EUR", valueCurrency: "EUR" });
    expect(r.currencySource).toBe("default");
    expect(r.issues.map((i) => i.code)).toEqual(["price.currency_assumed"]);
  });

  it.each<[string, string]>([
    ["Price (C$)", "CAD"],
    ["Preis (Rs.)", "INR"],
    ["Price ($)", "USD"],
  ])("EC-B2: detectCurrencyInHeader(%j) → %s", (header, code) => {
    expect(detectCurrencyInHeader(header)).toBe(code);
  });

  it("EC-B2: extractCurrency marks a bare '$' so the caller can resolve it", () => {
    expect(extractCurrency("$12")).toEqual({ currency: "USD", rest: "12", ambiguous: false, bareDollar: true });
    expect(extractCurrency("US$12")).toEqual({ currency: "USD", rest: "12", ambiguous: false });
  });
});
