import { AccentText } from "@/components/storefront/accent-text";
import { groupCategories } from "@/components/storefront/categories";
import { CollectionHero } from "@/components/storefront/collection-hero";
import { buildCollectionHref, type StorefrontSort } from "@/components/storefront/collection-href";
import { EmptyState } from "@/components/storefront/empty-state";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { storeHref } from "@/components/storefront/hrefs";
import { t } from "@/components/storefront/i18n";
import { Pagination } from "@/components/storefront/pagination";
import { Paren } from "@/components/storefront/paren";
import { summarizePrice } from "@/components/storefront/price";
import { ProductGrid } from "@/components/storefront/product-grid";
import { pickSlides, type HeroSlide } from "@/components/storefront/slideshow";
import { SortMenu } from "@/components/storefront/sort-menu";
import { StoreHome } from "@/components/storefront/store-home";
import { cachedCategories, cachedCategoryPhotos, cachedProducts, loadStorefront, PAGE_SIZE, type StorefrontProduct } from "./storefront-context";

/**
 * Collection shared by the store root and the category route. Paging is plain links and every sort
 * choice is a navigation, so every state has a URL. The store root opens as a
 * home (hero, about, categories, then the grid, the four facts and the language band); category
 * pages and deeper pages keep the editorial band. Everything reads through the 30 s cache (EC-H6).
 */
export async function Collection({ slug, basePath, category, categoryInQuery, page, sort }: { slug: string; basePath: string; category?: string; categoryInQuery: boolean; page: number; sort: StorefrontSort }) {
  const ctx = await loadStorefront(slug);
  const [{ items, total }, categories, photos] = await Promise.all([cachedProducts(ctx.store.id, ctx.locale, { category, page, sort }), cachedCategories(ctx.store.id, ctx.locale), cachedCategoryPhotos(ctx.store.id, ctx.locale)]);
  const home = !category && page === 1 && total > 0;
  const families = groupCategories(categories);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryCategory = categoryInQuery ? category : undefined;
  const anyFallback = items.some((p) => p.fallbackFields.length > 0);
  const now = Date.now();
  const empty = items.length > 0 ? null : total > 0 ? "page" : category ? "category" : "store";

  // The hero and the bands always show the newest photographed products, even when the grid below is sorted by price.
  let slides: HeroSlide[] = [];
  let newest = items;
  if (home) {
    newest = sort === "newest" ? items : (await cachedProducts(ctx.store.id, ctx.locale, { page: 1, sort: "newest" })).items;
    slides = pickSlides(newest).flatMap(toSlide);
  }

  const grid = (
    <section id="products" className="scroll-mt-[var(--header-h)] bg-card">
      <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-8 md:py-24">
        {empty ? (
          <EmptyState locale={ctx.locale} kind={empty} href={empty === "page" ? buildCollectionHref(basePath, { category: queryCategory, sort }) : storeHref(slug)} />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                {home ? (
                  <>
                    <p className="text-[13px] text-ink-muted">
                      <Paren>{t(ctx.locale, "catalogue")}</Paren>
                    </p>
                    <h2 className="mt-4 font-grotesk text-[40px] leading-[1] text-ink md:text-[56px] lg:text-[64px]">
                      <AccentText text={t(ctx.locale, "gridTitle")} />
                    </h2>
                  </>
                ) : null}
                {pageCount > 1 ? <p className="num mt-2 text-[13px] text-ink-muted">{t(ctx.locale, "pageOf", { page, count: pageCount })}</p> : null}
              </div>
              {total > 1 ? <SortMenu basePath={basePath} category={queryCategory} sort={sort} locale={ctx.locale} /> : null}
            </div>
            {/* On the home the grid starts far below the hero, so nothing in it competes with the first slide for bandwidth. */}
            <ProductGrid products={items} slug={slug} locale={ctx.locale} now={now} eager={home ? 0 : 3} fallbackCurrency={ctx.store.defaultCurrency} priorityImageId={slides[0]?.imageId} className="mt-10 md:mt-14" />
            <div className="mt-12">
              <Pagination basePath={basePath} category={queryCategory} sort={sort} page={page} pageCount={pageCount} locale={ctx.locale} />
            </div>
          </>
        )}
        {anyFallback ? <FallbackNotice locale={ctx.locale} scope="page" className="mt-8 inline-flex" /> : null}
      </div>
    </section>
  );

  if (home) {
    return (
      <StoreHome slug={slug} locale={ctx.locale} store={ctx.store} total={total} families={families} photos={photos} slides={slides} newest={newest}>
        {grid}
      </StoreHome>
    );
  }
  return (
    <>
      <CollectionHero slug={slug} locale={ctx.locale} storeName={ctx.store.name} total={total} families={families} photos={photos} current={category} />
      {grid}
    </>
  );
}

function toSlide(p: StorefrontProduct): HeroSlide[] {
  const image = p.images[0];
  if (!image) return [];
  return [{ handle: p.handle, title: p.title, imageId: image.id, alt: image.alt || p.title, price: summarizePrice(p.variants, p.priceFromCents, p.currency) }];
}
