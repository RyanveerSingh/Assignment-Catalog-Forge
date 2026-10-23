import type { CategoryFamily } from "./categories";
import type { CategoryPhoto } from "./category-photos";
import { CategoryTiles } from "./category-tiles";
import { HeroSlideshow } from "./hero-slideshow";
import { formatList, plural, t } from "./i18n";
import type { HeroSlide } from "./slideshow";

/**
 * The store root above the grid: the slideshow of the newest photographed products, then the
 * store's own introduction (name, what it sells, how much of it) and the category tiles.
 */
export function StoreHome({ slug, locale, storeName, total, families, photos, slides }: { slug: string; locale: string; storeName: string; total: number; families: CategoryFamily[]; photos: CategoryPhoto[]; slides: HeroSlide[] }) {
  const labels = families.map((f) => f.label);
  const tagline = labels.length > 0 ? t(locale, labels.length > 4 ? "taglineMore" : "tagline", { families: formatList(locale, labels.slice(0, 4)) }) : null;

  return (
    <>
      <HeroSlideshow slides={slides} slug={slug} locale={locale} />
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <div className="grid gap-4 md:grid-cols-12 md:items-end md:gap-8">
            <div className="md:col-span-8">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-muted">{t(locale, "catalogue")}</p>
              <h1 className="mt-3 font-display text-4xl leading-[1.02] text-ink md:text-6xl">{storeName}</h1>
              {tagline ? <p className="mt-4 max-w-xl text-base text-ink-muted md:text-lg">{tagline}</p> : null}
            </div>
            <p className="num text-sm text-ink md:col-span-4 md:text-right">
              {plural(locale, "products", total)}
              {families.length > 0 ? <span className="text-ink-muted"> · {plural(locale, "categories", families.length)}</span> : null}
            </p>
          </div>
          <CategoryTiles slug={slug} locale={locale} families={families} photos={photos} priorityImageId={slides[0]?.imageId} className="mt-10 md:mt-14" />
        </div>
      </section>
    </>
  );
}
