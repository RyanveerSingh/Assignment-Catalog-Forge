import { describe, expect, it } from "vitest";
import { COLOR_VOCABULARY, extractColorTokens, normalizeColor } from "./color";

describe("normalizeColor", () => {
  it.each([
    ["Blue", "blue"],
    ["BLACK", "black"],
    ["Dark Blue", "dark blue"],
    ["off-white", "off-white"],
    ["off white", "off-white"],
    ["Rose Gold", "rose gold"],
    ["violet", "violet"],
    ["  terracotta  ", "terracotta"],
    ["Multicolour", "multicolour"],
  ])("exact: %j -> %j with confidence 100", (input, expected) => {
    expect(normalizeColor(input)).toEqual({ raw: input, primary: expected, all: [expected], method: "exact", confidence: 100 });
  });

  it.each([
    ["gray", "grey"],
    ["Terra Cotta", "terracotta"],
    ["terra-cotta", "terracotta"],
    ["terrakotta", "terracotta"],
    ["terre cuite", "terracotta"],
    ["anthrazit", "anthracite"],
    ["weiss", "white"],
    ["weiß", "white"],
    ["blanc", "white"],
    ["blanche", "white"],
    ["schwarz", "black"],
    ["noir", "black"],
    ["rot", "red"],
    ["rouge", "red"],
    ["blau", "blue"],
    ["bleu", "blue"],
    ["grün", "green"],
    ["gruen", "green"],
    ["vert", "green"],
    ["gelb", "yellow"],
    ["jaune", "yellow"],
    ["grau", "grey"],
    ["gris", "grey"],
    ["braun", "brown"],
    ["marron", "brown"],
    ["brun", "brown"],
    ["rosa", "pink"],
    ["rose", "pink"],
    ["lila", "purple"],
    ["violett", "purple"],
    ["violette", "purple"],
    ["türkis", "turquoise"],
    ["creme", "cream"],
    ["crème", "cream"],
    ["cremefarben", "cream"],
    ["natur", "natural"],
    ["naturel", "natural"],
    ["holz", "natural"],
    ["bois", "natural"],
    ["silber", "silver"],
    ["argent", "silver"],
    ["argenté", "silver"],
    ["or", "gold"],
    ["doré", "gold"],
    ["elfenbein", "ivory"],
    ["ivoire", "ivory"],
    ["oliv", "olive"],
    ["bordeaux", "burgundy"],
    ["weinrot", "burgundy"],
    ["kaki", "khaki"],
    ["transparent", "clear"],
    ["klar", "clear"],
    ["bunt", "multicolour"],
    ["mehrfarbig", "multicolour"],
    ["multicolor", "multicolour"],
    ["multi-coloured", "multicolour"],
    ["multicolore", "multicolour"],
    ["dunkelblau", "dark blue"],
    ["bleu foncé", "dark blue"],
    ["bleu marine", "navy"],
    ["navy blue", "navy"],
    ["hellblau", "light blue"],
    ["bleu clair", "light blue"],
    ["dunkelgrün", "dark green"],
    ["vert foncé", "dark green"],
    ["hellgrün", "light green"],
    ["vert clair", "light green"],
    ["dunkelgrau", "dark grey"],
    ["gris foncé", "dark grey"],
    ["hellgrau", "light grey"],
    ["gris clair", "light grey"],
    ["dunkelbraun", "dark brown"],
    ["brun foncé", "dark brown"],
    ["hellbraun", "light brown"],
    ["dunkelrot", "dark red"],
    ["rouge foncé", "dark red"],
    ["roségold", "rose gold"],
    ["offwhite", "off-white"],
    ["senf", "mustard"],
    ["moutarde", "mustard"],
    ["minze", "mint"],
    ["menthe", "mint"],
    ["koralle", "coral"],
    ["corail", "coral"],
    ["pfirsich", "peach"],
    ["pêche", "peach"],
    ["sable", "sand"],
    ["stein", "stone"],
    ["schiefer", "slate"],
    ["ardoise", "slate"],
  ])("EC-B9: synonym %j -> %j with confidence 95", (input, expected) => {
    expect(normalizeColor(input)).toMatchObject({ primary: expected, all: [expected], method: "synonym", confidence: 95 });
  });

  it.each([
    ["rosé gold", "rose gold"],
    ["Écru", "ecru"],
    ["TERRACOTTA", "terracotta"],
  ])("EC-B9: accent and case folding makes %j an exact match for %j", (input, expected) => {
    expect(normalizeColor(input)).toMatchObject({ primary: expected, all: [expected], method: "exact", confidence: 100 });
  });

  it.each([
    ["pale blue", "light blue"],
    ["deep red", "dark red"],
    ["light gray", "light grey"],
    ["dark gray", "dark grey"],
    ["hellrot", "red"],
    ["dunkelrosa", "pink"],
    ["bright white", "white"],
    ["bright red", "bright red"],
    ["light sky blue", "sky blue"],
  ])("EC-B9: modifier %j -> %j (compound when it exists, else the base colour)", (input, expected) => {
    expect(normalizeColor(input)).toMatchObject({ primary: expected, all: [expected] });
  });

  it.each([
    ["red/blue", ["red", "blue"]],
    ["red & blue", ["red", "blue"]],
    ["red, blue", ["red", "blue"]],
    ["red and blue", ["red", "blue"]],
    ["rot-blau", ["red", "blue"]],
    ["Blau/Weiß", ["blue", "white"]],
    ["schwarz-weiß", ["black", "white"]],
    ["Rot / Blau glänzend", ["red", "blue"]],
    ["red/red", ["red"]],
  ])("EC-B9: multi-colour %j -> %j with the first as primary", (input, expected) => {
    const result = normalizeColor(input);
    expect(result.all).toEqual(expected);
    expect(result.primary).toBe(expected[0]);
  });

  it.each([
    ["terracota", "terracotta"],
    ["terra cota", "terracotta"],
    ["Terracotta", "terracotta"],
    ["anthracit", "anthracite"],
    ["burgandy", "burgundy"],
    ["turqoise", "turquoise"],
    ["yelow", "yellow"],
    ["whte", "white"],
    ["sliver", "silver"],
  ])("EC-B9: typo %j -> %j", (input, expected) => {
    const result = normalizeColor(input);
    expect(result.primary).toBe(expected);
    expect(result.all).toEqual([expected]);
    expect(["exact", "fuzzy"]).toContain(result.method);
  });

  it("EC-B9: fuzzy matches score 75", () => {
    expect(normalizeColor("terracota")).toMatchObject({ method: "fuzzy", confidence: 75 });
  });

  it.each(["blu", "re", "ret", "gre"])("EC-B9: never fuzzy-matches a word shorter than four characters (%j)", (input) => {
    expect(normalizeColor(input)).toMatchObject({ primary: null, all: [], method: "none", confidence: 0 });
  });

  it.each(["20 cm", "large", "XL", "glossy", "///", "&&&", "12345"])("non-colour %j -> none", (input) => {
    expect(normalizeColor(input)).toEqual({ raw: input, primary: null, all: [], method: "none", confidence: 0 });
  });

  it.each<[string | null | undefined, string]>([
    [null, ""],
    [undefined, ""],
    ["", ""],
    ["   ", "   "],
    ["n/a", "n/a"],
    ["-", "-"],
    ["TBD", "TBD"],
  ])("EC-B13: placeholder %j -> none, raw kept as %j", (input, raw) => {
    expect(normalizeColor(input)).toEqual({ raw, primary: null, all: [], method: "none", confidence: 0 });
  });

  it("reports the weakest method of a multi-colour value", () => {
    expect(normalizeColor("red/terracota")).toMatchObject({ all: ["red", "terracotta"], method: "fuzzy", confidence: 75 });
    expect(normalizeColor("red/blau")).toMatchObject({ all: ["red", "blue"], method: "synonym", confidence: 95 });
  });

  it("is deterministic", () => {
    expect(normalizeColor("terracota")).toEqual(normalizeColor("terracota"));
  });

  it("never throws on odd input", () => {
    expect(() => normalizeColor("x".repeat(5000))).not.toThrow();
    expect(() => normalizeColor("\u0000\uFFFD\u200B")).not.toThrow();
  });
});

