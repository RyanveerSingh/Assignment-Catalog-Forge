"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Compass } from "lucide-react";
import { storeHref } from "./hrefs";
import { t } from "./i18n";

/**
 * The 404 route has no params of its own, so the store and the language come from the page it
 * sits in: the slug from the URL, the language from the `lang` the layout put on its wrapper. Both
 * are read before first paint; without JavaScript the English copy stands.
 */
export function NotFoundBody() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState("en");

  useLayoutEffect(() => {
    const lang = ref.current?.closest("[lang]")?.getAttribute("lang");
    if (lang) setLocale(lang);
  }, []);

  const slug = /^\/store\/([^/]+)/.exec(pathname ?? "")?.[1];
  let href = "/";
  if (slug) {
    try {
      href = storeHref(decodeURIComponent(slug));
    } catch {
      href = storeHref(slug);
    }
  }

  return (
    <div ref={ref} className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-20 text-center md:px-6 md:py-28">
      <Compass aria-hidden className="size-8 text-brand" strokeWidth={1.4} />
      <p className="num text-xs text-ink-muted">404</p>
      <h1 className="font-display text-4xl leading-[1.04] text-ink md:text-5xl">{t(locale, "notFoundTitle")}</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-muted">{t(locale, "notFoundHint")}</p>
      <Link href={href} className="mt-2 inline-flex h-11 cursor-pointer items-center rounded-sm bg-ink px-5 text-sm font-medium text-paper outline-none transition-colors hover:bg-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper">
        {t(locale, "backToStore")}
      </Link>
    </div>
  );
}
