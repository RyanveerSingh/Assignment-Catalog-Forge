"use client";

import { useId } from "react";
import { ClaimChip } from "./claim-chip";
import { GuardrailBadge } from "./guardrail-badge";
import type { ProductClaim, ProductGuardrail, SourceHighlight } from "./types";

function Heading({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <h3 id={id} className="flex items-baseline gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
      {title}
      <span className="num text-[11px] normal-case tracking-normal">{count}</span>
    </h3>
  );
}

/**
 * What the validator verified and what it blocked, each wired to the Source panel: hover shows the words a
 * claim rests on (or the words that contradict a blocked one); pressing pins them; pressing again unpins.
 */
export function ClaimInspector({ claims, guardrails, pinned, onHover, onSelect }: { claims: ProductClaim[]; guardrails: ProductGuardrail[]; pinned: SourceHighlight | null; onHover: (h: SourceHighlight | null) => void; onSelect: (h: SourceHighlight) => void }) {
  const uid = useId();
  return (
    <>
      <section className="flex flex-col gap-1.5" aria-labelledby={`${uid}-claims`}>
        <Heading id={`${uid}-claims`} title="Claims" count={claims.length} />
        {claims.length === 0 ? (
          <p className="text-xs text-ink-muted">The listing makes no factual claims beyond the source.</p>
        ) : (
          <>
            <p className="text-[11px] text-ink-muted">Hover or press a claim to see the words it rests on; press again to unpin.</p>
            <ul className="flex flex-col gap-1.5">
              {claims.map((c, i) => (
                <ClaimChip key={`${c.text}-${c.row ?? ""}-${i}`} claim={c} pinned={pinned} onHover={onHover} onSelect={onSelect} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="flex flex-col gap-1.5" aria-labelledby={`${uid}-guardrails`}>
        <Heading id={`${uid}-guardrails`} title="Guardrails" count={guardrails.length} />
        {guardrails.length === 0 ? (
          <p className="text-xs text-ink-muted">Nothing was blocked: every claim and marketing term in the listing is backed by the source.</p>
        ) : (
          <>
            <p className="text-[11px] text-ink-muted">Removed from the listing before it reached you. Hover or press one to see the source words it fell to.</p>
            <ul className="flex flex-col gap-1.5">
              {guardrails.map((g, i) => (
                <GuardrailBadge key={`${g.kind}-${g.text}-${i}`} guardrail={g} pinned={pinned} onHover={onHover} onSelect={onSelect} />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
