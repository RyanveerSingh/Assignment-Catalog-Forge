/**
 * Buffer → ParsedSheet for CSV, XLSX and XLS uploads (EC-A4–A8, A12–A16). Never throws:
 * anything that cannot be parsed comes back as zero rows plus an error issue.
 */

import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import { issue, type CanonicalField, type Issue, type ParsedSheet, type RawRow } from "../types";
import { decodeText } from "./encoding";
import { detectDelimiter } from "./delimiter";
import { dedupeHeaders, detectHeaderRow, mapColumns } from "./headers";
import { sniffFileType, type FileKind, type SniffResult } from "./sniff";

export interface ParseSheetOptions {
  filename?: string;
  /** Data rows beyond this are counted but not returned (EC-A14). */
  maxRows: number;
}

type Grid = string[][];
type Format = ParsedSheet["format"];

interface Loaded {
  grid: Grid;
  format: Format;
  encoding?: string;
  delimiter?: string;
  sheetName?: string;
  issues: Issue[];
  /** The file could not be read at all; stop before header detection. */
  fatal?: boolean;
}

const DELIMITER_SAMPLE_CHARS = 20_000;
const MAPPING_SAMPLE_ROWS = 50;
const WIDTH_SAMPLE_ROWS = 200;
const VERY_LONG_CELL_CHARS = 20_000;
const SCIENTIFIC_RE = /^-?\d+(\.\d+)?E[+-]?\d+$/i;
const DATE_LIKE_RE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
/** Columns where a date can only be an Excel accident ("1-2" → "01/02/2024"). */
const DATE_SENSITIVE: ReadonlySet<CanonicalField> = new Set<CanonicalField>(["sku", "title", "barcode"]);

export function parseSheet(buf: Buffer, opts: ParseSheetOptions): ParsedSheet {
  try {
    return parse(buf, opts);
  } catch (err) {
    // Belt and braces: a library bug on a hostile file must surface as an issue, not a crash.
    return emptySheet("csv", [issue("sheet.unreadable", "error", "The file could not be parsed.", { value: errorMessage(err) })]);
  }
}

function parse(buf: Buffer, opts: ParseSheetOptions): ParsedSheet {
  const sniff = sniffFileType(buf, opts.filename);
  if (sniff.kind !== "csv" && sniff.kind !== "xlsx" && sniff.kind !== "xls") {
    return emptySheet("csv", [unsupportedIssue(sniff)]);
  }

  const issues: Issue[] = [];
  if (sniff.extensionMismatch) {
    issues.push(
      issue("sheet.extension_mismatch", "warn", `The file extension does not match its content; it was read as ${describeKind(sniff)}.`, { ec: "A2", value: sniff.kind }),
    );
  }

  const loaded = sniff.kind === "csv" ? loadCsv(buf) : loadWorkbook(buf, sniff.kind);
  issues.push(...loaded.issues);
  if (loaded.fatal) return { ...emptySheet(loaded.format, issues), sheetName: loaded.sheetName };
  return buildSheet(loaded, opts, issues);
}

// ---------------------------------------------------------------------------
// Loading a grid of text cells
// ---------------------------------------------------------------------------

function loadCsv(buf: Buffer): Loaded {
  const decoded = decodeText(buf);
  const { delimiter } = detectDelimiter(decoded.text.slice(0, DELIMITER_SAMPLE_CHARS));
  const result = Papa.parse<string[]>(decoded.text, { delimiter, header: false, skipEmptyLines: "greedy", quoteChar: '"' });
  const grid = dropBlankRows(result.data.map((row) => row.map(cellText)));
  const issues: Issue[] = [];
  if (result.errors.length > 0) {
    const first = result.errors[0];
    issues.push(
      issue("sheet.csv_errors", "warn", `${result.errors.length} CSV syntax problem(s) were found; cells on the affected rows may have shifted.`, {
        ec: "A6",
        value: first.message,
        ...(typeof first.row === "number" ? { row: first.row + 1 } : {}),
      }),
    );
  }
  return { grid, format: "csv", encoding: decoded.encoding, delimiter, issues };
}

