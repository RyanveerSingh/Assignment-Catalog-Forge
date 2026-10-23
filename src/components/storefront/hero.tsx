"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { AccentText } from "./accent-text";
import { productHref, storeHref } from "./hrefs";
import { t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Paren, PAREN_LINK } from "./paren";
import { Price } from "./price";
import { HERO_FADE_S, HERO_INTERVAL_MS, HERO_ZOOM_S, HERO_ZOOM_SCALE, slideNumber, stepIndex, type HeroSlide } from "./slideshow";

const WHITE_LINK = `${PAREN_LINK} text-white`;
/** Each headline line rises out of a clipped box, pure CSS so it also plays before hydration; the clip has room for descenders. */
const LINE_CLIP = "block overflow-hidden pb-[0.12em] -mb-[0.12em]";
const LINE_RISE = "block animate-in fade-in slide-in-from-bottom-[110%] fill-mode-both duration-[900ms] ease-out";

/**
 * Full-bleed, one viewport tall, the three newest photographed products crossfading under a
 * static headline. Each slide scales from 1 to 1.06 over eight seconds while it is up (the Ken
 * Burns drift); the next slide fades in over it in 1.2 s. The outgoing slide keeps its scale until
 * it has fully faded, then resets while hidden, so nothing ever jumps. Auto-advance stops while
 * focus is inside, while the tab is hidden, and entirely under reduced motion, where the first
 * slide simply stands still. Slides after the first mount after hydration so they never compete
 * with the first photo (the LCP) for bandwidth.
 */
export function Hero({ slides, slug, locale, subline }: { slides: HeroSlide[]; slug: string; locale: string; subline: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [warm, setWarm] = useState(false);
  const count = slides.length;
  const go = useCallback((delta: number) => setIndex((i) => stepIndex(i, count, delta)), [count]);

  useEffect(() => setWarm(true), []);

  useEffect(() => {
    if (reduce || focused || hidden || count < 2) return;
    const id = window.setInterval(() => go(1), HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduce, focused, hidden, count, go]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else return;
    e.preventDefault();
  };

  const lines = [t(locale, "heroLine1"), t(locale, "heroLine2"), t(locale, "heroLine3")];
  const paused = focused || hidden;

  return (
    <section
      data-shop-hero
      aria-roledescription="carousel"
      aria-label={t(locale, "featured")}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="relative -mt-[var(--header-h)] flex min-h-[100svh] flex-col overflow-hidden bg-ink text-white"
    >
      <div aria-live={paused ? "polite" : "off"} className="absolute inset-0">
        {slides.map((slide, i) => {
          const active = i === index;
          if (i > 0 && !warm) return null;
          return (
            <motion.div
              key={slide.handle}
              role="group"
              aria-roledescription="slide"
              aria-label={`${t(locale, "productOf", { n: i + 1, total: count })}: ${slide.title}`}
              aria-hidden={!active}
              initial={false}
              animate={{ opacity: active ? 1 : 0 }}
              transition={settle(reduce, HERO_FADE_S)}
              className={cn("absolute inset-0", active ? "z-10" : "z-0")}
            >
              {/* An explicit `initial` keeps the server and the first client render identical (`reduce` is null on the server); the drift only starts after mount. */}
              <motion.div
                initial={{ scale: 1 }}
                animate={{ scale: active && !reduce ? HERO_ZOOM_SCALE : 1 }}
                transition={active && !reduce ? { duration: HERO_ZOOM_S, ease: "linear" } : { duration: 0, delay: reduce ? 0 : HERO_FADE_S + 0.1 }}
                className="absolute inset-0 will-change-transform"
              >
                <Image src={storefrontImageUrl(slug, slide.imageId)} alt={i === 0 ? slide.alt : ""} fill priority={i === 0} sizes="100vw" className="object-cover" />
              </motion.div>
            </motion.div>
          );
        })}
      </div>
      {/* Two scrims: a bottom-up one for the subline and links, a left-right one behind the headline. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-full bg-gradient-to-r from-black/55 via-black/15 to-transparent md:w-3/4" />

      <div className="relative z-20 mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-5 pb-7 pt-[calc(var(--header-h)+1.5rem)] md:px-8 md:pb-12 md:pt-[calc(var(--header-h)+7vh)]">
        <h1 className="mt-auto font-grotesk text-[46px] leading-[0.98] tracking-[-0.045em] sm:text-[60px] md:mt-[3vh] md:text-[84px] lg:text-[104px]">
          {lines.map((line, i) => (
            <span key={i} className={LINE_CLIP}>
              <span className={LINE_RISE} style={{ animationDelay: `${150 + i * 110}ms` }}>
                <AccentText text={line} />
              </span>
            </span>
          ))}
        </h1>

        <div className="mt-8 grid gap-7 md:mt-auto md:grid-cols-12 md:items-end md:gap-8">
          <div className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 ease-out delay-500 md:col-span-6 lg:col-span-5">
            <p className="max-w-md text-[15px] leading-relaxed text-white/85 md:text-[17px]">{subline}</p>
            <div className="mt-5 flex flex-wrap gap-x-7 gap-y-1">
              <Link href={`${storeHref(slug)}#products`} className={WHITE_LINK}>
                <Paren>{t(locale, "shopAll")}</Paren>
              </Link>
              <a href="#categories" className={WHITE_LINK}>
                <Paren>{t(locale, "shopByCategory")}</Paren>
              </a>
            </div>
          </div>

          {count > 0 ? (
            <div className="animate-in fade-in fill-mode-both duration-700 ease-out delay-700 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 md:col-span-6 md:justify-end lg:col-span-7">
              <div className="grid">
                {slides.map((slide, i) => {
                  const active = i === index;
                  return (
                    <motion.p key={slide.handle} aria-hidden={!active} initial={false} animate={{ opacity: active ? 1 : 0, y: active ? 0 : 6 }} transition={settle(reduce, 0.5, active ? 0.3 : 0)} className={cn("col-start-1 row-start-1 text-[13px] leading-snug text-white/80 md:text-right", !active && "pointer-events-none")}>
                      <span className="block text-white">{slide.title}</span>
                      <span className="block">
                        <Price summary={slide.price} locale={locale} className="num" />
                        {" · "}
                        <Link href={productHref(slug, slide.handle)} tabIndex={active ? undefined : -1} className="group/paren inline-flex min-h-11 cursor-pointer items-center rounded-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand">
                          <Paren>{t(locale, "view")}</Paren>
                        </Link>
                      </span>
                    </motion.p>
                  );
                })}
              </div>
              {count > 1 ? (
                <div className="flex items-center gap-3">
                  <span aria-hidden data-slide-counter className="num text-[13px] text-white/80">
                    {slideNumber(index)} / {slideNumber(count - 1)}
                  </span>
                  <div className="flex items-center">
                    {slides.map((slide, i) => {
                      const active = i === index;
                      return (
                        <button key={slide.handle} type="button" onClick={() => setIndex(i)} aria-label={t(locale, "productOf", { n: i + 1, total: count })} aria-current={active ? "true" : undefined} className="group inline-flex size-11 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white">
                          <span className={cn("block size-[7px] rounded-full transition-[background-color,transform] duration-300", active ? "scale-125 bg-white" : "bg-white/40 group-hover:bg-white/80")} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
