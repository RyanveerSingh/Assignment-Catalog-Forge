"use client";

import { cn } from "cn";
import { ShieldXIcon } from "lucide-react";
import { CHIP_BUTTON_CLASS, CHIP_CLASS, sourceLabel } from "./claim-chip";
import { sameHighlight, type ProductGuardrail, type SourceHighlight } from "./types";

type Kind = ProductGuardrail["kind"];

/** Warning tone when the source merely lacks the words; destructive when it says the opposite. The prefix text carries the same meaning. */
const KIND_CLASS: Record<Kind, string> = {
  unsupported: "border-warning/40 bg-warning-soft/60",
  negated: "border-destructive/30 bg-destructive/5",
  contradicted: "border-destructive/30 bg-destructive/5",
};
const ICON_CLASS: Record<Kind, string> = { unsupported: "text-warning", negated: "text-destructive", contradicted: "text-destructive" };

/** `Blocked "frost-proof" — source says "not frost-proof"`, or the validator's reason when no cell was found. */
function describe(g: ProductGuardrail): { verdict: string; evidence: string } {
  return { verdict: `Blocked "${g.text}"`, evidence: g.quote ? `source says "${g.quote}"` : g.reason };
}

/**
 * One thing the grounding validator kept out of the listing. When the block rests on a source cell (a negation or
 * an assertion the listing contradicts), hovering or pressing the badge marks those words on the Source side.
 */
export function GuardrailBadge({ guardrail, pinned, onHover, onSelect }: { guardrail: ProductGuardrail; pinned: SourceHighlight | null; onHover: (h: SourceHighlight | null) => void; onSelect: (h: SourceHighlight) => void }) {
  const g = guardrail;
  const target: SourceHighlight | null = g.row !== undefined ? { row: g.row, column: g.column, quote: g.quote, tone: "guardrail" } : null;
  const where = g.row !== undefined ? sourceLabel(g.row, g.column, "") : null;
  const { verdict, evidence } = describe(g);
  const body = (
    <>
      <ShieldXIcon aria-hidden className={cn("size-3 shrink-0", ICON_CLASS[g.kind])} />
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">Guardrail · {g.kind}</span>
      <span className="text-ink">
        {verdict} — {evidence}
      </span>
      {where ? <span className="num text-[10px] text-ink-muted">{where}</span> : null}
    </>
  );

  if (!target) {
    return (
      <li className={cn(CHIP_CLASS, KIND_CLASS[g.kind])}>
        <span className="sr-only">Guardrail, {g.kind}: </span>
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
        aria-label={`Guardrail, ${g.kind}: ${verdict}; ${evidence}${where ? ` in ${where}` : ""}. Show the source cell`}
        onMouseEnter={() => onHover(target)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(target)}
        onBlur={() => onHover(null)}
        onClick={() => onSelect(target)}
        className={cn(CHIP_CLASS, CHIP_BUTTON_CLASS, KIND_CLASS[g.kind], active && "border-brand ring-1 ring-brand")}
      >
        {body}
      </button>
    </li>
  );
}
