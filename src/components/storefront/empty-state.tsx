import Link from "next/link";
import { AccentText } from "./accent-text";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

/** Three honest empty states: nothing published, nothing in this category, or a page number past the end. */
export function EmptyState({ locale, kind, href }: { locale: string; kind: "store" | "category" | "page"; href: string }) {
  const title = t(locale, kind === "store" ? "nothingPublished" : kind === "category" ? "nothingInCategory" : "pageEmpty");
  return (
    <div className="relative overflow-hidden rounded-3xl bg-paper px-6 py-24 md:px-12 md:py-32">
      <span aria-hidden className="pointer-events-none absolute -bottom-[0.2em] right-4 select-none font-grotesk text-[160px] leading-none text-ink/[0.05] md:text-[280px]">
        (0)
      </span>
      <div className="relative max-w-2xl">
        <p className="text-[13px] text-ink-muted">
          <Paren>{t(locale, "catalogue")}</Paren>
        </p>
        <p className="mt-5 font-grotesk text-[40px] leading-[1.02] text-ink md:text-[64px]">
          <AccentText text={title} />
        </p>
        {kind === "store" ? (
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-muted md:text-base">{t(locale, "nothingPublishedHint")}</p>
        ) : (
          <Link href={href} className={`${PAREN_LINK} mt-6 text-ink`}>
            <Paren>{t(locale, kind === "category" ? "browseAll" : "backToFirstPage")}</Paren>
          </Link>
        )}
      </div>
    </div>
  );
}
