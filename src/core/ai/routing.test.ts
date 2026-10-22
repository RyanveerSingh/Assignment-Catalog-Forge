import { describe, expect, it } from "vitest";
import type { ProductGroup } from "@/core/types";
import { escalateTier, routeTier } from "./routing";

function group(overrides: Partial<ProductGroup>): ProductGroup {
  return {
    productKey: "K",
    keySource: "single_row",
    title: "Terracotta Planter",
    descriptionHtml: "<p>Hand-thrown planter with drainage hole.</p>",
    descriptionText: "Hand-thrown planter with drainage hole.",
    category: null,
    brand: null,
    tags: [],
    notes: null,
    care: null,
    material: null,
    color: null,
    attributes: {},
    variants: [],
    sourceRows: [1],
    duplicateRows: [],
    conflicts: [],
    issues: [],
    language: { lang: "en", confidence: 90 },
    images: [],
    sourceCorpus: "",
    complexity: 10,
    sourceHash: "h",
    ...overrides,
  };
}

describe("routeTier", () => {
  it("sends clean rows to the cheap model", () => {
    expect(routeTier(group({}), 2).tier).toBe("cheap");
  });
  it("sends messy rows to the strong model", () => {
    expect(routeTier(group({ complexity: 60, conflicts: [{ code: "sku.conflict", severity: "error", message: "x" }] }), 0).tier).toBe("strong");
  });
  it("uses vision only when text is thin and photos exist", () => {
    expect(routeTier(group({ descriptionText: null, descriptionHtml: null }), 1).tier).toBe("vision");
    expect(routeTier(group({ descriptionText: null, descriptionHtml: null, complexity: 50 }), 0).tier).toBe("strong");
    expect(routeTier(group({ title: null }), 3).tier).toBe("vision");
  });
  it("EC-D1: escalation goes cheap → strong and stays there", () => {
    expect(escalateTier("cheap")).toBe("strong");
    expect(escalateTier("strong")).toBe("strong");
    expect(escalateTier("vision")).toBe("vision");
  });
});
