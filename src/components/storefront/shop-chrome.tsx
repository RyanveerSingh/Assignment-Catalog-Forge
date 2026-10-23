"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

type Chrome = "over" | "solid";

/*
 * The header reads four variables from this wrapper. Their defaults paint a white bar with a
 * hairline and a blur; the two overrides below paint it transparent with white text while a hero
 * photo sits under it. The first override is pure CSS, keyed on the page's `data-shop-hero`
 * marker, so the server HTML is already right before any script runs; once the effect has
 * measured the scroll position it sets `data-chrome` and the second override takes over.
 */
const VARS =
  "[--header-h:4rem] md:[--header-h:4.5rem] [--chrome-fg:var(--ink)] [--chrome-bg:rgb(255_255_255/0.86)] [--chrome-line:var(--line)] [--chrome-blur:14px] " +
  "[&:has([data-shop-hero]):not([data-chrome])]:[--chrome-fg:#fff] [&:has([data-shop-hero]):not([data-chrome])]:[--chrome-bg:transparent] [&:has([data-shop-hero]):not([data-chrome])]:[--chrome-line:transparent] [&:has([data-shop-hero]):not([data-chrome])]:[--chrome-blur:0px] " +
  "data-[chrome=over]:[--chrome-fg:#fff] data-[chrome=over]:[--chrome-bg:transparent] data-[chrome=over]:[--chrome-line:transparent] data-[chrome=over]:[--chrome-blur:0px]";

/**
 * Storefront wrapper: the resolved locale goes on it (the root layout owns `<html lang>`), and it
 * tracks whether the sticky header is still over the hero. The hero is the only element that
 * matters, so this is one rAF-throttled scroll listener and a state flip at the boundary.
 */
export function ShopChrome({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState<Chrome | undefined>(undefined);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const hero = root.querySelector<HTMLElement>("[data-shop-hero]");
    if (!hero) {
      setChrome("solid");
      return;
    }
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const headerHeight = root.querySelector<HTMLElement>("[data-shop-header]")?.offsetHeight ?? 72;
      setChrome(hero.getBoundingClientRect().bottom > headerHeight ? "over" : "solid");
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  return (
    <div ref={ref} lang={locale} data-chrome={chrome} className={cn("group/shop relative flex min-h-dvh flex-col bg-card text-ink", VARS)}>
      {children}
    </div>
  );
}
