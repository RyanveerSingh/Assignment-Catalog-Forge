import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { flatLeaves, type CategoryFamily } from "./categories";
import { ChipRow } from "./chip-row";
import { categoryHref, storeHref } from "./hrefs";
import { t } from "./i18n";

const CHIP = "inline-flex h-11 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand";
const TOP = "inline-flex h-11 cursor-pointer items-center gap-1 border-b-2 border-transparent px-3 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:border-brand";
const ITEM = "flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-sm px-3 text-sm text-ink outline-none transition-colors hover:bg-paper-deep focus-visible:bg-paper-deep focus-visible:ring-2 focus-visible:ring-brand";
/** 90 ms is below the threshold where a panel reads as "animating"; it just stops appearing abruptly. Visibility snaps so leaving is instant. */
const PANEL =
  "invisible absolute left-0 top-full z-30 min-w-60 translate-y-1 pt-1 opacity-0 transition-[opacity,translate] duration-[90ms] ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100";

/**
 * Phones get one scrolling row of leaf chips; wider screens get the families with a hover/focus
 * dropdown of their leaves. No JavaScript: the panel opens on :hover and :focus-within, and the
 * family link itself goes to the family page (a prefix match), which is also the touch fallback.
 */
export function CategoryNav({ slug, locale, families }: { slug: string; locale: string; families: CategoryFamily[] }) {
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

      <ul className="hidden items-center gap-1 md:flex">
        <li>
          <Link href={home} className={TOP}>
            {t(locale, "allProducts")}
          </Link>
        </li>
        {families.map((family) => (
          <li key={family.family} className="group relative">
            <Link href={categoryHref(slug, family.family)} className={TOP}>
              {family.label}
              <ChevronDown aria-hidden className="size-3.5 text-ink-muted transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
            </Link>
            <div className={PANEL}>
              <ul className="rounded-sm bg-card p-2 shadow-sm hairline">
                {family.leaves.map((leaf) => (
                  <li key={leaf.category}>
                    <Link href={categoryHref(slug, leaf.category)} className={ITEM}>
                      <span>{leaf.label}</span>
                      <span className="num text-xs text-ink-muted">{leaf.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}
