import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { FallbackNotice } from "@/components/storefront/fallback-notice";
import { ProductCard } from "@/components/storefront/product-card";
import { cachedProducts, loadStorefront, PAGE_SIZE, type StorefrontSort } from "./storefront-context";

const SORTS: ReadonlyArray<{ key: StorefrontSort; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
];

function buildHref(basePath: string, query: { category?: string; page?: number; sort?: StorefrontSort }): string {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Collection grid shared by the store root and the category route. Sort and paging are plain links,
 * so the page needs no client JavaScript and every state has a URL.
 */
export async function Collection({ slug, basePath, category, categoryInQuery, page, sort }: { slug: string; basePath: string; category?: string; categoryInQuery: boolean; page: number; sort: StorefrontSort }) {
  const ctx = await loadStorefront(slug);
  const { items, total } = await cachedProducts(ctx.store.id, ctx.locale, { category, page, sort });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryCategory = categoryInQuery ? category : undefined;
  const anyFallback = items.some((p) => p.fallbackFields.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">{category ?? "All products"}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="num">{total}</span> {total === 1 ? "product" : "products"}
          </p>
        </div>
        {total > 1 ? (
          <nav aria-label="Sort" className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-ink-muted">Sort</span>
            {SORTS.map((s) => {
              const active = s.key === sort;
              return (
                <Link
                  key={s.key}
                  href={buildHref(basePath, { category: queryCategory, sort: s.key })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "cursor-pointer rounded-sm px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    active ? "bg-ink text-paper" : "text-ink-muted hover:bg-paper-deep hover:text-ink",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border border-dashed border-border px-6 py-20 text-center">
          <p className="font-display text-2xl text-ink">Nothing published yet</p>
          <p className="max-w-sm text-sm text-ink-muted">{category ? "No products in this category have been published." : "Products appear here as soon as they are approved and published."}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
          {items.map((p, i) => (
            <li key={p.productId}>
              <ProductCard product={p} storeSlug={slug} locale={ctx.locale} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border pt-6 text-sm">
          <PageLink href={page > 1 ? buildHref(basePath, { category: queryCategory, sort, page: page - 1 }) : null} rel="prev">
            <ChevronLeft aria-hidden className="size-4" /> Previous
          </PageLink>
          <span className="text-ink-muted">
            Page <span className="num text-ink">{page}</span> of <span className="num text-ink">{pageCount}</span>
          </span>
          <PageLink href={page < pageCount ? buildHref(basePath, { category: queryCategory, sort, page: page + 1 }) : null} rel="next">
            Next <ChevronRight aria-hidden className="size-4" />
          </PageLink>
        </nav>
      ) : null}

      {anyFallback ? <FallbackNotice locale={ctx.locale} scope="page" /> : null}
    </div>
  );
}

function PageLink({ href, rel, children }: { href: string | null; rel: "prev" | "next"; children: React.ReactNode }) {
  const className = "inline-flex min-h-9 items-center gap-1 rounded-sm px-2 outline-none focus-visible:ring-2 focus-visible:ring-brand";
  if (!href)
    return (
      <span aria-disabled="true" className={cn(className, "text-ink-muted/50")}>
        {children}
      </span>
    );
  return (
    <Link href={href} rel={rel} className={cn(className, "cursor-pointer text-ink hover:bg-paper-deep")}>
      {children}
    </Link>
  );
}
