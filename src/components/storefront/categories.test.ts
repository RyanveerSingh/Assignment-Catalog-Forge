import { describe, expect, it } from "vitest";
import { categoryTiles, flatLeaves, groupCategories, leafLabel, relatedLeaves, titleCase } from "./categories";

const LIST = [
  { category: "Home & Garden > Decor > Clocks", n: 1 },
  { category: "Home & Garden > Decor > Vases", n: 1 },
  { category: "Home & Garden > Kitchen & Dining > Food Storage", n: 1 },
  { category: "Home & Garden > Kitchen & Dining > Food Storage > Food Containers", n: 1 },
  { category: "Home & Garden > Furniture > Side Tables", n: 1 },
  { category: "Furniture > Outdoor Furniture", n: 1 },
  { category: "Furniture > Tables > Side Tables", n: 2 },
  { category: "Furniture > Living Room > Side Tables", n: 1 },
];

describe("leafLabel", () => {
  it.each([
    ["Home & Garden > Decor > Clocks", "Clocks"],
    ["furniture > tables > side tables", "Side Tables"],
    ["Furniture", "Furniture"],
    ["  Pots & Pans ", "Pots & Pans"],
    ["", ""],
  ])("%j → %j", (path, label) => {
    expect(leafLabel(path)).toBe(label);
  });
});

describe("titleCase", () => {
  it("capitalises word starts and leaves the rest alone", () => {
    expect(titleCase("pots & pans")).toBe("Pots & Pans");
    expect(titleCase("Side Tables")).toBe("Side Tables");
    expect(titleCase("USB hubs")).toBe("USB Hubs");
  });
});

describe("groupCategories", () => {
  const families = groupCategories(LIST);

  it("groups by first segment, sums counts and puts the biggest family first", () => {
    expect(families.map((f) => [f.family, f.n])).toEqual([
      ["Home & Garden", 5],
      ["Furniture", 4],
    ]);
  });

  it("deduplicates a leaf label inside a family: shortest path wins, counts add up", () => {
    const furniture = families.find((f) => f.family === "Furniture");
    const side = furniture?.leaves.find((l) => l.label === "Side Tables");
    expect(side).toEqual({ category: "Furniture > Tables > Side Tables", label: "Side Tables", n: 3 });
  });

  it("sorts leaves alphabetically for scanning", () => {
    expect(families[0]?.leaves.map((l) => l.label)).toEqual(["Clocks", "Food Containers", "Food Storage", "Side Tables", "Vases"]);
  });

  it("flatLeaves dedupes labels across families keeping the most populated", () => {
    const side = flatLeaves(families).filter((l) => l.label === "Side Tables");
    expect(side).toHaveLength(1);
    expect(side[0]?.n).toBe(3);
  });
});

describe("relatedLeaves", () => {
  const families = groupCategories(LIST);

  it("lists the children of a middle level", () => {
    expect(relatedLeaves(families, "Home & Garden > Decor").map((l) => l.label)).toEqual(["Clocks", "Vases"]);
  });

  it("falls back to the family's other leaves for a leaf", () => {
    const labels = relatedLeaves(families, "Home & Garden > Decor > Clocks").map((l) => l.label);
    expect(labels).not.toContain("Clocks");
    expect(labels).toContain("Vases");
  });

  it("returns nothing for an unknown family", () => {
    expect(relatedLeaves(families, "Toys > Puzzles")).toEqual([]);
  });
});

describe("categoryTiles", () => {
  it("uses the families when there are at least two", () => {
    expect(categoryTiles(groupCategories(LIST)).map((t) => [t.label, t.n])).toEqual([
      ["Home & Garden", 5],
      ["Furniture", 4],
    ]);
  });

  it("falls back to the leaves of a lone family, and caps at eight", () => {
    const one = groupCategories(LIST.filter((c) => c.category.startsWith("Home")));
    expect(categoryTiles(one).map((t) => t.label)).toEqual(["Clocks", "Food Containers", "Food Storage", "Side Tables", "Vases"]);
    const many = groupCategories(Array.from({ length: 12 }, (_, i) => ({ category: `Family ${i}`, n: 1 })));
    expect(categoryTiles(many)).toHaveLength(8);
    expect(categoryTiles([])).toEqual([]);
  });
});
