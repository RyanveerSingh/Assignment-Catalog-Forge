"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "cn";
import type { Issue } from "@/core/types";
import type { SourceHighlight, SourceRow } from "./types";

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function cellId(row: number, column: string): string {
  return `src-${row}-${normaliseHeader(column).replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * The raw sheet rows behind a product as compact key/value tables. A highlight (from a claim chip) lights up
 * one cell, or the whole row when the claim only names a row, and scrolls it into view.
 */
export function SourceRows({ rows, highlight }: { rows: SourceRow[]; highlight: SourceHighlight | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wantedColumn = highlight?.column ? normaliseHeader(highlight.column) : null;

  useEffect(() => {
    if (!highlight || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(highlight.column ? `#${cellId(highlight.row, highlight.column)}` : `#src-row-${highlight.row}`);
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
              {row.status === "failed" || row.status === "needs_review" ? <span className="text-[11px] uppercase tracking-wide text-warning">{row.status.replace("_", " ")}</span> : null}
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
                        <td id={cellId(row.rowNumber, column)} className={cn("px-2 py-1 align-top break-words whitespace-pre-wrap text-ink transition-colors", lit && "bg-brand-soft ring-1 ring-inset ring-brand")}>
                          {String(value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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

/** Conflicts and issues from the deterministic grouping stage; the severity word is always printed. */
export function IssueList({ issues, emptyText = "None" }: { issues: Issue[]; emptyText?: string }) {
  if (issues.length === 0) return <p className="text-xs text-ink-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((it, i) => (
        <li key={`${it.code}-${it.row ?? ""}-${i}`} className="flex flex-wrap items-start gap-1.5 text-xs">
          <span className={cn("inline-flex h-4 shrink-0 items-center px-1 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset", SEVERITY_CLASS[it.severity])}>{it.severity}</span>
          <span className="text-ink">{it.message}</span>
          <span className="num text-[11px] text-ink-muted">
            {it.code}
            {it.row !== undefined ? ` · row ${it.row}` : ""}
            {it.ec ? ` · EC-${it.ec}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
