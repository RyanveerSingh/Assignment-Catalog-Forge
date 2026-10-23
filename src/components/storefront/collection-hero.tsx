import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { flatLeaves, leafLabel, relatedLeaves, segments, titleCase, type CategoryFamily, type CategoryLeaf } from "./categories";
import { categoryHref, storeHref } from "./hrefs";
import { formatList, plural, t } from "./i18n";

const CHIP = "inline-flex h-11 cursor-pointer items-center whitespace-nowrap rounded-full border border-border bg-paper px-4 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand";
const EYEBROW = "text-xs font-medium uppercase tracking-[0.18em] text-ink-muted";

/**
 * Editorial band above the grid for category pages and deeper pages of the store root: where you
 * are, how much is here and the sibling (or child) categories. The store root itself opens with
 * `StoreHome` instead.
 */
export function CollectionHero({ slug, locale, storeName, total, families, current }: { slug: string; locale: string; storeName: string; total: number; families: CategoryFamily[]; current?: string }) {
  const chips: CategoryLeaf[] = current ? relatedLeaves(families, current).slice(0, 4) : flatLeaves(families).slice(0, 4);
  const familyLabels = families.map((f) => f.label);
  const tagline = !current && familyLabels.length > 0 ? t(locale, familyLabels.length > 4 ? "taglineMore" : "tagline", { families: formatList(locale, familyLabels.slice(0, 4)) }) : null;

  return (
    <section className="border-b border-border bg-paper-deep/50">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-14">
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
