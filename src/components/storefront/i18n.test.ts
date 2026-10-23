import { describe, expect, it } from "vitest";
import { attributeLabel, formatList, humanizeKey, nativeLocaleName, optionLabel, plural, t, uiLocale } from "./i18n";

describe("t", () => {
  it.each([
    ["en", "Add to bag"],
    ["de", "In den Warenkorb"],
    ["fr", "Ajouter au panier"],
    ["es", "Add to bag"],
  ])("%s falls back to English when unknown", (locale, label) => {
    expect(t(locale, "addToBag")).toBe(label);
  });

  it("interpolates placeholders and leaves unknown ones visible", () => {
    expect(t("de", "pageOf", { page: 2, count: 5 })).toBe("Seite 2 von 5");
    expect(t("en", "moreFrom", {})).toBe("More from {category}");
  });
});

describe("plural", () => {
  it.each([
    [1, "en", "1 product"],
    [2, "en", "2 products"],
    [1, "de", "1 Produkt"],
    [3, "fr", "3 produits"],
    [0, "en", "0 products"],
  ])("%d products in %s", (n, locale, label) => {
    expect(plural(locale, "products", n)).toBe(label);
  });
});

describe("option and attribute labels", () => {
  it.each([
    ["size", "en", "Size"],
    ["color", "de", "Farbe"],
    ["Colour", "fr", "Couleur"],
    ["handle_length", "en", "Handle length"],
  ])("option %s in %s", (name, locale, label) => {
    expect(optionLabel(locale, name)).toBe(label);
  });

  it.each([
    ["care", "fr", "Entretien"],
    ["oven_maximum_temperature", "en", "Oven maximum temperature"],
    ["dishwasher-safe", "de", "Spülmaschinenfest"],
    ["weird-key_name", "de", "Weird key name"],
  ])("attribute %s in %s", (key, locale, label) => {
    expect(attributeLabel(locale, key)).toBe(label);
  });

  it("humanizeKey turns snake and kebab case into a sentence", () => {
    expect(humanizeKey("set_contents")).toBe("Set contents");
    expect(humanizeKey("")).toBe("");
  });
});

describe("locale helpers", () => {
  it("formatList joins in the visitor's language", () => {
    expect(formatList("de", ["A", "B", "C"])).toBe("A, B und C");
    expect(formatList("en", ["A", "B"])).toBe("A and B");
    expect(formatList("fr", ["A"])).toBe("A");
  });

  it("uiLocale and nativeLocaleName", () => {
    expect(uiLocale("fr")).toBe("fr");
    expect(uiLocale("nl")).toBe("en");
    expect(nativeLocaleName("de")).toBe("Deutsch");
    expect(nativeLocaleName("pt")).toBe("PT");
  });
});
