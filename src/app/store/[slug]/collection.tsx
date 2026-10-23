import Link from "next/link";
import { groupCategories } from "@/components/storefront/categories";
import { CollectionHero, type HeroFeature } from "@/components/storefront/collection-hero";
import { buildCollectionHref } from "@/components/storefront/collection-href";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { storeHref } from "@/components/storefront/hrefs";
import { t } from "@/components/storefront/i18n";
import { Pagination } from "@/components/storefront/pagination";
import { ProductGrid } from "@/components/storefront/product-grid";
import { SortSelect } from "@/components/storefront/sort-select";
import { cachedCategories, cachedProducts, loadStorefront, PAGE_SIZE, type StorefrontSort } from "./storefront-context";

/**
 * Collection shared by the store root and the category route. Paging is plain links and the sort
 * select is the only client island, so every state has a URL and the page ships almost no script.
 */
export async function Collection({ slug, basePath, category, categoryInQuery, page, sort }: { slug: string; basePath: string; category?: string; categoryInQuery: boolean; page: number; sort: StorefrontSort }) {
  const ctx = await loadStorefront(slug);
  const [{ items, total }, categories] = await Promise.all([cachedProducts(ctx.store.id, ctx.locale, { category, page, sort }), cachedCategories(ctx.store.id, ctx.locale)]);
  const families = groupCategories(categories);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryCategory = categoryInQuery ? category : undefined;
  const anyFallback = items.some((p) => p.fallbackFields.length > 0);
  const now = Date.now();
  // Three honest empty states: nothing published, nothing in this category, or a page number past the end.
  const empty = items.length > 0 ? null : total > 0 ? "page" : category ? "category" : "store";

  // The newest photographed product fronts the store hero; category pages and deeper pages keep the band to text.
  let feature: HeroFeature | undefined;
  if (!category && page === 1 && sort === "newest") {
    const first = items.find((p) => p.images.length > 0);
    const image = first?.images[0];
    if (first && image) feature = { handle: first.handle, title: first.title, imageId: image.id, alt: image.alt || first.title };
  }

  return (
    <>
      <CollectionHero slug={slug} locale={ctx.locale} storeName={ctx.store.name} total={total} families={families} current={category} feature={feature} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 md:py-12">
        {empty ? (
          <EmptyState locale={ctx.locale} kind={empty} href={empty === "page" ? buildCollectionHref(basePath, { category: queryCategory, sort }) : storeHref(slug)} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="num text-sm text-ink-muted">{pageCount > 1 ? t(ctx.locale, "pageOf", { page, count: pageCount }) : null}</p>
              {total > 1 ? <SortSelect basePath={basePath} category={queryCategory} sort={sort} locale={ctx.locale} /> : null}
            </div>
            <ProductGrid products={items} slug={slug} locale={ctx.locale} now={now} />
            <Pagination basePath={basePath} category={queryCategory} sort={sort} page={page} pageCount={pageCount} locale={ctx.locale} />
          </>
        )}
        {anyFallback ? <FallbackNotice locale={ctx.locale} scope="page" /> : null}
      </div>
    </>
  );
}

function EmptyState({ locale, kind, href }: { locale: string; kind: "store" | "category" | "page"; href: string }) {
  const title = t(locale, kind === "store" ? "nothingPublished" : kind === "category" ? "nothingInCategory" : "pageEmpty");
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-border px-6 py-20 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {kind === "store" ? (
        <p className="max-w-sm text-sm text-ink-muted">{t(locale, "nothingPublishedHint")}</p>
      ) : (
        <Link href={href} className="inline-flex h-11 cursor-pointer items-center rounded-sm border border-ink px-4 text-sm text-ink outline-none transition-colors hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          {t(locale, kind === "category" ? "browseAll" : "backToFirstPage")}
        </Link>
      )}
    </div>
  );
}
