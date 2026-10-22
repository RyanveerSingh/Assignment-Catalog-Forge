import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { Gallery } from "@/components/storefront/gallery";
import { storefrontImageUrl } from "@/components/storefront/product-card";
import { VariantPicker } from "@/components/storefront/variant-picker";
import { cachedProduct, categoryHref, loadStorefront } from "../../storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; handle: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, handle } = await params;
  const ctx = await loadStorefront(slug);
  const product = await cachedProduct(ctx.store.id, ctx.locale, handle);
  if (!product) return { title: "Not found", robots: { index: false } };
  const image = product.images[0];
  return {
    title: product.seo?.metaTitle || product.title,
    description: product.seo?.metaDescription || undefined,
    openGraph: { title: product.seo?.metaTitle || product.title, description: product.seo?.metaDescription || undefined, images: image ? [{ url: storefrontImageUrl(slug, image.id), alt: image.alt || product.title }] : [] },
  };
}

/** Only published products exist in the storefront table, so anything under review is a 404 (EC-H1). */
export default async function ProductPage({ params }: { params: Params }) {
  const { slug, handle } = await params;
  const ctx = await loadStorefront(slug);
  const product = await cachedProduct(ctx.store.id, ctx.locale, handle);
  if (!product) notFound();

  const home = `/store/${encodeURIComponent(slug)}`;
  const titleFallback = product.fallbackFields.includes("title");
  const descriptionFallback = product.fallbackFields.includes("descriptionHtml");
  const attributes = Object.entries(product.attributes).filter(([, v]) => v.trim() !== "");

  return (
    <article className="space-y-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={home} className="cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
              {ctx.store.name}
            </Link>
          </li>
          {product.category ? (
            <li className="flex items-center gap-1">
              <ChevronRight aria-hidden className="size-3.5" />
              <Link href={categoryHref(slug, product.category)} className="cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                {product.category}
              </Link>
            </li>
          ) : null}
          <li className="flex items-center gap-1 text-ink" aria-current="page">
            <ChevronRight aria-hidden className="size-3.5" />
            <span className="line-clamp-1">{product.title}</span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Gallery images={product.images} storeSlug={slug} title={product.title} />

        <div className="space-y-8">
          <header className="space-y-3">
            {product.category ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{product.category}</p> : null}
            <h1 lang={titleFallback ? "en" : undefined} className="font-display text-3xl leading-tight text-ink md:text-4xl lg:text-5xl">
              {product.title}
            </h1>
          </header>

          <VariantPicker variants={product.variants} locale={ctx.locale} fallbackCurrency={product.currency ?? ctx.store.defaultCurrency} />

          {product.descriptionHtml ? (
            <section aria-label="Description" lang={descriptionFallback ? "en" : undefined}>
              {/* Sanitised with sanitize-html at import and again before publish; this is the published snapshot, never raw supplier HTML. */}
              <div className="prose-product text-[15px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
            </section>
          ) : null}

          {attributes.length > 0 ? (
            <section aria-labelledby="product-details" className="space-y-3">
              <h2 id="product-details" className="font-display text-xl text-ink">
                Details
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {attributes.map(([key, value]) => (
                    <tr key={key} className="border-t border-border">
                      <th scope="row" className="w-1/3 py-2 pr-4 text-left font-medium text-ink-muted">
                        {key}
                      </th>
                      <td className="py-2 text-ink">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {product.tags.length > 0 ? (
            <ul aria-label="Tags" className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <li key={tag} className="rounded-sm bg-paper-deep px-2 py-1 text-xs text-ink-muted">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {titleFallback || descriptionFallback ? <FallbackNotice locale={ctx.locale} scope="product" /> : null}
        </div>
      </div>
    </article>
  );
}
