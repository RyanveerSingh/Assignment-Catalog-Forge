import { describe, expect, it } from "vitest";
import { truncatedIssue, WORKBOOK_ROW_MARGIN, workbookRowLimit } from "./row-cap";

describe("truncatedIssue", () => {
  it("EC-A14: an exact count names the skipped range", () => {
    expect(truncatedIssue(10_000, 12_345, true)).toMatchObject({
      code: "sheet.truncated",
      severity: "warn",
      ec: "A14",
      message: "The sheet has 12,345 data rows; only the first 10,000 were imported (the limit per import). Rows 10,001–12,345 were not imported: split the file and import the rest separately.",
    });
  });

  it("EC-A14: a lower bound says 'more than'", () => {
    expect(truncatedIssue(10_000, 999_998, false).message).toBe(
      "The sheet has more than 10,000 data rows; only the first 10,000 were imported (the limit per import). Rows 10,001 and beyond were not imported: split the file and import the rest separately.",
    );
  });
});

describe("workbookRowLimit", () => {
  it.each([
    [10_000, 10_000 + WORKBOOK_ROW_MARGIN],
    [0, WORKBOOK_ROW_MARGIN],
    [5.7, 5 + WORKBOOK_ROW_MARGIN],
    [Number.POSITIVE_INFINITY, 0],
    [-1, 0],
    [Number.NaN, 0],
  ])("EC-A14: a cap of %d reads %d rows", (cap, expected) => {
    expect(workbookRowLimit(cap)).toBe(expected);
  });
});
