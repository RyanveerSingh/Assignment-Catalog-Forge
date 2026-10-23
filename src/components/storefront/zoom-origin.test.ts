import { describe, expect, it } from "vitest";
import { zoomOrigin } from "./zoom-origin";

const RECT = { left: 100, top: 50, width: 400, height: 500 };

describe("zoomOrigin", () => {
  it.each([
    [100, 50, { x: 0, y: 0 }],
    [300, 300, { x: 50, y: 50 }],
    [500, 550, { x: 100, y: 100 }],
    [233, 175, { x: 33.3, y: 25 }],
  ])("cursor at (%d, %d) anchors at %j", (x, y, expected) => {
    expect(zoomOrigin(x, y, RECT)).toEqual(expected);
  });

  it("clamps a cursor outside the frame to its edge", () => {
    expect(zoomOrigin(0, 0, RECT)).toEqual({ x: 0, y: 0 });
    expect(zoomOrigin(900, 900, RECT)).toEqual({ x: 100, y: 100 });
  });

  it("centres when the frame has no size yet", () => {
    expect(zoomOrigin(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 50, y: 50 });
  });
});
