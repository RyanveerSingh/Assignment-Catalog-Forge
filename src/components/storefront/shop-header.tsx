import Link from "next/link";
import { Bag } from "./bag";
import type { CategoryFamily } from "./categories";
import type { CategoryPhoto } from "./category-photos";
import { CountrySwitcher } from "./country-switcher";
import { categoryHref, storeHref } from "./hrefs";
import { nativeLocaleName, t } from "./i18n";
import { MegaMenu } from "./mega-menu";
import { MobileMenu } from "./mobile-menu";

const NAV_LINK = "inline-flex h-11 cursor-pointer items-center rounded-full px-3 text-[15px] opacity-80 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand";

/**
 * One row, sticky: the store name, the family links with their mega menus, the country switcher
 * and the bag. Colours come from the chrome variables on the wrapper, so the same markup is white
 * over the hero and ink on a white bar once the hero has scrolled away; the bar itself eases
 * between the two in 200 ms. The container is the positioning box of every mega menu panel.
 */
export function ShopHeader({ slug, storeName, locale, country, countryNames, families, photos }: { slug: string; storeName: string; locale: string; country: string | null; countryNames: Record<string, string>; families: CategoryFamily[]; photos: CategoryPhoto[] }) {
  const home = storeHref(slug);
  return (
    <header
      data-shop-header
      className="sticky top-0 z-40 h-[var(--header-h)] text-[var(--chrome-fg)] transition-[color,background-color,box-shadow] duration-200 ease-out"
      style={{ backgroundColor: "var(--chrome-bg)", boxShadow: "0 1px 0 var(--chrome-line)", backdropFilter: "blur(var(--chrome-blur))", WebkitBackdropFilter: "blur(var(--chrome-blur))" }}
    >
      <div className="relative mx-auto flex h-full max-w-[1440px] items-center justify-between gap-6 px-5 md:px-8">
        <Link href={home} className="inline-flex min-h-11 cursor-pointer items-center rounded-full text-[17px] font-medium uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-brand md:text-[19px]">
          {storeName}
        </Link>

        {families.length > 0 ? (
          <nav aria-label={t(locale, "categories")} className="hidden lg:block">
            <ul className="flex items-center gap-1">
              <li>
                <Link href={home} className={NAV_LINK}>
                  {t(locale, "allProducts")}
                </Link>
              </li>
              {families.map((family) => (
                <li key={family.family} className="group">
                  <Link href={categoryHref(slug, family.family)} className={NAV_LINK}>
                    {family.label}
                  </Link>
                  <MegaMenu slug={slug} locale={locale} family={family} photos={photos} />
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="flex items-center gap-1 md:gap-3">
          <CountrySwitcher country={country} locale={locale} names={countryNames} tone="chrome" className="hidden lg:flex" />
          <Bag slug={slug} locale={locale} />
          <MobileMenu slug={slug} storeName={storeName} locale={locale} country={country} countryNames={countryNames} language={nativeLocaleName(locale)} families={families} />
        </div>
      </div>
    </header>
  );
}
