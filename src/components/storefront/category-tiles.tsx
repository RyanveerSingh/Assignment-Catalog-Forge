import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import { categoryTiles, type CategoryFamily } from "./categories";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";
import { categoryHref } from "./hrefs";
import { plural, t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";
import { RevealItem } from "./reveal";
import { slideNumber } from "./slideshow";

const COLUMNS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

/**
 * Numbered photo tiles, one per family (or per leaf when there is only one family). The photo is
 * the newest product beneath the path. A tile that shows the hero's first slide again is marked
 * priority as well: same URL, no extra request, and next/image's LCP bookkeeping stays consistent.
 */
export function CategoryTiles({ slug, locale, families, photos, priorityImageId, className }: { slug: string; locale: string; families: CategoryFamily[]; photos: CategoryPhoto[]; priorityImageId?: string; className?: string }) {
  const tiles = categoryTiles(families);
  if (tiles.length === 0) return null;
  // One or two tiles would tower at 4:5 across half the page; they lie down instead.
  const wide = tiles.length <= 2;

  return (
    <section aria-labelledby="shop-by-category" className={className}>
      <h2 id="shop-by-category" className="font-display text-2xl text-ink md:text-3xl">
        {t(locale, "shopByCategory")}
      </h2>
      <ul className={cn("mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:gap-x-6", COLUMNS[tiles.length] ?? "lg:grid-cols-4")}>
        {tiles.map((tile, i) => {
          const photo = pickCategoryPhoto(photos, tile.category);
          return (
            <RevealItem key={tile.category} index={i}>
              <Link href={categoryHref(slug, tile.category)} className="group block cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper">
                <span className={cn("relative block overflow-hidden rounded-sm bg-paper-deep hairline", wide ? "aspect-[4/5] md:aspect-[3/2]" : "aspect-[4/5]")}>
                  {photo ? (
                    <Image src={storefrontImageUrl(slug, photo.imageId)} alt="" fill priority={photo.imageId === priorityImageId} sizes={wide ? "50vw" : "(min-width: 1024px) 25vw, 50vw"} className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105" />
                  ) : (
                    <ImagePlaceholder label={tile.label} />
                  )}
                  <span aria-hidden className="num absolute left-3 top-3 rounded-sm bg-paper/95 px-2 py-1 text-[11px] text-ink hairline">
                    {slideNumber(i)}
                  </span>
                </span>
                <span className="mt-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <span className="font-display text-lg leading-snug text-ink group-hover:underline group-hover:underline-offset-4 md:text-xl">{tile.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
                    <span className="num">{plural(locale, "products", tile.n)}</span>
                    <ArrowUpRight aria-hidden className="size-3.5 -translate-x-1 translate-y-1 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
                  </span>
                </span>
              </Link>
            </RevealItem>
          );
        })}
      </ul>
    </section>
  );
}
