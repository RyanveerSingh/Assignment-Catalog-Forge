"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishedVariant } from "@/db/schema";
import { AddToBag, type BagProductSummary } from "./add-to-bag";
import { StickyBuyBar } from "./sticky-buy-bar";
import { VariantPicker } from "./variant-picker";

/**
 * Client boundary that wires the picker's resolved variant into the add-to-bag control; the page
 * itself stays a server component. With `sticky`, a phone-only bar follows the shopper once the
 * main button has left the viewport, carrying the same resolved variant.
 */
export function BuyBox({ slug, locale, variants, fallbackCurrency, product, sticky = false }: { slug: string; locale: string; variants: PublishedVariant[]; fallbackCurrency: string; product: BagProductSummary; sticky?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const el = anchor.current;
    if (!sticky || !el) return;
    // Only once the button has been scrolled past: on arrival it is simply further down the page, not "gone".
    const observer = new IntersectionObserver(([entry]) => setAway(entry ? !entry.isIntersecting && entry.boundingClientRect.bottom < 0 : false));
    observer.observe(el);
    return () => observer.disconnect();
  }, [sticky]);

  return (
    <VariantPicker
      variants={variants}
      locale={locale}
      fallbackCurrency={fallbackCurrency}
      renderBuy={(current) => (
        <>
          <div ref={anchor}>
            <AddToBag slug={slug} locale={locale} product={product} variant={current} />
          </div>
          {sticky ? <StickyBuyBar slug={slug} locale={locale} product={product} variant={current} fallbackCurrency={fallbackCurrency} visible={away} /> : null}
        </>
      )}
    />
  );
}
