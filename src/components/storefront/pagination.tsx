import Link from "next/link";
import { cn } from "cn";
import { buildCollectionHref, type StorefrontSort } from "./collection-href";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

const CELL = "num inline-flex size-11 items-center justify-center rounded-full text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** First, last and the neighbours of the current page; gaps collapse to an ellipsis. */
function pageWindow(page: number, count: number): Array<number | "gap"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const keep = [...new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count))].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const p of keep) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("gap");
    out.push(p);
  }
  return out;
}

export function Pagination({ basePath, category, sort, page, pageCount, locale }: { basePath: string; category?: string; sort: StorefrontSort; page: number; pageCount: number; locale: string }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => buildCollectionHref(basePath, { category, sort, page: p });
  return (
    <nav aria-label={t(locale, "pagination")} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-8">
      <Edge href={page > 1 ? href(page - 1) : null} rel="prev" label={t(locale, "previous")} />
      <ol className="flex items-center gap-1">
        {pageWindow(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className={cn(CELL, "text-ink-muted")}>
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span aria-current="page" className={cn(CELL, "bg-ink text-white")}>
                  {p}
                </span>
              ) : (
                <Link href={href(p)} aria-label={t(locale, "goToPage", { page: p })} className={cn(CELL, "cursor-pointer text-ink hover:bg-paper")}>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      <Edge href={page < pageCount ? href(page + 1) : null} rel="next" label={t(locale, "next")} />
    </nav>
  );
}

function Edge({ href, rel, label }: { href: string | null; rel: "prev" | "next"; label: string }) {
  if (!href)
    return (
      <span aria-disabled="true" className={cn(PAREN_LINK, "text-ink-muted/50")}>
        <Paren>{label}</Paren>
      </span>
    );
  return (
    <Link href={href} rel={rel} className={cn(PAREN_LINK, "text-ink")}>
      <Paren>{label}</Paren>
    </Link>
  );
}
