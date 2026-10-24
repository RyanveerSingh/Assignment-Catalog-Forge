import type { PriceSummary } from "./price";

/** Index arithmetic for the hero slideshow, kept apart from the component so it can be proven without a DOM. */

export interface HeroSlide {
  handle: string;
  title: string;
  imageId: string;
  alt: string;
  price: PriceSummary;
}

const HERO_SLIDE_COUNT = 3;
export const HERO_INTERVAL_MS = 6000;
/** The crossfade between two slides, in seconds; the Ken Burns scale keeps going until the slide has faded out. */
export const HERO_FADE_S = 1.2;
export const HERO_ZOOM_S = 8;
export const HERO_ZOOM_SCALE = 1.06;

/** Wraps around in both directions; a count of zero or one always resolves to zero. */
export function stepIndex(current: number, count: number, delta: number): number {
  if (count <= 1) return 0;
  return (((current + delta) % count) + count) % count;
}

/** The first `max` photographed products, in the order given (the caller passes the newest first). */
export function pickSlides<T extends { images: Array<{ id: string }> }>(products: T[], max = HERO_SLIDE_COUNT): T[] {
  return pickPhotographed(products, 0, max);
}

/**
 * `count` photographed products starting after the first `skip` of them, so the bands below the
 * hero show different photos from the slides. A small catalogue wraps around rather than leaving
 * a band without a photo; a catalogue with no photos at all yields nothing.
 */
export function pickPhotographed<T extends { images: Array<{ id: string }> }>(products: T[], skip: number, count: number): T[] {
  const withPhotos = products.filter((p) => p.images.length > 0);
  if (withPhotos.length === 0 || count <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, withPhotos.length); i++) {
    const item = withPhotos[(skip + i) % withPhotos.length];
    if (item) out.push(item);
  }
  return out;
}

/** "01", "02", … for the quiet counter beside the slide title. */
export function slideNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
