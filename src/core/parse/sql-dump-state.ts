/**
 * What the SQL-dump parser accumulates while scanning (tables, rows, skipped statements) and how
 * that becomes a ParsedSheet: the table with the most rows wins, the rest is reported as issues
 * (EC-A20–A22). Pure bookkeeping; the statement grammar lives in `sql-dump.ts`.
 */

import { issue, type Issue, type ParsedSheet, type RawRow } from "../types";
import { dedupeHeaders } from "./headers";

export interface TableData {
  name: string;
  /** Column names in first-seen order, exactly as written in the dump. */
  columns: string[];
  known: Set<string>;
  /** From CREATE TABLE; used when an INSERT or COPY carries no column list. */
  declared: string[] | null;
  rows: Array<Map<string, string>>;
  total: number;
  statements: number;
  issues: Issue[];
}

export interface DumpState {
  tables: Map<string, TableData>;
  declared: Map<string, string[]>;
  /** Statement kind → count, in first-seen order. */
  ignored: Map<string, number>;
  issues: Issue[];
  syntaxErrors: number;
  maxRows: number;
}

export const MAX_SYNTAX_ISSUES = 20;
const MAX_KINDS_LISTED = 5;

export function newDumpState(maxRows: number): DumpState {
  const cap = Number.isFinite(maxRows) && maxRows >= 0 ? Math.floor(maxRows) : Number.POSITIVE_INFINITY;
  return { tables: new Map(), declared: new Map(), ignored: new Map(), issues: [], syntaxErrors: 0, maxRows: cap };
}

export function tableFor(state: DumpState, name: string): TableData {
  let data = state.tables.get(name);
  if (!data) {
    data = { name, columns: [], known: new Set(), declared: state.declared.get(name) ?? null, rows: [], total: 0, statements: 0, issues: [] };
    state.tables.set(name, data);
  }
  return data;
}

export function addRow(state: DumpState, table: TableData, values: string[], names: string[] | null): void {
  const rowNumber = ++table.total;
  const keep = table.rows.length < state.maxRows;
  let keys: string[];
  if (names) {
    keys = names;
    if (keep && values.length !== names.length) pushRagged(table, values, names.length, rowNumber);
  } else {
    // No column list and no CREATE TABLE: generated names, widening as rows demand (EC-A7).
    if (keep && table.rows.length > 0 && values.length !== table.columns.length) pushRagged(table, values, table.columns.length, rowNumber);
    keys = values.map((_, i) => `column_${i + 1}`);
  }
  for (const key of keys) {
    if (!table.known.has(key)) {
      table.known.add(key);
      table.columns.push(key);
    }
  }
  if (!keep) return;
  const record = new Map<string, string>();
  keys.forEach((key, i) => record.set(key, values[i] ?? ""));
  table.rows.push(record);
}

function pushRagged(table: TableData, values: string[], width: number, rowNumber: number): void {
  if (values.length < width) {
    table.issues.push(issue("row.ragged", "info", `Row has ${values.length} cells but the header has ${width}; the missing cells were left empty.`, { row: rowNumber, ec: "A7" }));
    return;
  }
  const dropped = values.slice(width).filter((v) => v.trim() !== "");
  if (dropped.length === 0) return;
  table.issues.push(issue("row.ragged", "info", `Row has ${values.length} cells but the header has ${width}; ${dropped.length} extra cell(s) were dropped.`, { row: rowNumber, ec: "A7", value: dropped.join(" | ") }));
}

export function countIgnored(state: DumpState, kind: string): void {
  state.ignored.set(kind, (state.ignored.get(kind) ?? 0) + 1);
}

