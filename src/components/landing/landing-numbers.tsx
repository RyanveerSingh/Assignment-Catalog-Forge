"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { CONTAINER } from "./site-chrome";

interface Stat {
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  label: string;
  detail: string;
}

/* Every figure is measured on the sample files in the repository, with the request log as the source; the README lists the method. */
const STATS: readonly Stat[] = [
  { value: 100, decimals: 0, suffix: "%", label: "accuracy on the messy sample", detail: "SKU, price, title, category and status all correct on the 120-row sheet, real models, measured by the eval harness" },
  { value: 99.7, decimals: 1, suffix: "%", label: "of claims traced to a cell", detail: "The exact quote behind each claim is re-found in the source row by an independent check" },
  { value: 1.93, decimals: 2, prefix: "$", label: "per 1,000 products", detail: "Written and translated into German and French, routed to the cheapest capable model; Batch mode halves it" },
  { value: 53, decimals: 0, suffix: " s", label: "from upload to a stocked shop", detail: "26 rows, 12 products and 18 photos, cleaned, written, translated and published" },
];

function format(n: number, s: Stat): string {
  return `${s.prefix ?? ""}${n.toFixed(s.decimals)}${s.suffix ?? ""}`;
}

function CountUp({ stat }: { stat: Stat }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? stat.value : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, stat.value, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    return () => controls.stop();
  }, [inView, reduce, stat.value]);

  return (
    <span ref={ref} className="num block text-4xl text-ink md:text-5xl">
      {format(reduce ? stat.value : shown, stat)}
    </span>
  );
}

export function LandingNumbers() {
  return (
    <section aria-labelledby="numbers-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-14 md:py-20")}>
        <h2 id="numbers-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
          Measured, not promised
        </h2>
        <dl className="mt-8 grid gap-px bg-border hairline sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-2 bg-card px-5 py-6">
              <dt className="order-2 text-sm font-medium text-ink">{s.label}</dt>
              <dd className="order-1">
                <CountUp stat={s} />
              </dd>
              <dd className="order-3 text-xs leading-relaxed text-ink-muted">{s.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-ink-muted">Numbers come from the request log of runs against the sample files in the repository; the README shows how each one is taken.</p>
      </div>
    </section>
  );
}
