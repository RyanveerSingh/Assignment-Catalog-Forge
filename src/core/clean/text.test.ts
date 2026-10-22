import { describe, expect, it } from "vitest";
import { cleanCell, foldForMatch, isPlaceholder, normalizeText, repairMojibake, truncateForModel } from "./text";

describe("normalizeText", () => {
  it.each([
    ["EC-B13: NBSP becomes a space", "Terracotta\u00A0planter", "Terracotta planter"],
    ["EC-B13: narrow, figure and thin spaces become spaces", "20\u202Fcm\u2007x\u200920", "20 cm x 20"],
    ["EC-B13: zero-width characters, BOM and soft hyphen are removed", "\uFEFFTerra\u200Bcotta\u200C\u200D pot\u00AD", "Terracotta pot"],
    ["CRLF and CR become LF", "a\r\nb\rc", "a\nb\nc"],
    ["C0 controls are removed, tab and newline kept", "a\u0000b\u0007c\td\ne", "abc d\ne"],
    ["runs of spaces and tabs collapse to one space", "a   b\t\tc \t d", "a b c d"],
    ["three or more newlines collapse to two", "a\n\n\n\nb", "a\n\nb"],
    ["spaces around newlines are dropped", "a \n \n \n b", "a\n\nb"],
    ["trims", "  x  ", "x"],
    ["NFC composes decomposed accents", "Größe", "Größe"],
    ["EC-B13: smart quotes are kept as typed", "“Hand-thrown” pot’s", "“Hand-thrown” pot’s"],
    ["EC-B16: emoji, CJK and right-to-left text are preserved", "🌿 陶器の鉢 مزهرية", "🌿 陶器の鉢 مزهرية"],
    ["empty stays empty", "", ""],
  ])("%s", (_name, input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

describe("isPlaceholder (EC-B13)", () => {
  it.each([
    "", " ", "-", "–", "—", "n/a", "N/A", "n.a.", "na", "null", "NULL", "none", "nil", "tbd", "TBD", "tba", "?", "#N/A",
    "#REF!", "#VALUE!", "#DIV/0!", "unknown", "k.a.", "keine Angabe", "nicht verfügbar", "non applicable", "s/o",
    "sans objet", "-/-", ".", "--", "...", "???", "\u00A0", "\u200B",
  ])("treats %j as a placeholder", (value) => {
    expect(isPlaceholder(value)).toBe(true);
  });

  it.each(["0", "x", "no", "0.0", "red", "N/A is fine", "na-1", "TC-PL-20", "1"])("keeps %j as a value", (value) => {
    expect(isPlaceholder(value)).toBe(false);
  });

  it("treats null and undefined as placeholders", () => {
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder(undefined)).toBe(true);
  });
});

describe("cleanCell", () => {
  it.each<[string, string | null | undefined, string | null]>([
    ["EC-B13: placeholder becomes null", "  N/A ", null],
    ["EC-B13: whitespace-only becomes null", "  \t", null],
    ["null stays null", null, null],
    ["undefined becomes null", undefined, null],
    ["trailing CRLF is trimmed", "Red\r\n", "Red"],
    ["EC-A4: mojibake is repaired", "GrÃ¶ÃŸe\u200B", "Größe"],
    ["EC-B13: NBSP inside the value becomes a space", "Terra\u00A0cotta", "Terra cotta"],
    ["EC-B16: emoji and CJK survive", "🌿 陶器の鉢", "🌿 陶器の鉢"],
    ["a dash with text is not a placeholder", "- 20 cm", "- 20 cm"],
  ])("%s", (_name, input, expected) => {
    expect(cleanCell(input)).toBe(expected);
  });
});

describe("repairMojibake (EC-A4)", () => {
  it.each<[string, string, string, boolean]>([
    ["EC-A4: UTF-8 read as Windows-1252", "GrÃ¶ÃŸe", "Größe", true],
    ["EC-A4: en dash via the cp1252 0x80–0x9F range", "terracotta â€“ 20 cm", "terracotta – 20 cm", true],
    ["EC-A4: clean text is never repaired into garbage", "Größe", "Größe", false],
    ["EC-A4: mixed clean and damaged parts", "Größe GrÃ¶ÃŸe", "Größe Größe", true],
    ["EC-A4: ß followed by a dash is left alone next to real damage", "Maß–Größe GrÃ¶ÃŸe", "Maß–Größe Größe", true],
    ["EC-A4: French accent", "CafÃ©", "Café", true],
    ["EC-A4: four-byte emoji sequence", "ðŸ˜€", "😀", true],
    ["EC-A4: three-byte CJK sequences", "ä¸\u00ADæ–‡", "中文", true],
    ["EC-A4: double-encoded text is repaired in passes", "GrÃƒÂ¶ÃƒÅ¸e", "Größe", true],
    ["EC-A4: double-encoded NBSP lead byte", "Ã‚\u00A0x", "\u00A0x", true],
    ["EC-A4: replacement-character mojibake is left, the rest repaired", "ï¿½ GrÃ¶ÃŸe", "ï¿½ Größe", true],
    ["plain ASCII is untouched", "Hand-thrown pot", "Hand-thrown pot", false],
    ["EC-A4: a lone lead character without continuation is untouched", "Ã la carte", "Ã la carte", false],
    ["empty", "", "", false],
  ])("%s", (_name, input, expected, repaired) => {
    const result = repairMojibake(input);
    expect(result).toEqual({ text: expected, repaired });
    expect(result.text).not.toContain("\uFFFD");
  });

  it("EC-A4: is idempotent", () => {
    const once = repairMojibake("GrÃ¶ÃŸe â€“ CafÃ©").text;
    expect(repairMojibake(once)).toEqual({ text: once, repaired: false });
  });
});

describe("foldForMatch", () => {
  it.each([
    ["Größe", "grosse"],
    ["Terra-Cotta!", "terra cotta"],
    ["Æon Œuvre Øl Łódź Đakovo", "aeon oeuvre ol lodz dakovo"],
    ["  Café   au  lait ", "cafe au lait"],
    ["ÜBERTOPF 20cm / blau", "ubertopf 20cm blau"],
    ["陶器の鉢", "陶器の鉢"],
    ["off-white (matte)", "off white matte"],
    ["", ""],
  ])("folds %j to %j", (input, expected) => {
    expect(foldForMatch(input)).toBe(expected);
  });

  it("is deterministic", () => {
    const input = "Übertopf Terra-Cotta Größe Ø20";
    expect(foldForMatch(input)).toBe(foldForMatch(input));
  });
});

describe("truncateForModel", () => {
  const SUFFIX = " [truncated]";

  it("leaves short text alone", () => {
    expect(truncateForModel("short")).toEqual({ text: "short", truncated: false });
  });

  it("leaves text exactly at the limit alone", () => {
    const text = "a".repeat(50);
    expect(truncateForModel(text, 50)).toEqual({ text, truncated: false });
  });

  it("truncates to the default budget and marks it", () => {
    const result = truncateForModel("word ".repeat(5000));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(result.text.endsWith(SUFFIX)).toBe(true);
  });

  it("respects a custom maximum and prefers a word boundary", () => {
    const result = truncateForModel("alpha beta gamma delta epsilon zeta eta theta", 30);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(30);
    expect(result.text).toBe("alpha beta gamma" + SUFFIX);
  });

  it("never splits a surrogate pair", () => {
    const result = truncateForModel("😀".repeat(100), 31);
    expect(result.truncated).toBe(true);
    expect(result.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
