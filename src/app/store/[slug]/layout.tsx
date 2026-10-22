import type { Metadata } from "next";
import Link from "next/link";
import { CountrySwitcher } from "@/components/storefront/country-switcher";
import { cachedCategories, cachedStore, categoryHref, loadStorefront } from "./storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await cachedStore(slug);
  if (!store) return { title: "Store not found" };
  return { title: { default: store.name, template: `%s · ${store.name}` }, description: `${store.name} — product catalog`, robots: { index: true, follow: true } };
}

/**
 * Public storefront chrome. The root layout owns <html lang>, so the resolved locale goes on a
 * wrapper element; every text node below inherits it (EC-H2). hreflang alternates are skipped on
 * purpose: the locale is chosen by cookie/geo, not by URL, so there is no distinct URL per language.
 */
export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { slug } = await params;
  const ctx = await loadStorefront(slug);
  const categories = (await cachedCategories(ctx.store.id, ctx.locale)).slice(0, 6);
  const home = `/store/${encodeURIComponent(slug)}`;

  return (
    <div lang={ctx.locale} className="flex min-h-dvh flex-col bg-paper text-ink">
      <a href="#storefront-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6 md:py-5">
          <Link href={home} className="font-display text-2xl leading-none tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper md:text-3xl">
            {ctx.store.name}
          </Link>
          <CountrySwitcher country={ctx.country} />
        </div>
        {categories.length > 0 ? (
          <nav aria-label="Categories" className="mx-auto max-w-6xl px-4 md:px-6">
            <ul className="-mb-px flex gap-6 overflow-x-auto text-sm">
              <li className="shrink-0">
                <Link href={home} className="inline-block cursor-pointer border-b-2 border-transparent py-3 text-ink-muted outline-none hover:border-ink hover:text-ink focus-visible:border-brand focus-visible:text-ink">
                  All
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.category} className="shrink-0">
                  <Link href={categoryHref(slug, c.category)} className="inline-block cursor-pointer border-b-2 border-transparent py-3 text-ink-muted outline-none hover:border-ink hover:text-ink focus-visible:border-brand focus-visible:text-ink">
                    {c.category}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      <main id="storefront-main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-ink-muted md:px-6">
          <span>© {ctx.store.name}</span>
          <span>
            Catalog by <span className="font-display text-sm text-ink">CatalogForge</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
