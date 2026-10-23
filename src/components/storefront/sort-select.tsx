"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { buildCollectionHref, SORT_KEYS, type StorefrontSort } from "./collection-href";
import { t } from "./i18n";

const LABELS: Record<StorefrontSort, "sortNewest" | "sortPriceAsc" | "sortPriceDesc"> = { newest: "sortNewest", price_asc: "sortPriceAsc", price_desc: "sortPriceDesc" };

/** A real <select> that navigates on change; without JavaScript the form submits the same query with the Apply button. */
export function SortSelect({ basePath, category, sort, locale }: { basePath: string; category?: string; sort: StorefrontSort; locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <form method="get" action={basePath} className="flex items-center gap-2">
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <label htmlFor={id} className="text-sm text-ink-muted">
        {t(locale, "sort")}
      </label>
      <span className="relative inline-flex items-center">
        <select
          id={id}
          name="sort"
          key={sort}
          defaultValue={sort}
          aria-busy={pending}
          onChange={(e) => {
            const value = e.target.value;
            const next = SORT_KEYS.find((k) => k === value) ?? "newest";
            startTransition(() => router.push(buildCollectionHref(basePath, { category, sort: next })));
          }}
          className="h-11 cursor-pointer appearance-none rounded-sm border border-border bg-card py-0 pl-3 pr-9 text-sm text-ink outline-none transition-colors hover:border-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(locale, LABELS[key])}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-ink-muted" />
      </span>
      <noscript>
        <button type="submit" className="h-11 cursor-pointer rounded-sm border border-border bg-card px-3 text-sm text-ink">
          {t(locale, "apply")}
        </button>
      </noscript>
    </form>
  );
}
