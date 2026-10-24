"use client";

import { motion, useReducedMotion } from "motion/react";
import { settle, stagger } from "./motion";

/**
 * Fade-and-rise entrance for a block. Rendered with the final layout from the first frame (only
 * opacity and a transform move), so nothing reflows while it settles. `index` staggers siblings.
 */
export function Reveal({ children, index = 0, className }: { children: React.ReactNode; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.4, stagger(index))} className={className}>
      {children}
    </motion.div>
  );
}
