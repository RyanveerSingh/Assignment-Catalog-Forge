import { groupCategories, leafLabel } from "@/components/storefront/categories";
import { CollectionHero } from "@/components/storefront/collection-hero";
import { buildCollectionHref } from "@/components/storefront/collection-href";
import { EmptyState } from "@/components/storefront/empty-state";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { storeHref } from "@/components/storefront/hrefs";
import { t } from "@/components/storefront/i18n";
import { Pagination } from "@/components/storefront/pagination";
import { summarizePrice } from "@/components/storefront/price";
import { ProductGrid } from "@/components/storefront/product-grid";
import { pickSlides, type HeroSlide } from "@/components/storefront/slideshow";
import { SortSelect } from "@/components/storefront/sort-select";
import { StoreHome } from "@/components/storefront/store-home";
import { cachedCategories, cachedCategoryPhotos, cachedProducts, loadStorefront, PAGE_SIZE, type StorefrontProduct, type StorefrontSort } from "./storefront-context";

/**
 * Collection shared by the store root and the category route. Paging is plain links and the sort
 * select is the only client island, so every state has a URL and the page ships almost no script.
 * The store root opens as a home (slideshow, introduction, category tiles); category pages and
 * deeper pages keep the editorial band.
 */
export async function Collection({ slug, basePath, category, categoryInQuery, page, sort }: { slug: string; basePath: string; category?: string; categoryInQuery: boolean; page: number; sort: StorefrontSort }) {
  const ctx = await loadStorefront(slug);
  const home = !category && page === 1;
  const [{ items, total }, categories, photos] = await Promise.all([
    cachedProducts(ctx.store.id, ctx.locale, { category, page, sort }),
    cachedCategories(ctx.store.id, ctx.locale),
    home ? cachedCategoryPhotos(ctx.store.id, ctx.locale) : Promise.resolve([]),
  ]);
  const families = groupCategories(categories);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryCategory = categoryInQuery ? category : undefined;
  const anyFallback = items.some((p) => p.fallbackFields.length > 0);
  const now = Date.now();
  const empty = items.length > 0 ? null : total > 0 ? "page" : category ? "category" : "store";

  // The slideshow always shows the newest photographed products, even when the grid below is sorted by price.
  let slides: HeroSlide[] = [];
  if (home) {
    const newest = sort === "newest" ? items : (await cachedProducts(ctx.store.id, ctx.locale, { page: 1, sort: "newest" })).items;
    slides = pickSlides(newest).flatMap(toSlide);
  }

  return (
    <>
      {home ? (
        <StoreHome slug={slug} locale={ctx.locale} storeName={ctx.store.name} total={total} families={families} photos={photos} slides={slides} />
      ) : (
        <CollectionHero slug={slug} locale={ctx.locale} storeName={ctx.store.name} total={total} families={families} current={category} />
      )}
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 md:py-12">
        {empty ? (
          <EmptyState locale={ctx.locale} kind={empty} href={empty === "page" ? buildCollectionHref(basePath, { category: queryCategory, sort }) : storeHref(slug)} />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                {home ? <h2 className="font-display text-2xl text-ink md:text-3xl">{t(ctx.locale, "allProducts")}</h2> : null}
                {pageCount > 1 ? <p className="num text-sm text-ink-muted">{t(ctx.locale, "pageOf", { page, count: pageCount })}</p> : null}
              </div>
              {total > 1 ? <SortSelect basePath={basePath} category={queryCategory} sort={sort} locale={ctx.locale} /> : null}
            </div>
            {/* On the home the grid starts below the slideshow and the tiles, so nothing in it competes with the first slide for bandwidth. */}
            <ProductGrid products={items} slug={slug} locale={ctx.locale} now={now} eager={home ? 0 : 4} fallbackCurrency={ctx.store.defaultCurrency} priorityImageId={slides[0]?.imageId} />
            <Pagination basePath={basePath} category={queryCategory} sort={sort} page={page} pageCount={pageCount} locale={ctx.locale} />
          </>
        )}
        {anyFallback ? <FallbackNotice locale={ctx.locale} scope="page" /> : null}
      </div>
    </>
  );
}

function toSlide(p: StorefrontProduct): HeroSlide[] {
  const image = p.images[0];
  if (!image) return [];
  return [{ handle: p.handle, title: p.title, imageId: image.id, alt: image.alt || p.title, category: p.category ? leafLabel(p.category) : null, price: summarizePrice(p.variants, p.priceFromCents, p.currency) }];
}
