import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { buildCollectionHref, type StorefrontSort } from "./collection-href";
import { t } from "./i18n";

const CELL = "inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";

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
    <nav aria-label={t(locale, "pagination")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
      <Edge href={page > 1 ? href(page - 1) : null} rel="prev">
        <ChevronLeft aria-hidden className="size-4" /> {t(locale, "previous")}
      </Edge>
      <ol className="flex items-center gap-1">
        {pageWindow(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className={cn(CELL, "text-ink-muted")}>
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <span aria-current="page" className={cn(CELL, "num bg-ink text-paper")}>
                  {p}
                </span>
              ) : (
                <Link href={href(p)} aria-label={t(locale, "goToPage", { page: p })} className={cn(CELL, "num cursor-pointer text-ink hover:bg-paper-deep")}>
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      <Edge href={page < pageCount ? href(page + 1) : null} rel="next">
        {t(locale, "next")} <ChevronRight aria-hidden className="size-4" />
      </Edge>
    </nav>
  );
}

function Edge({ href, rel, children }: { href: string | null; rel: "prev" | "next"; children: React.ReactNode }) {
  if (!href)
    return (
      <span aria-disabled="true" className={cn(CELL, "text-ink-muted/50")}>
        {children}
      </span>
    );
  return (
    <Link href={href} rel={rel} className={cn(CELL, "cursor-pointer text-ink hover:bg-paper-deep")}>
      {children}
    </Link>
  );
}
