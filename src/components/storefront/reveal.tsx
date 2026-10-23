"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { settle } from "@/components/ext/motion";

const HIDDEN = { opacity: 0, y: 12 };
const SHOWN = { opacity: 1, y: 0 };

/**
 * Grid item that fades up the first time it scrolls into view. The server HTML is fully visible, so
 * the page reads without JavaScript and the first row (the LCP) never waits on hydration: only items
 * that start below the fold are armed, and they reveal once, with a short stagger across the row.
 * A sort or filter that re-orders the grid keeps every item that has already been seen in place.
 */
export function RevealItem({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLLIElement>(null);
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (reduce || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce]);

  const hidden = armed && !inView;
  return (
    <motion.li ref={ref} className={className} initial={false} animate={hidden ? HIDDEN : SHOWN} transition={hidden ? { duration: 0 } : settle(reduce, 0.35, (index % 4) * 0.05)}>
      {children}
    </motion.li>
  );
}
