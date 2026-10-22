import { describe, expect, it } from "vitest";
import { inferOptionsFromTitle, stripOptionTokens } from "./options";

describe("inferOptionsFromTitle", () => {
  it.each([
    ["Terracotta Planter 20cm Blue", { size: "20 cm", color: "blue" }, "Terracotta Planter"],
    ["Terracotta Planter 20 cm", { size: "20 cm" }, "Terracotta Planter"],
    ["Planter Ø 30 cm", { size: "30 cm" }, "Planter"],
    ["Tray 30x20cm", { size: "30 x 20 cm" }, "Tray"],
    ["Cushion 40x40x10 cm", { size: "40 x 40 x 10 cm" }, "Cushion"],
    ["Cushion 12x8 in", { size: "30.5 x 20.3 cm" }, "Cushion"],
    ["Ruler 7.9 in", { size: "20.1 cm" }, "Ruler"],
    ["Shelf L 20 cm", { size: "20 cm" }, "Shelf"],
    ["T-Shirt XL", { size: "XL" }, "T-Shirt"],
    ["T-Shirt - Large", { size: "Large" }, "T-Shirt"],
    ["Men's Hoodie L", { size: "L" }, "Men's Hoodie"],
    ["Shirt Size 20", { size: "20 cm" }, "Shirt"],
    ["Shirt Size: M", { size: "M" }, "Shirt"],
    ["Töpfe Größe 20", { size: "20 cm" }, "Töpfe"],
  ])("EC-B18 size: %j -> %j, base %j", (title, options, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options, baseTitle });
  });

  it.each([
    ["Bottle 500 ml", { capacity: "500 ml" }, "Bottle"],
    ["Bottle 0.5 l", { capacity: "500 ml" }, "Bottle"],
    ["Jug 1 L", { capacity: "1 l" }, "Jug"],
    ["Can 2 liter", { capacity: "2 l" }, "Can"],
    ["Carafe 1,5 Liter", { capacity: "1.5 l" }, "Carafe"],
  ])("capacity: %j -> %j, base %j", (title, options, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options, baseTitle });
  });

  it.each([
    ["Mug Set of 4", { pack: "4" }, "Mug"],
    ["Tasse 4er Set", { pack: "4" }, "Tasse"],
    ["Bol lot de 4", { pack: "4" }, "Bol"],
    ["Mug 4-pack", { pack: "4" }, "Mug"],
    ["Glasses, pack of 6", { pack: "6" }, "Glasses"],
  ])("pack: %j -> %j, base %j", (title, options, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options, baseTitle });
  });

  it.each([
    ["Mug, Blue", { color: "blue" }, "Mug"],
    ["Mug (Dark Blue)", { color: "dark blue" }, "Mug"],
    ["Mug Navy Blue", { color: "navy" }, "Mug"],
    ["Mug Off-White", { color: "off-white" }, "Mug"],
    ["Mug in Blue", { color: "blue" }, "Mug"],
    ["Tasse Rot 20 cm", { size: "20 cm", color: "red" }, "Tasse"],
    ["Kerze Weiß 10cm", { size: "10 cm", color: "white" }, "Kerze"],
    ["Pot de fleurs bleu foncé 20 cm", { size: "20 cm", color: "dark blue" }, "Pot de fleurs"],
    ["Mug Red Blue", { color: "blue" }, "Mug Red"],
  ])("EC-C5 colour (last mention wins): %j -> %j, base %j", (title, options, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options, baseTitle });
  });

  it.each([
    ["Blue Mug", "Blue Mug"],
    ["Off-White Mug", "Off-White Mug"],
    ["Terracotta Planter", "Terracotta Planter"],
  ])("a leading colour word describes the product and stays: %j", (title, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options: {}, baseTitle });
  });

  it.each([
    ["Planter - 20 cm - Blue", { size: "20 cm", color: "blue" }, "Planter"],
    ["Vase / 20 cm / Blue", { size: "20 cm", color: "blue" }, "Vase"],
    ["Water Bottle 500 ml Blue", { capacity: "500 ml", color: "blue" }, "Water Bottle"],
    ["Mug 1 L", { capacity: "1 l" }, "Mug"],
    ["Planter 20cm for 30cm pots", { size: "30 cm" }, "Planter 20cm for pots"],
  ])("combined tokens and separators: %j -> %j, base %j", (title, options, baseTitle) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options, baseTitle });
  });

  it("keeps the title when it consists only of tokens", () => {
    expect(inferOptionsFromTitle("20 cm")).toEqual({ options: { size: "20 cm" }, baseTitle: "20 cm" });
  });

  it.each([
    ["Garden Gnome"],
    ["Ceramic Mug"],
  ])("finds nothing in %j", (title) => {
    expect(inferOptionsFromTitle(title)).toEqual({ options: {}, baseTitle: title });
  });

  it("never throws on empty or non-string input", () => {
    expect(inferOptionsFromTitle("")).toEqual({ options: {}, baseTitle: "" });
    expect(inferOptionsFromTitle("   ")).toEqual({ options: {}, baseTitle: "" });
    expect(inferOptionsFromTitle(null as unknown as string)).toEqual({ options: {}, baseTitle: "" });
    expect(inferOptionsFromTitle(12 as unknown as string)).toEqual({ options: {}, baseTitle: "" });
  });
});

describe("stripOptionTokens", () => {
  it("returns the base title only", () => {
    expect(stripOptionTokens("Terracotta Planter 20cm Blue")).toBe("Terracotta Planter");
    expect(stripOptionTokens("Ceramic Mug")).toBe("Ceramic Mug");
  });
});
