"use client";

import Image from "next/image";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { LiveImportCard } from "./live-import-card";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

interface Shot {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Which part of the full screenshot the 16:10 window shows, as a translate of the 150 %-wide image. */
  focus: string;
}

interface Step {
  title: string;
  text: string;
  shot?: Shot;
}

/* Real screenshots from docs/screenshots, framed with CSS so the file stays untouched; step two replays a real import. */
const STEPS: readonly Step[] = [
  {
    title: "Upload any sheet and photos",
    text: "A CSV, Excel file, SQL dump or Google Sheets link, with photos or a ZIP of them. Mixed languages, European prices and odd units are expected, not exceptions.",
    shot: {
      src: "/landing/step-upload.png",
      alt: "The Upload page: a drop zone for a supplier sheet and photos, a Google Sheets link field, Fast and Economy modes and an AI budget, with sample files listed beside it.",
      width: 1440,
      height: 1940,
      focus: "translate(0, -4.5%)",
    },
  },
  {
    title: "Watch it clean, write and translate",
    text: "Prices, SKUs, weights and sizes are fixed by code, never by a model. Then the AI writes each listing from your rows, every claim is checked against the sheet, and the result is translated. This is the real log of the sample import, replayed.",
  },
  {
    title: "Review what needs you, publish the rest",
    text: "Each listing sits beside the rows it came from. Hover a claim to see its cell, edit what you like, approve, and it is live in your shop. Or tick one box and everything that passes every check publishes itself.",
    shot: {
      src: "/landing/step-review.png",
      alt: "The review drawer: the supplier's raw row on the left, the written listing with confidence scores on the right, and Approve, Send back and Reject buttons.",
      width: 1440,
      height: 900,
      focus: "translate(-23.6%, 0)",
    },
  },
];

function Visual({ step, priority }: { step: Step; priority: boolean }) {
  if (!step.shot) return <LiveImportCard />;
  const s = step.shot;
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-paper-deep shadow-[0_18px_40px_-24px_rgba(26,23,20,0.35)] hairline">
      <Image src={s.src} alt={s.alt} width={s.width} height={s.height} priority={priority} loading={priority ? undefined : "lazy"} className="absolute top-0 left-0 h-auto w-[150%] max-w-none" style={{ transform: s.focus }} />
    </div>
  );
}

/** One step of the left column; reports when its middle crosses the middle band of the viewport. */
function StepItem({ index, step, active, onActive, children }: { index: number; step: Step; active: boolean; onActive: (i: number) => void; children?: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <li ref={ref} className="flex flex-col gap-4 lg:min-h-[60vh] lg:justify-center">
      <div className={cn("transition-opacity duration-300", active ? "opacity-100" : "lg:opacity-40")}>
        <span className="num text-[11px] text-brand">0{index + 1}</span>
        <h3 className="font-display mt-1 text-2xl leading-tight text-ink md:text-3xl">{step.title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted md:text-base">{step.text}</p>
      </div>
      {children}
    </li>
  );
}

/**
 * "How it works" as a scroll story: on wide screens the three steps scroll past a visual that stays
 * put and swaps to match the step in the middle of the viewport; on phones each step carries its own visual.
 */
export function LandingSteps() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const current = STEPS[active] ?? STEPS[0]!;

  return (
    <section aria-labelledby="steps-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-14 md:py-20")}>
        <Reveal>
          <h2 id="steps-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
            How it works
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-ink md:text-4xl">Three steps, and you watch every row move through them.</p>
        </Reveal>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <ol className="flex flex-col gap-12 lg:gap-0">
            {STEPS.map((step, i) => (
              <StepItem key={step.title} index={i} step={step} active={active === i} onActive={setActive}>
                <div className="lg:hidden">
                  <Visual step={step} priority={i === 0} />
                </div>
              </StepItem>
            ))}
          </ol>
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={active} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -10 }} transition={{ duration: 0.28 }}>
                  <Visual step={current} priority={false} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
