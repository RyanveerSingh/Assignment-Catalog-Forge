import { describe, expect, it } from "vitest";
import { DEFAULT_COUNTRY_LOCALE_MAP, formatMoney, resolveLocale } from "./locale";

const available = ["en", "de", "fr"];

describe("resolveLocale", () => {
  it.each([
    ["DE", "de"],
    ["AT", "de"],
    ["FR", "fr"],
    ["US", "en"],
    ["IN", "en"],
    ["gb", "en"],
  ])("EC-H3: country %s → %s", (country, locale) => {
    expect(resolveLocale({ country, map: DEFAULT_COUNTRY_LOCALE_MAP, available }).locale).toBe(locale);
  });

  it("EC-H4: an explicit choice beats the country", () => {
    const r = resolveLocale({ explicitLocale: "fr", country: "DE", map: DEFAULT_COUNTRY_LOCALE_MAP, available });
    expect(r).toEqual({ locale: "fr", country: "DE", source: "explicit" });
  });

  it("ignores an explicit locale the store does not offer", () => {
    expect(resolveLocale({ explicitLocale: "es", country: "DE", map: DEFAULT_COUNTRY_LOCALE_MAP, available }).locale).toBe("de");
  });

  it("EC-H2: a mapped locale that is not available falls back to English", () => {
    expect(resolveLocale({ country: "DE", map: DEFAULT_COUNTRY_LOCALE_MAP, available: ["en", "fr"] }).locale).toBe("en");
  });

  it("formats money per locale without floats leaking", () => {
    expect(formatMoney(129900, "EUR", "de")).toMatch(/1\.299,00/);
    expect(formatMoney(2499, "GBP", "en")).toBe("£24.99");
  });
});
