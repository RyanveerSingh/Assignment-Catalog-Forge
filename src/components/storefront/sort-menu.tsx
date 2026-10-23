"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildCollectionHref, SORT_KEYS, type StorefrontSort } from "./collection-href";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

const LABELS: Record<StorefrontSort, "sortNewest" | "sortPriceAsc" | "sortPriceDesc"> = { newest: "sortNewest", price_asc: "sortPriceAsc", price_desc: "sortPriceDesc" };

/**
 * "( Sort: Newest )" opening a small menu; each choice is a navigation, so every order has a URL.
 * Without JavaScript the three orders are plain links.
 */
export function SortMenu({ basePath, category, sort, locale }: { basePath: string; category?: string; sort: StorefrontSort; locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const href = (key: StorefrontSort) => buildCollectionHref(basePath, { category, sort: key });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-busy={pending} className={`${PAREN_LINK} text-ink`}>
          <Paren>
            {t(locale, "sort")}: {t(locale, LABELS[sort])}
          </Paren>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="min-w-56 rounded-2xl bg-card p-2 text-ink shadow-[var(--shadow-pop)] ring-1 ring-line">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => {
              const next = SORT_KEYS.find((k) => k === value) ?? "newest";
              startTransition(() => router.push(href(next)));
            }}
          >
            {SORT_KEYS.map((key) => (
              <DropdownMenuRadioItem key={key} value={key} className="cursor-pointer rounded-xl px-3 py-2.5 text-[15px] text-ink focus:bg-paper focus:text-ink">
                {t(locale, LABELS[key])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <noscript>
        <ul className="flex flex-wrap gap-4">
          {SORT_KEYS.map((key) => (
            <li key={key}>
              <Link href={href(key)} className={`${PAREN_LINK} text-ink`}>
                <Paren>{t(locale, LABELS[key])}</Paren>
              </Link>
            </li>
          ))}
        </ul>
      </noscript>
    </>
  );
}
