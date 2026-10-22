"use client";

import { cn } from "cn";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import type { ProductClaim, SourceHighlight } from "./types";

/**
 * One AI claim and the source cell it was grounded in. Hovering or focusing the source chip asks the
 * drawer to light up that cell on the Source side, so a reviewer can verify without reading the sheet.
 */
export function ClaimChip({ claim, onHighlight }: { claim: ProductClaim; onHighlight: (h: SourceHighlight | null) => void }) {
  const target: SourceHighlight | null = claim.row !== undefined ? { row: claim.row, column: claim.column } : null;
  const sourceLabel = claim.row !== undefined ? `row ${claim.row}${claim.column ? ` · ${claim.column}` : ""}` : claim.source || "unsourced";
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 leading-tight", claim.verified ? "border-success/40 bg-success-soft/60 text-ink" : "border-warning/40 bg-warning-soft/60 text-ink")}>
        {claim.verified ? <CheckIcon aria-hidden className="size-3 text-success" /> : <CircleAlertIcon aria-hidden className="size-3 text-warning" />}
        <span className="sr-only">{claim.verified ? "Verified: " : "Unverified: "}</span>
        {claim.text}
      </span>
      {target ? (
        <button
          type="button"
          className="inline-flex h-5 cursor-pointer items-center gap-1 border border-border bg-card px-1.5 num text-[11px] text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand focus-visible:border-brand focus-visible:bg-brand-soft focus-visible:text-brand focus-visible:outline-none"
          onMouseEnter={() => onHighlight(target)}
          onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(target)}
          onBlur={() => onHighlight(null)}
          aria-label={`Show source cell: ${sourceLabel}`}
        >
          {sourceLabel}
        </button>
      ) : (
        <span className="inline-flex h-5 items-center border border-dashed border-border px-1.5 text-[11px] text-ink-muted">{sourceLabel}</span>
      )}
    </li>
  );
}
