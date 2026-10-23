"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

interface Stat {
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  label: string;
  detail: string;
}

/* Every figure is measured on the sample files in the repository or counted in it; the README lists the method. */
const STATS: readonly Stat[] = [
  { value: 100, decimals: 0, suffix: "%", label: "accuracy on the messy sample", detail: "SKU, price, title, category and status all correct on the 120-row sheet, real models, measured by the eval harness" },
  { value: 99.7, decimals: 1, suffix: "%", label: "of claims traced to a cell", detail: "The exact quote behind each claim is re-found in the source row by an independent check" },
  { value: 1.93, decimals: 2, prefix: "$", label: "per 1,000 products", detail: "Written and translated into German and French, routed to the cheapest capable model; Batch mode halves it" },
  { value: 53, decimals: 0, suffix: " s", label: "from upload to a stocked shop", detail: "26 rows, 12 products and 18 photos, cleaned, written, translated and published" },
  { value: 10000, decimals: 0, label: "rows in one import", detail: "The 10,000-row sample runs end to end in nine minutes on a laptop, every row accounted for" },
  { value: 155, decimals: 0, label: "edge cases catalogued", detail: "Written down before the first line of code, each with what happens, what the product does and a test" },
  { value: 1683, decimals: 0, label: "automated tests", detail: "Parsers, cleaners, grouping, grounding, queue, storefront and store isolation, run before every commit" },
  { value: 3, decimals: 0, label: "languages per listing", detail: "English written from the rows, German and French translated with sentinel checks on numbers and tags" },
];

function format(n: number, s: Stat): string {
  return `${s.prefix ?? ""}${n.toLocaleString("en", { minimumFractionDigits: s.decimals, maximumFractionDigits: s.decimals })}${s.suffix ?? ""}`;
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
    <span ref={ref} className="num block text-4xl leading-none text-brand md:text-5xl">
      {format(reduce ? stat.value : shown, stat)}
    </span>
  );
}

/** The figures band: ink ground, amber numbers, eight things that were measured or counted rather than claimed. */
export function LandingNumbers() {
  return (
    <section aria-labelledby="numbers-heading" className="border-b border-border bg-ink text-paper">
      <div className={cn(CONTAINER, "py-16 md:py-24")}>
        <Reveal>
          <h2 id="numbers-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
            Measured, not promised
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-paper md:text-4xl">Every number here comes from a run you can repeat.</p>
        </Reveal>
        <dl className="mt-10 grid gap-px bg-paper/10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className="bg-ink">
              <Reveal delay={Math.min(i, 7) * 0.05} className="flex h-full flex-col gap-2 px-5 py-6">
                <dt className="order-2 text-sm font-medium text-paper">{s.label}</dt>
                <dd className="order-1">
                  <CountUp stat={s} />
                </dd>
                <dd className="order-3 text-xs leading-relaxed text-paper/60">{s.detail}</dd>
              </Reveal>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-paper/50">Runs against the sample files in the repository, with the request log as the source; the README shows how each one is taken.</p>
      </div>
    </section>
  );
}
