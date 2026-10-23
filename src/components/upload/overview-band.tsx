"use client";

import { CoinsIcon, EyeIcon, PackageCheckIcon, UploadIcon } from "lucide-react";
import { StatTile } from "@/components/ext/stat-tile";
import type { StoreOverview } from "@/db/repositories/overview";
import { formatMicrosUsd, formatNumber } from "@/lib/format";
import type { ImportDto } from "./import-live-types";
import { LiveNowTile } from "./live-now-tile";

function signed(n: number): string {
  return n > 0 ? `+${formatNumber(n)}` : formatNumber(n);
}

/** The figures above the drop zone: four counts with a 14-day line each, and the live panel. Fetched once per page load by the server. */
export function OverviewBand({ storeSlug, overview, latest }: { storeSlug: string; overview: StoreOverview; latest: ImportDto | null }) {
  const { products, imports, ai } = overview;
  const importsDelta = imports.last7 - imports.previous7;
  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="overview-heading" className="font-display text-xl text-ink">
          Your store right now
        </h2>
        <p className="text-[11px] text-ink-muted">Counted from the tables of record · each line is the last 14 days</p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatTile
          index={0}
          label="Live in the shop"
          value={products.live}
          format={formatNumber}
          icon={PackageCheckIcon}
          tone="success"
          context={products.approvedLast7 > 0 ? `${signed(products.approvedLast7)} approved this week` : "nothing approved this week"}
          contextTone={products.approvedLast7 > 0 ? "success" : "muted"}
          sparkline={products.liveSeries}
          sparklineLabel="Products approved per day over the last 14 days"
        />
        <StatTile
          index={1}
          label="Waiting for review"
          value={products.needsReview}
          format={formatNumber}
          icon={EyeIcon}
          tone="warning"
          context={products.flaggedLast7 > 0 ? `${formatNumber(products.flaggedLast7)} flagged this week` : products.needsReview > 0 ? "none flagged this week" : "the queue is clear"}
          contextTone={products.flaggedLast7 > 0 ? "warning" : "muted"}
          sparkline={products.reviewSeries}
          sparklineLabel="Products flagged for review per day over the last 14 days"
        />
        <StatTile
          index={2}
          label="Imports · 7 days"
          value={imports.last7}
          format={formatNumber}
          icon={UploadIcon}
          tone="brand"
          context={`${formatNumber(imports.rowsLast7)} rows · ${signed(importsDelta)} vs the week before`}
          sparkline={imports.series}
          sparklineLabel="Imports started per day over the last 14 days"
        />
        <StatTile
          index={3}
          label="AI spend · 30 days"
          value={ai.spendMicros30d}
          format={formatMicrosUsd}
          icon={CoinsIcon}
          tone="info"
          context={`${formatMicrosUsd(ai.spendMicros7d)} in the last 7 days`}
          sparkline={ai.series}
          sparklineLabel="AI spend per day over the last 14 days"
        />
        <LiveNowTile storeSlug={storeSlug} live={overview.live} latest={latest} className="col-span-2 xl:col-span-1" />
      </div>
    </section>
  );
}
