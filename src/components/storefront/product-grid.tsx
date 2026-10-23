import { ProductCard, type ProductCardData } from "./product-card";

/** 2 columns on phones, 3 on tablets, 4 on desktop; the first row is eager, the rest lazy. */
export function ProductGrid({ products, slug, locale, now, eager = 4 }: { products: ProductCardData[]; slug: string; locale: string; now: number; eager?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.handle}>
          <ProductCard product={p} storeSlug={slug} locale={locale} priority={i < eager} now={now} />
        </li>
      ))}
    </ul>
  );
}