export function noteSyntaxError(state: DumpState, what: string): void {
  state.syntaxErrors++;
  if (state.syntaxErrors <= MAX_SYNTAX_ISSUES) {
    state.issues.push(issue("sql.syntax", "warn", `A statement could not be read and was skipped: ${what}.`, { ec: "A20" }));
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export function assemble(state: DumpState): ParsedSheet {
  const issues = [...state.issues];
  if (state.syntaxErrors > MAX_SYNTAX_ISSUES) {
    issues.push(issue("sql.syntax", "warn", `${state.syntaxErrors - MAX_SYNTAX_ISSUES} further statement(s) could not be read.`, { ec: "A20" }));
  }
  const ignored = ignoredIssue(state);
  const tables = [...state.tables.values()].filter((t) => t.total > 0);
  if (tables.length === 0) return declaredOnly(state, issues, ignored);

  const chosen = tables.reduce((best, t) => (t.total > best.total ? t : best));
  const others = tables.filter((t) => t !== chosen);
  const verb = `${chosen.statements} ${chosen.statements === 1 ? "statement" : "statements"}`;
  issues.push(issue("sql.table_used", "info", `Read as a SQL dump: table "${chosen.name}" (${chosen.total} rows from ${verb}). Nothing in the file was executed.`, { ec: "A20", value: chosen.name }));
  if (others.length > 0) {
    const named = others.map((t) => `"${t.name}" (${t.total} rows)`).join(", ");
    issues.push(issue("sql.tables_ignored", "info", `The dump holds ${tables.length} tables; the one with the most rows was used and the others were ignored: ${named}.`, { ec: "A21", value: others.map((t) => t.name).join(", ") }));
  }
  if (ignored) issues.push(ignored);
  issues.push(...chosen.issues);

  const originalHeaders = chosen.columns;
  const headers = dedupeHeaders(originalHeaders);
  const rows: RawRow[] = chosen.rows.map((record, i) => {
    const cells: Record<string, string> = {};
    headers.forEach((h, j) => {
      cells[h] = record.get(originalHeaders[j]) ?? "";
    });
    return { rowNumber: i + 1, cells };
  });
  const truncated = chosen.total > state.maxRows;
  if (truncated) issues.push(issue("sheet.truncated", "warn", `Rows ${state.maxRows + 1} and beyond were not imported`, { ec: "A14" }));
  return { headers, originalHeaders, headerRowIndex: 0, rows, totalRows: chosen.total, truncated, format: "sql", sheetName: chosen.name, issues };
}

/** CREATE TABLE without any rows behaves like a header-only sheet (EC-A16); nothing at all is an error. */
function declaredOnly(state: DumpState, issues: Issue[], ignored: Issue | null): ParsedSheet {
  const first = state.declared.entries().next();
  if (ignored) issues.push(ignored);
  if (first.done) {
    issues.push(issue("sql.no_rows", "error", "No INSERT or COPY statements with rows were found; this does not look like a database dump of a product table.", { ec: "A20" }));
    return emptySheet(issues);
  }
  const [name, columns] = first.value;
  issues.push(issue("sheet.no_data_rows", "info", `Table "${name}" is declared but the dump holds no rows for it.`, { ec: "A16" }));
  return { ...emptySheet(issues), headers: dedupeHeaders(columns), originalHeaders: columns, headerRowIndex: 0, sheetName: name };
}

function ignoredIssue(state: DumpState): Issue | null {
  if (state.ignored.size === 0) return null;
  const kinds = [...state.ignored.keys()];
  const total = [...state.ignored.values()].reduce((a, b) => a + b, 0);
  const listed = kinds.slice(0, MAX_KINDS_LISTED).join(", ") + (kinds.length > MAX_KINDS_LISTED ? `, +${kinds.length - MAX_KINDS_LISTED} more` : "");
  const noun = total === 1 ? "statement that does not insert rows was" : "statements that do not insert rows were";
  return issue("sql.statements_ignored", "info", `${total} ${noun} ignored (${listed}). Nothing in the file is executed.`, { ec: "A22", value: listed });
}

export function emptySheet(issues: Issue[]): ParsedSheet {
  return { headers: [], originalHeaders: [], headerRowIndex: -1, rows: [], totalRows: 0, truncated: false, format: "sql", issues };
}
