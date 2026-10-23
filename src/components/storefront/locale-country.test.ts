import { describe, expect, it } from "vitest";
import { countryForLocale, nextLocale } from "./locale-country";

describe("countryForLocale", () => {
  it("prefers a country the store itself maps to the language", () => {
    expect(countryForLocale("de", { AT: "de", DE: "de", FR: "fr" })).toBe("AT");
    expect(countryForLocale("fr", { AT: "de", FR: "fr" })).toBe("FR");
  });

  it("falls back to a sensible default when the store has not mapped the language", () => {
    expect(countryForLocale("de", {})).toBe("DE");
    expect(countryForLocale("en", { DE: "de" })).toBe("GB");
    expect(countryForLocale("pt", {})).toBeNull();
  });
});

describe("nextLocale", () => {
  it("offers the first other language, in the store's order", () => {
    expect(nextLocale("en", ["en", "de", "fr"])).toBe("de");
    expect(nextLocale("de", ["en", "de", "fr"])).toBe("en");
    expect(nextLocale("en", ["en"])).toBeNull();
  });
});
