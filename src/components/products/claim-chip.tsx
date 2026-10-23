"use client";

import { cn } from "cn";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { sameHighlight, type ProductClaim, type SourceHighlight } from "./types";

/** "Row 14 · Notes", or the fallback when the claim names no row. */
export function sourceLabel(row: number | undefined, column: string | undefined, fallback: string): string {
  return row !== undefined ? `Row ${row}${column ? ` · ${column}` : ""}` : fallback;
}

/** Shared chip chrome so claim chips and guardrail badges line up; the tone classes carry the meaning colour. */
export const CHIP_CLASS = "inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 border px-1.5 py-0.5 text-left text-xs leading-tight";
export const CHIP_BUTTON_CLASS = "cursor-pointer transition-colors hover:border-brand focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

/**
 * One AI claim and the source cell it was grounded in. Hovering or focusing the chip marks the exact words in
 * that cell on the Source side; pressing it pins the mark so both sides can be read at leisure (press again to unpin).
 */
export function ClaimChip({ claim, pinned, onHover, onSelect }: { claim: ProductClaim; pinned: SourceHighlight | null; onHover: (h: SourceHighlight | null) => void; onSelect: (h: SourceHighlight) => void }) {
  const target: SourceHighlight | null = claim.row !== undefined ? { row: claim.row, column: claim.column, quote: claim.quote, tone: "claim" } : null;
  const where = sourceLabel(claim.row, claim.column, claim.source || "unsourced");
  const tone = claim.verified ? "border-success/40 bg-success-soft/60" : "border-warning/40 bg-warning-soft/60";
  const Icon = claim.verified ? CheckIcon : CircleAlertIcon;
  const body = (
    <>
      <Icon aria-hidden className={cn("size-3 shrink-0", claim.verified ? "text-success" : "text-warning")} />
      <span className="text-ink">{claim.text}</span>
      <span className="num text-[10px] text-ink-muted">{where}</span>
    </>
  );

  if (!target) {
    return (
      <li className={cn(CHIP_CLASS, tone)}>
        <span className="sr-only">{claim.verified ? "Verified claim: " : "Unverified claim: "}</span>
        {body}
      </li>
    );
  }
  const active = sameHighlight(pinned, target);
  return (
    <li className="max-w-full">
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${claim.verified ? "Verified" : "Unverified"} claim "${claim.text}", from ${where}. Show the source cell`}
        onMouseEnter={() => onHover(target)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(target)}
        onBlur={() => onHover(null)}
        onClick={() => onSelect(target)}
        className={cn(CHIP_CLASS, CHIP_BUTTON_CLASS, tone, active && "border-brand ring-1 ring-brand")}
      >
        {body}
      </button>
    </li>
  );
}
