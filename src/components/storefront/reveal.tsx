"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useInView, useReducedMotion, type Transition } from "motion/react";
import { settle } from "@/components/ext/motion";

const HIDDEN = { opacity: 0, y: 24 };
const SHOWN = { opacity: 1, y: 0 };

/**
 * Scroll reveal that never costs the first paint: the server HTML is fully visible, so the page
 * reads without JavaScript and nothing above the fold waits on hydration. Only elements that start
 * below the fold are armed; they fade up once, the first time they scroll in.
 */
function useArmedReveal<T extends HTMLElement>(ref: RefObject<T | null>, delay: number): { hidden: boolean; transition: Transition } {
  const reduce = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (reduce || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, [reduce, ref]);

  const hidden = armed && !inView;
  return { hidden, transition: hidden ? { duration: 0 } : settle(reduce, 0.6, delay) };
}

/** Grid item (an `<li>`) with a short stagger across the row. */
export function RevealItem({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const { hidden, transition } = useArmedReveal(ref, (index % 3) * 0.08);
  return (
    <motion.li ref={ref} className={className} initial={false} animate={hidden ? HIDDEN : SHOWN} transition={transition}>
      {children}
    </motion.li>
  );
}

/** A block (`<div>`) such as a section heading or a card; `delay` lets a few siblings cascade. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { hidden, transition } = useArmedReveal(ref, delay);
  return (
    <motion.div ref={ref} className={className} initial={false} animate={hidden ? HIDDEN : SHOWN} transition={transition}>
      {children}
    </motion.div>
  );
}
