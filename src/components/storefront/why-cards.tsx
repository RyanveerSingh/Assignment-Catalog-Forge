"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { AccentText } from "./accent-text";
import type { BandPhoto } from "./about-band";
import { t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Paren } from "./paren";
import { Reveal } from "./reveal";
import { slideNumber } from "./slideshow";

export interface WhyCard {
  title: string;
  body: string;
  photo: BandPhoto | null;
}

const STEP_REM = 1.5;

/**
 * Four white cards that stick as the page scrolls, each a little lower than the one before, so
 * they pile up like a deck; a card shrinks a touch (scale, scroll-linked) as the next one covers it.
 * A giant ghost "(01)" sits behind each. Under reduced motion they are a plain stack: both the
 * sticking and the scroll-linked transform are switched off by media query, not by script, so
 * the server HTML and the first client render stay identical.
 */
export function WhyCards({ slug, locale, cards }: { slug: string; locale: string; cards: WhyCard[] }) {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: container, offset: ["start start", "end end"] });

  return (
    <section aria-labelledby="why-heading" className="bg-paper">
      <div className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-5 md:grid-cols-12 md:items-end">
          <p className="text-[13px] text-ink-muted md:col-span-2">
            <Paren>{t(locale, "whyLabel")}</Paren>
          </p>
          <Reveal className="md:col-span-7">
            <h2 id="why-heading" className="font-grotesk text-[40px] leading-[1] md:text-[56px] lg:text-[64px]">
              <AccentText text={t(locale, "whyTitle")} />
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-3">
            <p className="text-[15px] leading-relaxed text-ink-muted">{t(locale, "whyIntro")}</p>
          </Reveal>
        </div>

        <div ref={container} className="mt-12 space-y-6 md:mt-16">
          {cards.map((card, i) => (
            <Card key={card.title} slug={slug} card={card} index={i} count={cards.length} progress={scrollYProgress} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ slug, card, index, count, progress }: { slug: string; card: WhyCard; index: number; count: number; progress: MotionValue<number> }) {
  // The card's own slot of the section's scroll: it is fully covered by the end of the slot.
  const start = index / count;
  const end = (index + 1) / count;
  const last = index === count - 1;
  const scale = useTransform(progress, [start, end], [1, last ? 1 : 0.94]);
  const number = slideNumber(index);

  return (
    <motion.article
      style={{ scale, top: `calc(var(--header-h) + ${index * STEP_REM}rem)` }}
      className="relative overflow-hidden rounded-3xl bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-line motion-safe:sticky motion-safe:origin-top motion-safe:will-change-transform motion-reduce:transform-none! md:p-12 lg:p-14"
    >
      <span aria-hidden className="pointer-events-none absolute -bottom-[0.22em] left-4 select-none font-grotesk text-[140px] leading-none text-ink/[0.05] md:text-[260px] lg:text-[320px]">
        ({number})
      </span>
      <div className="relative grid gap-8 md:grid-cols-12 md:items-center md:gap-10">
        <div className="md:col-span-6 lg:col-span-5">
          <p className="text-[15px] text-brand">
            <Paren>{number}</Paren>
          </p>
          <h3 className="mt-5 font-grotesk text-[30px] leading-[1.04] md:text-[40px] lg:text-[46px]">{card.title}</h3>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-muted md:text-[17px]">{card.body}</p>
        </div>
        {card.photo ? (
          <div className="md:col-span-6 md:col-start-7">
            <div className="relative overflow-hidden rounded-2xl bg-paper" style={{ aspectRatio: "4 / 3" }}>
              <Image src={storefrontImageUrl(slug, card.photo.imageId)} alt={card.photo.alt} fill sizes="(min-width: 768px) 46vw, 100vw" className="object-cover" />
            </div>
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
