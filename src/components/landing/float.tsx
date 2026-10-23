"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/components/ext/motion";

interface Props {
  children: ReactNode;
  className?: string;
  /** Seconds before the chip enters; siblings stagger on this. */
  delay?: number;
  /** Seconds for one up-and-down loop; give siblings different values so they never move in step. */
  period?: number;
  /** Pixels of drift either side of rest. */
  amplitude?: number;
  /** Start the loop on the way down instead of up, a cheap way to offset phases. */
  invert?: boolean;
}

/**
 * A floating chip: it enters once (fade, rise, settle) and then drifts up and down forever. Two layers
 * keep the entrance and the loop from fighting over the same transform. Transform and opacity only.
 */
export function Float({ children, className, delay = 0, period = 5, amplitude = 6, invert = false }: Props) {
  const reduce = useReducedMotion();
  // Each loop starts and ends at rest, so the first cycle continues smoothly from the entrance.
  const drift = invert ? [0, amplitude, 0, -amplitude, 0] : [0, -amplitude, 0, amplitude, 0];
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: EASE_OUT }}>
      {/* An explicit resting pose keeps the server markup identical whether or not the visitor prefers reduced motion. */}
      <motion.div className="h-full" initial={{ y: 0 }} animate={reduce ? { y: 0 } : { y: drift }} transition={{ duration: period, repeat: Infinity, ease: "easeInOut", delay }}>
        {children}
      </motion.div>
    </motion.div>
  );
}
