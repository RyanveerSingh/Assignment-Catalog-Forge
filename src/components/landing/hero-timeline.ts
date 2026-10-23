"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { REPAIRS } from "./hero-sheet-data";

/*
 * One clock drives the whole first screen. Each tick is a discrete state (a cell flagged, a cell
 * repaired, a language switched), so React renders three times a second at most and every visible
 * change is a CSS opacity/transform transition on the compositor; nothing runs per frame.
 */
export const TICK_MS = 300;
const START = 4;
const REPAIRED = START + REPAIRS.length * 2 + 1;

export const AT = {
  card: REPAIRED + 1,
  claim: (i: number) => REPAIRED + 2 + i,
  de: REPAIRED + 8,
  fr: REPAIRED + 11,
  published: REPAIRED + 14,
  end: REPAIRED + 28,
} as const;

export type CellState = "raw" | "flagged" | "repaired";

export function cellState(tick: number, repairIndex: number): CellState {
  if (repairIndex < 0) return "raw";
  const at = START + repairIndex * 2;
  if (tick < at) return "raw";
  return tick === at ? "flagged" : "repaired";
}

export function langIndex(tick: number, still: boolean): number {
  if (still) return 0;
  if (tick >= AT.fr && tick < AT.published + 6) return 2;
  if (tick >= AT.de && tick < AT.fr) return 1;
  return 0;
}

export function stepLabel(tick: number, still: boolean): { n: string; text: string } {
  if (still || tick >= AT.published) return { n: "05", text: "Published to the shop" };
  if (tick >= AT.de) return { n: "04", text: "Translating into German and French" };
  if (tick >= AT.card) return { n: "03", text: "Writing the listing from rows 10 and 11, every claim cited" };
  if (tick >= START) {
    const current = REPAIRS[Math.min(REPAIRS.length - 1, Math.floor((tick - START) / 2))];
    return current && current.col === "sku" ? { n: "02", text: "No SKU: one is generated and flagged" } : { n: "02", text: "Fixing prices, units and encodings in code, before any model" };
  }
  return { n: "01", text: "Reading new-12.csv, 26 rows" };
}

/**
 * Advances while the hero is on screen and the tab is visible; stops otherwise, so scrolling the rest
 * of the page costs nothing. Under reduced motion it jumps straight to the finished state and stays.
 */
export function useHeroClock(): { ref: RefObject<HTMLDivElement | null>; tick: number; still: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      setTick(AT.published);
      return;
    }
    let id: number | undefined;
    let onScreen = true;
    const start = (): void => {
      if (id === undefined && onScreen && document.visibilityState === "visible") id = window.setInterval(() => setTick((t) => (t + 1) % AT.end), TICK_MS);
    };
    const stop = (): void => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? false;
      if (onScreen) start();
      else stop();
    });
    const onVisibility = (): void => (document.visibilityState === "visible" ? start() : stop());
    io.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { ref, tick, still };
}
