"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { settle } from "./motion";
import { sparklineArea, sparklineCoords, sparklinePoints } from "./sparkline-points";

const BOX = { width: 120, height: 32, pad: 2 } as const;

/**
 * A 14-day line in the brand colour with a faint fill and a dot on today. The polyline is in the
 * server HTML; a card-coloured cover slides off it the first time it scrolls into view, so the
 * reveal is a transform and the layout underneath never moves. The dot is an HTML overlay because
 * the SVG stretches to the tile width (`preserveAspectRatio="none"`) and would squash a circle.
 */
export function Sparkline({ values, label, delay = 0 }: { values: ReadonlyArray<number>; label: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const coords = sparklineCoords(values, BOX);
  const last = coords[coords.length - 1];
  return (
    <div ref={ref} role="img" aria-label={label} className="relative h-8 w-full">
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible text-brand" aria-hidden>
        <polygon points={sparklineArea(values, BOX)} fill="currentColor" opacity={0.1} />
        <polyline points={sparklinePoints(values, BOX)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {last ? <span aria-hidden className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card" style={{ left: `${(last[0] / BOX.width) * 100}%`, top: `${(last[1] / BOX.height) * 100}%` }} /> : null}
      <motion.div aria-hidden className="absolute -inset-y-1 -inset-x-px origin-right bg-card" initial={{ scaleX: 1 }} animate={{ scaleX: inView ? 0 : 1 }} transition={settle(reduce, 0.9, delay)} />
    </div>
  );
}
