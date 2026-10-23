import { describe, expect, it } from "vitest";
import { foldForMatch } from "@/core/clean/text";
import { foldQuote, locateQuote } from "./quote";

describe("locateQuote", () => {
  it.each([
    ["frost-resistant (not frost-proof, bring indoors below 0 °C)", "not frost proof", "not frost-proof"],
    ["frost-resistant (not frost-proof, bring indoors below 0 °C)", "Not Frost-Proof", "not frost-proof"],
    ["Hand-thrown planter with drainage hole.", "hand thrown", "Hand-thrown"],
    ["Nicht tropffrei; immer in einem Halter verwenden. Innen und außen handgegossen.", "innen und aussen handgegossen", "Innen und außen handgegossen"],
    ["Café crème, 20 cm", "cafe creme", "Café crème"],
    ["Frostproof terracotta", "frostproof", "Frostproof"],
    ["Price: 1.299,00 €", "1 299 00", "1.299,00"],
    ["Hand-thrown planter with drainage hole.", "drainage hole", "drainage hole"],
  ])("EC-B15: finds %j → %j as %j", (cell, quote, expected) => {
    const span = locateQuote(cell, quote);
    expect(span).not.toBeNull();
    expect(cell.slice(span?.start, span?.end)).toBe(expected);
  });

  it.each([
    ["frost-resistant planter", "frost proof"],
    ["Frostproof terracotta", "frost proof"],
    ["", "anything"],
    ["anything", ""],
    ["Hand-thrown planter", "planter with drainage"],
  ])("returns null when %j does not contain %j", (cell, quote) => {
    expect(locateQuote(cell, quote)).toBeNull();
  });

  it("maps characters outside the basic plane without splitting surrogate pairs", () => {
    const cell = "Set of 3 🪴 frost-proof pots";
    const span = locateQuote(cell, "frost-proof pots");
    expect(cell.slice(span?.start, span?.end)).toBe("frost-proof pots");
  });

  it("prefers a whole-word match over an earlier substring", () => {
    const cell = "frostproof glaze; not frost-proof body";
    const span = locateQuote(cell, "frost proof");
    expect(cell.slice(span?.start, span?.end)).toBe("frost-proof");
  });

  it.each(["Nicht tropffrei; immer!", "  Café  crème ", "Größe: 20cm / Blau", "100% Baumwolle", "", "---"])("foldQuote agrees with foldForMatch on %j", (text) => {
    expect(foldQuote(text)).toBe(foldForMatch(text));
  });
});
