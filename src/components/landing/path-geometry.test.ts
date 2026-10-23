import { describe, expect, it } from "vitest";
import { buildPath } from "./path-geometry";

describe("buildPath", () => {
  it("draws a straight gutter line on narrow screens", () => {
    expect(buildPath({ width: 390, height: 2000 }, true)).toBe("M 7 0 L 7 2000");
  });

  it("starts at the right gutter, ends at the bottom and alternates sides on wide screens", () => {
    const d = buildPath({ width: 1200, height: 1920 }, false);
    const curves = d.match(/ C /g) ?? [];
    expect(d.startsWith("M 1156 0")).toBe(true);
    expect(curves.length).toBe(3);
    expect(d.endsWith("44 1920")).toBe(true);
  });

  it("always has at least one bend, even for a short section", () => {
    expect(buildPath({ width: 1000, height: 200 }, false)).toContain(" C ");
  });
});
