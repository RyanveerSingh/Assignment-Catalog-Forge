"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { EASE_OUT } from "./motion";

/**
 * An integer that rolls to its new value instead of snapping. The first render shows the real number
 * (no counting up from zero on page load); only later changes animate. Motion writes the text straight
 * to the DOM, so the surrounding tree does not re-render on every frame. Pair it with tabular numerals
 * so the digits do not jitter sideways while they change.
 */
export function CountUp({ value, format, className, duration = 0.6 }: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  const text = useTransform(mv, (v) => formatRef.current(Math.round(v)));
  const last = useRef(value);

  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, reduce, mv, duration]);

  return <motion.span className={className}>{text}</motion.span>;
}
