import { describe, expect, it } from "vitest";
import { phrasePattern, phrasesRegex, removeFromHtml, removeFromLine, repairSentence, stripFromListing, type ListingText } from "./strip";

describe("phrasePattern / phrasesRegex", () => {
  it.each([
    ["frost proof", "Frost-proof", true],
    ["frost proof", "frost proof", true],
    ["frost proof", "frostproof", false],
    ["organic", "inorganic", false],
    ["dishwasher safe", "Dishwasher–safe", true],
  ])("EC-D2: %j matches %j → %s", (folded, text, expected) => {
    expect(new RegExp(phrasePattern(folded), "iu").test(text)).toBe(expected);
  });

  it("EC-B15: with negation, the denial goes too, contractions included", () => {
    const re = phrasesRegex(["frost proof"], true);
    expect("It isn't frost-proof.".replace(re, "X")).toBe("It X.");
    expect("Nicht frost-proof".replace(phrasesRegex(["frost proof"], true), "X")).toBe("X");
  });

  it("prefers the longest phrase", () => {
    expect("Weather proof".replace(phrasesRegex(["weather", "weather proof"]), "X")).toBe("X");
  });
});

describe("removeFromHtml: no wreckage survives a removal (EC-D2)", () => {
  it.each<[string, string[], string | null]>([
    ["<p>100% organic.</p>", ["organic"], null],
    ["<p>Cover in 100% organic cotton. Zip closure.</p>", ["organic"], "<p>Zip closure.</p>"],
    ["<p>Planter in organic cotton and glaze.</p>", ["organic cotton"], "<p>Planter in glaze.</p>"],
    ["<p>Made with organic and recycled cotton.</p>", ["organic"], "<p>Made with recycled cotton.</p>"],
    ["<p>This pot is frost-proof and sturdy.</p>", ["frost proof"], "<p>This pot is sturdy.</p>"],
    ["<p>Mug. Frost-proof.</p>", ["frost proof"], "<p>Mug.</p>"],
    ["<p>UV-stable, scratch-proof and kid-friendly.</p>", ["scratch proof"], "<p>UV-stable, kid-friendly.</p>"],
    ["<p>UV-stable, scratch-proof and kid-friendly.</p>", ["kid"], null],
    ["<p>Frost-resistant, not frost-proof. Bring indoors.</p>", ["frost proof"], "<p>Frost-resistant. Bring indoors.</p>"],
    ["<p>Glazed mug (dishwasher-safe) for tea.</p>", ["dishwasher safe"], "<p>Glazed mug for tea.</p>"],
    ["<p>Stoneware mug.</p><ul><li>Dishwasher-safe</li><li>Hand-thrown</li></ul>", ["dishwasher safe"], "<p>Stoneware mug.</p><ul><li>Hand-thrown</li></ul>"],
    ["<p>Stoneware mug. Fully weatherproof and winter-hardy, can stay outside all winter.</p>", ["weatherproof", "winter hardy", "outside all winter"], "<p>Stoneware mug.</p>"],
    ["<p>Dishwasher-safe and microwave-safe.</p>", ["dishwasher safe", "microwave safe"], null],
    ["<p>Plain stoneware mug.</p>", ["organic"], "<p>Plain stoneware mug.</p>"],
  ])("%j minus %j → %j", (html, phrases, expected) => {
    const out = removeFromHtml(html, phrasesRegex(phrases, true));
    expect(out).toBe(expected);
    if (out) expect(out).not.toMatch(/<p>\s*[.,;:]?\s*<\/p>|\s[.,]|\s-\p{L}|%\s*[.<]|^<p>(?:and|or)\b/iu);
  });
});

describe("removeFromLine / repairSentence", () => {
  it.each([
    ["Frost-proof Terracotta Planter", ["frost proof"], "Terracotta Planter"],
    ["Organic", ["organic"], ""],
    ["terracotta, frost-proof", ["frost proof"], "terracotta"],
  ])("EC-D2: %j minus %j → %j", (line, phrases, expected) => {
    expect(removeFromLine(line, phrasesRegex(phrases, true))).toBe(expected);
  });

  it("drops a sentence that no longer reads as one", () => {
    expect(repairSentence("Made in \u0001.")).toBeNull();
    expect(repairSentence("Very \u0001.")).toBeNull();
    expect(repairSentence("Glazed, \u0001 and sturdy.")).toBe("Glazed, sturdy.");
  });
});

describe("stripFromListing", () => {
  it("EC-D2: strips title, description and attributes, dropping emptied attributes", () => {
    const listing: ListingText = {
      title: "Organic Cotton Apron",
      descriptionHtml: "<p>Apron in organic cotton. Two pockets.</p>",
      descriptionText: "Apron in organic cotton. Two pockets.",
      attributes: { material: "organic cotton", certification: "organic" },
    };
    stripFromListing(listing, ["organic"]);
    expect(listing).toEqual({
      title: "Cotton Apron",
      descriptionHtml: "<p>Apron in cotton. Two pockets.</p>",
      descriptionText: expect.stringContaining("Apron in cotton."),
      attributes: { material: "cotton" },
    });
  });
});
