"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { settle } from "@/components/ext/motion";

interface Props {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before this block starts, so siblings can stagger. */
  delay?: number;
  /** Pixels to rise from; 16 reads as "placed", 24 as "arriving". */
  distance?: number;
}

/**
 * Fades a block up the first time it scrolls into view. The hidden state is rendered on the server too,
 * so hydration never disagrees with it; under reduced motion the tween collapses to a cut and the block
 * simply appears when it is reached.
 */
export function Reveal({ children, className, delay = 0, distance = 16 }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={{ opacity: 0, y: distance }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={settle(reduce, 0.5, delay)}>
      {children}
    </motion.div>
  );
}
