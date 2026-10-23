import type { EnrichInput, EnrichProductInput } from "./prompts";
import { CLAIM_LEXICON } from "./lexicon";
import { findNegatedSpan, isNegated, tokenizeClauses } from "./negation";
import { locateQuote } from "./quote";
import type { AiEnrichBatch, AiProductOutput } from "./schema";
import { foldForMatch } from "@/core/clean/text";

/**
 * Chaos helper (EC-D2, B15): slip one invented claim into a model answer, asserting a term the
 * supplier explicitly negated ("frost-proof" when the notes say "not frost-proof"), and echo it in
 * the description. The grounding validator must block both and send the product to review. Works on
 * any provider's answer, so the guardrail can be demonstrated against the real models too.
 */

export interface InventedClaim {
  text: string;
  source_row: number;
  source_column: string;
  quote: string;
}

/** The first lexicon term that a product's own cells negate, cited from the cell that negates it. */
export function findNegatedTerm(product: EnrichProductInput): InventedClaim | null {
  for (const row of product.rows) {
    for (const [column, cell] of Object.entries(row.cells)) {
      if (!cell) continue;
      const tokens = tokenizeClauses(cell);
      for (const entry of CLAIM_LEXICON) {
        const variant = entry.variants.find((v) => ` ${foldForMatch(cell)} `.includes(` ${v} `));
        if (!variant || !isNegated(tokens, [variant])) continue;
        // The negation as the supplier wrote it ("not frost-proof"), so the validator can point at it.
        const span = findNegatedSpan(tokens, [variant]);
        const phrase = span ? tokens.slice(span.start, span.end).join(" ") : variant;
        const located = locateQuote(cell, phrase);
        return { text: entry.term, source_row: row.row, source_column: column, quote: located ? cell.slice(located.start, located.end) : phrase };
      }
    }
  }
  return null;
}

/** A copy of the answer with one invented claim per product that has a negated term; products without one are untouched. */
export function injectInventedClaims(output: AiEnrichBatch, input: EnrichInput): { output: AiEnrichBatch; injected: number } {
  const byKey = new Map(input.products.map((p) => [p.product_key, p] as const));
  let injected = 0;
  const products: AiProductOutput[] = output.products.map((p) => {
    const source = byKey.get(p.product_key);
    const invented = source ? findNegatedTerm(source) : null;
    if (!invented) return p;
    injected += 1;
    const sentence = `<p>${capitalize(invented.text)}.</p>`;
    return {
      ...p,
      description_html: `${p.description_html}${sentence}`,
      claims: [...p.claims, invented],
    };
  });
  return { output: { ...output, products }, injected };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
