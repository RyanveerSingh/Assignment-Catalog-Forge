import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CategoryFamily } from "./categories";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";
import { categoryHref } from "./hrefs";
import { plural, t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";

const MAX_LEAVES = 8;
/**
 * The panel is `display: none` until its family is hovered or focused, so its photos are not
 * fetched on every page view and never compete with the page's own images; `@starting-style`
 * gives it the same 90 ms settle on the way in, and leaving is instant.
 */
const PANEL =
  "absolute inset-x-0 top-full z-30 hidden translate-y-0 pt-1 opacity-100 transition-[opacity,translate] duration-[90ms] ease-out starting:translate-y-1 starting:opacity-0 group-hover:block group-focus-within:block";
const LEAF = "group/leaf block cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/**
 * Desktop panel under a family: the family's name and count with a "shop all" link, and a photo
 * tile per leaf. Opened by CSS from the parent `.group` on hover and focus-within, so it needs no
 * script and the family link itself stays a plain link.
 */
export function MegaMenu({ slug, locale, family, photos }: { slug: string; locale: string; family: CategoryFamily; photos: CategoryPhoto[] }) {
  const leaves = family.leaves.slice(0, MAX_LEAVES);
  return (
    <div className={PANEL}>
      <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-8 rounded-sm bg-card p-6 shadow-sm hairline">
        <div className="flex flex-col">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{t(locale, "categories")}</p>
          <p className="mt-2 font-display text-2xl leading-tight text-ink">{family.label}</p>
          <p className="num mt-1 text-xs text-ink-muted">{plural(locale, "products", family.n)}</p>
          <Link href={categoryHref(slug, family.family)} className="mt-auto inline-flex min-h-11 cursor-pointer items-center gap-2 self-start pt-4 text-sm text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
            {t(locale, "shopAll")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-4 lg:grid-cols-4">
          {leaves.map((leaf) => {
            const photo = pickCategoryPhoto(photos, leaf.category);
            return (
              <li key={leaf.category}>
                <Link href={categoryHref(slug, leaf.category)} className={LEAF}>
                  <span className="relative block overflow-hidden rounded-sm bg-paper-deep hairline" style={{ aspectRatio: "4 / 3" }}>
                    {photo ? (
                      // A plain <img> on purpose: the panel is display:none until hovered, and next/image would still
                      // register the URL in its LCP bookkeeping, racing the page's own priority image when the two
                      // share a photo. Images are served pre-resized and unoptimized project-wide, so nothing is lost.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={storefrontImageUrl(slug, photo.thumbId)} alt="" loading="lazy" decoding="async" width={400} height={300} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover/leaf:scale-105" />
                    ) : (
                      <ImagePlaceholder />
                    )}
                  </span>
                  <span className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink group-hover/leaf:underline group-hover/leaf:underline-offset-4">{leaf.label}</span>
                    <span className="num text-xs text-ink-muted">{leaf.n}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
