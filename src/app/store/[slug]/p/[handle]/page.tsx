import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, Truck, Undo2 } from "lucide-react";
import { cn } from "cn";
import { BuyBox } from "@/components/storefront/buy-box";
import { familyOf, leafLabel, segments, titleCase } from "@/components/storefront/categories";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { Gallery } from "@/components/storefront/gallery";
import { categoryHref, storeHref } from "@/components/storefront/hrefs";
import { attributeLabel, t } from "@/components/storefront/i18n";
import { storefrontImageUrl } from "@/components/storefront/image-url";
import { ProductGrid } from "@/components/storefront/product-grid";
import { cachedProduct, cachedProducts, loadStorefront, type StorefrontProduct } from "../../storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; handle: string }>;

const CARE_KEYS = new Set(["care", "care_instructions", "pflege", "entretien"]);
const RELATED_LIMIT = 4;

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

/** Leaf category first, then the family, then the whole catalogue: the first level with at least one other product wins. */
async function relatedProducts(storeId: string, locale: string, product: StorefrontProduct): Promise<{ label: string; items: StorefrontProduct[] } | null> {
  const levels: Array<{ category?: string; label: string }> = [];
  if (product.category) {
    levels.push({ category: product.category, label: t(locale, "moreFrom", { category: leafLabel(product.category) }) });
    const family = familyOf(product.category);
    if (family !== product.category) levels.push({ category: family, label: t(locale, "moreFrom", { category: titleCase(family) }) });
  }
  levels.push({ label: t(locale, "moreFromCatalogue") });
  for (const level of levels) {
    const { items } = await cachedProducts(storeId, locale, { category: level.category, page: 1, sort: "newest" });
    const others = items.filter((p) => p.productId !== product.productId).slice(0, RELATED_LIMIT);
    if (others.length > 0) return { label: level.label, items: others };
  }
  return null;
}