function loadWorkbook(buf: Buffer, format: "xlsx" | "xls"): Loaded {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: "buffer", raw: false, cellText: true, cellDates: false, dense: true });
  } catch (err) {
    const message = "The workbook could not be read; it may be corrupt or password-protected.";
    return { grid: [], format, issues: [issue("sheet.unreadable", "error", message, { value: errorMessage(err) })], fatal: true };
  }

  const names = workbook.SheetNames;
  for (const name of names) {
    const sheet: unknown = workbook.Sheets[name];
    if (!sheet || typeof sheet !== "object") continue;
    const grid = dropBlankRows(sheetToGrid(sheet as XLSX.WorkSheet));
    if (grid.length === 0) continue;
    const issues: Issue[] = [];
    if (names.length > 1) {
      issues.push(issue("sheet.selected", "info", `Using sheet "${name}" (the first with data; the workbook has ${names.length} sheets).`, { ec: "A12", value: name }));
    }
    return { grid, format, sheetName: name, issues };
  }
  return { grid: [], format, sheetName: names[0], issues: [] };
}

function sheetToGrid(sheet: XLSX.WorkSheet): Grid {
  const rows: unknown = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  if (!Array.isArray(rows)) return [];
  return rows.map((row: unknown) => (Array.isArray(row) ? row.map(cellText) : []));
}

function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
}

// ---------------------------------------------------------------------------
// Header + rows
// ---------------------------------------------------------------------------

function buildSheet(loaded: Loaded, opts: ParseSheetOptions, issues: Issue[]): ParsedSheet {
  const { grid, format, encoding, delimiter, sheetName } = loaded;
  const header = detectHeaderRow(grid);
  if (!header) {
    issues.push(noHeaderIssue(grid));
    return { ...emptySheet(format, issues), encoding, delimiter, sheetName };
  }

  const dataRows = grid.slice(header.index + 1);
  const headerCells = trimTrailingEmpty(grid[header.index]);
  const width = typicalWidth(dataRows, headerCells.length);
  const originalHeaders = padTo(headerCells, width);
  const headers = dedupeHeaders(originalHeaders);
  const dateSensitive = dateSensitiveColumns(originalHeaders, dataRows.slice(0, MAPPING_SAMPLE_ROWS));
  const maxRows = normaliseMaxRows(opts.maxRows);

  const rows: RawRow[] = [];
  for (let i = 0; i < dataRows.length && i < maxRows; i++) {
    const rowNumber = i + 1;
    const cells = fitRow(dataRows[i], width, rowNumber, issues);
    flagCells(cells, headers, rowNumber, dateSensitive, issues);
    rows.push({ rowNumber, cells: toRecord(headers, cells) });
  }

  const totalRows = dataRows.length;
  const truncated = totalRows > maxRows;
  if (truncated) issues.push(issue("sheet.truncated", "warn", `Rows ${maxRows + 1} and beyond were not imported`, { ec: "A14" }));
  if (totalRows === 0) issues.push(issue("sheet.no_data_rows", "info", "The sheet has a header row but no data rows.", { ec: "A16" }));

  return { headers, originalHeaders, headerRowIndex: header.index, rows, totalRows, truncated, format, encoding, delimiter, sheetName, issues };
}

/** Pads short rows and drops cells past the header, recording either on the row (EC-A7). */
function fitRow(raw: string[], width: number, rowNumber: number, issues: Issue[]): string[] {
  if (raw.length === width) return raw;
  if (raw.length < width) {
    issues.push(issue("row.ragged", "info", `Row has ${raw.length} cells but the header has ${width}; the missing cells were left empty.`, { row: rowNumber, ec: "A7" }));
    return padTo(raw, width);
  }
  const dropped = raw.slice(width).filter((c) => c.trim() !== "");
  if (dropped.length > 0) {
    issues.push(
      issue("row.ragged", "info", `Row has ${raw.length} cells but the header has ${width}; ${dropped.length} extra cell(s) were dropped.`, {
        row: rowNumber,
        ec: "A7",
        value: dropped.join(" | "),
      }),
    );
  }
  return raw.slice(0, width);
}

function flagCells(cells: string[], headers: string[], rowNumber: number, dateSensitive: ReadonlySet<number>, issues: Issue[]): void {
  let longFlagged = false;
  cells.forEach((cell, col) => {
    const value = cell.trim();
    if (value === "") return;
    const field = headers[col];
    if (SCIENTIFIC_RE.test(value)) {
      issues.push(issue("cell.scientific_notation", "warn", `"${value}" is in scientific notation; Excel may have mangled a long number or code.`, { field, row: rowNumber, value, ec: "A13" }));
    }
    if (dateSensitive.has(col) && DATE_LIKE_RE.test(value)) {
      issues.push(issue("cell.date_like", "warn", `"${value}" looks like a date in the "${field}" column; Excel may have converted a value such as "1-2".`, { field, row: rowNumber, value, ec: "A13" }));
    }
    if (!longFlagged && cell.length > VERY_LONG_CELL_CHARS) {
      longFlagged = true;
      issues.push(issue("cell.very_long", "info", `A cell holds ${cell.length} characters; it is kept in full but will be shortened for the AI input.`, { field, row: rowNumber, ec: "A15" }));
    }
  });
}

