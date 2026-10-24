import type { LucideIcon } from "lucide-react";
import { DatabaseIcon, FileDownIcon, GaugeIcon, ImagesIcon, LanguagesIcon, RefreshCwIcon, ShieldCheckIcon, WebhookIcon } from "lucide-react";
import { LiveImportCard } from "./live-import-card";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { CONTAINER } from "./site-chrome";

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
}

/* Eight things the import really does, one line each; the longer versions live in the README. */
const LEFT: readonly Feature[] = [
  { icon: DatabaseIcon, title: "Any shape of sheet", text: "CSV, Excel, a mysqldump or pg_dump, or a Google Sheets link. Title rows, BOMs and broken encodings are handled." },
  { icon: ImagesIcon, title: "Photos find their product", text: "Matched by the Image column, the SKU, a camera name or the product stem. The rest wait in a tray for one click." },
  { icon: ShieldCheckIcon, title: "Claims with receipts", text: "Every claim cites its row and column, the quote must exist, and a negation in the sheet beats the model." },
  { icon: LanguagesIcon, title: "German and French, checked", text: "Numbers, tags and brand names are protected in translation and verified after; a failed field falls back to English." },
];
const RIGHT: readonly Feature[] = [
  { icon: GaugeIcon, title: "Fast or Economy", text: "Realtime calls for results in minutes, or the Batch API at half the price. A budget pauses the import first." },
  { icon: RefreshCwIcon, title: "Survives a restart", text: "Every row's stage lives in Postgres, jobs are idempotent, and re-uploads never duplicate a product." },
  { icon: FileDownIcon, title: "Exports that fit", text: "CSV, JSON and a Shopify-shaped CSV straight from the published catalogue, with every variant and translation." },
  { icon: WebhookIcon, title: "Webhooks and an API", text: "Signed webhooks when an import finishes, API keys for uploads and reads, a delivery log with retries." },
];

function FeatureCard({ feature, delay }: { feature: Feature; delay: number }) {
  const Icon = feature.icon;
  return (
    <Reveal delay={delay} className="h-full">
      <div className="group flex h-full items-start gap-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/70 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-float)]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 group-hover:-translate-y-0.5">
          <Icon aria-hidden className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[17px] leading-snug text-ink">{feature.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{feature.text}</p>
        </div>
      </div>
    </Reveal>
  );
}

/** The bento: four feature cards either side of the live import. */
export function LandingFeatures() {
  return (
    <section id="product" aria-labelledby="features-heading" className="scroll-mt-24 py-20 md:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="features-heading" eyebrow="One import" title="Everything your catalogue runs on" text="Cleaning, matching, writing, translating and publishing, in one pipeline, with every row visible while it moves." />
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.18fr)_minmax(0,1fr)] lg:items-stretch">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {LEFT.map((f, i) => (
              <FeatureCard key={f.title} feature={f} delay={i * 0.06} />
            ))}
          </div>
          <Reveal delay={0.1} className="order-first h-full lg:order-none">
            <LiveImportCard className="h-full min-h-[420px]" />
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {RIGHT.map((f, i) => (
              <FeatureCard key={f.title} feature={f} delay={0.12 + i * 0.06} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
