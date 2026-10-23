import Link from "next/link";
import type { CategoryFamily } from "./categories";
import { categoryHref } from "./hrefs";
import { formatList, nativeLocaleName, t } from "./i18n";

const HEADING = "font-sans text-xs font-medium uppercase tracking-[0.14em] text-ink-muted";
const LINK = "inline-flex min-h-9 cursor-pointer items-center text-sm text-ink outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand";

export function ShopFooter({ slug, storeName, locale, locales, families }: { slug: string; storeName: string; locale: string; locales: string[]; families: CategoryFamily[] }) {
  const languages = locales.map(nativeLocaleName);
  return (
    <footer className="mt-20 border-t border-border bg-paper-deep/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
        <div>
          <p className="font-display text-2xl text-ink">{storeName}</p>
          <h2 className={`${HEADING} mt-5`}>{t(locale, "about")}</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">{t(locale, "aboutText", { store: storeName, languages: formatList(locale, languages) })}</p>
        </div>
        <div>
          <h2 className={HEADING}>{t(locale, "languages")}</h2>
          <ul className="mt-2">
            {languages.map((name, i) => (
              <li key={locales[i] ?? name} lang={locales[i]} className="flex min-h-9 items-center text-sm text-ink">
                {name}
              </li>
            ))}
          </ul>
        </div>
        {families.length > 0 ? (
          <div>
            <h2 className={HEADING}>{t(locale, "categories")}</h2>
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
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-ink-muted md:px-6">
          <span>
            © {new Date().getFullYear()} {storeName}
          </span>
          <span>
            {t(locale, "poweredBy")}{" "}
            <Link href="/" className="font-display text-sm text-ink outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand">
              CatalogForge
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
