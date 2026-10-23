import Link from "next/link";
import { Bag } from "./bag";
import type { CategoryFamily } from "./categories";
import { CategoryNav } from "./category-nav";
import { CountrySwitcher } from "./country-switcher";
import { storeHref } from "./hrefs";
import { nativeLocaleName } from "./i18n";

/** Utility strip (ship-to), wordmark row with the bag, then the category navigation. */
export function ShopHeader({ slug, storeName, locale, country, countryNames, families }: { slug: string; storeName: string; locale: string; country: string | null; countryNames: Record<string, string>; families: CategoryFamily[] }) {
  return (
    <header className="border-b border-border bg-paper">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <CountrySwitcher country={country} locale={locale} names={countryNames} language={nativeLocaleName(locale)} showLabel />
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6 md:py-6">
        <Link href={storeHref(slug)} className="font-display text-[28px] leading-none tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper md:text-[36px]">
          {storeName}
        </Link>
        <Bag slug={slug} locale={locale} />
      </div>
      <CategoryNav slug={slug} locale={locale} families={families} />
    </header>
  );
}
