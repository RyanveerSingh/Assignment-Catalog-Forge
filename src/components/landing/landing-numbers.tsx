"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { EASE_OUT } from "@/components/ext/motion";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
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

  // Writes the text node directly: eight counters re-rendering React on every frame made scrolling past this band stutter.
  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;
    if (reduce) {
      el.textContent = format(stat.value, stat);
      return;
    }
    const controls = animate(0, stat.value, { duration: 1.4, ease: EASE_OUT, onUpdate: (v) => (el.textContent = format(v, stat)) });
    return () => controls.stop();
  }, [inView, reduce, stat]);

  return (
    <span ref={ref} className="font-display tabular block text-[40px] leading-none text-brand md:text-[48px]">
      {format(0, stat)}
    </span>
  );
}

/** The figures band: white cards on a grey panel, big orange numbers that count up, eight things that were measured rather than claimed. */
export function LandingNumbers() {
  return (
    <section id="numbers" aria-labelledby="numbers-heading" className="scroll-mt-24 py-6 md:py-10">
      <div className={CONTAINER}>
        <div className="rounded-[32px] bg-surface-2 px-4 py-14 sm:px-6 md:py-20 lg:px-10">
          <SectionHeading id="numbers-heading" eyebrow="Measured, not promised" title="Every number here comes from a run you can repeat" />
          <dl className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={Math.min(i, 7) * 0.05} className="h-full">
                <div className="flex h-full flex-col gap-2 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)]">
                  <dd className="order-1">
                    <CountUp stat={s} />
                  </dd>
                  <dt className="font-display order-2 mt-1 text-[15px] text-ink">{s.label}</dt>
                  <dd className="order-3 text-xs leading-relaxed text-ink-muted">{s.detail}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
          <p className="mt-6 text-center text-xs text-ink-muted">Runs against the sample files in the repository, with the request log as the source; the README shows how each one is taken.</p>
        </div>
      </div>
    </section>
  );
}
