"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
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
 * keep the entrance and the loop from fighting over the same transform. The loop is a CSS animation, not
 * a motion tween, so it runs on the compositor and costs the main thread nothing.
 */
export function Float({ children, className, delay = 0, period = 5, amplitude = 6, invert = false }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: EASE_OUT }}>
      <div
        className="h-full animate-float motion-reduce:animate-none"
        // A negative delay on the inverted chips starts them half a cycle in, so neighbours never move in step.
        style={{ "--float-period": `${period}s`, "--float-amp": `${amplitude}px`, animationDelay: invert ? `${-period / 2}s` : `${delay}s` } as CSSProperties}
      >
        {children}
      </div>
    </motion.div>
  );
}
