import type { ReactNode } from "react";
import { AboutBand, type BandPhoto } from "./about-band";
import type { CategoryFamily } from "./categories";
import { CategoryCards } from "./category-cards";
import type { CategoryPhoto } from "./category-photos";
import { CtaBand } from "./cta-band";
import { Hero } from "./hero";
import { formatList, nativeLocaleName, plural, t } from "./i18n";
import { pickPhotographed, type HeroSlide } from "./slideshow";
import { WhyCards, type WhyCard } from "./why-cards";

export interface HomeStore {
  name: string;
  locales: string[];
  countryLocaleMap: Record<string, string>;
}

/**
 * The store root around the product grid (`children`): hero, the about sentence, the category
 * cards, then below the grid the four facts and the language band. Every photo is a real product
 * photo; the bands skip the ones the hero already shows so the page does not repeat itself.
 */
export function StoreHome({ slug, locale, store, total, families, photos, slides, newest, children }: { slug: string; locale: string; store: HomeStore; total: number; families: CategoryFamily[]; photos: CategoryPhoto[]; slides: HeroSlide[]; newest: Array<{ images: Array<{ id: string; alt: string }>; title: string }>; children: ReactNode }) {
  const languages = formatList(locale, store.locales.map(nativeLocaleName));
  const bandPhotos = pickPhotographed(newest, slides.length, 6).map<BandPhoto>((p) => ({ imageId: p.images[0]?.id ?? "", alt: p.images[0]?.alt || p.title }));
  const subline = t(locale, "heroSub", { store: store.name, products: plural(locale, "products", total), languages });
  const whyCards: WhyCard[] = [
    { title: t(locale, "why1Title"), body: t(locale, "why1Body"), photo: bandPhotos[1] ?? null },
    { title: t(locale, "why2Title", { languages }), body: t(locale, "why2Body", { languages }), photo: bandPhotos[2] ?? null },
    { title: t(locale, "why3Title"), body: t(locale, "why3Body"), photo: bandPhotos[3] ?? null },
    { title: t(locale, "why4Title"), body: t(locale, "why4Body"), photo: bandPhotos[4] ?? null },
  ];

  return (
    <>
      <Hero slides={slides} slug={slug} locale={locale} subline={subline} />
      <AboutBand slug={slug} locale={locale} storeName={store.name} languages={languages} photo={bandPhotos[0] ?? null} />
      <CategoryCards slug={slug} locale={locale} families={families} photos={photos} total={total} priorityImageId={slides[0]?.imageId} />
      {children}
      <WhyCards slug={slug} locale={locale} cards={whyCards} />
      <CtaBand slug={slug} locale={locale} locales={store.locales} countryLocaleMap={store.countryLocaleMap} photo={bandPhotos[5] ?? null} />
    </>
  );
}
