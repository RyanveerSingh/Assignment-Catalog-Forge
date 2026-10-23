import { describe, expect, it } from "vitest";
import { anglicizeCategoryHint, nearestTaxonomyPath, resolveSourceCategory, TAXONOMY } from "./taxonomy";

describe("resolveSourceCategory", () => {
  it.each([
    ["Animals & Pet Supplies > Pet Supplies > Pet Toys", "Animals & Pet Supplies > Pet Supplies > Pet Toys"],
    ["furniture > tables", "Furniture > Tables"],
    ["Home & Garden / Decor / Candles", "Home & Garden > Decor > Candles"],
    ["Haus & Garten > Dekoration > Kerzen", "Home & Garden > Decor > Candles"],
    ["Maison & Jardin > Cuisine & Salle à manger > Vaisselle", "Home & Garden > Kitchen & Dining > Tableware"],
    ["Office Supplies > Desk Accessories", "Office Supplies > Desk Accessories"],
    ["Haus & Garten > Garten > Gartenarbeit > Gießkannen", "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Watering Cans"],
    ["Fournitures de bureau > Fournitures générales > Papeterie > Carnets", "Office Supplies > General Office Supplies > Paper > Notebooks & Notepads"],
    ["Misc", null],
    ["", null],
    ["Products", null],
  ])("EC-D3: %j → %j", (raw, expected) => {
    expect(resolveSourceCategory(raw)).toBe(expected);
  });

  it("never invents a leaf the cell did not name", () => {
    const resolved = resolveSourceCategory("Haus & Garten > Beleuchtung");
    expect(resolved).not.toBeNull();
    expect(resolved!.split(" > ")).toHaveLength(2);
    expect(TAXONOMY.some((p) => p.startsWith(`${resolved} > `))).toBe(true);
  });
});

describe("nearestTaxonomyPath + anglicizeCategoryHint", () => {
  it("snaps near misses and unique leaf names, rejects junk", () => {
    expect(nearestTaxonomyPath("Home & Garden > Decor > Planter")).toBe("Home & Garden > Decor > Planters");
    expect(nearestTaxonomyPath("Planters")).toBe("Home & Garden > Decor > Planters");
    expect(nearestTaxonomyPath("Zzz")).toBeNull();
  });

  it("translates taxonomy words from German and French", () => {
    expect(anglicizeCategoryHint("Haus & Garten > Beleuchtung > Lampen")).toBe("home garden lighting lamps");
    expect(anglicizeCategoryHint("Jouets")).toBe("toys");
  });
});
