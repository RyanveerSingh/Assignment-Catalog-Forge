import { cn } from "cn";
import { Reveal } from "./reveal";
import { CONTAINER } from "./site-chrome";

/* What the import accepts and what it hands back; every entry is a code path in the repository. */
const ROWS: ReadonlyArray<{ label: string; items: readonly string[] }> = [
  { label: "Reads", items: ["CSV", "XLSX", "XLS", "SQL dump (mysqldump / pg_dump)", "Google Sheets link", "ZIP of photos", "PNG", "JPG", "WEBP", "GIF"] },
  { label: "Writes", items: ["CSV", "JSON", "Shopify CSV", "Signed webhooks", "API keys", "Three languages"] },
];

/** Two plain rows of format names, no logos. */
export function LandingWorksWith() {
  return (
    <section aria-labelledby="works-heading" className="py-20 md:py-28">
      <div className={cn(CONTAINER, "grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16")}>
        <Reveal>
          <p className="text-sm font-medium text-brand">Formats</p>
          <h2 id="works-heading" className="font-display mt-3 max-w-[16ch] text-[34px] leading-[1.05] text-balance text-ink sm:text-[40px] md:text-[48px]">
            Works with the files you already have
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-muted md:text-lg">No template to fill in first. The sheet your supplier sent is the input; the catalogue your shop needs is the output.</p>
        </Reveal>
        <div className="flex flex-col divide-y divide-border">
          {ROWS.map((row, i) => (
            <Reveal key={row.label} delay={0.08 + i * 0.1} className="grid gap-3 py-6 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-6">
              <span className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase sm:pt-2">{row.label}</span>
              <ul className="flex flex-wrap gap-2">
                {row.items.map((item) => (
                  <li key={item} className="rounded-full bg-card px-3.5 py-1.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] ring-1 ring-border/70">
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
