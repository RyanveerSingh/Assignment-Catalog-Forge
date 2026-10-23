"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "cn";
import { locateQuote } from "@/core/ai/quote";
import type { Issue } from "@/core/types";
import { statusLabel } from "@/lib/format";
import { CleaningXray } from "./cleaning-xray";
import type { SourceHighlight, SourceRow } from "./types";

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function cellId(row: number, column: string): string {
  return `src-${row}-${normaliseHeader(column).replace(/[^a-z0-9]+/g, "-")}`;
}

type Tone = NonNullable<SourceHighlight["tone"]>;

/** Brand for words that support the listing, destructive for words that contradict it; the chip that triggered it says which. */
const CELL_CLASS: Record<Tone, string> = {
  claim: "bg-brand-soft/50 ring-1 ring-inset ring-brand/60",
  guardrail: "bg-destructive/5 ring-1 ring-inset ring-destructive/50",
};
const MARK_CLASS: Record<Tone, string> = {
  claim: "-mx-0.5 rounded-[2px] bg-brand-soft px-0.5 text-ink ring-1 ring-brand",
  guardrail: "-mx-0.5 rounded-[2px] bg-destructive/15 px-0.5 text-ink ring-1 ring-destructive/70",
};

/** The cell text with the quoted words wrapped in <mark>; the plain text when the quote cannot be located in it. */
function CellText({ value, quote, tone }: { value: string; quote: string | undefined; tone: Tone }) {
  const span = quote ? locateQuote(value, quote) : null;
  if (!span) return <>{value}</>;
  return (
    <>
      {value.slice(0, span.start)}
      <mark data-quote className={MARK_CLASS[tone]}>
        {value.slice(span.start, span.end)}
      </mark>
      {value.slice(span.end)}
    </>
  );
}

/**
 * The raw sheet rows behind a product as compact key/value tables. A highlight (from a claim chip or a guardrail)
 * lights up one cell and marks the quoted words inside it, or the whole row when only a row is named, and scrolls
 * it into view. With `showCleaning` each row also carries its cleaning X-ray.
 */
export function SourceRows({ rows, highlight, showCleaning }: { rows: SourceRow[]; highlight: SourceHighlight | null; showCleaning: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wantedColumn = highlight?.column ? normaliseHeader(highlight.column) : null;
  const tone: Tone = highlight?.tone ?? "claim";

  useEffect(() => {
    if (!highlight || !containerRef.current) return;
    const cell = containerRef.current.querySelector<HTMLElement>(highlight.column ? `#${cellId(highlight.row, highlight.column)}` : `#src-row-${highlight.row}`);
    const target = cell?.querySelector<HTMLElement>("mark[data-quote]") ?? cell;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.rowNumber - b.rowNumber), [rows]);

  if (sorted.length === 0) return <p className="text-xs text-ink-muted">No source rows are attached to this product.</p>;

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {sorted.map((row) => {
        const rowLit = highlight?.row === row.rowNumber;
        const cells = Object.entries(row.raw).filter(([, v]) => v !== undefined && String(v).trim() !== "");
        return (
          <section key={row.rowNumber} id={`src-row-${row.rowNumber}`} aria-label={`Source row ${row.rowNumber}`} className={cn("border border-border bg-card", rowLit && !wantedColumn && "ring-1 ring-brand")}>
            <header className="flex flex-wrap items-center gap-2 border-b border-border bg-paper-deep/50 px-2 py-1">
              <span className="num text-[11px] font-medium text-ink">row {row.rowNumber}</span>
              {row.duplicateOfRow !== null ? <span className="text-[11px] text-ink-muted">duplicate of {row.duplicateOfRow}</span> : null}
              {row.status === "failed" || row.status === "needs_review" ? <span className="text-[11px] uppercase tracking-wide text-warning">{statusLabel(row.status)}</span> : null}
            </header>
            {cells.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-ink-muted">Empty row.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {cells.map(([column, value]) => {
                    const lit = rowLit && wantedColumn !== null && normaliseHeader(column) === wantedColumn;
                    return (
                      <tr key={column} className="border-b border-border/60 last:border-0">
                        <th scope="row" className="w-[38%] px-2 py-1 text-left align-top font-medium text-ink-muted">
                          {column}
                        </th>
                        <td id={cellId(row.rowNumber, column)} className={cn("px-2 py-1 align-top break-words whitespace-pre-wrap text-ink transition-colors", lit && CELL_CLASS[tone])}>
                          {lit ? <CellText value={String(value)} quote={highlight?.quote} tone={tone} /> : String(value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {showCleaning ? <CleaningXray entries={row.xray} /> : null}
          </section>
        );
      })}
    </div>
  );
}

const SEVERITY_CLASS: Record<Issue["severity"], string> = {
  error: "bg-destructive/10 text-destructive ring-destructive/25",
  warn: "bg-warning-soft text-warning ring-warning/25",
  info: "bg-info-soft text-info ring-info/25",
};

/** "price.ambiguous · EC-B5": the machine code and edge-case id, kept for the hover rather than the line. */
export function issueCodeTitle(it: Issue): string {
  return it.ec ? `${it.code} · EC-${it.ec}` : it.code;
}

/** Conflicts and issues from the deterministic grouping stage; the severity word is always printed. */
export function IssueList({ issues, emptyText = "None" }: { issues: Issue[]; emptyText?: string }) {
  if (issues.length === 0) return <p className="text-xs text-ink-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((it, i) => (
        <li key={`${it.code}-${it.row ?? ""}-${i}`} className="flex flex-wrap items-start gap-1.5 text-xs">
          <span className={cn("inline-flex h-4 shrink-0 items-center px-1 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset", SEVERITY_CLASS[it.severity])}>{it.severity}</span>
          <span className="text-ink" title={issueCodeTitle(it)}>
            {it.message}
          </span>
          {it.row !== undefined ? <span className="num text-[11px] text-ink-muted">row {it.row}</span> : null}
        </li>
      ))}
    </ul>
  );
}
