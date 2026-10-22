import {
  type CurrencyCode,
  type CurrencySource,
  type Issue,
  type ParsedPrice,
  type Severity,
  issue,
} from "../types";
import { extractCurrency } from "./currency";

export type NumberLocale = "eu" | "us" | "unknown";

export interface PriceContext {
  defaultCurrency: CurrencyCode;
  /** From a separate currency column on the same row. */
  columnCurrency?: CurrencyCode | null;
  /** From the price column header ("Price EUR"). */
  headerCurrency?: CurrencyCode | null;
  /** From `inferColumnNumberLocale` over the whole column. */
  locale?: NumberLocale;
}

/** Values a supplier writes instead of a price (EC-B1, EC-B13). Compared lower-case. */
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  "", "-", "–", "—", "n/a", "n.a.", "na", "null", "none", "tbd", "?", "#n/a",
  "auf anfrage", "sur demande", "on request", "call", "poa",
]);

const KRONE: ReadonlySet<string> = new Set(["SEK", "NOK", "DKK"]);

// Written as code points so the invisible characters stay visible to reviewers.
const ZERO_WIDTH_RE = new RegExp(`[${String.fromCodePoint(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, "g");
const ODD_SPACE_RE = new RegExp(`[${String.fromCodePoint(0xa0, 0x2007, 0x2009, 0x200a, 0x202f)}]`, "g");
const APPROX_RE = /^(?:ca\.?|circa|approx\.?|approximately|etwa|environ|à partir de|ab|from|~)(?!\p{L})\s*/iu;
// A space or apostrophe is a thousands separator only between a digit and a group of exactly three.
const GROUPING_RE = /(\d)[ '’](?=\d{3}(?!\d))/g;
const RANGE_RE = /\d\s*(?:[-–—−~]|bis|to|à)\s*\d/iu;
const NEGATIVE_RE = /^[-−–]\s*\d/u;
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const PERCENT_RE = /\d+(?:[.,]\d+)*\s*%/g;

const MAX_PLAUSIBLE_CENTS = 10_000_000 * 100;
/** Keeps major*100 well inside Number's exact integer range. */
const MAX_INTEGER_DIGITS = 13;

function normalise(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(ODD_SPACE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Leading group 1+ digits, every further group exactly three. */
function validGroups(groups: string[]): boolean {
  return groups.every((g, i) => (i === 0 ? g.length >= 1 : g.length === 3));
}

interface NumberParts {
  intDigits: string;
  decDigits: string;
  /** Set when a lone separator with three digits after it had to be guessed (EC-B5). */
  ambiguous: "thousands" | "decimal" | null;
}

function readNumber(token: string, locale: NumberLocale): NumberParts | null {
  const dots = count(token, ".");
  const commas = count(token, ",");

  if (dots === 0 && commas === 0) return { intDigits: token, decDigits: "", ambiguous: null };

  if (dots > 0 && commas > 0) {
    const decSep = token.lastIndexOf(".") > token.lastIndexOf(",") ? "." : ",";
    const groupSep = decSep === "." ? "," : ".";
    if (count(token, decSep) !== 1) return null;
    const [intPart, decPart] = token.split(decSep);
    const groups = intPart.split(groupSep);
    if (!validGroups(groups)) return null;
    return { intDigits: groups.join(""), decDigits: decPart, ambiguous: null };
  }

  const sep = dots > 0 ? "." : ",";
  const parts = token.split(sep);
  if (parts.length > 2) {
    return validGroups(parts) ? { intDigits: parts.join(""), decDigits: "", ambiguous: null } : null;
  }

  const [intPart, after] = parts;
  if (after.length !== 3) return { intDigits: intPart, decDigits: after, ambiguous: null };

  // "1.299": retail prices never carry three decimals, so this is read as a thousands group even when the
  // column's own convention uses this separator for decimals; it is flagged unless the locale confirms it.
  const localeDecimal = locale === "eu" ? "," : locale === "us" ? "." : null;
  if (localeDecimal === null || localeDecimal === sep) return { intDigits: intPart + after, decDigits: "", ambiguous: "thousands" };
  return { intDigits: intPart + after, decDigits: "", ambiguous: null };
}

/** Integer cents from digit strings; the third decimal digit rounds half-up. Never floats. */
function toCents(intDigits: string, decDigits: string): number | null {
  const trimmed = intDigits.replace(/^0+(?=\d)/, "");
  if (trimmed.length > MAX_INTEGER_DIGITS) return null;
  const major = Number(trimmed);
  const minor = Number(`${decDigits}00`.slice(0, 2));
  const roundUp = decDigits.length > 2 && decDigits.charAt(2) >= "5" ? 1 : 0;
  return major * 100 + minor + roundUp;
}

interface ResolvedCurrency {
  currency: CurrencyCode;
  source: CurrencySource;
}

/** Column → header → store default; with `kroneOnly` only SEK/NOK/DKK qualify (for "kr"). */
function resolveFallback(ctx: PriceContext, kroneOnly: boolean): ResolvedCurrency | null {
  const candidates: Array<{ currency: CurrencyCode | null | undefined; source: CurrencySource }> = [
    { currency: ctx.columnCurrency, source: "column" },
    { currency: ctx.headerCurrency, source: "header" },
    { currency: ctx.defaultCurrency, source: "default" },
  ];
  for (const c of candidates) {
    if (!c.currency) continue;
    if (kroneOnly && !KRONE.has(c.currency)) continue;
    return { currency: c.currency, source: c.source };
  }
  return null;
}

/**
 * Parses one price cell into integer cents + currency (EC-B1, EC-B2, EC-B5).
 * Never throws; every problem is an issue and a confidence deduction.
 */
export function parsePrice(raw: string | null | undefined, ctx: PriceContext): ParsedPrice {
  const original = raw ?? "";
  const text = normalise(original);
  const issues: Issue[] = [];

  const fail = (code: string, severity: Severity, message: string, ec?: string): ParsedPrice => ({
    money: null,
    confidence: 0,
    currencySource: "none",
    issues: [...issues, issue(code, severity, message, { value: original, ...(ec ? { ec } : {}) })],
    raw: original,
  });
  const missing = (): ParsedPrice => fail("price.missing", "warn", "No price given.", "B1");
  const unparseable = (why: string): ParsedPrice => fail("price.unparseable", "error", why);

  if (PLACEHOLDERS.has(text.toLowerCase())) return missing();

  let penalty = 0;
  const found = extractCurrency(text);
  let rest = found.rest;
  let currency: CurrencyCode;
  let source: CurrencySource;

  if (found.currency) {
    currency = found.currency;
    source = "value";
    if (ctx.columnCurrency && ctx.columnCurrency !== currency) {
      issues.push(
        issue(
          "price.currency_conflict",
          "warn",
          `Value says ${currency} but the currency column says ${ctx.columnCurrency}; kept ${currency}.`,
          { value: original, ec: "B2" },
        ),
      );
      penalty += 10;
    }
  } else {
    const resolved = resolveFallback(ctx, found.ambiguous);
    if (!resolved) {
      return fail(
        "price.currency_ambiguous",
        "error",
        '"kr" could be SEK, NOK or DKK; add a currency column or set a Scandinavian store currency.',
        "B2",
      );
    }
    currency = resolved.currency;
    source = resolved.source;
    if (source === "default") {
      penalty += 25;
      issues.push(
        issue(
          "price.currency_assumed",
          "info",
          found.ambiguous
            ? `"kr" could be SEK, NOK or DKK; assumed the store default ${currency}.`
            : `No currency given; assumed the store default ${currency}.`,
          { ec: "B2" },
        ),
      );
    } else {
      penalty += 10;
    }
  }

  if (rest === "") return missing();

  const approx = APPROX_RE.exec(rest);
  if (approx) {
    rest = rest.slice(approx[0].length);
    issues.push(issue("price.approximate", "info", "Price is marked as approximate.", { value: original }));
    penalty += 20;
    if (rest === "") return unparseable("Could not read a number from this value.");
  }

  if (NEGATIVE_RE.test(rest)) return fail("price.negative", "error", "Price is negative.", "B5");
  if (RANGE_RE.test(rest)) {
    return fail("price.range", "error", "Value is a price range; one price is needed.");
  }

  rest = rest.replace(GROUPING_RE, "$1");
  const first = /\d+(?:[.,]\d+)*/.exec(rest);
  if (!first) return unparseable("Could not read a number from this value.");
  if (/^\s*%/.test(rest.slice(first.index + first[0].length))) {
    return unparseable("Value is a percentage, not a price.");
  }

  // Percentages elsewhere ("inkl. 19% MwSt.") are not prices and must not count as extra values.
  const token = first[0];
  const tokenCount = (rest.replace(PERCENT_RE, " ").match(NUMBER_RE) ?? []).length;
  if (tokenCount > 1) {
    issues.push(
      issue("price.multiple_values", "warn", "Several numbers found; the first was used.", { value: original }),
    );
    penalty += 20;
  }

  const parts = readNumber(token, ctx.locale ?? "unknown");
  if (!parts) return unparseable("Could not read a number from this value.");
  const cents = toCents(parts.intDigits, parts.decDigits);
  if (cents === null) return unparseable("Number has too many digits to be a price.");

  let cap = 100;
  if (parts.decDigits.length > 2) {
    issues.push(
      issue("price.rounded", "warn", "More than two decimals; rounded to the nearest cent.", { value: original }),
    );
    penalty += 10;
  }
  if (parts.ambiguous) {
    const message =
      parts.ambiguous === "thousands"
        ? `"${token}" was read with a thousands separator; it could also be a value with three decimals.`
        : `"${token}" was read with three decimals because the column uses that separator for decimals; it could also be a thousands group.`;
    issues.push(issue("price.ambiguous", "warn", message, { value: original, ec: "B5" }));
    cap = 60;
  }
  if (cents === 0) return fail("price.zero", "error", "Price is zero.", "B5");
  if (cents > MAX_PLAUSIBLE_CENTS) {
    issues.push(
      issue("price.implausible", "warn", "Price is above 10,000,000; check the value.", { value: original }),
    );
    penalty += 10;
  }

  return {
    money: { cents, currency },
    confidence: Math.max(0, Math.min(cap, 100 - penalty)),
    currencySource: source,
    issues,
    raw: original,
  };
}

/**
 * Looks at a whole column to decide whether "," or "." is the decimal separator (EC-B5).
 * A value with both separators is strong evidence; a lone separator with 1–2 digits after it
 * is weak evidence; a separator repeated twice or more is a thousands separator, which is weak
 * evidence for the other one.
 */
export function inferColumnNumberLocale(values: Array<string | null | undefined>): NumberLocale {
  let eu = 0;
  let us = 0;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = normalise(value);
    if (PLACEHOLDERS.has(text.toLowerCase())) continue;
    const rest = extractCurrency(text).rest.replace(APPROX_RE, "").replace(GROUPING_RE, "$1");
    const token = /\d+(?:[.,]\d+)*/.exec(rest)?.[0];
    if (!token) continue;

    const dots = count(token, ".");
    const commas = count(token, ",");
    if (dots > 0 && commas > 0) {
      if (token.lastIndexOf(",") > token.lastIndexOf(".")) eu += 3;
      else us += 3;
    } else if (dots + commas === 1) {
      const after = token.slice(token.search(/[.,]/) + 1);
      if (after.length <= 2) {
        if (commas === 1) eu += 1;
        else us += 1;
      }
    } else if (dots >= 2) {
      eu += 1;
    } else if (commas >= 2) {
      us += 1;
    }
  }
  if (eu > us) return "eu";
  if (us > eu) return "us";
  return "unknown";
}
