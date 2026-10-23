/**
 * The storefront has no URL per language: the language follows the visitor's country (cookie,
 * then geo). "Open in Deutsch" therefore picks a country that the store maps to that language.
 * The store's own map wins; the table below only covers a locale the merchant has not mapped.
 */

const DEFAULT_COUNTRY: Record<string, string> = { en: "GB", de: "DE", fr: "FR", es: "ES", it: "IT", nl: "NL" };

export function countryForLocale(locale: string, map: Record<string, string>): string | null {
  for (const [country, mapped] of Object.entries(map)) if (mapped === locale) return country;
  return DEFAULT_COUNTRY[locale] ?? null;
}

/** The first other language the store publishes, the one the CTA band offers; null for a single-language store. */
export function nextLocale(current: string, available: string[]): string | null {
  return available.find((l) => l !== current) ?? null;
}
