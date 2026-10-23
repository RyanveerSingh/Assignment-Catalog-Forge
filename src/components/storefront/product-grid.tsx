import { ProductCard, type ProductCardData } from "./product-card";
import { RevealItem } from "./reveal";

/**
 * 2 columns on phones, 3 on tablets, 4 on desktop; the first `eager` cards load with priority, the
 * rest lazy and revealed as they scroll in. A card whose photo is already the page's priority image
 * (`priorityImageId`, the hero's first slide) is marked priority too: same URL, no extra request,
 * and next/image's LCP bookkeeping stays consistent.
 */
export function ProductGrid({ products, slug, locale, now, eager = 4, fallbackCurrency, priorityImageId }: { products: ProductCardData[]; slug: string; locale: string; now: number; eager?: number; fallbackCurrency: string; priorityImageId?: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
      {products.map((p, i) => (
        <RevealItem key={p.handle} index={i}>
          <ProductCard product={p} storeSlug={slug} locale={locale} priority={i < eager || (priorityImageId !== undefined && p.images[0]?.id === priorityImageId)} now={now} fallbackCurrency={fallbackCurrency} />
        </RevealItem>
      ))}
    </ul>
  );
}
