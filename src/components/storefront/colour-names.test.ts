import { describe, expect, it } from "vitest";
import type { PublishedVariant } from "@/db/schema";
import { colourSwatches, normaliseColourName, swatchColour } from "./colour-names";

function variant(options: Record<string, string>): PublishedVariant {
  return { sku: Object.values(options).join("-") || "one", options, priceCents: 100, currency: "EUR", compareAtCents: null, weightGrams: null, dimensions: null, imageIds: [] };
}

describe("swatchColour", () => {
  it.each([
    ["white", "#ffffff"],
    ["Weiß", "#ffffff"],
    ["blanc", "#ffffff"],
    ["dark blue", "#2b3f66"],
    ["Dunkelblau", "#2b3f66"],
    ["bleu foncé", "#2b3f66"],
    ["salbeigrün", "#9aa88a"],
    ["sage green", "#9aa88a"],
    ["vert sauge", "#9aa88a"],
    ["ochre", "#c68a3a"],
    ["Ocker", "#c68a3a"],
    ["ocre", "#c68a3a"],
    ["mustard", "#c9a227"],
    ["moutarde", "#c9a227"],
    ["grey", "#8a8580"],
    ["Gray", "#8a8580"],
    ["gris", "#8a8580"],
  ])("maps %j to %s in English, German and French", (name, css) => {
    expect(swatchColour(name)).toBe(css);
  });

  it("falls back to the hue word of a compound it does not know: last word first, then the first", () => {
    expect(swatchColour("ocean blue")).toBe("#3f5f8a");
    expect(swatchColour("vert olive")).toBe("#6f6b2e");
    expect(swatchColour("bleu canard")).toBe("#3f5f8a");
  });

  it("returns null for names it cannot place, so the card shows a neutral ring", () => {
    expect(swatchColour("multi")).toBeNull();
    expect(swatchColour("Glas")).toBeNull();
    expect(swatchColour("")).toBeNull();
    expect(swatchColour("   ")).toBeNull();
  });

  it("normalises accents, umlauts, case and punctuation", () => {
    expect(normaliseColourName("  Bleu-Foncé ")).toBe("bleu fonce");
    expect(normaliseColourName("SalbeiGrün")).toBe("salbeigruen");
    expect(normaliseColourName("Weiß/Grau")).toBe("weiss grau");
  });
});

describe("colourSwatches", () => {
  it("collects distinct colours across variants in sheet order, under any of the colour option names", () => {
    const { swatches, more } = colourSwatches([variant({ size: "S", Farbe: "grey" }), variant({ size: "M", Farbe: "Grey" }), variant({ size: "S", Farbe: "mustard" })]);
    expect(swatches.map((s) => s.name)).toEqual(["grey", "mustard"]);
    expect(swatches.map((s) => s.css)).toEqual(["#8a8580", "#c9a227"]);
    expect(more).toBe(0);
  });

  it("shows nothing for a single colour or for products without a colour option", () => {
    expect(colourSwatches([variant({ color: "white" })]).swatches).toEqual([]);
    expect(colourSwatches([variant({ size: "S" }), variant({ size: "M" })]).swatches).toEqual([]);
    expect(colourSwatches([]).swatches).toEqual([]);
  });

  it("caps the dots and counts the rest", () => {
    const names = ["white", "black", "grey", "blue", "green", "red", "pink"];
    const { swatches, more } = colourSwatches(names.map((c) => variant({ colour: c })));
    expect(swatches).toHaveLength(5);
    expect(more).toBe(2);
  });

  it("skips blank values and keeps unknown names with a null colour", () => {
    const { swatches } = colourSwatches([variant({ color: " " }), variant({ color: "multi" }), variant({ color: "ochre" })]);
    expect(swatches).toEqual([
      { name: "multi", css: null },
      { name: "ochre", css: "#c68a3a" },
    ]);
  });
});
