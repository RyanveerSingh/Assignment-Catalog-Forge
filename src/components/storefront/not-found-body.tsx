"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { AccentText } from "./accent-text";
import { storeHref } from "./hrefs";
import { t } from "./i18n";
import { Paren, PAREN_LINK } from "./paren";

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
    <div ref={ref} className="relative overflow-hidden bg-card">
      <span aria-hidden className="pointer-events-none absolute -bottom-[0.2em] right-5 select-none font-grotesk text-[200px] leading-none text-ink/[0.05] md:text-[400px]">
        (404)
      </span>
      <div className="relative mx-auto max-w-[1440px] px-5 py-24 md:px-8 md:py-40">
        <p className="num text-[13px] text-ink-muted">404</p>
        <h1 className="mt-5 max-w-3xl font-grotesk text-[44px] leading-[1.02] text-ink md:text-[72px] lg:text-[88px]">
          <AccentText text={t(locale, "notFoundTitle")} />
        </h1>
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-muted md:text-base">{t(locale, "notFoundHint")}</p>
        <Link href={href} className={`${PAREN_LINK} mt-6 text-ink`}>
          <Paren>{t(locale, "backToStore")}</Paren>
        </Link>
      </div>
    </div>
  );
}
