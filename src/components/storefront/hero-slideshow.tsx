"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FocusEvent, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { productHref } from "./hrefs";
import { t } from "./i18n";
import { storefrontImageUrl } from "./image-url";
import { Price } from "./price";
import { HERO_INTERVAL_MS, slideNumber, stepIndex, type HeroSlide } from "./slideshow";

const ROUND = "inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-paper text-ink hairline outline-none transition-colors hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper";

/**
 * The three newest photographed products, one at a time: photo left, title and price right. Slides
 * are stacked and crossfade (opacity only), the text of every slide shares one grid cell so the
 * column keeps the height of the tallest title and nothing below it moves. Auto-advance stops while
 * the pointer or focus is inside, while the tab is hidden, and entirely under reduced motion.
 */
export function HeroSlideshow({ slides, slug, locale }: { slides: HeroSlide[]; slug: string; locale: string }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  const count = slides.length;
  const go = useCallback((delta: number) => setIndex((i) => stepIndex(i, count, delta)), [count]);

  useEffect(() => {
    if (reduce || hovered || hidden || count < 2) return;
    const id = window.setInterval(() => go(1), HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduce, hovered, hidden, count, go]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else return;
    e.preventDefault();
  };

  if (count === 0) return null;
  // Announce slide changes only while a person is steering them; `reduce` stays out of rendered attributes (it is null on the server).
  const paused = hovered || hidden;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t(locale, "featured")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="border-b border-border bg-paper-deep/50"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-12 md:items-center md:gap-10 md:px-6 md:py-12">
        <div aria-live={paused ? "polite" : "off"} className="relative overflow-hidden rounded-sm bg-paper-deep hairline md:col-span-7" style={{ aspectRatio: "1 / 1" }}>
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <motion.div
                key={slide.handle}
                role="group"
                aria-roledescription="slide"
                aria-label={t(locale, "productOf", { n: i + 1, total: count })}
                aria-hidden={!active}
                initial={false}
                animate={{ opacity: active ? 1 : 0 }}
                transition={settle(reduce, 0.7)}
                className={cn("absolute inset-0", active ? "z-10" : "z-0")}
              >
                <Link href={productHref(slug, slide.handle)} tabIndex={active ? undefined : -1} aria-label={slide.title} className="relative block h-full w-full cursor-pointer outline-none">
                  {/* Only the first slide is the LCP candidate; the others arrive while it is on screen. */}
                  <Image src={storefrontImageUrl(slug, slide.imageId)} alt={slide.alt} fill priority={i === 0} sizes="(min-width: 768px) 56vw, 100vw" className="object-cover" />
                </Link>
              </motion.div>
            );
          })}
          <span aria-hidden className="num absolute bottom-3 left-3 z-20 rounded-sm bg-paper/95 px-2 py-1 text-xs text-ink hairline">
            {slideNumber(index)} / {slideNumber(count - 1)}
          </span>
        </div>

        <div className="md:col-span-5">
          <div className="grid">
            {slides.map((slide, i) => {
              const active = i === index;
              return (
                <motion.div
                  key={slide.handle}
                  aria-hidden={!active}
                  initial={false}
                  animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }}
                  transition={settle(reduce, 0.5, active ? 0.15 : 0)}
                  className={cn("col-start-1 row-start-1", !active && "pointer-events-none")}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
                    {t(locale, "newIn")}
                    {slide.category ? <span className="text-ink-muted"> · {slide.category}</span> : null}
                  </p>
                  <p className="mt-3 font-display text-3xl leading-[1.04] text-ink md:text-5xl">{slide.title}</p>
                  <p className="mt-4 text-lg text-ink">
                    <Price summary={slide.price} locale={locale} />
                  </p>
                  <Link href={productHref(slug, slide.handle)} tabIndex={active ? undefined : -1} className={cn("mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-brand", FOCUS)}>
                    {t(locale, "view")}
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {count > 1 ? (
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex items-center">
                {slides.map((slide, i) => {
                  const active = i === index;
                  return (
                    <button key={slide.handle} type="button" onClick={() => setIndex(i)} aria-label={t(locale, "productOf", { n: i + 1, total: count })} aria-current={active ? "true" : undefined} className="group inline-flex size-11 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      <span className={cn("block size-2 rounded-full transition-[background-color,transform] duration-300", active ? "scale-125 bg-ink" : "bg-ink/25 group-hover:bg-ink/60")} />
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => go(-1)} aria-label={t(locale, "previousProduct")} className={ROUND}>
                  <ChevronLeft aria-hidden className="size-5" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t(locale, "nextProduct")} className={ROUND}>
                  <ChevronRight aria-hidden className="size-5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
