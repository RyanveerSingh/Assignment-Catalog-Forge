import { cn } from "cn";
import { CONTAINER } from "./site-chrome";

/* The four things that make the output trustworthy, each one enforced in code and covered by tests. */
const FACTS = [
  { title: "Prices, units and encodings are fixed by code.", note: "The model never writes a number. 1.299,00 € becomes €1,299.00 before any AI sees the row." },
  { title: "Every claim cites the cell it came from.", note: "A claim the supplier text does not support is removed and the product goes to review." },
  { title: "English, German and French from one upload.", note: "Numbers and tags are checked again after translation." },
  { title: "Nothing goes live until it passes or you approve it.", note: "Conflicting rows and missing prices wait in review; a generated SKU is flagged for you." },
] as const;

export function LandingFacts() {
  return (
    <section id="how" aria-labelledby="how-heading" className="scroll-mt-20 border-b border-border py-14 md:py-20">
      <div className={cn(CONTAINER, "max-w-[1320px]")}>
        <h2 id="how-heading" className="num text-[13px] text-ink-muted">
          How it stays right
        </h2>
        <ol className="mt-6 md:mt-8">
          {FACTS.map((f, i) => (
            <li key={f.title} className="grid gap-x-8 gap-y-2 border-t border-border py-6 md:grid-cols-[80px_minmax(0,1fr)_minmax(0,0.6fr)] md:py-8">
              <span className="num text-[13px] text-brand md:pt-2">{String(i + 1).padStart(2, "0")}</span>
              <p className="font-display text-[26px] leading-[1.05] tracking-[-0.025em] text-balance text-ink md:text-[40px]">{f.title}</p>
              <p className="text-[15px] leading-relaxed text-ink-muted md:pt-2">{f.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
