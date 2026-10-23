"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { StorefrontImage } from "@/db/schema";
import { t } from "./i18n";
import { ImagePlaceholder } from "./image-placeholder";
import { storefrontImageUrl } from "./image-url";
import { zoomOrigin } from "./zoom-origin";

const ARROW = "absolute top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-paper/90 text-ink hairline outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-brand md:inline-flex";
/** Lens zoom only where there is a precise pointer to steer it: desktop widths with a mouse or trackpad. */
const ZOOM_MEDIA = "(min-width: 768px) and (hover: hover) and (pointer: fine)";
const ZOOM_SCALE = 1.8;

/**
 * Below md the slides are a scroll-snap track: swiping is native scrolling and the active index is
 * read back from the scroll position. From md up the same slides stack and crossfade instead: the
 * incoming slide fades in on top while the outgoing one waits underneath, so the paper behind never
 * shows through mid-fade. Thumbnails, arrows and arrow keys drive both through one `go()`. On
 * desktop the active photo scales up under the pointer (a transform anchored at the cursor), so
 * the part being looked at stays put.
 */
export function Gallery({ images, storeSlug, title, locale }: { images: StorefrontImage[]; storeSlug: string; title: string; locale: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const count = images.length;

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!window.matchMedia(ZOOM_MEDIA).matches) return;
    setZoom(zoomOrigin(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };

  const go = useCallback(
    (next: number) => {
      const el = trackRef.current;
      if (!el || count === 0) return;
      const clamped = Math.max(0, Math.min(count - 1, next));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // A no-op on the stacked layout (nothing overflows), so the crossfade alone takes over there.
      el.scrollTo({ left: clamped * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
      setIndex(clamped);
    },
    [count],
  );

  const onScroll = () => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const el = trackRef.current;
      if (!el || el.clientWidth === 0) return;
      setIndex(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth))));
    });
  };

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(count - 1);
    else return;
    e.preventDefault();
  };

  if (count === 0) {
    return (
      <div className="overflow-hidden rounded-sm hairline" style={{ aspectRatio: "4 / 5" }}>
        <ImagePlaceholder label={t(locale, "noImage")} />
      </div>
    );
  }

  return (
    <div className="space-y-3" role="group" aria-roledescription="carousel" aria-label={t(locale, "images")}>
      <div className="relative">
        <div
          ref={trackRef}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setZoom(null)}
          aria-live="polite"
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-sm bg-paper-deep hairline outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper md:relative md:snap-none md:cursor-zoom-in md:overflow-hidden [&::-webkit-scrollbar]:hidden"
          style={{ aspectRatio: "4 / 5" }}
        >
          {images.map((img, i) => {
            const active = i === index;
            const lens = active && zoom;
            return (
              <div
                key={`${img.id}-${i}`}
                role="group"
                aria-roledescription="slide"
                aria-label={t(locale, "imageOf", { n: i + 1, total: count })}
                aria-hidden={!active}
                className={cn("relative h-full w-full shrink-0 snap-center md:absolute md:inset-0 md:transition-opacity md:duration-300 md:ease-out", active ? "md:z-10 md:opacity-100 md:delay-0" : "md:z-0 md:opacity-0 md:delay-300")}
              >
                {/* Only the scale transitions; the origin follows the cursor instantly so the lens never lags behind it. */}
                <div className="absolute inset-0 transition-transform duration-300 ease-out" style={lens ? { transform: `scale(${ZOOM_SCALE})`, transformOrigin: `${lens.x}% ${lens.y}%` } : undefined}>
                  <Image src={storefrontImageUrl(storeSlug, img.id)} alt={img.alt || title} fill priority={i === 0} sizes="(min-width: 768px) 58vw, 100vw" className="object-cover" />
                </div>
              </div>
            );
          })}
        </div>
        {count > 1 ? (
          <>
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t(locale, "previousImage")} className={cn(ARROW, "left-3 z-20 disabled:opacity-0")}>
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label={t(locale, "nextImage")} className={cn(ARROW, "right-3 z-20 disabled:opacity-0")}>
              <ChevronRight aria-hidden className="size-5" />
            </button>
            <span aria-hidden className="num absolute bottom-3 right-3 rounded-sm bg-paper/90 px-2 py-0.5 text-xs text-ink hairline md:hidden">
              {index + 1} / {count}
            </span>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((img, i) => {
            const active = i === index;
            return (
              <li key={`${img.id}-${i}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t(locale, "showImage", { n: i + 1, total: count })}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative block w-16 cursor-pointer overflow-hidden rounded-sm bg-paper-deep outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper md:w-20",
                    active ? "ring-1 ring-ink" : "opacity-60 hairline hover:opacity-100",
                  )}
                  style={{ aspectRatio: "4 / 5" }}
                >
                  {/* Same URL as the eager main slide when no separate thumb exists; priority keeps next/image's LCP bookkeeping consistent. */}
                  <Image src={storefrontImageUrl(storeSlug, img.thumbId || img.id)} alt="" fill priority={i === 0} sizes="80px" className="object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
