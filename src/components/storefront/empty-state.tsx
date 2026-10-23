import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { t } from "./i18n";

/** Three honest empty states: nothing published, nothing in this category, or a page number past the end. */
export function EmptyState({ locale, kind, href }: { locale: string; kind: "store" | "category" | "page"; href: string }) {
  const title = t(locale, kind === "store" ? "nothingPublished" : kind === "category" ? "nothingInCategory" : "pageEmpty");
  return (
    <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed border-border px-6 py-20 text-center md:py-28">
      <PackageOpen aria-hidden className="size-8 text-brand" strokeWidth={1.4} />
      <p className="font-display text-3xl leading-tight text-ink md:text-4xl">{title}</p>
      {kind === "store" ? (
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{t(locale, "nothingPublishedHint")}</p>
      ) : (
        <Link href={href} className="mt-2 inline-flex h-11 cursor-pointer items-center rounded-sm bg-ink px-5 text-sm font-medium text-paper outline-none transition-colors hover:bg-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
          {t(locale, kind === "category" ? "browseAll" : "backToFirstPage")}
        </Link>
      )}
    </div>
  );
}
