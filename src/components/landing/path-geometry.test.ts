import { describe, expect, it } from "vitest";
import { buildPath } from "./path-geometry";

describe("buildPath", () => {
  it("draws a straight gutter line on narrow screens", () => {
    expect(buildPath({ width: 390, height: 2000 }, true)).toBe("M 7 0 L 7 2000");
  });

  it("falls back to an even snake when no section layout is known", () => {
    const d = buildPath({ width: 1200, height: 1920 }, false);
    expect(d.startsWith("M 1156 0")).toBe(true);
    expect((d.match(/ C /g) ?? []).length).toBe(3);
    expect(d.endsWith("44 1920")).toBe(true);
  });

  it("always has at least one bend, even for a short section", () => {
    expect(buildPath({ width: 1000, height: 200 }, false)).toContain(" C ");
  });

  it("crosses the page only inside the gaps between sections", () => {
    const boxes = [
      { top: 100, bottom: 900, left: 120, right: 1080 },
      { top: 1000, bottom: 1800, left: 120, right: 1080 },
    ];
    const d = buildPath({ width: 1200, height: 1900 }, false, boxes);
    expect(d).toBe("M 1156 0 C 1156 50, 44 50, 44 100 L 44 900 C 44 950, 1156 950, 1156 1000 L 1156 1800 C 1156 1850, 44 1850, 44 1900");
  });

  it("skips gaps too short to cross and keeps clear of content in a narrow gutter", () => {
    const boxes = [
      { top: 0, bottom: 500, left: 24, right: 796 },
      { top: 520, bottom: 1000, left: 24, right: 796 },
    ];
    const d = buildPath({ width: 820, height: 1000 }, false, boxes);
    expect(d).toBe("M 808 0 L 808 1000");
  });
});
