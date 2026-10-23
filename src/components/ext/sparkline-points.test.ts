import { describe, expect, it } from "vitest";
import { sparklineArea, sparklineCoords, sparklinePoints } from "./sparkline-points";

const BOX = { width: 100, height: 20, pad: 0 };

describe("sparklineCoords", () => {
  it("spaces points evenly and scales the maximum to the top", () => {
    expect(sparklineCoords([0, 5, 10], BOX)).toEqual([
      [0, 20],
      [50, 10],
      [100, 0],
    ]);
  });

  it("keeps a flat series on the baseline instead of dividing by zero", () => {
    expect(sparklineCoords([0, 0, 0, 0], BOX)).toEqual([
      [0, 20],
      [33.3, 20],
      [66.7, 20],
      [100, 20],
    ]);
  });

  it("places a single value mid-width at the top", () => {
    expect(sparklineCoords([7], BOX)).toEqual([[50, 0]]);
  });

  it("returns nothing for an empty series", () => {
    expect(sparklineCoords([], BOX)).toEqual([]);
    expect(sparklinePoints([], BOX)).toBe("");
    expect(sparklineArea([], BOX)).toBe("");
  });

  it("respects the inset so edge strokes are not clipped", () => {
    expect(sparklineCoords([0, 10], { width: 100, height: 20, pad: 2 })).toEqual([
      [2, 18],
      [98, 2],
    ]);
  });

  it("treats negative and non-finite values as zero", () => {
    expect(sparklineCoords([-5, Number.NaN, 10], BOX)).toEqual([
      [0, 20],
      [50, 20],
      [100, 0],
    ]);
  });
});

describe("sparklinePoints and sparklineArea", () => {
  it("prints a polyline and closes the area down to the baseline", () => {
    expect(sparklinePoints([0, 10], BOX)).toBe("0,20 100,0");
    expect(sparklineArea([0, 10], BOX)).toBe("0,20 0,20 100,0 100,20");
  });

  it("closes the area at the padded baseline", () => {
    expect(sparklineArea([10], { width: 10, height: 10, pad: 1 })).toBe("5,9 5,1 5,9");
  });
});
