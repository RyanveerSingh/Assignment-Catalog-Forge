"use client";

import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buildPath, type PathSize } from "./path-geometry";

/** The dot stays hidden until the reader has scrolled a little into the section. */
const DOT_VISIBLE_FROM = 0.02;
/** Progress is read 60 % down the viewport: roughly where the eye rests while scrolling. */
const EYE_LINE = 0.6;

interface Geometry {
  size: PathSize;
  mobile: boolean;
  /** The raw scroll progress reachable at the very bottom of the page; the dot must land at 1 there. */
  maxProgress: number;
}

interface Props {
  children: ReactNode;
  className?: string;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Overlays the snaking line on its children and ties a glowing dot to scroll progress: the dot sits
 * where the reader's eye is and the line fills in behind it. Progress is normalised to what the page
 * can actually scroll to, so the dot finishes its journey at the foot of the page instead of stalling
 * wherever the footer leaves it. SVG only, no layout work per frame; with reduced motion the faint
 * track is drawn and nothing moves.
 */
export function ScrollPathAnimator({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const maxRef = useRef(1);
  const reduce = useReducedMotion();
  const glowId = useId();
  const [geom, setGeom] = useState<Geometry | null>(null);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const dotOpacity = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: [`start ${EYE_LINE}`, `end ${EYE_LINE}`] });
  const progress = useTransform(scrollYProgress, (p) => clamp01(p / maxRef.current));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const height = el.clientHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const vh = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      // Raw progress at max scroll: (maxScrollY + eyeLine·vh − top) / height.
      const reachable = height > 0 ? (docHeight - vh + EYE_LINE * vh - top) / height : 1;
      maxRef.current = Math.max(0.05, Math.min(1, reachable));
      setGeom({ size: { width: el.clientWidth, height }, mobile: window.innerWidth < 768, maxProgress: maxRef.current });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useMotionValueEvent(progress, "change", (p) => {
    const path = pathRef.current;
    if (!path) return;
    const point = path.getPointAtLength(p * path.getTotalLength());
    cx.set(point.x);
    cy.set(point.y);
    dotOpacity.set(p > DOT_VISIBLE_FROM ? 1 : 0);
  });

  const d = geom ? buildPath(geom.size, geom.mobile) : null;

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      {d && geom ? (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${geom.size.width} ${geom.size.height}`} preserveAspectRatio="none" style={{ zIndex: 0 }}>
          <defs>
            <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {/* Invisible twin used only to measure positions along the curve. */}
          <path ref={pathRef} d={d} fill="none" stroke="none" />
          <path d={d} fill="none" stroke="var(--border)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {reduce ? null : (
            <>
              <motion.path d={d} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pathLength: progress, opacity: 0.8 }} />
              <motion.circle r={16} fill="var(--brand)" fillOpacity={0.35} filter={`url(#${glowId})`} style={{ cx, cy, opacity: dotOpacity }} />
              <motion.circle r={5} fill="var(--brand)" stroke="var(--card)" strokeWidth={2} style={{ cx, cy, opacity: dotOpacity }} />
            </>
          )}
        </svg>
      ) : null}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
