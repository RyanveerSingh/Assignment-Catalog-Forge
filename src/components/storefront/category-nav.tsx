import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { flatLeaves, type CategoryFamily } from "./categories";
import type { CategoryPhoto } from "./category-photos";
import { ChipRow } from "./chip-row";
import { categoryHref, storeHref } from "./hrefs";
import { t } from "./i18n";
import { MegaMenu } from "./mega-menu";

const CHIP = "inline-flex h-11 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand";
const TOP = "inline-flex h-11 cursor-pointer items-center gap-1 border-b-2 border-transparent px-3 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand";

/**
 * Phones get one scrolling row of leaf chips; wider screens get the families, each with a mega
 * menu of its leaves. No JavaScript: the panel opens on :hover and :focus-within, and the family
 * link itself goes to the family page (a prefix match), which is also the touch fallback.
 */
export function CategoryNav({ slug, locale, families, photos }: { slug: string; locale: string; families: CategoryFamily[]; photos: CategoryPhoto[] }) {
  if (families.length === 0) return null;
  const home = storeHref(slug);
  const leaves = flatLeaves(families);

  return (
    <nav aria-label={t(locale, "categories")} className="mx-auto max-w-6xl md:px-6">
      <ChipRow className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        <li>
          <Link href={home} className={CHIP}>
            {t(locale, "all")}
          </Link>
        </li>
        {leaves.map((leaf) => (
          <li key={leaf.category}>
            <Link href={categoryHref(slug, leaf.category)} className={CHIP}>
              {leaf.label}
            </Link>
          </li>
        ))}
      </ChipRow>

      {/* The list is the panel's positioning box, so every mega menu spans the full nav width. */}
      <ul className="relative hidden items-center gap-1 md:flex">
        <li>
          <Link href={home} className={TOP}>
            {t(locale, "allProducts")}
          </Link>
        </li>
        {families.map((family) => (
          <li key={family.family} className="group">
            <Link href={categoryHref(slug, family.family)} className={TOP}>
              {family.label}
              <ChevronDown aria-hidden className="size-3.5 text-ink-muted transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
            </Link>
            <MegaMenu slug={slug} locale={locale} family={family} photos={photos} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
