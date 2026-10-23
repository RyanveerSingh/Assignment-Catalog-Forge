import Link from "next/link";
import { AccentText } from "./accent-text";
import type { BandPhoto } from "./about-band";
import { nativeLocaleName, t } from "./i18n";
import { countryForLocale, nextLocale } from "./locale-country";
import { LocaleLink } from "./locale-link";
import { ParallaxPhoto } from "./parallax-photo";
import { Paren, PAREN_LINK } from "./paren";
import { Reveal } from "./reveal";

/**
 * Full-bleed photo band near the end of the home: the catalogue in another language is one click
 * away (the country cookie, like the switcher), and the maker's own page explains how it was built.
 */
export function CtaBand({ slug, locale, locales, countryLocaleMap, photo }: { slug: string; locale: string; locales: string[]; countryLocaleMap: Record<string, string>; photo: BandPhoto | null }) {
  const other = nextLocale(locale, locales);
  const country = other ? countryForLocale(other, countryLocaleMap) : null;

  return (
    <section className="relative flex min-h-[80svh] overflow-hidden bg-ink text-white">
      {photo ? <ParallaxPhoto slug={slug} imageId={photo.imageId} alt="" className="absolute inset-0" /> : null}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/50 to-transparent md:w-2/3" />
      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col justify-end px-5 py-16 md:px-8 md:py-24">
        <Reveal>
          <h2 className="max-w-[14ch] font-grotesk text-[44px] leading-[0.98] md:text-[72px] lg:text-[96px]">
            <AccentText text={t(locale, "ctaTitle")} />
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/85 md:text-[17px]">{t(locale, "ctaBody")}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-1">
            {other && country ? <LocaleLink country={country} locale={locale} label={t(locale, "openIn", { language: nativeLocaleName(other) })} className="text-white" /> : null}
            <Link href="/" className={`${PAREN_LINK} text-white`}>
              <Paren>{t(locale, "seeHowMade")}</Paren>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
