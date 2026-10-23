import { describe, expect, it } from "vitest";
import { matchBadge } from "./photo-match-label";

describe("matchBadge", () => {
  it.each([
    ["image_column", 100, "Image column · 100", "neutral"],
    ["sku", 95, "SKU · 95", "neutral"],
    ["sku_stem", 85, "Stem · 85", "neutral"],
    ["handle", 80, "Handle · 80", "neutral"],
    ["fuzzy", 60, "Fuzzy · 60", "warning"],
    ["none", 0, "Unmatched · 0", "warning"],
  ])("EC-C12: %s at %i reads '%s' (%s)", (method, score, label, tone) => {
    const b = matchBadge(method, score);
    expect(b.label).toBe(label);
    expect(b.tone).toBe(tone);
  });

  it("EC-C13: a manual assignment reads 'Manual' without a score and carries the brand tone", () => {
    expect(matchBadge("manual", 100)).toEqual({ label: "Manual", tone: "brand", description: "assigned by hand" });
  });

  it("clamps and rounds odd scores and spells out unknown methods", () => {
    expect(matchBadge("sku", 101.6).label).toBe("SKU · 100");
    expect(matchBadge("sku", Number.NaN).label).toBe("SKU · 0");
    expect(matchBadge("some_new_method", 50).label).toBe("some new method · 50");
  });
});
