/**
 * Country → locale resolution for the storefront (EC-H3, H4).
 * Explicit visitor choice beats geolocation; unmapped countries get the default locale.
 */

export const DEFAULT_COUNTRY_LOCALE_MAP: Readonly<Record<string, string>> = { DE: "de", AT: "de", FR: "fr" };

export interface LocaleResolution {
  locale: string;
  country: string | null;
  source: "explicit" | "country" | "default";
}

export function resolveLocale(input: { explicitLocale?: string | null; country?: string | null; map: Record<string, string>; available: string[]; fallback?: string }): LocaleResolution {
  const available = input.available.length ? input.available : ["en"];
  const fallback = input.fallback ?? (available.includes("en") ? "en" : available[0]!);
  const country = input.country ? input.country.toUpperCase().slice(0, 2) : null;
  if (input.explicitLocale && available.includes(input.explicitLocale)) return { locale: input.explicitLocale, country, source: "explicit" };
  if (country) {
    const mapped = input.map[country];
    if (mapped && available.includes(mapped)) return { locale: mapped, country, source: "country" };
  }
  return { locale: fallback, country, source: "default" };
}

export const COUNTRY_CHOICES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" },
];

export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "de" ? "de-DE" : locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
