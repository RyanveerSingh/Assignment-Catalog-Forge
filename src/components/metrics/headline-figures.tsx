"use client";

import { cn } from "cn";
import { CountUp } from "@/components/ext/count-up";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatDuration, formatMicrosUsd, formatNumber } from "@/lib/format";

interface Figure {
  key: string;
  label: string;
  value: number;
  format: (n: number) => string;
  hint: string;
}

/**
 * The six numbers that answer "what has this done for me" before any chart: the ink band at the top
 * of the metrics page. Every figure is already in the metrics payload; nothing is queried for it.
 */
export function HeadlineFigures({ data }: { data: StoreMetrics }) {
  const translationsMade = data.translations.reduce((n, t) => n + t.fresh + t.outdated, 0);
  const languages = data.translations.length;
  const medianMs = data.speed.medianImportMs;
  const figures: Figure[] = [
    { key: "products", label: "Products processed", value: data.products.total, format: formatNumber, hint: `across ${formatNumber(data.imports.completed)} completed ${data.imports.completed === 1 ? "import" : "imports"}` },
    { key: "listings", label: "Listings written", value: data.productsThroughAi, format: formatNumber, hint: "drafted by the AI stage" },
    { key: "translations", label: "Translations made", value: translationsMade, format: formatNumber, hint: languages > 0 ? `into ${languages} ${languages === 1 ? "language" : "languages"}` : "no languages enabled yet" },
    { key: "spend", label: "AI spend", value: data.cost.totalMicros, format: formatMicrosUsd, hint: `${formatMicrosUsd(data.cost.savedMicros)} saved against list price` },
    { key: "perProduct", label: "Cost per product", value: data.cost.perProductMicros, format: (n) => formatMicrosUsd(n, 4), hint: "average over decided products" },
    { key: "median", label: "Median import time", value: medianMs ?? 0, format: (n) => (medianMs === null ? "—" : formatDuration(n)), hint: medianMs === null ? "no completed imports yet" : "first row in to last row out" },
  ];
  return (
    <section aria-label="Headline figures" className="relative overflow-hidden bg-ink px-5 py-5 text-paper md:px-6 md:py-6">
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full border border-paper/10" />
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-4 size-40 rounded-full border border-paper/10" />
      <dl className="relative grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
        {figures.map((f, i) => (
          <div key={f.key} className={cn("flex min-w-0 flex-col gap-2 border-l pl-3 md:pl-4", i === 0 ? "border-brand" : "border-paper/15")}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-paper/60">{f.label}</dt>
            <dd className="font-display text-3xl leading-none text-paper tabular xl:text-[2.25rem]">
              <CountUp value={f.value} format={f.format} />
            </dd>
            <dd className="text-xs leading-4 text-paper/60">{f.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
