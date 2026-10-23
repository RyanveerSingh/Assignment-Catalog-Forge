"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "cn";

/*
 * The lit area is a blob made of a few circles. Each one trails the pointer at its own pace and drifts
 * on its own slow wobble, so the shape stretches behind a moving pointer and keeps changing when it
 * rests: a fluid, never the same twice. The edges are hard on purpose: only the letters change colour,
 * nothing around them, so the blob itself is never visible.
 */
const BLOBS = [
  { r: 62, follow: 0.32, wobble: 14, speed: 0.0011 },
  { r: 48, follow: 0.2, wobble: 20, speed: 0.0017 },
  { r: 40, follow: 0.13, wobble: 24, speed: 0.0013 },
  { r: 32, follow: 0.085, wobble: 18, speed: 0.0021 },
  { r: 26, follow: 0.055, wobble: 16, speed: 0.0009 },
] as const;

const MASK = BLOBS.map((b, i) => `radial-gradient(circle calc(${b.r}px * var(--spot-k)) at var(--b${i}x) var(--b${i}y), #000 calc(100% - 0.5px), transparent 100%)`).join(", ");
const OVERLAY_STYLE: CSSProperties = { maskImage: MASK, WebkitMaskImage: MASK };

/** How long the blob takes to grow or vanish; matches the `--spot-k` transition in globals.css. */
const FADE_MS = 320;

interface Props {
  /** The text as it normally reads. */
  children: ReactNode;
  /** The same text laid out identically, in the colour the blob reveals. Defaults to `children` in orange. */
  lit?: ReactNode;
  className?: string;
}

/**
 * Text with a fluid colour spotlight under the mouse. The lit copy sits on top, inherits the heading's
 * font and width so it wraps identically, and is masked to the blob. Positions are written straight to
 * CSS custom properties from one animation frame loop that runs only while the pointer is over the text
 * (and a moment after, while the blob fades), so nothing re-renders and nothing runs while scrolling.
 */
export function SpotlightText({ children, lit, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useRef({ tx: 0, ty: 0, pts: BLOBS.map(() => ({ x: 0, y: 0 })), phase: BLOBS.map(() => Math.random() * 1000), raf: 0, until: 0 });

  useEffect(() => () => cancelAnimationFrame(state.current.raf), []);

  const frame = (now: number): void => {
    const el = ref.current;
    const s = state.current;
    if (!el) return;
    BLOBS.forEach((b, i) => {
      const p = s.pts[i];
      const ph = s.phase[i] ?? 0;
      if (!p) return;
      p.x += (s.tx - p.x) * b.follow;
      p.y += (s.ty - p.y) * b.follow;
      const t = now * b.speed + ph;
      el.style.setProperty(`--b${i}x`, `${p.x + Math.sin(t) * b.wobble + Math.sin(t * 2.3) * b.wobble * 0.4}px`);
      el.style.setProperty(`--b${i}y`, `${p.y + Math.cos(t * 1.3) * b.wobble + Math.sin(t * 1.9) * b.wobble * 0.4}px`);
    });
    s.raf = now < s.until ? requestAnimationFrame(frame) : 0;
  };

  const aim = (e: PointerEvent<HTMLElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    state.current.tx = e.clientX - r.left;
    state.current.ty = e.clientY - r.top;
  };

  const enter = (e: PointerEvent<HTMLElement>): void => {
    if (e.pointerType !== "mouse") return;
    aim(e);
    const s = state.current;
    // Start every circle at the pointer so the blob grows out of it rather than sweeping in from a corner.
    s.pts.forEach((p) => Object.assign(p, { x: s.tx, y: s.ty }));
    s.until = Number.POSITIVE_INFINITY;
    e.currentTarget.style.setProperty("--spot-k", "1");
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };

  const move = (e: PointerEvent<HTMLElement>): void => {
    if (e.pointerType === "mouse") aim(e);
  };

  const leave = (e: PointerEvent<HTMLElement>): void => {
    e.currentTarget.style.setProperty("--spot-k", "0");
    state.current.until = performance.now() + FADE_MS;
  };

  return (
    <span ref={ref} className={cn("spotlight relative block", className)} onPointerEnter={enter} onPointerMove={move} onPointerLeave={leave}>
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0 select-none" style={OVERLAY_STYLE}>
        {lit ?? <span className="text-brand">{children}</span>}
      </span>
    </span>
  );
}
