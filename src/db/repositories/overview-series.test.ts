import { describe, expect, it } from "vitest";
import { dailySeries, sumLast, utcDayKey } from "./overview-series";

const NOON_OCT_23 = Date.UTC(2026, 9, 23, 12, 0, 0);

describe("utcDayKey", () => {
  it("prints the UTC calendar day, not the local one", () => {
    expect(utcDayKey(NOON_OCT_23)).toBe("2026-10-23");
    expect(utcDayKey(Date.UTC(2026, 9, 23, 23, 59, 59))).toBe("2026-10-23");
    expect(utcDayKey(Date.UTC(2026, 9, 24, 0, 0, 0))).toBe("2026-10-24");
  });
});

describe("dailySeries", () => {
  it("fills a dense window ending today, oldest first, with zeros where nothing happened", () => {
    const rows = [
      { day: "2026-10-23", value: 5 },
      { day: "2026-10-21", value: 2 },
    ];
    expect(dailySeries(rows, NOON_OCT_23, 4)).toEqual([0, 2, 0, 5]);
  });

  it("adds rows that fall on the same day and ignores rows outside the window", () => {
    const rows = [
      { day: "2026-10-23", value: 1 },
      { day: "2026-10-23", value: 4 },
      { day: "2026-09-01", value: 999 },
      { day: "2026-10-24", value: 999 },
    ];
    expect(dailySeries(rows, NOON_OCT_23, 3)).toEqual([0, 0, 5]);
  });

  it("returns all zeros for an empty result and an empty array for a zero-day window", () => {
    expect(dailySeries([], NOON_OCT_23, 14)).toEqual(Array.from({ length: 14 }, () => 0));
    expect(dailySeries([{ day: "2026-10-23", value: 3 }], NOON_OCT_23, 0)).toEqual([]);
  });

  it("treats a non-finite value as zero rather than poisoning the series", () => {
    expect(dailySeries([{ day: "2026-10-23", value: Number.NaN }], NOON_OCT_23, 2)).toEqual([0, 0]);
  });

  it("crosses a month boundary without skipping a day", () => {
    const nov2 = Date.UTC(2026, 10, 2, 8, 0, 0);
    const rows = [
      { day: "2026-10-31", value: 1 },
      { day: "2026-11-01", value: 2 },
      { day: "2026-11-02", value: 3 },
    ];
    expect(dailySeries(rows, nov2, 4)).toEqual([0, 1, 2, 3]);
  });
});

describe("sumLast", () => {
  it.each([
    [[1, 2, 3, 4], 2, 7],
    [[1, 2, 3, 4], 10, 10],
    [[1, 2, 3, 4], 0, 0],
    [[], 7, 0],
  ])("sums the newest %i of %j as %i", (series, n, expected) => {
    expect(sumLast(series, n)).toBe(expected);
  });
});
