import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import { AccentText } from "./accent-text";
import { categoryTiles, type CategoryFamily } from "./categories";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";
import { categoryHref } from "./hrefs";
import { plural, t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";
import { Paren } from "./paren";
import { RevealItem } from "./reveal";
import { slideNumber } from "./slideshow";

/**
 * Numbered white cards on the ice ground, one per family (or per leaf when there is only one
 * family): a rounded photo of the newest product beneath the path, the name, the count and a
 * "( + )". Two columns when there are two or four, so no row is left with a lone card; three otherwise.
 * A card showing the hero's first photo again is marked priority: same URL, no extra request.
 */
export function CategoryCards({ slug, locale, families, photos, total, priorityImageId }: { slug: string; locale: string; families: CategoryFamily[]; photos: CategoryPhoto[]; total: number; priorityImageId?: string }) {
  const tiles = categoryTiles(families);
  if (tiles.length === 0) return null;
  const two = tiles.length === 2 || tiles.length === 4;

  return (
    <section id="categories" aria-labelledby="shop-by-category" className="scroll-mt-[var(--header-h)] bg-paper">
      <div className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-5 md:grid-cols-12 md:items-end">
          <p className="text-[13px] text-ink-muted md:col-span-2">
            <Paren>{t(locale, "categories")}</Paren>
          </p>
          <h2 id="shop-by-category" className="font-grotesk text-[40px] leading-[1] md:col-span-7 md:text-[56px] lg:text-[64px]">
            <AccentText text={t(locale, "shopByCategoryTitle")} />
          </h2>
          <p className="num text-[13px] text-ink-muted md:col-span-3 md:text-right">
            {plural(locale, "products", total)} · {plural(locale, "categories", tiles.length)}
          </p>
        </div>

        <ul className={cn("mt-12 grid gap-5 sm:grid-cols-2", two ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
          {tiles.map((tile, i) => {
            const photo = pickCategoryPhoto(photos, tile.category);
            return (
              <RevealItem key={tile.category} index={i}>
                <Link href={categoryHref(slug, tile.category)} className="group block cursor-pointer rounded-3xl bg-card p-3 shadow-[var(--shadow-card)] outline-none transition-transform duration-300 ease-out focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper motion-safe:hover:-translate-y-1">
                  <span className={cn("relative block overflow-hidden rounded-2xl bg-paper", two ? "aspect-[3/2]" : "aspect-[4/3]")}>
                    {photo ? (
                      <Image src={storefrontImageUrl(slug, photo.imageId)} alt="" fill priority={photo.imageId === priorityImageId} sizes={two ? "(min-width: 1024px) 50vw, (min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105" />
                    ) : (
                      <ImagePlaceholder label={tile.label} />
                    )}
                    <span aria-hidden className="absolute right-3 top-3 inline-flex h-10 items-center rounded-full bg-card/95 px-3 text-[15px] text-brand">
                      <Paren>+</Paren>
                    </span>
                  </span>
                  <span className="flex items-end justify-between gap-4 px-3 pb-3 pt-5">
                    <span className="min-w-0">
                      <span className="num block text-xs text-ink-muted">{slideNumber(i)}</span>
                      <span className="mt-1 block font-grotesk text-[26px] leading-[1.02] text-ink md:text-[30px]">{tile.label}</span>
                    </span>
                    <span className="num shrink-0 pb-1 text-[13px] text-ink-muted">{plural(locale, "products", tile.n)}</span>
                  </span>
                </Link>
              </RevealItem>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
