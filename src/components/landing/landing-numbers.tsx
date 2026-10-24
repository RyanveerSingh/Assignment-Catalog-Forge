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

/*
 * Each figure must match the README's "Measured numbers" table or a count in the repository. Counts
 * that grow (tests) are floors so they stay true; the import time is the run the live-import panel
 * on this page replays, so the two never disagree.
 */
const STATS: readonly Stat[] = [
  { value: 100, decimals: 0, suffix: "%", label: "price and SKU match on the labelled messy sample", detail: "Real models against our own hand-labelled 120-row sheet (58 products): every price and every SKU matched the ground truth. One sample, scored by the eval harness" },
  { value: 99.7, decimals: 1, suffix: "%", label: "of claims traced to a cell", detail: "Same run: the exact quote behind each claim is re-found in the source row by the eval's own check" },
  { value: 1.93, decimals: 2, prefix: "$", label: "per 1,000 products, written and translated", detail: "Real models, realtime, from the request log of the 1,000-row sample: $0.51 for the English listing, $1.42 for German and French. That sample has no photos, so no vision calls" },
  { value: 77, decimals: 0, suffix: " s", label: "from upload to a stocked shop", detail: "The real-model run the import panel above replays: 26 rows, 12 products and 18 photos, written, translated and 9 products published" },
  { value: 10000, decimals: 0, label: "rows in one import", detail: "The 10,000-row sample ran end to end in 7.2 minutes with the demo provider and two workers on a laptop, every row accounted for" },
  { value: 161, decimals: 0, label: "edge cases catalogued", detail: "138 written down before the first line of code, the rest added as building turned them up; each records what happens, what the product does and its status" },
  { value: 1600, decimals: 0, suffix: "+", label: "automated tests", detail: "Parsers, cleaners, grouping, grounding, queue, storefront and store isolation; npm run check runs them all" },
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

/** The figures band: white cards on a grey panel, big orange numbers that count up, each one measured on a sample run or counted in the repository. */
export function LandingNumbers() {
  return (
    <section id="numbers" aria-labelledby="numbers-heading" className="scroll-mt-24 py-6 md:py-10">
      <div className={CONTAINER}>
        <div className="rounded-[32px] bg-surface-2 px-4 py-14 sm:px-6 md:py-20 lg:px-10">
          <SectionHeading id="numbers-heading" eyebrow="Measured, not promised" title="Measured on the sample files, or counted in the repository" />
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
          <p className="mt-6 text-center text-xs text-ink-muted">Runs used the sample files in the repository. The import time is the run replayed above; the README&apos;s &ldquo;Measured numbers&rdquo; table lists the others and how to repeat them.</p>
        </div>
      </div>
    </section>
  );
}
