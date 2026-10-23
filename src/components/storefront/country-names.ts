import { COUNTRY_CHOICES } from "@/core/i18n/locale";
import { uiLocale } from "./i18n";

/**
 * Country names in the visitor's language ("Deutschland", not "Germany"), computed on the server
 * and passed down so the client never re-derives them and the markup matches on hydration.
 */
export function localizedCountryNames(locale: string, extra: string | null): Record<string, string> {
  const codes = [...COUNTRY_CHOICES.map((c) => c.code), ...(extra ? [extra] : [])];
  const out: Record<string, string> = {};
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([uiLocale(locale)], { type: "region" });
  } catch {
    return out;
  }
  for (const code of codes) {
    try {
      const name = names.of(code);
      if (name && name !== code) out[code] = name;
    } catch {
      // Unknown or malformed code: the switcher falls back to its English label.
    }
  }
  return out;
}
