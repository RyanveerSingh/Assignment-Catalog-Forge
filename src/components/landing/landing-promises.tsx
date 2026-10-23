import type { LucideIcon } from "lucide-react";
import { LanguagesIcon, ListChecksIcon, ShieldCheckIcon, StoreIcon } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { CONTAINER } from "./site-chrome";

const PROMISES: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: ShieldCheckIcon, title: "Nothing invented", text: "Every claim in a listing points to the cell it came from, and anything the sheet contradicts is blocked before you see it." },
  { icon: LanguagesIcon, title: "German and French, ready before anyone asks", text: "Listings are translated as soon as they are written. Edit the English and the translation is marked out of date and redone." },
  { icon: ListChecksIcon, title: "Never loses a row", text: "Every row ends as done, needs review or failed, and those three always add up to the rows in your file. Duplicates are collapsed, not dropped." },
  { icon: StoreIcon, title: "Fast storefront while imports run", text: "Shoppers only ever see the published snapshot of your catalogue; an import running in the background cannot slow it down or leak into it." },
];

/** Four things that hold on every import, by construction. */
export function LandingPromises() {
  return (
    <section aria-labelledby="promises-heading" className="pb-20 md:pb-28">
      <div className={CONTAINER}>
        <SectionHeading id="promises-heading" eyebrow="What you can count on" title="Four things that hold on every import" />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="h-full">
              <Reveal delay={i * 0.07} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)]">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon aria-hidden className="size-[18px]" />
                  </span>
                  <h3 className="font-display text-[17px] leading-snug text-ink">{title}</h3>
                  <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
