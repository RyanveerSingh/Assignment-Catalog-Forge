"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { CountUp } from "@/components/ext/count-up";
import { settle, stagger } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
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
 * The six numbers that answer "what has this done for me" before any chart: a white raised band
 * with the figures in the brand colour. Every figure is already in the metrics payload; nothing is queried for it.
 */
export function HeadlineFigures({ data }: { data: StoreMetrics }) {
  const reduce = useReducedMotion();
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
    <section aria-label="Headline figures" className={cn(CARD, "relative overflow-hidden px-5 py-5 md:px-6")}>
      <span aria-hidden className="glow-top pointer-events-none absolute inset-x-0 -top-10 h-40" />
      <dl className="relative grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
        {figures.map((f, i) => (
          <motion.div key={f.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.45, stagger(i, 0.06))} className="flex min-w-0 flex-col gap-1.5 border-l border-border pl-4 first:border-brand">
            <dt className="text-[12px] font-medium text-ink-muted">{f.label}</dt>
            <dd className="font-display text-[1.9rem] leading-none text-brand tabular xl:text-[2.1rem]">
              <CountUp value={f.value} format={f.format} />
            </dd>
            <dd className="text-xs leading-4 text-ink-muted">{f.hint}</dd>
          </motion.div>
        ))}
      </dl>
    </section>
  );
}
