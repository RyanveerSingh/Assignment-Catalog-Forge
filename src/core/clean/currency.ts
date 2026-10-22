import type { CurrencyCode } from "../types";

/**
 * Common ISO 4217 codes. Supplier sheets for European merchants rarely go beyond these, and
 * an unknown three-letter word is more likely a product code than a currency.
 */
const CURRENCY_CODES: readonly CurrencyCode[] = [
  "EUR", "USD", "GBP", "CHF", "JPY", "INR", "SEK", "NOK", "DKK", "PLN", "CZK", "CAD",
  "AUD", "NZD", "HUF", "RON", "BGN", "TRY", "ZAR", "BRL", "MXN", "CNY", "HKD", "SGD",
  "KRW", "ISK", "ILS", "AED", "SAR", "THB",
];
const CODE_SET: ReadonlySet<string> = new Set(CURRENCY_CODES);

/** "kr" is used by Sweden, Norway and Denmark alike; only context can pick one (EC-B2). */
const KRONE_CODES: ReadonlySet<string> = new Set(["SEK", "NOK", "DKK"]);

/** Symbols and words that map to exactly one code. Keys are lower-case without a trailing dot. */
const ALIASES: Readonly<Record<string, CurrencyCode>> = {
  "€": "EUR",
  euro: "EUR",
  euros: "EUR",
  $: "USD",
  dollar: "USD",
  dollars: "USD",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  fr: "CHF",
  sfr: "CHF",
  "zł": "PLN",
  zl: "PLN",
  "kč": "CZK",
  kc: "CZK",
};

// Letter tokens must be whole words so "from", "inkl." or "Fri" are never read as currencies.
const TOKEN_RE = new RegExp(
  `(?<!\\p{L})(?:${CURRENCY_CODES.join("|")}|euros?|dollars?|sfr\\.?|fr\\.?|kr\\.?|zł|zl|kč|kc)(?!\\p{L})|[€$£¥₹]`,
  "iu",
);

// Written as a code point so the invisible character stays visible to reviewers.
const NBSP_RE = new RegExp(String.fromCodePoint(0xa0), "g");

/** Spelled-out currency names that only make sense in a column header, not in a price cell. */
const HEADER_WORDS: ReadonlyArray<[RegExp, CurrencyCode]> = [
  [/\b(?:pounds?|sterling)\b/, "GBP"],
  [/\b(?:francs?|franken)\b/, "CHF"],
  [/\byen\b/, "JPY"],
  [/\brupees?\b/, "INR"],
  [/\bz[łl]oty\b/u, "PLN"],
  [/\bkorun[ay]\b/, "CZK"],
];

export function isCurrencyCode(s: string): boolean {
  return /^[A-Z]{3}$/.test(s) && CODE_SET.has(s);
}

function tokenKey(token: string): string {
  return token.toLowerCase().replace(/\.$/, "");
}

function codeForKey(key: string): CurrencyCode | null {
  const alias = ALIASES[key];
  if (alias) return alias;
  const upper = key.toUpperCase();
  return CODE_SET.has(upper) ? upper : null;
}

/**
 * Finds the first currency symbol or code in a value and returns the value without it.
 * "kr" is ambiguous (SEK/NOK/DKK): it resolves to `defaultForKr` when that is one of the three,
 * otherwise the result has `currency: null, ambiguous: true` so the caller can decide.
 */
export function extractCurrency(
  raw: string,
  defaultForKr?: CurrencyCode,
): { currency: CurrencyCode | null; rest: string; ambiguous: boolean } {
  const match = TOKEN_RE.exec(raw);
  if (!match) return { currency: null, rest: raw, ambiguous: false };

  const token = match[0];
  const rest = `${raw.slice(0, match.index)} ${raw.slice(match.index + token.length)}`
    .replace(/\s+/g, " ")
    .trim();
  const key = tokenKey(token);

  if (key === "kr") {
    if (defaultForKr && KRONE_CODES.has(defaultForKr)) {
      return { currency: defaultForKr, rest, ambiguous: false };
    }
    return { currency: null, rest, ambiguous: true };
  }
  return { currency: codeForKey(key), rest, ambiguous: false };
}

/** "Price EUR", "Preis (€)", "prix en euros", "Price (GBP)" → code; "Price" → null (EC-B2). */
export function detectCurrencyInHeader(header: string): CurrencyCode | null {
  const text = header.normalize("NFC").replace(NBSP_RE, " ");
  const { currency, ambiguous } = extractCurrency(text);
  if (currency) return currency;
  if (ambiguous) return null;

  const lower = text.toLowerCase();
  for (const [pattern, code] of HEADER_WORDS) {
    if (pattern.test(lower)) return code;
  }
  return null;
}
