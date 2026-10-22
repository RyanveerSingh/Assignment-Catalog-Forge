import { describe, expect, it } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage (EC-B10)", () => {
  it.each([
    ["Handgefertigter Übertopf aus Terrakotta mit Abflussloch", "de"],
    ["Pot en terre cuite fait à la main avec trou de drainage", "fr"],
    ["Hand-thrown terracotta planter with drainage hole", "en"],
    ["TC-PL-20", "und"],
  ])("EC-B10: %j -> %s", (text, lang) => {
    const result = detectLanguage(text);
    expect(result.lang).toBe(lang);
    if (lang === "und") expect(result.confidence).toBe(0);
    else expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it.each([null, undefined, "", "   ", "\n\t", "Red planter", "TC-PL-20 blue"])(
    "returns und/0 for %j (empty or fewer than three words)",
    (text) => {
      expect(detectLanguage(text)).toEqual({ lang: "und", confidence: 0 });
    },
  );

  it.each([
    ["der die das und mit", "de", 90],
    ["the quick fox and the dog", "en", 80],
    ["le pot et la soucoupe", "fr", 80],
    ["Pflanztopf mit Untersetzer", "de", 40],
  ])("EC-B10: stopwords decide short text: %j -> %s at %i", (text, lang, confidence) => {
    expect(detectLanguage(text)).toEqual({ lang, confidence });
  });

  it("EC-B10: tied stopword evidence on a short title is undetermined", () => {
    expect(detectLanguage("Der planter with Deckel")).toEqual({ lang: "und", confidence: 0 });
  });

  it("EC-B10: accented letters only break a stopword tie", () => {
    // "in" (en) and "die" (de) score one hit each; the umlauts decide.
    expect(detectLanguage("Übertopf in die Küche").lang).toBe("de");
    // Accents alone, without any stopword hit, prove nothing.
    expect(detectLanguage("Übertopf Küche Größe")).toEqual({ lang: "und", confidence: 0 });
  });

  it.each([
    ["Glasierter Steinzeug Übertopf frostsicher drinnen wie draußen verwendbar", "de"],
    ["Cache-pot céramique émaillée résistant au gel intérieur extérieur", "fr"],
    ["Glazed stoneware planter, frost proof, suitable indoors as well as outdoors", "en"],
  ])("EC-B10: longer text without listed stopwords falls back to trigrams: %j -> %s", (text, lang) => {
    const result = detectLanguage(text);
    expect(result.lang).toBe(lang);
    expect(result.confidence).toBeGreaterThanOrEqual(10);
    expect(result.confidence).toBeLessThanOrEqual(90);
  });

  it("EC-B10: agreeing stopword evidence raises the trigram confidence", () => {
    const result = detectLanguage("Hand thrown stoneware planter finished in a speckled oatmeal glaze");
    expect(result.lang).toBe("en");
    expect(result.confidence).toBeGreaterThanOrEqual(50);
  });

  it("EC-B10: short text with a single stopword hit is a low-confidence guess, not a trigram call", () => {
    const result = detectLanguage("Topf mit Deckel");
    expect(result.lang).toBe("de");
    expect(result.confidence).toBeLessThan(70);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it.each([
    "1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21",
    "TC-PL-20 TC-PL-25 TC-PL-30 lorem ipsum dolor sit amet",
    "🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿 🌿",
    "陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢 陶器の鉢",
  ])("EC-B16: numbers, codes and non-Latin scripts are undetermined: %j", (text) => {
    expect(detectLanguage(text)).toEqual({ lang: "und", confidence: 0 });
  });

  it("is deterministic", () => {
    const text = "Glasierter Steinzeug Übertopf frostsicher drinnen wie draußen verwendbar";
    expect(detectLanguage(text)).toEqual(detectLanguage(text));
  });

  it("never throws and always returns a 0–100 integer confidence", () => {
    const inputs = ["\u0000\u0000\u0000 \uFFFD \uFFFD", "a".repeat(10_000) + " b c", "<p>und mit für</p>", "   x   y   z   "];
    for (const text of inputs) {
      expect(() => detectLanguage(text)).not.toThrow();
      const result = detectLanguage(text);
      expect(["en", "de", "fr", "und"]).toContain(result.lang);
      expect(Number.isInteger(result.confidence)).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    }
  });
});
