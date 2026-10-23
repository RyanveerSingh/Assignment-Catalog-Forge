import Link from "next/link";
import type { CategoryFamily } from "./categories";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";
import { categoryHref } from "./hrefs";
import { plural, t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";
import { Paren, PAREN_LINK } from "./paren";

const MAX_LEAVES = 8;
/**
 * The panel is `display: none` until its family is hovered or focused, so its photos are not
 * fetched on every page view and never compete with the page's own images; `@starting-style`
 * gives it a short settle on the way in (opacity and a 4 px rise), and leaving is instant.
 */
const PANEL =
  "absolute inset-x-0 top-full z-30 hidden translate-y-0 pt-2 opacity-100 transition-[opacity,translate] duration-150 ease-out starting:translate-y-1 starting:opacity-0 group-hover:block group-focus-within:block";
const LEAF = "group/leaf block cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/**
 * Desktop panel under a family: the family's name and count with a "( Shop all )" link, and a
 * photo tile per leaf. Opened by CSS from the parent `.group` on hover and focus-within, so it
 * needs no script and the family link itself stays a plain link. Always ink on white, whatever
 * the header's chrome is doing above it.
 */
export function MegaMenu({ slug, locale, family, photos }: { slug: string; locale: string; family: CategoryFamily; photos: CategoryPhoto[] }) {
  const leaves = family.leaves.slice(0, MAX_LEAVES);
  return (
    <div className={PANEL}>
      <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-10 rounded-2xl bg-card p-7 text-ink shadow-[var(--shadow-pop)] ring-1 ring-line">
        <div className="flex flex-col">
          <p className="text-[13px] text-ink-muted">
            <Paren>{t(locale, "categories")}</Paren>
          </p>
          <p className="mt-3 font-grotesk text-[32px] leading-[1.02]">{family.label}</p>
          <p className="num mt-2 text-[13px] text-ink-muted">{plural(locale, "products", family.n)}</p>
          <Link href={categoryHref(slug, family.family)} className={`${PAREN_LINK} mt-auto self-start pt-6 text-ink`}>
            <Paren>{t(locale, "shopAll")}</Paren>
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-5 xl:grid-cols-4">
          {leaves.map((leaf) => {
            const photo = pickCategoryPhoto(photos, leaf.category);
            return (
              <li key={leaf.category}>
                <Link href={categoryHref(slug, leaf.category)} className={LEAF}>
                  <span className="relative block overflow-hidden rounded-2xl bg-paper" style={{ aspectRatio: "4 / 3" }}>
                    {photo ? (
                      // A plain <img> on purpose: the panel is display:none until hovered, and next/image would still
                      // register the URL in its LCP bookkeeping, racing the page's own priority image when the two
                      // share a photo. Images are served pre-resized and unoptimized project-wide, so nothing is lost.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={storefrontImageUrl(slug, photo.thumbId)} alt="" loading="lazy" decoding="async" width={400} height={300} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover/leaf:scale-105" />
                    ) : (
                      <ImagePlaceholder />
                    )}
                  </span>
                  <span className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="font-grotesk text-[17px] leading-tight text-ink">{leaf.label}</span>
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
