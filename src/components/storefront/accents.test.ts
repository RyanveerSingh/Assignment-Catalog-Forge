import { describe, expect, it } from "vitest";
import { splitAccents, stripAccents } from "./accents";

describe("splitAccents", () => {
  it.each([
    ["nothing *invented*.", [{ text: "nothing ", accent: false }, { text: "invented", accent: true }, { text: ".", accent: false }]],
    ["*Alles* aus dem Blatt", [{ text: "Alles", accent: true }, { text: " aus dem Blatt", accent: false }]],
    ["two *here* and *there*", [{ text: "two ", accent: false }, { text: "here", accent: true }, { text: " and ", accent: false }, { text: "there", accent: true }]],
    ["plain", [{ text: "plain", accent: false }]],
    ["", []],
  ])("%j splits into runs", (text, runs) => {
    expect(splitAccents(text)).toEqual(runs);
  });

  it("leaves an unbalanced asterisk as text instead of dropping words", () => {
    expect(splitAccents("5 * 3 = 15")).toEqual([{ text: "5 * 3 = 15", accent: false }]);
  });

  it("stripAccents returns the words only", () => {
    expect(stripAccents("Shop by *category*")).toBe("Shop by category");
    expect(stripAccents("a * b")).toBe("a * b");
  });
});
