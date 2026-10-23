import type { PriceSummary } from "./price";

/** Index arithmetic for the hero slideshow, kept apart from the component so it can be proven without a DOM. */

export interface HeroSlide {
  handle: string;
  title: string;
  imageId: string;
  alt: string;
  /** Leaf label of the product's category, already localised and title-cased. */
  category: string | null;
  price: PriceSummary;
}

export const HERO_SLIDE_COUNT = 3;
export const HERO_INTERVAL_MS = 5000;

/** Wraps around in both directions; a count of zero or one always resolves to zero. */
export function stepIndex(current: number, count: number, delta: number): number {
  if (count <= 1) return 0;
  return (((current + delta) % count) + count) % count;
}

/** The first `max` photographed products, in the order given (the caller passes the newest first). */
export function pickSlides<T extends { images: Array<{ id: string }> }>(products: T[], max = HERO_SLIDE_COUNT): T[] {
  const out: T[] = [];
  for (const p of products) {
    if (p.images.length === 0) continue;
    out.push(p);
    if (out.length === max) break;
  }
  return out;
}

/** "01", "02", … for the quiet counter beside the slide title. */
export function slideNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