function dateSensitiveColumns(originalHeaders: string[], sample: Grid): ReadonlySet<number> {
  const columns = new Set<number>();
  for (const m of mapColumns(originalHeaders, sample)) {
    if (m.canonical !== null && DATE_SENSITIVE.has(m.canonical)) columns.add(m.index);
  }
  return columns;
}

/**
 * The header row may be narrower than the data (an unlabelled trailing column). When at least
 * half the rows extend past the header, the extra columns get generated names instead of every
 * row being flagged as ragged; a lone wide row is still ragged (EC-A7).
 */
function typicalWidth(dataRows: Grid, headerWidth: number): number {
  const sample = dataRows.slice(0, WIDTH_SAMPLE_ROWS);
  if (sample.length === 0) return headerWidth;
  const counts = new Map<number, number>();
  let wider = 0;
  for (const row of sample) {
    const extent = trimTrailingEmpty(row).length;
    if (extent <= headerWidth) continue;
    wider++;
    counts.set(extent, (counts.get(extent) ?? 0) + 1);
  }
  if (wider / sample.length < 0.5) return headerWidth;
  let mode = headerWidth;
  let modeCount = 0;
  for (const [extent, count] of counts) {
    if (count > modeCount || (count === modeCount && extent < mode)) {
      mode = extent;
      modeCount = count;
    }
  }
  return mode;
}

// ---------------------------------------------------------------------------
// Issues and empty results
// ---------------------------------------------------------------------------

function unsupportedIssue(sniff: SniffResult): Issue {
  if (sniff.kind === "empty") return issue("sheet.unsupported_type", "error", "File is empty.", { ec: "A1", value: sniff.kind });
  const hint = sniff.kind === "html" ? " If this came from Excel, use Save As → CSV or XLSX." : "";
  return issue("sheet.unsupported_type", "error", `This looks like ${describeKind(sniff)}, not a spreadsheet. Upload a CSV or XLSX export.${hint}`, { ec: "A2", value: sniff.kind });
}

function describeKind(sniff: SniffResult): string {
  const names: Record<FileKind, string> = {
    csv: "a CSV text file",
    xlsx: "an Excel workbook (XLSX)",
    xls: "a legacy Excel workbook (XLS)",
    zip: "a ZIP archive",
    image: `an image${sniff.imageFormat ? ` (${sniff.imageFormat})` : ""}`,
    pdf: "a PDF document",
    html: "an HTML page",
    empty: "an empty file",
    unknown: "an unrecognised binary file",
  };
  return names[sniff.kind];
}

function noHeaderIssue(grid: Grid): Issue {
  const sample = grid
    .slice(0, 3)
    .map((row) => row.join(" | "))
    .join(" ⏎ ");
  const message = grid.length === 0 ? "No header row detected: the sheet has no rows." : "No header row detected in the first 20 rows.";
  return issue("sheet.no_header", "error", message, { ec: "A9", ...(sample ? { value: sample } : {}) });
}

function emptySheet(format: Format, issues: Issue[]): ParsedSheet {
  return { headers: [], originalHeaders: [], headerRowIndex: -1, rows: [], totalRows: 0, truncated: false, format, issues };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function dropBlankRows(grid: Grid): Grid {
  return grid.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function trimTrailingEmpty(row: string[]): string[] {
  let end = row.length;
  while (end > 0 && row[end - 1].trim() === "") end--;
  return row.slice(0, end);
}

function padTo(row: string[], width: number): string[] {
  return row.length >= width ? row : [...row, ...new Array<string>(width - row.length).fill("")];
}

function toRecord(headers: string[], cells: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((h, i) => {
    record[h] = cells[i] ?? "";
  });
  return record;
}

function normaliseMaxRows(maxRows: number): number {
  return Number.isFinite(maxRows) && maxRows >= 0 ? Math.floor(maxRows) : Number.POSITIVE_INFINITY;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
