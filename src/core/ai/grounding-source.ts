import { foldForMatch, repairMojibake } from "@/core/clean/text";
import { findNegatedSpan, tokenizeClauses } from "./negation";
import { locateQuote } from "./quote";
import type { AiClaim } from "./schema";

/**
 * Looking things up in a product's raw source cells for the grounding validator: citations, terms,
 * quotes and negations. Every hit names the row, the column and the words as the supplier wrote them,
 * so the review drawer can mark the exact characters (EC-D2, B15).
 */

export interface SourceCell {
  /** The cell after mojibake repair: what the model read. */
  text: string;
  folded: string;
}

export interface SourceRowCells {
  row: number;
  cells: Record<string, SourceCell>;
}

export interface Found {
  row: number;
  column: string;
  quote: string;
}

/** Cells are matched after mojibake repair: the model quotes the readable text, the sheet may hold "auÃŸen" (EC-A4). */
export function prepareSourceRows(rows: Array<{ row: number; cells: Record<string, string> }>): SourceRowCells[] {
  return rows.map((r) => ({
    row: r.row,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([column, value]) => {
        const text = repairMojibake(value ?? "").text;
        return [column, { text, folded: foldForMatch(text) }];
      }),
    ),
  }));
}

/** The matched words as the supplier wrote them; the folded form when they cannot be located (HTML in between, say). */
function asWritten(cell: SourceCell, folded: string): string {
  const span = locateQuote(cell.text, folded);
  return span ? cell.text.slice(span.start, span.end) : folded;
}

function tokenContainment(needle: string, haystack: string): number {
  const n = needle.split(" ").filter(Boolean);
  if (n.length === 0) return 0;
  const h = new Set(haystack.split(" ").filter(Boolean));
  return n.filter((t) => h.has(t)).length / n.length;
}

/** The model's own citation, checked against the cell it names. */
export function verifyCitation(c: AiClaim, rows: SourceRowCells[], variants: string[]): Found | null {
  const row = rows.find((r) => r.row === c.source_row);
  if (!row) return null;
  const column = Object.keys(row.cells).find((k) => foldForMatch(k) === foldForMatch(c.source_column));
  const cell = column === undefined ? undefined : row.cells[column];
  if (column === undefined || cell === undefined) return null;
  const padded = ` ${cell.folded} `;
  const quote = foldForMatch(c.quote);
  const quoteOk = quote.length > 0 && (padded.includes(quote) || tokenContainment(quote, padded) >= 0.9);
  const termOk = variants.some((v) => padded.includes(` ${v} `));
  if (!quoteOk && !termOk) return null;
  return { row: row.row, column, quote: c.quote.trim().slice(0, 200) };
}

/** First cell that contains the term as a whole word. */
export function findTermInRows(rows: SourceRowCells[], variants: string[]): Found | null {
  for (const r of rows) {
    for (const [column, cell] of Object.entries(r.cells)) {
      const padded = ` ${cell.folded} `;
      const v = variants.find((x) => padded.includes(` ${x} `));
      if (v) return { row: r.row, column, quote: asWritten(cell, v) };
    }
  }
  return null;
}

/** The model's quote, looked for in every cell of the product's rows. One-word quotes prove nothing and are ignored. */
export function findQuoteInRows(rows: SourceRowCells[], quoteRaw: string): Found | null {
  const quote = foldForMatch(quoteRaw);
  if (quote.split(" ").filter(Boolean).length < 2) return null;
  for (const r of rows) {
    for (const [column, cell] of Object.entries(r.cells)) {
      const padded = ` ${cell.folded} `;
      if (padded.includes(` ${quote} `) || tokenContainment(quote, padded) >= 0.9) return { row: r.row, column, quote: quoteRaw.trim().slice(0, 200) };
    }
  }
  return null;
}

/** The cell where the source denies the term, quoting the denial as written: "not frost-proof". */
export function findNegationInRows(rows: SourceRowCells[], variants: string[]): Found | null {
  for (const r of rows) {
    for (const [column, cell] of Object.entries(r.cells)) {
      const tokens = tokenizeClauses(cell.text);
      const span = findNegatedSpan(tokens, variants);
      if (span) return { row: r.row, column, quote: asWritten(cell, tokens.slice(span.start, span.end).join(" ")) };
    }
  }
  return null;
}
