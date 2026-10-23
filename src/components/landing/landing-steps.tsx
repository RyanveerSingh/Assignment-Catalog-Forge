import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { CheckIcon, ImagesIcon, LanguagesIcon, MousePointerClickIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { cn } from "cn";
import { Float } from "./float";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { CONTAINER } from "./site-chrome";

interface Shot {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface Chip {
  icon: LucideIcon;
  text: string;
  tone?: "success";
  /** Corner of the frame the chip floats at. */
  at: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

interface Step {
  n: string;
  title: string;
  text: string;
  points: readonly string[];
  shot: Shot;
  chips: readonly [Chip, Chip];
}

/* Real screenshots from docs/screenshots, framed with CSS so the files stay untouched; every chip states something the sample import really did. */
const STEPS: readonly Step[] = [
  {
    n: "01",
    title: "Upload any sheet",
    text: "A CSV, Excel file, SQL dump or Google Sheets link, with photos or a ZIP of them. Mixed languages, European prices and odd units are expected, not exceptions.",
    points: ["Headers in English or German, title rows, BOMs", "One ZIP of photos up to 200 MB", "Fast or Economy, with an AI budget that pauses the import"],
    shot: { src: "/landing/step-upload.png", alt: "The Upload page: an illustrated drop zone for a supplier sheet and photos, a Google Sheets link field, speed, budget and publish controls, and sample sheets to try.", width: 1920, height: 1320 },
    chips: [
      { icon: ImagesIcon, text: "18 photos, 16 matched by name", at: "top-right" },
      { icon: CheckIcon, text: "new-12.csv · 26 rows parsed", tone: "success", at: "bottom-left" },
    ],
  },
  {
    n: "02",
    title: "Watch it clean, write and translate",
    text: "Prices, SKUs, weights and sizes are fixed by code, never by a model. Then the AI writes each listing from your rows, every claim is checked against the sheet, and the result is translated.",
    points: ["25 prices normalised to cents, 26 rows with units converted", "A claim the sheet contradicts is blocked, not published", "German and French written as soon as the English passes"],
    shot: { src: "/landing/step-pipeline.png", alt: "An import detail page: the stage pipeline from Queued to Done, counts of rows done, needing review and failed, and the 'What we fixed in your sheet' breakdown.", width: 1920, height: 1320 },
    chips: [
      { icon: ShieldCheckIcon, text: "1 claim blocked: “not waterproof”", at: "top-right" },
      { icon: LanguagesIcon, text: "Translating: Deutsch, Français", at: "bottom-left" },
    ],
  },
  {
    n: "03",
    title: "Review and publish",
    text: "Each listing sits beside the rows it came from. Hover a claim to see its cell, edit what you like, approve, and it is live in your shop. Or tick one box and everything that passes every check publishes itself.",
    points: ["Source row and written listing side by side", "Confidence on every field, the quote behind every claim", "Approve, send back or reject; published products are a snapshot"],
    shot: { src: "/landing/step-review.png", alt: "The review drawer: the supplier's raw row on the left, the written listing with confidence scores on the right, and Approve, Send back and Reject buttons.", width: 1920, height: 1320 },
    chips: [
      { icon: SparklesIcon, text: "Title confidence 95", at: "top-left" },
      { icon: MousePointerClickIcon, text: "Approve → live in the shop", tone: "success", at: "bottom-right" },
    ],
  },
];

const CORNER: Record<Chip["at"], string> = {
  "top-left": "top-4 left-4 sm:-left-3",
  "top-right": "top-4 right-4 sm:-right-3",
  "bottom-left": "bottom-4 left-4 sm:-left-3",
  "bottom-right": "bottom-4 right-4 sm:-right-3",
};

function Mockup({ step }: { step: Step }) {
  const s = step.shot;
  return (
    <div className="relative">
      <div className="relative aspect-[16/11] overflow-hidden rounded-2xl bg-paper ring-1 ring-border">
        <Image src={s.src} alt={s.alt} width={s.width} height={s.height} loading="lazy" sizes="(min-width: 1024px) 560px, 90vw" className="absolute inset-0 h-full w-full object-cover object-top" />
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-ink/4 to-transparent" />
      </div>
      {step.chips.map((chip, i) => {
        const Icon = chip.icon;
        return (
          <div key={chip.text} className={cn("absolute z-10 max-w-[calc(100%-2rem)]", CORNER[chip.at])}>
            <Float delay={0.2 + i * 0.15} period={i === 0 ? 5.2 : 6} invert={i === 1}>
              <div className="flex items-center gap-2 rounded-xl bg-card py-1.5 pr-3 pl-1.5 text-[11px] font-medium whitespace-nowrap text-ink shadow-[var(--shadow-float)] ring-1 ring-border/70 sm:py-2 sm:pl-2 sm:text-xs">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg", chip.tone === "success" ? "bg-success-soft text-success" : "bg-brand-soft text-brand")}>
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="truncate">{chip.text}</span>
              </div>
            </Float>
          </div>
        );
      })}
    </div>
  );
}

/** Three wide white panels on an ice band, text and mockup alternating sides. */
export function LandingSteps() {
  return (
    <section id="how" aria-labelledby="steps-heading" className="scroll-mt-24 py-6 md:py-10">
      <div className={CONTAINER}>
        <div className="rounded-[32px] bg-surface-2 px-4 py-14 sm:px-6 md:py-20 lg:px-10">
          <SectionHeading id="steps-heading" eyebrow="How it works" title="Three steps, and you watch every row move through them" />
          <ol className="mt-12 flex flex-col gap-6">
            {STEPS.map((step, i) => {
              const flip = i % 2 === 1;
              return (
                <li key={step.n}>
                  <Reveal distance={20}>
                    <article className={cn("grid items-center gap-8 rounded-3xl bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/70 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-10", flip && "lg:[&>*:first-child]:order-last")}>
                      <div>
                        <span className="num inline-flex h-7 items-center rounded-full bg-brand-soft px-2.5 text-[12px] font-medium text-brand">{step.n}</span>
                        <h3 className="font-display mt-4 text-[28px] leading-[1.08] text-ink md:text-[36px]">{step.title}</h3>
                        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted">{step.text}</p>
                        <ul className="mt-5 flex flex-col gap-2.5">
                          {step.points.map((p) => (
                            <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
                              <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                                <CheckIcon aria-hidden className="size-2.5" />
                              </span>
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Mockup step={step} />
                    </article>
                  </Reveal>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
