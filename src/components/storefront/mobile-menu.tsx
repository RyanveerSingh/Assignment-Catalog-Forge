"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { settle } from "@/components/ext/motion";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { CategoryFamily } from "./categories";
import { CountrySwitcher } from "./country-switcher";
import { categoryHref, storeHref } from "./hrefs";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

const BIG = "group/paren block cursor-pointer rounded-md py-2 font-grotesk text-[40px] leading-[1.02] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand sm:text-[48px]";
const SMALL = "inline-flex min-h-11 cursor-pointer items-center text-[15px] text-ink-muted outline-none hover:text-ink focus-visible:text-ink";

/**
 * Below lg the families live in a full-screen sheet: big grotesk links, the leaves under each,
 * and the country switcher at the bottom. The sheet remounts on open, so the links cascade in
 * each time (transform and opacity only); under reduced motion they are simply there.
 */
export function MobileMenu({ slug, storeName, locale, country, countryNames, language, families }: { slug: string; storeName: string; locale: string; country: string | null; countryNames: Record<string, string>; language: string; families: CategoryFamily[] }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const entries: Array<{ href: string; label: string; leaves: CategoryFamily["leaves"] }> = [{ href: storeHref(slug), label: t(locale, "allProducts"), leaves: [] }, ...families.map((f) => ({ href: categoryHref(slug, f.family), label: f.label, leaves: f.leaves }))];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} aria-label={t(locale, "menu")} aria-expanded={open} className="inline-flex size-11 cursor-pointer flex-col items-center justify-center gap-[6px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden">
        <span aria-hidden className="block h-px w-6 bg-current" />
        <span aria-hidden className="block h-px w-6 bg-current" />
      </button>

      <SheetContent side="right" showCloseButton={false} className="gap-0 border-0 bg-card p-0 text-ink data-[side=right]:w-full data-[side=right]:sm:max-w-full">
        <div className="flex h-[var(--header-h)] items-center justify-between px-5">
          <SheetTitle className="font-sans text-[17px] font-medium uppercase tracking-[0.16em] text-ink">{storeName}</SheetTitle>
          <SheetDescription className="sr-only">{t(locale, "menu")}</SheetDescription>
          <button type="button" onClick={close} className={`${PAREN_LINK} text-ink`}>
            <Paren>{t(locale, "close")}</Paren>
          </button>
        </div>

        <nav aria-label={t(locale, "categories")} className="flex-1 overflow-y-auto px-5 pb-8 pt-6">
          <ul className="space-y-6">
            {entries.map((entry, i) => (
              <motion.li key={entry.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.45, 0.08 + i * 0.06)}>
                <Link href={entry.href} onClick={close} className={BIG}>
                  {entry.label}
                </Link>
                {entry.leaves.length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-x-5">
                    {entry.leaves.map((leaf) => (
                      <li key={leaf.category}>
                        <Link href={categoryHref(slug, leaf.category)} onClick={close} className={SMALL}>
                          {leaf.label} <span className="num ml-1.5 text-xs">{leaf.n}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </motion.li>
            ))}
          </ul>
        </nav>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={settle(reduce, 0.4, 0.3)} className="border-t border-line px-5 py-4">
          <CountrySwitcher country={country} locale={locale} names={countryNames} language={language} showLabel />
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}
