"use client";

import type { PublishedVariant } from "@/db/schema";
import { AddToBag, type BagProductSummary } from "./add-to-bag";
import { VariantPicker } from "./variant-picker";

/** Client boundary that wires the picker's resolved variant into the add-to-bag control; the page itself stays a server component. */
export function BuyBox({ slug, locale, variants, fallbackCurrency, product }: { slug: string; locale: string; variants: PublishedVariant[]; fallbackCurrency: string; product: BagProductSummary }) {
  return <VariantPicker variants={variants} locale={locale} fallbackCurrency={fallbackCurrency} renderBuy={(current) => <AddToBag slug={slug} locale={locale} product={product} variant={current} />} />;
}
