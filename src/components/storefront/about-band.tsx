import Image from "next/image";
import Link from "next/link";
import { AccentText } from "./accent-text";
import { storeHref } from "./hrefs";
import { t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Paren, PAREN_LINK } from "./paren";
import { Reveal } from "./reveal";

export interface BandPhoto {
  imageId: string;
  alt: string;
}

/** One large sentence about how the catalogue is made, true by construction, with a small photo and a link into it. */
export function AboutBand({ slug, locale, storeName, languages, photo }: { slug: string; locale: string; storeName: string; languages: string; photo: BandPhoto | null }) {
  return (
    <section aria-labelledby="about-heading" className="bg-card">
      <div className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-32">
        <div className="grid gap-8 md:grid-cols-12">
          <p className="text-[13px] text-ink-muted md:col-span-2">
            <Paren>{t(locale, "aboutLabel")}</Paren>
          </p>
          <div className="md:col-span-10">
            <Reveal>
              <h2 id="about-heading" className="max-w-[24ch] font-grotesk text-[32px] leading-[1.06] sm:text-[40px] md:text-[52px] lg:text-[62px]">
                <AccentText text={t(locale, "aboutBig", { store: storeName, languages })} />
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-8 md:mt-20 md:grid-cols-10 md:items-end">
              {photo ? (
                <Reveal className="md:col-span-3">
                  <div className="relative overflow-hidden rounded-2xl bg-paper" style={{ aspectRatio: "4 / 5" }}>
                    <Image src={storefrontImageUrl(slug, photo.imageId)} alt={photo.alt} fill sizes="(min-width: 768px) 28vw, 100vw" className="object-cover" />
                  </div>
                </Reveal>
              ) : null}
              <Reveal delay={0.1} className="md:col-span-4 md:col-start-7">
                <p className="text-[15px] leading-relaxed text-ink-muted md:text-base">{t(locale, "aboutSmall", { languages })}</p>
                <Link href={`${storeHref(slug)}#products`} className={`${PAREN_LINK} mt-5 text-ink`}>
                  <Paren>{t(locale, "browseCatalogue")}</Paren>
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
