import Link from "next/link";
import { AnnouncementStrip } from "./announcement-strip";
import { Bag } from "./bag";
import type { CategoryFamily } from "./categories";
import type { CategoryPhoto } from "./category-photos";
import { CategoryNav } from "./category-nav";
import { CountrySwitcher } from "./country-switcher";
import { storeHref } from "./hrefs";
import { nativeLocaleName, t } from "./i18n";

/** Announcement strip, utility strip (ship-to), wordmark row with the bag, then the category navigation. */
export function ShopHeader({ slug, storeName, locale, country, countryNames, families, photos }: { slug: string; storeName: string; locale: string; country: string | null; countryNames: Record<string, string>; families: CategoryFamily[]; photos: CategoryPhoto[] }) {
  return (
    <header className="border-b border-border bg-paper">
      <AnnouncementStrip lines={[t(locale, "announce1"), t(locale, "announce2"), t(locale, "announce3")]} />
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
      <CategoryNav slug={slug} locale={locale} families={families} photos={photos} />
    </header>
  );
}
