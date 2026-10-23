import type { LucideIcon } from "lucide-react";
import { DatabaseIcon, FileDownIcon, GaugeIcon, ImagesIcon, LanguagesIcon, RefreshCwIcon, ShieldCheckIcon, WebhookIcon } from "lucide-react";
import { cn } from "cn";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

const FEATURES: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: DatabaseIcon, title: "Any shape of sheet", text: "CSV, Excel, a mysqldump or pg_dump read in memory, or a public Google Sheets link. Headers in English or German, title rows, BOMs and broken encodings are handled." },
  { icon: ImagesIcon, title: "Photos find their product", text: "A ladder of rungs: the Image column, the SKU, the SKU inside a camera name, the product stem. What is left waits in a tray for one click." },
  { icon: ShieldCheckIcon, title: "Claims with receipts", text: "Every claim cites its row and column, the quote must exist, and a negation in the sheet beats the model. Blocked claims are shown, not hidden." },
  { icon: LanguagesIcon, title: "German and French, checked", text: "Numbers, tags and brand names are protected during translation and verified after. A field that fails falls back to English with a flag." },
  { icon: GaugeIcon, title: "Fast or Economy", text: "Realtime calls for results in minutes, or the Batch API at half the price. A budget pauses the import before it overspends." },
  { icon: RefreshCwIcon, title: "Survives a restart", text: "Every row's stage lives in Postgres, jobs are idempotent, and a crashed worker's work is picked up by the next one. Re-uploads never duplicate." },
  { icon: FileDownIcon, title: "Exports that fit", text: "CSV, JSON and a Shopify-shaped CSV, straight from the published catalogue, with every variant and translation." },
  { icon: WebhookIcon, title: "Webhooks and an API", text: "Signed webhooks when an import finishes, API keys for uploads and reads, and a per-endpoint delivery log with retries." },
];

export function LandingFeatures() {
  return (
    <section aria-labelledby="features-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-14 md:py-20")}>
        <Reveal>
          <h2 id="features-heading" className="text-[11px] font-medium tracking-[0.18em] text-brand uppercase">
            Everything the import does
          </h2>
          <p className="font-display mt-3 max-w-2xl text-3xl leading-tight text-ink md:text-4xl">Built for the sheet you actually get, not the one you wish you got.</p>
        </Reveal>
        <ul className="mt-10 grid gap-px bg-border hairline sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="bg-card">
              <Reveal delay={Math.min(i, 7) * 0.05} className="group flex h-full flex-col gap-3 px-5 py-5 transition-colors hover:bg-brand-soft/30">
                <span className="flex size-9 items-center justify-center rounded-md bg-brand-soft text-brand transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon aria-hidden className="size-4.5" />
                </span>
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
