import type { Issue, ProductGroup, VariantDraft } from "@/core/types";

/**
 * Prices the cleaner was unsure of (EC-B5). With auto-publish on, a draft goes live, so a price read
 * from "1.299" or "12.999" must reach a person first. The model never sees prices, so this is the
 * only place the doubt can become a review reason.
 *
 * The group carries the cleaner's price issues, not its 0–100 confidence; every confidence penalty
 * that matters comes with a warn-level issue, so the issues are the signal.
 */

/** Price issues that do not cast doubt on a price that was read: no price at all, and mixed currencies, are reported separately. */
const NOT_A_DOUBT: ReadonlySet<string> = new Set(["price.missing"]);

function isPriceDoubt(i: Issue): boolean {
  return i.code.startsWith("price.") && i.severity !== "info" && !NOT_A_DOUBT.has(i.code) && i.field !== "compare_at_price" && i.field !== "currency";
}

function doubts(v: VariantDraft): Issue[] {
  return v.issues.filter(isPriceDoubt);
}

/** "Price unclear: <raw>" for each distinct doubtful price on a variant that has a price. */
export function priceDoubtReasons(group: ProductGroup): string[] {
  const out = new Set<string>();
  for (const v of group.variants) {
    // A variant without a price is already sent to review as "No price for …".
    if (v.priceCents === null) continue;
    // Even a sibling's unambiguous "1.299,00 €" does not settle a "1.299": variants may be priced differently.
    for (const i of doubts(v)) out.add(`Price unclear: ${(i.value ?? i.message).trim()}`);
  }
  return [...out];
}
