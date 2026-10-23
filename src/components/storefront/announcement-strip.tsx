"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { settle } from "@/components/ext/motion";

const INTERVAL_MS = 4000;

/**
 * One short true line at a time above the header, rolling upward to the next every four seconds.
 * The strip has a fixed height, so the swap never moves the header. It rests while hovered or while
 * the tab is in the background, and under reduced motion it simply shows the first line.
 */
export function AnnouncementStrip({ lines }: { lines: string[] }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (reduce || hovered || hidden || lines.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduce, hovered, hidden, lines.length]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (lines.length === 0) return null;

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="bg-ink text-paper">
      <div className="relative mx-auto h-9 max-w-6xl overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.p key={index} initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-100%", opacity: 0 }} transition={settle(reduce, 0.45)} className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs tracking-[0.02em] md:px-6">
            {lines[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
