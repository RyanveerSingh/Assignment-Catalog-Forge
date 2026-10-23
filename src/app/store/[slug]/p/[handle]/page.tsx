import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { AccentText } from "@/components/storefront/accent-text";
import { BuyBox } from "@/components/storefront/buy-box";
import { familyOf, leafLabel, segments, titleCase } from "@/components/storefront/categories";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { Gallery } from "@/components/storefront/gallery";
import { categoryHref, storeHref } from "@/components/storefront/hrefs";
import { attributeLabel, t } from "@/components/storefront/i18n";
import { storefrontImageUrl } from "@/components/storefront/image-url";
import { Paren } from "@/components/storefront/paren";
import { ProductGrid } from "@/components/storefront/product-grid";
import { slideNumber } from "@/components/storefront/slideshow";
import { cachedProduct, cachedProducts, loadStorefront, type StorefrontProduct } from "../../storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; handle: string }>;

const CARE_KEYS = new Set(["care", "care_instructions", "pflege", "entretien"]);
const RELATED_LIMIT = 3;
const EYEBROW = "text-[13px] text-ink-muted";
const CRUMB = "cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";

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
    levels.push({ category: product.category, label: t(locale, "moreFrom", { category: `*${leafLabel(product.category)}*` }) });
    const family = familyOf(product.category);
    if (family !== product.category) levels.push({ category: family, label: t(locale, "moreFrom", { category: `*${titleCase(family)}*` }) });
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
  const hasFallback = titleFallback || descriptionFallback;
  const hasLongForm = Boolean(product.descriptionHtml) || details.length > 0 || care !== null || product.tags.length > 0 || hasFallback;

  return (
    // Extra bottom room below md keeps the last line clear of the sticky "( Add to bag )" bar.
    <article className="bg-card pb-20 md:pb-0">
      <div className="mx-auto max-w-[1440px] px-5 pt-6 md:px-8 md:pt-10">
        <nav aria-label={t(locale, "breadcrumb")} className={EYEBROW}>
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href={storeHref(slug)} className={CRUMB}>
                {t(locale, "home")}
              </Link>
            </li>
            {crumbs.map((seg, i) => {
              const last = i === crumbs.length - 1;
              // Middle levels are skipped on purpose: Home / family / leaf is enough to find your way back.
              if (!last && i !== 0) return null;
              return (
                <li key={i} className="flex items-center gap-2">
                  <span aria-hidden>/</span>
                  <Link href={categoryHref(slug, crumbs.slice(0, i + 1).join(" > "))} aria-current={last ? "page" : undefined} className={CRUMB}>
                    {titleCase(seg)}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        {/*
          Gallery and the long-form sections share the left column; the buy column spans both rows and
          sticks from lg up, so price, options and "( Add to bag )" stay in view while the description scrolls.
          On a phone the DOM order still reads gallery, buy, details.
        */}
        <div className="mt-6 grid gap-10 md:grid-cols-12 md:gap-x-10 md:gap-y-16 lg:gap-x-16">
          <div className="md:col-span-7">
            <Gallery images={product.images} storeSlug={slug} title={product.title} locale={locale} />
          </div>

          <div className={cn("space-y-8 md:col-span-5 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start", hasLongForm && "md:row-span-2")}>
            <header>
              {product.category && leaf ? (
                <Link href={categoryHref(slug, product.category)} className="font-serif-italic inline-block cursor-pointer rounded-sm text-[26px] leading-none text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand md:text-[30px]">
                  {leaf}
                </Link>
              ) : null}
              <h1 lang={titleFallback ? "en" : undefined} className="mt-3 font-grotesk text-[38px] leading-[1] text-ink md:text-[48px] lg:text-[56px]">
                {product.title}
              </h1>
            </header>

            <BuyBox slug={slug} locale={locale} variants={product.variants} fallbackCurrency={product.currency ?? ctx.store.defaultCurrency} product={{ handle: product.handle, title: product.title, imageId: product.images[0]?.id ?? null }} sticky />

            {/* True by construction: every published claim was verified against the supplier's row before it could be approved. */}
            <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-muted">
              <span aria-hidden className="mt-[7px] block size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{t(locale, "checkedAgainstSheet")}</span>
            </p>
          </div>

          {hasLongForm ? (
            <div className="space-y-12 md:col-span-7">
              {product.descriptionHtml ? (
                <section aria-label="Description" lang={descriptionFallback ? "en" : undefined} className="max-w-prose">
                  {/* Sanitised with sanitize-html at import and again before publish; this is the published snapshot, never raw supplier HTML. */}
                  <div className="prose-product text-[16px] leading-relaxed text-ink md:text-[17px]" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
                </section>
              ) : null}

              {details.length > 0 ? (
                <section aria-labelledby="product-details">
                  <h2 id="product-details" className={EYEBROW}>
                    <Paren>{t(locale, "details")}</Paren>
                  </h2>
                  <ol className="mt-4 border-t border-line">
                    {details.map(([key, value], i) => (
                      <li key={key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-line py-4 md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.5fr)]">
                        <span className="num pt-0.5 text-xs text-ink-muted">{slideNumber(i)}</span>
                        <span className="text-[15px] text-ink-muted">{attributeLabel(locale, key)}</span>
                        <span className="col-start-2 text-[15px] text-ink md:col-start-3">{value}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {care ? (
                <section aria-labelledby="product-care">
                  <h2 id="product-care" className={EYEBROW}>
                    <Paren>{t(locale, "care")}</Paren>
                  </h2>
                  <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink md:text-base">{care}</p>
                </section>
              ) : null}

              {product.tags.length > 0 ? (
                <section aria-labelledby="product-tags">
                  <h2 id="product-tags" className={EYEBROW}>
                    <Paren>{t(locale, "tags")}</Paren>
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {product.tags.map((tag) => (
                      <li key={tag} className="inline-flex h-9 items-center rounded-full bg-paper px-4 text-[13px] text-ink">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hasFallback ? <FallbackNotice locale={locale} scope="product" className="inline-flex" /> : null}
            </div>
          ) : null}
        </div>
      </div>

      {related ? (
        <section aria-labelledby="related-heading" className="mt-20 bg-paper md:mt-32">
          <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 md:py-24">
            <h2 id="related-heading" className="font-grotesk text-[36px] leading-[1] text-ink md:text-[52px]">
              <AccentText text={related.label} />
            </h2>
            <ProductGrid products={related.items} slug={slug} locale={locale} now={Date.now()} eager={0} fallbackCurrency={ctx.store.defaultCurrency} className="mt-10" />
          </div>
        </section>
      ) : null}
    </article>
  );
}