describe("extractColorTokens", () => {
  it.each([
    ["Hand-thrown terracota planter, dunkelblau glaze", ["terracotta", "dark blue"]],
    ["Blau/Weiß glasiert", ["blue", "white"]],
    ["Available in red or blue", ["red", "blue"]],
    ["light blue and dark blue", ["light blue", "dark blue"]],
    ["Rose gold finish, natural oak base", ["rose gold", "natural", "oak"]],
    ["red and red again", ["red"]],
    ["Hand-made", []],
    ["graphics card with sliver trim", []],
    ["", []],
  ])("EC-B9: %j -> %j in order of appearance, de-duplicated", (input, expected) => {
    expect(extractColorTokens(input)).toEqual(expected);
  });

  it("only fuzzy-matches long words in free text so 'hand' never becomes 'sand'", () => {
    expect(extractColorTokens("hand band land cold fine")).toEqual([]);
  });
});

describe("COLOR_VOCABULARY", () => {
  it("is a frozen list of unique lower-case canonical colours", () => {
    expect(Object.isFrozen(COLOR_VOCABULARY)).toBe(true);
    expect(COLOR_VOCABULARY.length).toBeGreaterThanOrEqual(70);
    expect(new Set(COLOR_VOCABULARY).size).toBe(COLOR_VOCABULARY.length);
    for (const colour of COLOR_VOCABULARY) expect(colour).toBe(colour.toLowerCase().trim());
    expect(COLOR_VOCABULARY).toContain("terracotta");
  });

  it("maps every entry to itself exactly", () => {
    for (const colour of COLOR_VOCABULARY) {
      expect(normalizeColor(colour)).toMatchObject({ primary: colour, method: "exact", confidence: 100 });
    }
  });
});
