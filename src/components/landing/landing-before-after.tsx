import { ArrowRightIcon } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { CONTAINER } from "./site-chrome";

/* Each pair is a mess the sample sheets really contain and what the deterministic cleaner makes of it. */
const PAIRS: ReadonlyArray<{ before: string; after: string; why: string }> = [
  { before: "1.299,00 €", after: "€1,299.00", why: "German price format, currency read from the symbol" },
  { before: "£8", after: "800 GBP", why: "Empty currency column, symbol decides" },
  { before: "4 lbs", after: "1,814 g", why: "Weights become grams" },
  { before: "18 × 12 × 9 in", after: "45.7 × 30.5 × 22.9 cm", why: "Lengths become centimetres" },
  { before: "nÃ¤chstgrÃ¶ÃŸere", after: "nächstgrößere", why: "Double-encoded text repaired" },
  { before: "<script>alert(1)</script>", after: "removed, row flagged", why: "Unsafe HTML never reaches a listing" },
  { before: "dunkelblau", after: "dark blue", why: "Colours normalised across languages" },
  { before: "“not waterproof” ≠ “waterproof”", after: "claim blocked, sent to review", why: "The sheet says one thing, the model wrote the other: the sheet wins" },
];

export function LandingBeforeAfter() {
  return (
    <section aria-labelledby="clean-heading" className="scroll-mt-24 pt-20 pb-10 md:pt-28 md:pb-12">
      <div className={CONTAINER}>
        <SectionHeading id="clean-heading" eyebrow="Fixed before any AI sees a row" title="The cleaner owns prices, units, encodings and markup" text="The model only ever writes words. Everything with a number in it is handled by code you can read, and tested." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAIRS.map((p, i) => (
            <li key={p.before} className="h-full">
              <Reveal delay={Math.min(i, 7) * 0.05} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)]">
                  <div className="flex items-center gap-2">
                    <span className="num min-w-0 flex-1 truncate rounded-lg bg-paper px-2.5 py-1.5 text-xs text-ink-muted line-through decoration-ink-muted/50" title={p.before}>
                      {p.before}
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <ArrowRightIcon aria-hidden className="size-3" />
                    </span>
                  </div>
                  <span className="num text-[15px] font-medium text-ink">{p.after}</span>
                  <span className="text-xs leading-relaxed text-ink-muted">{p.why}</span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
