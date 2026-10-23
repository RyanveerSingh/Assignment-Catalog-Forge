import { describe, expect, it } from "vitest";
import { pickSlides, slideNumber, stepIndex } from "./slideshow";

describe("stepIndex", () => {
  it.each([
    [0, 3, 1, 1],
    [2, 3, 1, 0],
    [0, 3, -1, 2],
    [1, 3, -1, 0],
    [0, 3, 4, 1],
    [0, 3, -4, 2],
    [2, 1, 1, 0],
    [0, 0, 1, 0],
    [5, 3, 0, 2],
  ])("from %d of %d step %d → %d", (current, count, delta, expected) => {
    expect(stepIndex(current, count, delta)).toBe(expected);
  });
});

describe("pickSlides", () => {
  const img = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `img-${i}` }));

  it("takes the first three photographed products and skips the ones without a photo", () => {
    const products = [
      { handle: "a", images: img(1) },
      { handle: "b", images: img(0) },
      { handle: "c", images: img(2) },
      { handle: "d", images: img(1) },
      { handle: "e", images: img(1) },
    ];
    expect(pickSlides(products).map((p) => p.handle)).toEqual(["a", "c", "d"]);
  });

  it("returns fewer when the catalogue has fewer, and none for an empty catalogue", () => {
    expect(pickSlides([{ handle: "a", images: img(1) }]).map((p) => p.handle)).toEqual(["a"]);
    expect(pickSlides([{ handle: "a", images: img(0) }])).toEqual([]);
    expect(pickSlides([])).toEqual([]);
  });
});

describe("slideNumber", () => {
  it("pads to two digits", () => {
    expect(slideNumber(0)).toBe("01");
    expect(slideNumber(9)).toBe("10");
  });
});
