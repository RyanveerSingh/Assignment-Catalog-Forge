import { describe, expect, it } from "vitest";
import { findOriginClaims, originSupported, placeNames } from "./origin";

describe("findOriginClaims", () => {
  it.each([
    ["Stoneware mug. Made in Germany.", [{ phrase: "Made in Germany", place: "Germany" }]],
    ["Made in Portugal, hergestellt in Deutschland", [{ phrase: "Made in Portugal", place: "Portugal" }, { phrase: "hergestellt in Deutschland", place: "Deutschland" }]],
    ["Hand-made in natural jute", []],
    ["", []],
  ])("EC-D2: %j → %j", (text, expected) => {
    expect(findOriginClaims(text)).toEqual(expected);
  });
});

describe("originSupported", () => {
  it.each([
    ["EC-D2: a designer's country is not an origin", "Germany", "Designed in Germany, made in China.", false],
    ["EC-D2: the production clause backs its place", "China", "Designed in Germany, made in China.", true],
    ["EC-D2: an origin field", "Portugal", "Country of origin: Portugal", true],
    ["EC-D2: a 'Made in' column", "Portugal", "Made in: Portugal", true],
    ["EC-D2: a hand process names the origin (French)", "Nepal", "Grotte feutrée à la main au Népal en laine mérinos.", true],
    ["EC-D2: a German alias", "Germany", "Handgefertigt in Deutschland", true],
    ["EC-D2: a brand's home is not an origin", "Denmark", "Danish brand based in Denmark.", false],
    ["EC-D2: a place never mentioned", "Italy", "Stoneware mug, hand wash only.", false],
    ["EC-D2: the place in another sentence than the verb", "Spain", "Hand-thrown. Ships from Spain.", false],
  ])("%s", (_name, place, source, expected) => {
    expect(originSupported(place, source)).toBe(expected);
  });

  it("knows the names a supplier uses for a place", () => {
    expect(placeNames("Germany")).toEqual(["germany", "deutschland", "allemagne"]);
    expect(placeNames("Atlantis")).toEqual(["atlantis"]);
  });
});