/** Only published products exist in the storefront table, so anything under review is a 404 (EC-H1). */
export default async function ProductPage({ params }: { params: Params }) {
  const { slug, handle } = await params;
  const ctx = await loadStorefront(slug);
  const product = await cachedProduct(ctx.store.id, ctx.locale, handle);
  if (!product) notFound();

  const locale = ctx.locale;
  const related = await relatedProducts(ctx.store.id, locale, product);
  const titleFallback = product.fallbackFields.includes("title");
  const descriptionFallback = product.fallbackFields.includes("descriptionHtml");
  const entries = Object.entries(product.attributes).filter(([, v]) => v.trim() !== "");
  const care = entries.find(([k]) => CARE_KEYS.has(k.trim().toLowerCase()))?.[1] ?? null;
  const details = entries.filter(([k]) => !CARE_KEYS.has(k.trim().toLowerCase()));
  const crumbs = product.category ? segments(product.category) : [];
  const leaf = product.category ? leafLabel(product.category) : null;
  const heading = "font-display text-xl text-ink";
  const hasFallback = titleFallback || descriptionFallback;
  const hasLongForm = Boolean(product.descriptionHtml) || details.length > 0 || care !== null || product.tags.length > 0 || hasFallback;

  return (
    // Extra bottom room below md keeps the last line clear of the sticky "Add to bag" bar.
    <article className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:py-10">
      <nav aria-label={t(locale, "breadcrumb")} className="text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={storeHref(slug)} className="cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
              {t(locale, "home")}
            </Link>
          </li>
          {crumbs.map((seg, i) => {
            const last = i === crumbs.length - 1;
            // Middle levels are skipped on purpose: Home › family › leaf is enough to find your way back.
            if (!last && i !== 0) return null;
            return (
              <li key={i} className="flex items-center gap-1">
                <ChevronRight aria-hidden className="size-3.5" />
                <Link href={categoryHref(slug, crumbs.slice(0, i + 1).join(" > "))} aria-current={last ? "page" : undefined} className="cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                  {titleCase(seg)}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      {/*
        Gallery and the long-form sections share the left column; the buy column spans both rows and
        sticks from lg up, so price, options and "Add to bag" stay in view while the description scrolls.
        On a phone the DOM order still reads gallery, buy, details.
      */}
      <div className="mt-6 grid gap-8 md:grid-cols-12 md:gap-x-10 md:gap-y-12 lg:gap-x-14">
        <div className="md:col-span-7">
          <Gallery images={product.images} storeSlug={slug} title={product.title} locale={locale} />
        </div>

        <div className={cn("space-y-8 md:col-span-5 lg:sticky lg:top-6 lg:self-start", hasLongForm && "md:row-span-2")}>
          <header className="space-y-3">
            {product.category && leaf ? (
              <Link href={categoryHref(slug, product.category)} className="inline-block cursor-pointer text-xs font-medium uppercase tracking-[0.18em] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
                {leaf}
              </Link>
            ) : null}
            <h1 lang={titleFallback ? "en" : undefined} className="font-display text-3xl leading-[1.08] text-ink md:text-4xl">
              {product.title}
            </h1>
          </header>

          <BuyBox slug={slug} locale={locale} variants={product.variants} fallbackCurrency={product.currency ?? ctx.store.defaultCurrency} product={{ handle: product.handle, title: product.title, imageId: product.images[0]?.id ?? null }} sticky />

          {/* True by construction: every published claim was verified against the supplier's row before it could be approved. */}
          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" strokeWidth={2.2} />
            <span>{t(locale, "checkedAgainstSheet")}</span>
          </p>

          <ul className="space-y-2 rounded-sm bg-paper-deep/60 px-4 py-3 text-sm">
            <li className="flex items-start gap-3">
              <Truck aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
              <span>
                <span className="font-medium text-ink">{t(locale, "delivery")}</span> <span className="text-ink-muted">· {t(locale, "deliveryHint")}</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Undo2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
              <span>
                <span className="font-medium text-ink">{t(locale, "returns")}</span> <span className="text-ink-muted">· {t(locale, "returnsHint")}</span>
              </span>
            </li>
          </ul>
        </div>

        {hasLongForm ? (
          <div className="space-y-8 md:col-span-7 md:max-w-prose">
            {product.descriptionHtml ? (
              <section aria-label="Description" lang={descriptionFallback ? "en" : undefined}>
                {/* Sanitised with sanitize-html at import and again before publish; this is the published snapshot, never raw supplier HTML. */}
                <div className="prose-product text-[15px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
              </section>
            ) : null}

            {details.length > 0 ? (
              <section aria-labelledby="product-details" className="space-y-3">
                <h2 id="product-details" className={heading}>
                  {t(locale, "details")}
                </h2>
                <table className="w-full text-sm">
                  <tbody>
                    {details.map(([key, value]) => (
                      <tr key={key} className="border-t border-border">
                        <th scope="row" className="w-2/5 py-2.5 pr-4 text-left align-top font-medium text-ink-muted">
                          {attributeLabel(locale, key)}
                        </th>
                        <td className="py-2.5 align-top text-ink">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {care ? (
              <section aria-labelledby="product-care" className="space-y-2 border-t border-border pt-6">
                <h2 id="product-care" className={heading}>
                  {t(locale, "care")}
                </h2>
                <p className="text-sm leading-relaxed text-ink">{care}</p>
              </section>
            ) : null}

            {product.tags.length > 0 ? (
              <section aria-labelledby="product-tags" className="space-y-2 border-t border-border pt-6">
                <h2 id="product-tags" className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
                  {t(locale, "tags")}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <li key={tag} className="rounded-full bg-paper-deep px-3 py-1.5 text-xs text-ink">
                      {tag}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {hasFallback ? <FallbackNotice locale={locale} scope="product" /> : null}
          </div>
        ) : null}
      </div>

      {related ? (
        <section aria-labelledby="related-heading" className="mt-16 border-t border-border pt-10 md:mt-24">
          <h2 id="related-heading" className="font-display text-2xl text-ink md:text-3xl">
            {related.label}
          </h2>
          <div className="mt-6">
            <ProductGrid products={related.items} slug={slug} locale={locale} now={Date.now()} eager={0} fallbackCurrency={ctx.store.defaultCurrency} />
          </div>
        </section>
      ) : null}
    </article>
  );
}
