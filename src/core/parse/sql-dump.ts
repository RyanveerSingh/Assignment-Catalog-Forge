/**
 * Read-only ingest of mysqldump / pg_dump output (EC-A20–A22). The text is scanned for
 * `INSERT … VALUES` tuples and `COPY … FROM stdin` blocks and turned into the same ParsedSheet a
 * CSV produces, so nothing downstream changes. Nothing is ever executed: CREATE TABLE is read only
 * for column names and every other statement (DROP, SET, LOCK, ALTER, …) is skipped and counted.
 * Never throws; junk comes back as zero rows plus an error issue.
 */

import { issue, type ParsedSheet } from "../types";
import { addRow, assemble, countIgnored, emptySheet, newDumpState, noteSyntaxError, tableFor, type DumpState } from "./sql-dump-state";
import { SqlCursor } from "./sql-scanner";

export interface ParseSqlDumpOptions {
  /** Rows beyond this (for the chosen table) are counted but not returned (EC-A14). */
  maxRows: number;
}

const LEAD_SAMPLE_CHARS = 64 * 1024;
const DIALECT_SAMPLE_CHARS = 256 * 1024;
/** What a dump starts with once comments are gone. `SET` needs `NAMES` or `=` so a CSV header "Set,Price" does not match. */
const LEAD_RE =
  /^(?:CREATE\s+(?:TEMPORARY\s+|UNLOGGED\s+)?(?:TABLE|SCHEMA|DATABASE|SEQUENCE|TYPE|EXTENSION)\b|(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\b|COPY\s+[^;]{1,500}?\bFROM\s+stdin\b|DROP\s+(?:TABLE|DATABASE|SCHEMA|SEQUENCE)\b|SET\s+(?:NAMES\b|\w+\s*=)|LOCK\s+TABLES\b|START\s+TRANSACTION\b|BEGIN\s*(?:TRANSACTION\b|;)|PRAGMA\s+\w+|USE\s+[`"\w]+\s*;|\\(?:restrict|connect)\b|SELECT\s+pg_catalog\.)/i;
const POSTGRES_RE = /\bFROM\s+stdin\b|standard_conforming_strings|pg_catalog\.|\bINSERT\s+INTO\s+"|CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"|public\.)|PostgreSQL database dump/i;
const SECOND_WORD_KINDS = new Set(["DROP", "ALTER", "LOCK", "UNLOCK", "START", "TRUNCATE", "DELETE", "GRANT", "REVOKE"]);
const INSERT_MODIFIERS = new Set(["IGNORE", "LOW_PRIORITY", "DELAYED", "HIGH_PRIORITY"]);
const CREATE_MODIFIERS = new Set(["TEMPORARY", "TEMP", "UNLOGGED", "GLOBAL", "LOCAL", "OR", "REPLACE"]);
/** A CREATE TABLE body item starting with one of these is a constraint, not a column. */
const CONSTRAINT_WORDS = new Set(["PRIMARY", "KEY", "INDEX", "UNIQUE", "CONSTRAINT", "FOREIGN", "CHECK", "FULLTEXT", "SPATIAL", "EXCLUDE", "LIKE", "PERIOD"]);
const STRING_PREFIX_RE = /^(?:E|N|_[A-Z0-9]+)$/;
const COPY_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
]);

/** True for text that starts (after comments and whitespace) like a dump, or for any `.sql` file. */
export function looksLikeSqlDump(text: string, filename?: string): boolean {
  if (filename && /\.sql$/i.test(filename.trim())) return true;
  const c = new SqlCursor(text.slice(0, LEAD_SAMPLE_CHARS).replace(/^﻿/, ""));
  c.skipSpaceAndComments();
  while (c.peek() === ";") {
    c.pos++; // what mysqldump's `/*!40101 … */;` conditionals leave behind
    c.skipSpaceAndComments();
  }
  return LEAD_RE.test(c.text.slice(c.pos, c.pos + 600));
}

export function parseSqlDump(text: string, opts: ParseSqlDumpOptions): ParsedSheet {
  try {
    return parse(text, opts);
  } catch (err) {
    return emptySheet([issue("sheet.unreadable", "error", "The SQL dump could not be parsed.", { value: err instanceof Error ? err.message : String(err) })]);
  }
}

function parse(raw: string, opts: ParseSqlDumpOptions): ParsedSheet {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const c = new SqlCursor(text);
  c.backslashEscapes = !POSTGRES_RE.test(text.slice(0, DIALECT_SAMPLE_CHARS));
  const state = newDumpState(opts.maxRows);
  while (!c.eof()) {
    c.skipSpaceAndComments();
    if (c.eof()) break;
    const start = c.pos;
    readStatement(c, state);
    if (c.pos === start) c.pos++;
  }
  return assemble(state);
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function readStatement(c: SqlCursor, state: DumpState): void {
  const ch = c.peek();
  if (ch === "\\") {
    // psql meta-commands (\connect, \restrict) end at the line, not at a semicolon.
    const line = c.readLine();
    countIgnored(state, line.split(/\s+/)[0]);
    return;
  }
  if (ch === ";") {
    c.pos++; // what a `/*!40101 … */;` conditional comment leaves behind
    return;
  }
  const word = c.readWord();
  if (word === "INSERT" || word === "REPLACE") return parseInsert(c, state);
  if (word === "CREATE") return parseCreate(c, state);
  if (word === "COPY") return parseCopy(c, state);
  countIgnored(state, word ? kindLabel(c, word) : "unparseable text");
  c.skipStatement();
}

function parseInsert(c: SqlCursor, state: DumpState): void {
  while (INSERT_MODIFIERS.has(peekKeyword(c))) c.readWord();
  if (!c.matchKeyword("INTO")) return skipBroken(c, state, "INSERT without INTO");
  const table = c.readQualifiedName();
  if (table === null) return skipBroken(c, state, "INSERT without a table name");
  c.skipSpaceAndComments();
  let columns: string[] | null = null;
  if (c.peek() === "(") {
    columns = readNameList(c);
    if (columns === null) return skipBroken(c, state, `INSERT INTO ${table}: unreadable column list`);
  }
  if (c.matchKeyword("OVERRIDING")) {
    if (!c.matchKeyword("SYSTEM")) c.matchKeyword("USER");
    c.matchKeyword("VALUE");
  }
  if (!c.matchKeyword("VALUES") && !c.matchKeyword("VALUE")) {
    countIgnored(state, "INSERT without a VALUES list");
    c.skipStatement();
    return;
  }
  const data = tableFor(state, table);
  data.statements++;
  const names = columns ?? data.declared;
  for (;;) {
    c.skipSpaceAndComments();
    if (c.peek() !== "(") return skipBroken(c, state, `INSERT INTO ${table}: expected "(" at "${c.text.slice(c.pos, c.pos + 40)}"`);
    const values = readTuple(c);
    if (values === null) return skipBroken(c, state, `INSERT INTO ${table}: unreadable VALUES tuple near row ${data.total + 1}`);
    addRow(state, data, values, names);
    c.skipSpaceAndComments();
    if (c.peek() !== ",") break;
    c.pos++;
  }
  c.skipStatement(); // `ON DUPLICATE KEY UPDATE …`, `ON CONFLICT …`, `RETURNING …` and the semicolon
}

function parseCreate(c: SqlCursor, state: DumpState): void {
  c.skipSpaceAndComments();
  let word = c.readWord();
  while (word !== "TABLE" && CREATE_MODIFIERS.has(word)) {
    c.skipSpaceAndComments();
    word = c.readWord();
  }
  if (word !== "TABLE") {
    countIgnored(state, word ? `CREATE ${word}` : "CREATE");
    c.skipStatement();
    return;
  }
  if (c.matchKeyword("IF")) {
    c.matchKeyword("NOT");
    c.matchKeyword("EXISTS");
  }
  const name = c.readQualifiedName();
  c.skipSpaceAndComments();
  if (name === null || c.peek() !== "(") {
    countIgnored(state, "CREATE TABLE");
    c.skipStatement();
    return;
  }
  const columns = readDefinitions(c).map(columnOf).filter((col): col is string => col !== null);
  if (columns.length > 0) {
    state.declared.set(name, columns);
    const existing = state.tables.get(name);
    if (existing && existing.declared === null) existing.declared = columns;
  }
  c.skipStatement();
}

function parseCopy(c: SqlCursor, state: DumpState): void {
  const table = c.readQualifiedName();
  if (table === null) {
    countIgnored(state, "COPY");
    c.skipStatement();
    return;
  }
  c.skipSpaceAndComments();
  const columns = c.peek() === "(" ? readNameList(c) : null;
  const headerStart = c.pos;
  const terminated = c.skipStatement();
  const header = c.text.slice(headerStart, c.pos);
  if (!terminated || !/\bFROM\s+stdin\b/i.test(header)) {
    countIgnored(state, "COPY");
    return;
  }
  if (c.peek() === "\n") c.pos++;
  if (/\bcsv\b/i.test(header)) {
    state.issues.push(issue("sql.copy_csv", "warn", `The COPY block for "${table}" is in CSV format, which is not supported; dump with pg_dump's default text format.`, { ec: "A20" }));
    readCopyLines(c, () => undefined);
    return;
  }
  const data = tableFor(state, table);
  data.statements++;
  const names = columns ?? data.declared;
  const closed = readCopyLines(c, (line) => addRow(state, data, line.split("\t").map(unescapeCopy), names));
  if (!closed) state.issues.push(issue("sql.copy_unterminated", "warn", `The COPY block for "${table}" has no closing "\\." line; rows up to the end of the file were used.`, { ec: "A20" }));
}

/** Feeds data lines to `onLine` until the `\.` terminator. Returns false when the file ended first. */
function readCopyLines(c: SqlCursor, onLine: (line: string) => void): boolean {
  while (!c.eof()) {
    const line = c.readLine();
    if (line === "\\.") return true;
    if (line !== "") onLine(line);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pieces of statements
// ---------------------------------------------------------------------------

/** `(a, b, c)` at the cursor → names; null on anything unexpected. */
function readNameList(c: SqlCursor): string[] | null {
  c.pos++;
  const names: string[] = [];
  for (;;) {
    c.skipSpaceAndComments();
    const name = c.readIdentifier();
    if (name === null) return null;
    names.push(name);
    c.skipSpaceAndComments();
    const ch = c.peek();
    if (ch !== "," && ch !== ")") return null;
    c.pos++;
    if (ch === ")") return names;
  }
}

/** `(v1, v2, …)` at the cursor → cell texts; null on a syntax error. */
function readTuple(c: SqlCursor): string[] | null {
  c.pos++;
  const values: string[] = [];
  for (;;) {
    c.skipSpaceAndComments();
    if (c.peek() === ")" && values.length === 0) {
      c.pos++;
      return values;
    }
    const value = readValue(c);
    if (value === null) return null;
    values.push(value);
    c.skipSpaceAndComments();
    const ch = c.peek();
    // Leave an unexpected character in place so the recovery skip sees it (a quote eaten here desyncs the file).
    if (ch !== "," && ch !== ")") return null;
    c.pos++;
    if (ch === ")") return values;
  }
}

/** NULL → "", quoted strings unescaped, everything else (numbers, NOW(), DEFAULT) verbatim. */
function readValue(c: SqlCursor): string | null {
  const ch = c.peek();
  if (ch === "'" || ch === '"') return readLiteral(c, c.backslashEscapes);
  const word = c.peekWord();
  if (word) {
    const after = c.peek(word.length);
    if (after === "'" && STRING_PREFIX_RE.test(word)) {
      c.pos += word.length;
      return readLiteral(c, c.backslashEscapes || word === "E");
    }
    if (word === "NULL" && after !== "'") {
      c.pos += 4;
      return "";
    }
  }
  const raw = c.readRawToken();
  return raw === "" ? null : raw;
}

function readLiteral(c: SqlCursor, backslashEscapes: boolean): string | null {
  const literal = c.readString(backslashEscapes);
  return literal.unterminated ? null : literal.value;
}

/** The comma-separated items inside the `( … )` at the cursor, raw. */
function readDefinitions(c: SqlCursor): string[] {
  c.pos++;
  const items: string[] = [];
  for (;;) {
    c.skipSpaceAndComments();
    const item = c.readRawToken();
    if (item !== "") items.push(item);
    const ch = c.peek();
    c.pos++;
    if (ch !== ",") return items;
  }
}

function columnOf(definition: string): string | null {
  const c = new SqlCursor(definition);
  const quoted = c.peek() === "`" || c.peek() === '"' || c.peek() === "[";
  const name = c.readIdentifier();
  if (!name) return null;
  return !quoted && CONSTRAINT_WORDS.has(name.toUpperCase()) ? null : name;
}

function unescapeCopy(field: string): string {
  if (field === "\\N") return "";
  if (!field.includes("\\")) return field;
  return field.replace(/\\(x[0-9A-Fa-f]{1,2}|[0-7]{1,3}|[\s\S])/g, (_match, seq: string) => {
    if (seq.length > 1 && seq[0] === "x") return String.fromCharCode(Number.parseInt(seq.slice(1), 16));
    if (/^[0-7]+$/.test(seq)) return String.fromCharCode(Number.parseInt(seq, 8));
    return COPY_ESCAPES.get(seq) ?? seq;
  });
}

function skipBroken(c: SqlCursor, state: DumpState, what: string): void {
  noteSyntaxError(state, what);
  c.skipStatement();
}

function kindLabel(c: SqlCursor, word: string): string {
  if (!SECOND_WORD_KINDS.has(word)) return word;
  const second = peekKeyword(c);
  return second ? `${word} ${second}` : word;
}

function peekKeyword(c: SqlCursor): string {
  c.skipSpaceAndComments();
  return c.peekWord();
}
