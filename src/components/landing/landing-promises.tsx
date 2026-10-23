import type { LucideIcon } from "lucide-react";
import { LanguagesIcon, ListChecksIcon, ShieldCheckIcon, StoreIcon } from "lucide-react";
import { cn } from "cn";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

const PROMISES: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: ShieldCheckIcon,
    title: "Nothing invented",
    text: "Every claim in a listing points to the cell it came from, and anything the sheet contradicts is blocked before you see it.",
  },
  {
    icon: LanguagesIcon,
    title: "German and French, ready before anyone asks",
    text: "Listings are translated as soon as they are written. Edit the English and the translation is marked out of date and redone.",
  },
  {
    icon: ListChecksIcon,
    title: "Never loses a row: counts always add up",
    text: "Every row ends as done, needs review or failed, and those three always add up to the rows in your file. Duplicates are collapsed, not dropped.",
  },
  {
    icon: StoreIcon,
    title: "Fast storefront while imports run",
    text: "Shoppers only ever see the published snapshot of your catalogue; an import running in the background cannot slow it down or leak into it.",
  },
];

export function LandingPromises() {
  return (
    <section aria-labelledby="promises-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-12 md:py-16")}>
        <Reveal>
          <h2 id="promises-heading" className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
            What you can count on
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-ink md:text-4xl">Four things that hold on every import, by construction.</p>
        </Reveal>
        <ul className="mt-10 grid gap-px bg-border hairline sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="bg-card">
              <Reveal delay={i * 0.07} className="flex h-full flex-col gap-3 px-5 py-5">
                <Icon aria-hidden className="size-5 text-brand" />
                <h3 className="font-display text-lg leading-snug text-ink">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
