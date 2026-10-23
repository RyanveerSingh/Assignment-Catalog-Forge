import Image from "next/image";
import Link from "next/link";
import { flatLeaves, leafLabel, relatedLeaves, segments, titleCase, type CategoryFamily, type CategoryLeaf } from "./categories";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";
import { categoryHref, storeHref } from "./hrefs";
import { plural, t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Paren, PAREN_LINK } from "./paren";

const CHIP = `${PAREN_LINK} text-ink`;

/**
 * Band above the grid for category pages and deeper pages of the store root: where you are, how
 * much is here, the sibling (or child) categories as parenthesised links, and the newest photo
 * beneath the path. The store root itself opens with `StoreHome` instead.
 */
export function CollectionHero({ slug, locale, storeName, total, families, photos, current }: { slug: string; locale: string; storeName: string; total: number; families: CategoryFamily[]; photos: CategoryPhoto[]; current?: string }) {
  const chips: CategoryLeaf[] = current ? relatedLeaves(families, current).slice(0, 6) : flatLeaves(families).slice(0, 6);
  const photo = current ? pickCategoryPhoto(photos, current) : null;

  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-8 md:px-8 md:pb-16 md:pt-14">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className={photo ? "md:col-span-8" : "md:col-span-12"}>
            {current ? <Trail slug={slug} locale={locale} path={current} /> : <p className="text-[13px] text-ink-muted"><Paren>{t(locale, "catalogue")}</Paren></p>}
            <h1 className="mt-6 font-grotesk text-[44px] leading-[0.98] md:text-[72px] lg:text-[88px]">
              {current ? leafLabel(current) : storeName}
              <span className="font-serif-italic mt-2 block text-[0.52em] leading-[1.1] text-ink-muted">{plural(locale, "products", total)}</span>
            </h1>
            {chips.length > 0 || current ? (
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-1">
                {current ? (
                  <li>
                    <Link href={storeHref(slug)} className={CHIP}>
                      <Paren>{t(locale, "allProducts")}</Paren>
                    </Link>
                  </li>
                ) : null}
                {chips.map((leaf) => (
                  <li key={leaf.category}>
                    <Link href={categoryHref(slug, leaf.category)} className={CHIP}>
                      <Paren>
                        {leaf.label} <span className="num ml-1 text-[13px] text-ink-muted">{leaf.n}</span>
                      </Paren>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {photo ? (
            <div className="md:col-span-4">
              <div className="relative overflow-hidden rounded-3xl bg-paper-deep" style={{ aspectRatio: "4 / 5" }}>
                <Image src={storefrontImageUrl(slug, photo.imageId)} alt={photo.alt} fill priority sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** "Home / Home & Garden / Decor": each ancestor links to its own (prefix-matched) collection. */
function Trail({ slug, locale, path }: { slug: string; locale: string; path: string }) {
  const parts = segments(path);
  const parents = parts.slice(0, -1);
  const link = "cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <nav aria-label={t(locale, "breadcrumb")} className="text-[13px] text-ink-muted">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href={storeHref(slug)} className={link}>
            {t(locale, "home")}
          </Link>
        </li>
        {parents.map((seg, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden>/</span>
            <Link href={categoryHref(slug, parts.slice(0, i + 1).join(" > "))} className={link}>
              {titleCase(seg)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
