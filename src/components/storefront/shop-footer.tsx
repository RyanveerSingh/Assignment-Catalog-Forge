import Link from "next/link";
import type { CategoryFamily } from "./categories";
import { categoryHref } from "./hrefs";
import { formatList, nativeLocaleName, t } from "./i18n";
import { Paren } from "./paren";

const LINK = "inline-flex min-h-10 cursor-pointer items-center text-[15px] text-ink outline-none transition-colors hover:text-ink-muted focus-visible:ring-2 focus-visible:ring-brand";

/** The store's name as large as the page allows, three short columns, and the maker's credit. */
export function ShopFooter({ slug, storeName, locale, locales, families }: { slug: string; storeName: string; locale: string; locales: string[]; families: CategoryFamily[] }) {
  const languages = locales.map(nativeLocaleName);
  return (
    <footer className="bg-paper text-ink">
      <div className="mx-auto max-w-[1440px] px-5 pb-8 pt-16 md:px-8 md:pt-24">
        <p className="font-grotesk text-[clamp(44px,11vw,168px)] leading-[0.92] tracking-[-0.05em]">{storeName}</p>
        <p className="mt-4 text-[15px] text-ink-muted md:text-base">{t(locale, "announce1")}</p>

        <div className="mt-14 grid gap-10 md:grid-cols-[1.3fr_1fr_1fr] md:gap-8">
          <div>
            <h2 className="text-[13px] text-ink-muted">
              <Paren>{t(locale, "about")}</Paren>
            </h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink">{t(locale, "aboutText", { store: storeName, languages: formatList(locale, languages) })}</p>
          </div>
          <div>
            <h2 className="text-[13px] text-ink-muted">
              <Paren>{t(locale, "languages")}</Paren>
            </h2>
            <ul className="mt-2">
              {languages.map((name, i) => (
                <li key={locales[i] ?? name} lang={locales[i]} className="flex min-h-10 items-center text-[15px] text-ink">
                  {name}
                </li>
              ))}
            </ul>
          </div>
          {families.length > 0 ? (
            <div>
              <h2 className="text-[13px] text-ink-muted">
                <Paren>{t(locale, "categories")}</Paren>
              </h2>
              <ul className="mt-2">
                {families.map((f) => (
                  <li key={f.family}>
                    <Link href={categoryHref(slug, f.family)} className={LINK}>
                      {f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink-muted">
          <span>
            © {new Date().getFullYear()} {storeName}
          </span>
          <span>
            {t(locale, "poweredBy")}{" "}
            <Link href="/" className="font-medium text-ink outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand">
              CatalogForge
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
