"use client";

import { motion, useReducedMotion } from "motion/react";
import { settle, stagger } from "./motion";

/**
 * Fade-and-rise entrance for a block. Rendered with the final layout from the first frame (only
 * opacity and a transform move), so nothing reflows while it settles. `index` staggers siblings.
 */
export function Reveal({ children, index = 0, delay = 0, y = 10, duration = 0.4, className, as = "div" }: { children: React.ReactNode; index?: number; delay?: number; y?: number; duration?: number; className?: string; as?: "div" | "section" | "li" | "article" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, duration, delay + stagger(index))} className={className}>
      {children}
    </Tag>
  );
}
