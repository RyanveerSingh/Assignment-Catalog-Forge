import { describe, expect, it } from "vitest";
import { damerauLevenshtein, jaccard, trigramSet, trigramSimilarity } from "./similarity";

describe("trigramSimilarity", () => {
  it("is 1 for identical strings regardless of case, accents and punctuation", () => {
    expect(trigramSimilarity("Terracotta Planter", "terracotta-planter")).toBe(1);
    expect(trigramSimilarity("Café Tasse", "cafe tasse")).toBe(1);
  });

  it("EC-C9: near-identical titles score at or above the 0.85 badge threshold", () => {
    expect(trigramSimilarity("Terracotta Planter Classic", "Terracotta Planter Classics")).toBeGreaterThanOrEqual(0.85);
  });

  it("scores unrelated titles low", () => {
    expect(trigramSimilarity("Terracotta Planter", "Ceramic Mug")).toBeLessThan(0.2);
  });

  it.each([
    ["", "", 1],
    ["", "mug", 0],
    ["mug", "", 0],
  ])("empty handling: %j vs %j -> %d", (a, b, expected) => {
    expect(trigramSimilarity(a, b)).toBe(expected);
  });

  it("is symmetric", () => {
    expect(trigramSimilarity("Blue Mug", "Red Mug")).toBe(trigramSimilarity("Red Mug", "Blue Mug"));
  });

  it("never throws on non-string input", () => {
    expect(trigramSimilarity(undefined as unknown as string, null as unknown as string)).toBe(1);
  });
});

describe("trigramSet / jaccard", () => {
  it("pads so a three-letter word still has trigrams", () => {
    expect(trigramSet("mug")).toEqual(new Set(["  m", " mu", "mug", "ug "]));
  });

  it("jaccard of disjoint sets is 0 and of equal sets is 1", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });
});

describe("damerauLevenshtein", () => {
  it.each([
    ["", "", 0],
    ["abc", "abc", 0],
    ["", "abc", 3],
    ["abc", "", 3],
    ["kitten", "sitting", 3],
    ["abcd", "acbd", 1],
    ["tc pl 20", "tc pl 02", 1],
    ["tc pl 20", "tc pl 2", 1],
    ["tc pl 20", "tcpl20", 2],
    ["flaw", "lawn", 2],
  ])("distance(%j, %j) = %d", (a, b, expected) => {
    expect(damerauLevenshtein(a, b)).toBe(expected);
  });

  it("returns limit + 1 as soon as the limit is exceeded", () => {
    expect(damerauLevenshtein("kitten", "sitting", 2)).toBe(3);
    expect(damerauLevenshtein("a", "abcdef", 2)).toBe(3);
  });

  it("treats non-strings as empty", () => {
    expect(damerauLevenshtein(undefined as unknown as string, "ab")).toBe(2);
  });
});
