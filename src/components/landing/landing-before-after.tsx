import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";
import { Reveal } from "./reveal";
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
    <section aria-labelledby="clean-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-14 md:py-20")}>
        <Reveal>
          <h2 id="clean-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
            Fixed before any AI sees a row
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-ink md:text-4xl">The cleaner owns prices, units, encodings and markup. The model only ever writes words.</p>
        </Reveal>
        <ul className="mt-10 grid gap-px bg-border hairline sm:grid-cols-2 lg:grid-cols-4">
          {PAIRS.map((p, i) => (
            <li key={p.before} className="bg-card">
              <Reveal delay={Math.min(i, 7) * 0.05} className="flex h-full flex-col gap-3 px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="num min-w-0 flex-1 truncate rounded-sm bg-paper-deep px-2 py-1 text-xs text-ink-muted line-through decoration-ink-muted/50" title={p.before}>
                    {p.before}
                  </span>
                  <ArrowRightIcon aria-hidden className="size-3.5 shrink-0 text-brand" />
                </div>
                <span className="num text-sm font-medium text-ink">{p.after}</span>
                <span className="text-xs leading-relaxed text-ink-muted">{p.why}</span>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
