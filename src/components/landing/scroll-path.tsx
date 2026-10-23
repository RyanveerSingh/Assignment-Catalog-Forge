"use client";

import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buildPath, type PathSize } from "./path-geometry";

/** The dot stays hidden until the reader has scrolled a little into the section. */
const DOT_VISIBLE_FROM = 0.02;

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * Overlays the snaking line on its children and ties a glowing dot to scroll progress: the dot sits
 * where the reader's eye is (60 % down the viewport) and the line fills in behind it. SVG only,
 * no layout work per frame; with reduced motion the faint track is drawn and nothing moves.
 */
export function ScrollPathAnimator({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduce = useReducedMotion();
  const glowId = useId();
  const [size, setSize] = useState<PathSize | null>(null);
  const [mobile, setMobile] = useState(false);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const dotOpacity = useMotionValue(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.6", "end 0.6"] });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
      setMobile(window.innerWidth < 768);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const path = pathRef.current;
    if (!path) return;
    const clamped = Math.min(1, Math.max(0, p));
    const point = path.getPointAtLength(clamped * path.getTotalLength());
    cx.set(point.x);
    cy.set(point.y);
    dotOpacity.set(clamped > DOT_VISIBLE_FROM && clamped < 0.995 ? 1 : 0);
  });

  const d = size ? buildPath(size, mobile) : null;

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      {d && size ? (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none" style={{ zIndex: 0 }}>
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
              <motion.path d={d} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pathLength: scrollYProgress, opacity: 0.8 }} />
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
