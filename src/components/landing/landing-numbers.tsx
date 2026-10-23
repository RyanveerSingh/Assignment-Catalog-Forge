import { cn } from "cn";
import { CONTAINER } from "./site-chrome";

/* Measured on the sample files in the repository with real models; the README shows how each is taken. */
const STATS = [
  { value: "100%", label: "accuracy on the 120-row messy sample" },
  { value: "99.7%", label: "of claims traced back to a source cell" },
  { value: "$1.93", label: "per 1,000 products, written and translated" },
  { value: "53 s", label: "from upload to a stocked shop" },
] as const;

export function LandingNumbers() {
  return (
    <section id="numbers" aria-labelledby="numbers-heading" className="scroll-mt-20 py-14 md:py-20">
      <div className={cn(CONTAINER, "max-w-[1320px]")}>
        <h2 id="numbers-heading" className="num text-[13px] text-ink-muted">
          Measured, not promised
        </h2>
        <dl className="mt-6 grid grid-cols-2 border-t border-border md:mt-8 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={cn("flex flex-col gap-2 border-b border-border py-6 pr-4 lg:border-b-0 lg:py-8", i % 2 === 1 && "pl-4 max-lg:border-l lg:pl-6", i >= 2 && "lg:pl-6", i > 0 && "lg:border-l")}>
              <dd className="font-display order-1 text-[44px] leading-none tracking-[-0.04em] text-ink md:text-[72px]">{s.value}</dd>
              <dt className="order-2 max-w-[22ch] text-[14px] leading-snug text-ink-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
