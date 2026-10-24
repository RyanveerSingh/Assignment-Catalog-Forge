import { issue, type Issue } from "../types";

/**
 * The row cap's message (EC-A14), shared by every format so a merchant always reads the same,
 * explicit sentence: how many rows the file has, how many were imported, and what to do.
 * `exact` is false when the count is only a lower bound (a workbook read with a row limit).
 */
export function truncatedIssue(maxRows: number, totalRows: number, exact: boolean): Issue {
  const cap = maxRows.toLocaleString("en-US");
  const first = (maxRows + 1).toLocaleString("en-US");
  const found = exact ? `${totalRows.toLocaleString("en-US")} data rows` : `more than ${cap} data rows`;
  const skipped = exact ? `Rows ${first}–${totalRows.toLocaleString("en-US")} were not imported` : `Rows ${first} and beyond were not imported`;
  return issue("sheet.truncated", "warn", `The sheet has ${found}; only the first ${cap} were imported (the limit per import). ${skipped}: split the file and import the rest separately.`, {
    ec: "A14",
    value: String(totalRows),
  });
}

/** Rows a workbook reader should load: the cap plus room for title rows, the header and blank rows above it. */
export function workbookRowLimit(maxRows: number): number {
  return Number.isFinite(maxRows) && maxRows >= 0 ? Math.floor(maxRows) + WORKBOOK_ROW_MARGIN : 0;
}

/** Header detection looks at the first 20 rows; this leaves slack for blank rows between them. */
export const WORKBOOK_ROW_MARGIN = 100;
