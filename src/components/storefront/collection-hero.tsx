import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { flatLeaves, leafLabel, relatedLeaves, segments, titleCase, type CategoryFamily, type CategoryLeaf } from "./categories";
import { categoryHref, productHref, storeHref } from "./hrefs";
import { formatList, plural, t } from "./i18n";
import { storefrontImageUrl } from "./image-url";

const CHIP = "inline-flex h-11 cursor-pointer items-center whitespace-nowrap rounded-full border border-border bg-paper px-4 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand";
const EYEBROW = "text-xs font-medium uppercase tracking-[0.18em] text-ink-muted";

export interface HeroFeature {
  handle: string;
  title: string;
  imageId: string;
  alt: string;
}

/**
 * Editorial band above the grid. The store root introduces the shop (name, what it sells, the most
 * populated categories, the newest photographed product); a category page shows where you are
 * and its sibling categories instead.
 */
export function CollectionHero({ slug, locale, storeName, total, families, current, feature }: { slug: string; locale: string; storeName: string; total: number; families: CategoryFamily[]; current?: string; feature?: HeroFeature }) {
  const chips: CategoryLeaf[] = current ? relatedLeaves(families, current).slice(0, 4) : flatLeaves(families).slice(0, 4);
  const familyLabels = families.map((f) => f.label);
  const tagline = !current && familyLabels.length > 0 ? t(locale, familyLabels.length > 4 ? "taglineMore" : "tagline", { families: formatList(locale, familyLabels.slice(0, 4)) }) : null;

  return (
    <section className="border-b border-border bg-paper-deep/50">
      <div className="mx-auto grid max-w-6xl items-end gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:px-6 md:py-14">
        <div>
          {current ? <Trail slug={slug} locale={locale} path={current} /> : <p className={EYEBROW}>{t(locale, "catalogue")}</p>}
          <h1 className="mt-3 font-display text-4xl leading-[1.02] text-ink md:text-6xl">{current ? leafLabel(current) : storeName}</h1>
          {tagline ? <p className="mt-4 max-w-xl text-base text-ink-muted md:text-lg">{tagline}</p> : null}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="num mr-2 text-sm text-ink">{plural(locale, "products", total)}</span>
            {current ? (
              <Link href={storeHref(slug)} className={CHIP}>
                {t(locale, "allProducts")}
              </Link>
            ) : null}
            {chips.map((leaf) => (
              <Link key={leaf.category} href={categoryHref(slug, leaf.category)} className={CHIP}>
                {leaf.label}
              </Link>
            ))}
          </div>
        </div>
        {feature ? (
          <Link href={productHref(slug, feature.handle)} className="group hidden cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper md:block">
            <span className="relative block overflow-hidden rounded-sm bg-paper-deep hairline" style={{ aspectRatio: "5 / 4" }}>
              <Image src={storefrontImageUrl(slug, feature.imageId)} alt={feature.alt} fill priority sizes="22rem" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]" />
            </span>
            <span className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-display text-ink group-hover:underline group-hover:underline-offset-4">{feature.title}</span>
              <span className="text-xs uppercase tracking-[0.14em] text-ink-muted">{t(locale, "new")}</span>
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** "Home › Home & Garden › Decor": each ancestor links to its own (prefix-matched) collection. */
function Trail({ slug, locale, path }: { slug: string; locale: string; path: string }) {
  const parts = segments(path);
  const parents = parts.slice(0, -1);
  const link = "cursor-pointer rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <nav aria-label={t(locale, "breadcrumb")} className={EYEBROW}>
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href={storeHref(slug)} className={link}>
            {t(locale, "home")}
          </Link>
        </li>
        {parents.map((seg, i) => (
          <li key={i} className="flex items-center gap-1">
            <ChevronRight aria-hidden className="size-3" />
            <Link href={categoryHref(slug, parts.slice(0, i + 1).join(" > "))} className={link}>
              {titleCase(seg)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
