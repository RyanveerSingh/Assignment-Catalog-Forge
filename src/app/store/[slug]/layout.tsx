import type { Metadata } from "next";
import { groupCategories } from "@/components/storefront/categories";
import { localizedCountryNames } from "@/components/storefront/country-names";
import { t } from "@/components/storefront/i18n";
import { ShopChrome } from "@/components/storefront/shop-chrome";
import { ShopFooter } from "@/components/storefront/shop-footer";
import { ShopHeader } from "@/components/storefront/shop-header";
import { cachedCategories, cachedCategoryPhotos, cachedStore, loadStorefront } from "./storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await cachedStore(slug);
  if (!store) return { title: "Store not found" };
  return { title: { default: store.name, template: `%s · ${store.name}` }, description: `${store.name} — product catalog`, robots: { index: true, follow: true } };
}

/**
 * Public storefront chrome. The root layout owns <html lang>, so the resolved locale goes on the
 * wrapper; every text node below inherits it (EC-H2). hreflang alternates are skipped on purpose:
 * the locale is chosen by cookie/geo, not by URL, so there is no distinct URL per language.
 */
export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { slug } = await params;
  const ctx = await loadStorefront(slug);
  const [categories, photos] = await Promise.all([cachedCategories(ctx.store.id, ctx.locale), cachedCategoryPhotos(ctx.store.id, ctx.locale)]);
  const families = groupCategories(categories);
  const countryNames = localizedCountryNames(ctx.locale, ctx.country);

  return (
    <ShopChrome locale={ctx.locale}>
      <a href="#storefront-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        {t(ctx.locale, "skip")}
      </a>
      <ShopHeader slug={slug} storeName={ctx.store.name} locale={ctx.locale} country={ctx.country} countryNames={countryNames} families={families} photos={photos} />
      <main id="storefront-main" className="flex-1">
        {children}
      </main>
      <ShopFooter slug={slug} storeName={ctx.store.name} locale={ctx.locale} locales={ctx.store.locales} families={families} />
    </ShopChrome>
  );
}
